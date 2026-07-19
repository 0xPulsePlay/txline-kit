import { describe, expect, test } from "vitest";
import { normalizeScoreRecord } from "../src/data.js";
import { canonicalizeJournal, hashCanonical, journalRecord } from "../src/journal.js";
import {
  applyPartialProofs,
  attestJournal,
  canonicalAttestation,
  materialFor,
  observeAttestation,
  type ProofAnchor,
  quarantineAttestation,
  sealAttestation,
} from "../src/lifecycle.js";

const anchor = (id: string, ts: number): ProofAnchor => ({ sourceId: id, sourceTimestamp: ts, rootHash: `0x${id.repeat(8)}` });
const subject = { fixtureId: 42, headHash: "0xabc" };

describe("proof lifecycle", () => {
  test("walks observed → canonical → verified without ever recomputing content", async () => {
    const observed = await observeAttestation(subject);
    expect(observed).toMatchObject({ state: "observed", coverage: "none" });
    const canonical = await canonicalAttestation(subject);
    expect(canonical.state).toBe("canonical");
    expect(canonical.contentHash).toBe(observed.contentHash);
    const sealed = await sealAttestation(canonical, [anchor("bbbbbbbb", 2), anchor("aaaaaaaa", 1)]);
    expect(sealed).toMatchObject({ state: "verified", coverage: "complete" });
    expect(sealed.contentHash).toBe(canonical.contentHash);
    expect(sealed.anchors.map((item) => item.sourceId)).toEqual(["aaaaaaaa", "bbbbbbbb"]);
    expect(sealed.sealedHash).toBeDefined();
    expect(sealed.sealedHash).not.toBe(sealed.contentHash);
    const resorted = await sealAttestation(canonical, [anchor("aaaaaaaa", 1), anchor("bbbbbbbb", 2)]);
    expect(resorted.sealedHash).toBe(sealed.sealedHash);
    expect(["liquid", "amber", "crystal"]).toEqual([materialFor("observed"), materialFor("canonical"), materialFor("verified")]);
  });

  test("partial coverage is representable without claiming completeness", async () => {
    const canonical = await canonicalAttestation(subject);
    const partial = applyPartialProofs(canonical, [anchor("cccccccc", 3)]);
    expect(partial).toMatchObject({ state: "canonical", coverage: "partial" });
    expect(partial.sealedHash).toBeUndefined();
    expect(applyPartialProofs(canonical, []).coverage).toBe("none");
  });

  test("conflicting journal identities quarantine and refuse to seal", async () => {
    const at = Date.UTC(2026, 6, 18, 22, 57, 0);
    const record = (extra: Record<string, unknown>) => journalRecord("score", normalizeScoreRecord({ FixtureId: 42, Seq: 3, Ts: at, Action: "goal", ...extra }));
    const journal = await canonicalizeJournal([await record({}), await record({ StatusId: 4 })]);
    const attested = await attestJournal(journal);
    expect(attested.state).toBe("quarantined");
    expect(attested.quarantineReason).toContain("42:00000003");
    await expect(sealAttestation(attested, [anchor("dddddddd", 1)])).rejects.toMatchObject({ code: "LIFECYCLE_QUARANTINED" });
    expect(applyPartialProofs(attested, [anchor("dddddddd", 1)])).toBe(attested);
    const clean = await attestJournal(await canonicalizeJournal([await record({})]));
    expect(clean.state).toBe("canonical");
  });

  test("refuses to seal content mutated after canonicalization", async () => {
    // Regression for the wi-3 review bug (a): sealAttestation trusted the
    // contentHash recorded at canonicalization time without ever rehashing
    // the live subject, so mutating the subject stored on the attestation
    // between canonicalAttestation and sealAttestation silently sealed a
    // record whose contentHash no longer matched its actual content.
    //
    // canonicalAttestation now deep-clones its subject (see the M6 fix
    // below), so this exercises the check via the stored `canonical.subject`
    // directly rather than the caller's original object -- mutating the
    // caller's own object no longer reaches the attestation at all, which is
    // exactly the M6 fix; the seal-time rehash check here still guards
    // against direct tampering with the attestation's own subject.
    const canonical = await canonicalAttestation({ fixtureId: 42, headHash: "0xabc" });
    (canonical.subject as { headHash: string }).headHash = "0xtampered";
    await expect(sealAttestation(canonical, [anchor("aaaaaaaa", 1)])).rejects.toMatchObject({ code: "LIFECYCLE_CONTENT_MUTATED" });
    // Restoring the original content makes it sealable again.
    (canonical.subject as { headHash: string }).headHash = "0xabc";
    await expect(sealAttestation(canonical, [anchor("aaaaaaaa", 1)])).resolves.toMatchObject({ state: "verified" });
  });

  test("subject stored on an attestation is independent of later mutation of the caller's original object", async () => {
    // Regression for the M6 review bug: freeze({ ...attestation, subject })
    // only shallow-freezes the returned attestation container; the
    // referenced subject object itself was never cloned, so a caller
    // mutating the same object it passed in would make the "frozen"
    // attestation's exposed .subject reflect the mutation while
    // .contentHash still attested to the pre-mutation bytes.
    const original: Record<string, unknown> = { fixtureId: 42, headHash: "0xabc" };
    const snapshot = { ...original };
    const observed = await observeAttestation(original);
    const canonical = await canonicalAttestation(original);
    original.headHash = "0xtampered";
    original.fixtureId = 999;
    expect(observed.subject).toEqual(snapshot);
    expect(canonical.subject).toEqual(snapshot);
    expect(observed.subject).not.toBe(original);
    expect(canonical.subject).not.toBe(original);
    await expect(hashCanonical(observed.subject)).resolves.toBe(observed.contentHash);
    await expect(hashCanonical(canonical.subject)).resolves.toBe(canonical.contentHash);
  });

  test("snapshots anchors at seal time so the stored record can't disagree with what was hashed", async () => {
    // Regression for the wi-3 review bug (b). Note first: the pre-existing
    // `freeze()` helper already clones each anchor via `{ ...anchor }`
    // before freezing, so mutating a caller's anchor object *after*
    // sealAttestation has already returned was never actually able to
    // corrupt the result — that specific timing doesn't reproduce a bug.
    //
    // The real gap was internal: sealAttestation read the live `anchors`
    // objects directly at three different points while computing
    // proofFingerprint and sealedHash, and only cloned them into the
    // returned attestation at the very end (inside freeze()). If the
    // underlying anchor value changed between those reads — e.g. a caller
    // mutating a shared anchor object from a callback that fires while one
    // of sealAttestation's `await hashCanonical(...)` calls is pending —
    // the hashes and the stored anchors could each capture a different
    // value, so the returned record would no longer accurately describe
    // what its own sealedHash commits to.
    //
    // A getter deterministically reproduces this without depending on real
    // async scheduling: it returns one value for the first two reads (what
    // proofFingerprint's map and sealedHash's canonicalStringify would see)
    // and a different value from the third read onward (what the old
    // code's final `{ ...anchor }` clone inside freeze() would capture).
    let reads = 0;
    const flaky: ProofAnchor = {
      sourceId: "flaky",
      sourceTimestamp: 1,
      get rootHash() {
        reads += 1;
        return reads <= 2 ? "0xhashed-value" : "0xchanged-after-hashing";
      },
    };
    const canonical = await canonicalAttestation(subject);
    const sealed = await sealAttestation(canonical, [flaky]);
    // The stored anchor must reflect the same single read used for hashing,
    // never a later, different read of the same live object.
    expect(sealed.anchors[0]!.rootHash).toBe("0xhashed-value");
    expect(sealed.anchors[0]!.rootHash).not.toBe("0xchanged-after-hashing");
    expect(Object.isFrozen(sealed.anchors[0])).toBe(true);
    expect(() => { (sealed.anchors[0] as { rootHash: string }).rootHash = "0xshouldfail"; }).toThrow();
  });

  test("breaks anchor sort ties deterministically regardless of input order", async () => {
    // Regression for the wi-3 review bug (c): the sort comparator only
    // compared sourceTimestamp then sourceId. Two anchors tying on both
    // (same PDA/day identity and timestamp, different rootHash — e.g. two
    // observations of the same account that disagree) fell back to
    // Array#sort's *stable* behavior, which preserves input order — so the
    // same logical anchor set produced a different sealedHash depending on
    // which order the caller happened to list them in.
    const canonical = await canonicalAttestation(subject);
    const tiedA: ProofAnchor = { sourceId: "shared", sourceTimestamp: 100, rootHash: "0xaaaa" };
    const tiedB: ProofAnchor = { sourceId: "shared", sourceTimestamp: 100, rootHash: "0xbbbb" };
    const forward = await sealAttestation(canonical, [tiedA, tiedB]);
    const reversed = await sealAttestation(canonical, [tiedB, tiedA]);
    expect(forward.sealedHash).toBe(reversed.sealedHash);
    expect(forward.anchors.map((a) => a.rootHash)).toEqual(reversed.anchors.map((a) => a.rootHash));
    // The deterministic tie-break (rootHash ascending) is what decides order.
    expect(forward.anchors.map((a) => a.rootHash)).toEqual(["0xaaaa", "0xbbbb"]);
  });

  test("guards transitions and manual quarantine strips seals", async () => {
    const observed = await observeAttestation(subject);
    await expect(sealAttestation(observed, [anchor("aaaaaaaa", 1)])).rejects.toMatchObject({ code: "LIFECYCLE_TRANSITION_INVALID" });
    expect(() => applyPartialProofs(observed, [])).toThrow(expect.objectContaining({ code: "LIFECYCLE_TRANSITION_INVALID" }));
    const canonical = await canonicalAttestation(subject);
    await expect(sealAttestation(canonical, [])).rejects.toMatchObject({ code: "LIFECYCLE_ANCHORS_MISSING" });
    const sealed = await sealAttestation(canonical, [anchor("aaaaaaaa", 1)]);
    const quarantined = quarantineAttestation(sealed, "on-chain predicate rejected");
    expect(quarantined).toMatchObject({ state: "quarantined", quarantineReason: "on-chain predicate rejected" });
    expect(quarantined.sealedHash).toBeUndefined();
    expect(quarantined.proofFingerprint).toBeUndefined();
    expect(Object.isFrozen(quarantined)).toBe(true);
  });
});
