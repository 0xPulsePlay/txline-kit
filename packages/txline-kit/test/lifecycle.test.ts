import { describe, expect, test } from "vitest";
import { normalizeScoreRecord } from "../src/data.js";
import { canonicalizeJournal, journalRecord } from "../src/journal.js";
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
