import { describe, expect, test } from "vitest";
import { normalizeOddsRecord, normalizeScoreRecord, updateBucket } from "../src/data.js";
import {
  bucketJournalRecords,
  canonicalStringify,
  canonicalizeJournal,
  hashCanonical,
  journalRecord,
  reconcileInterval,
} from "../src/journal.js";

const at = Date.UTC(2026, 6, 18, 22, 57, 0);
const score = (seq: number, extra: Record<string, unknown> = {}) =>
  journalRecord("score", normalizeScoreRecord({ FixtureId: 42, Seq: seq, Ts: at + seq, Action: "goal", ...extra }));
const odds = (messageId: string) =>
  journalRecord("odds", normalizeOddsRecord({ FixtureId: 42, MessageId: messageId, Ts: at + 1, Prices: [1.8, 3.9, 4.9] }));

describe("canonical journal", () => {
  test("canonical JSON sorts keys, drops undefined, and hashes deterministically", async () => {
    expect(canonicalStringify({ b: 1, a: [2, { z: -0, y: 3n, skip: undefined }] })).toBe('{"a":[2,{"y":"3","z":0}],"b":1}');
    expect(() => canonicalStringify([undefined])).toThrow(expect.objectContaining({ code: "JOURNAL_PAYLOAD_INVALID" }));
    expect(() => canonicalStringify({ bad: Number.NaN })).toThrow(expect.objectContaining({ code: "JOURNAL_PAYLOAD_INVALID" }));
    await expect(hashCanonical({ a: 1, b: 2 })).resolves.toBe(await hashCanonical({ b: 2, a: 1 }));
    await expect(hashCanonical({ a: 1 })).resolves.not.toBe(await hashCanonical({ a: 2 }));
  });

  test("builds identities from sequences and message ids, refusing incomplete records", async () => {
    const record = await score(7);
    expect(record).toMatchObject({ source: "score", sourceId: "42:00000007", sourceTimestamp: at + 7 });
    await expect(odds("m-1")).resolves.toMatchObject({ source: "odds", sourceId: "m-1" });
    await expect(journalRecord("score", normalizeScoreRecord({ FixtureId: 42, Ts: at, Action: "goal" }))).rejects.toMatchObject({ code: "JOURNAL_SOURCE_ID_MISSING" });
    await expect(journalRecord("odds", normalizeOddsRecord({ FixtureId: 42, Ts: at }))).rejects.toMatchObject({ code: "JOURNAL_SOURCE_ID_MISSING" });
    await expect(journalRecord("score", normalizeScoreRecord({ Seq: 1, Ts: at }))).rejects.toMatchObject({ code: "JOURNAL_FIXTURE_MISSING" });
  });

  test("dedupes exact duplicates and orders identically regardless of arrival", async () => {
    const records = [await score(2), await score(1), await odds("m-1")];
    const duplicated = [...records, await score(2)];
    const forward = await canonicalizeJournal(duplicated);
    const shuffled = await canonicalizeJournal([...duplicated].reverse());
    expect(forward.records).toHaveLength(3);
    expect(forward.headHash).toBe(shuffled.headHash);
    expect(forward.records.map((record) => record.sourceId)).toEqual(["42:00000001", "m-1", "42:00000002"]);
    expect(forward.conflicts).toEqual([]);
    const changed = await canonicalizeJournal([await score(2), await score(1, { StatusId: 4 }), await odds("m-1")]);
    expect(changed.headHash).not.toBe(forward.headHash);
  });

  test("picks a deterministic survivor among true exact duplicates regardless of arrival order", async () => {
    // Regression for the wi-4 review bug: exact.set(key, record) for the
    // Map keyed by (identity, payloadHash) always kept "whichever record
    // came last in the array". Two JournalRecord objects can share an
    // identical payloadHash (same canonical payload content, e.g. the same
    // update redelivered by the source) while still differing in
    // receivedTimestamp, which is not part of the hash. Which one survived
    // therefore depended on arrival order, violating the documented "same
    // records in any arrival order -> same journal" guarantee down to the
    // full record, not just headHash.
    const payload = normalizeScoreRecord({ FixtureId: 42, Seq: 5, Ts: at + 5, Action: "goal" });
    const early = await journalRecord("score", payload, at + 5); // first delivery
    const late = await journalRecord("score", payload, at + 9_000); // redelivered later
    expect(early.payloadHash).toBe(late.payloadHash);
    expect(early.receivedTimestamp).not.toBe(late.receivedTimestamp);

    const forward = await canonicalizeJournal([early, late, await score(1)]);
    const reversed = await canonicalizeJournal([late, early, await score(1)]);
    const shuffled = await canonicalizeJournal([await score(1), late, early]);

    expect(forward.headHash).toBe(reversed.headHash);
    expect(forward.headHash).toBe(shuffled.headHash);
    // Not just the hash: the actual surviving record, receivedTimestamp
    // included, must be identical no matter which arrival order produced it.
    expect(forward.records).toEqual(reversed.records);
    expect(forward.records).toEqual(shuffled.records);
    const survivor = forward.records.find((record) => record.sourceId === "42:00000005");
    // Deterministic tie-break: the earlier of the two receivedTimestamps wins.
    expect(survivor?.receivedTimestamp).toBe(early.receivedTimestamp);
    expect(forward.conflicts).toEqual([]); // same payloadHash -> not a conflict
  });

  test("flags conflicting payloads observed under one source identity", async () => {
    const journal = await canonicalizeJournal([await score(3), await score(3, { StatusId: 4 })]);
    expect(journal.records).toHaveLength(2);
    expect(journal.conflicts).toHaveLength(1);
    expect(journal.conflicts[0]).toMatchObject({ source: "score", sourceId: "42:00000003" });
    expect(journal.conflicts[0]!.hashes).toHaveLength(2);
  });

  test("orders conflicts by (source, sourceId), not sourceId alone, even when a score sourceId and an odds messageId collide as strings", async () => {
    // Regression for the M3 review bug: conflicts were sorted by sourceId
    // only. A score's sourceId ("fixtureId:paddedSeq") can string-collide
    // with an odds record's free-form messageId; when it does, a
    // sourceId-only comparator ties and the sort falls back to arrival
    // order, so the resulting conflicts array (and any downstream hash
    // derived from it, e.g. attestJournal's hashCanonical(journal)) could
    // differ purely by which arrival order fed the records in.
    const collidingId = "42:00000009";
    const scoreA = await score(9);
    const scoreB = await score(9, { StatusId: 4 });
    const oddsA = await journalRecord("odds", normalizeOddsRecord({ FixtureId: 42, MessageId: collidingId, Ts: at + 1, Prices: [1.8, 3.9, 4.9] }));
    const oddsB = await journalRecord("odds", normalizeOddsRecord({ FixtureId: 42, MessageId: collidingId, Ts: at + 1, Prices: [2.1, 3.5, 4.2] }));
    expect(scoreA.sourceId).toBe(collidingId);
    expect(oddsA.sourceId).toBe(collidingId);

    const forward = await canonicalizeJournal([scoreA, scoreB, oddsA, oddsB]);
    const reversed = await canonicalizeJournal([oddsB, oddsA, scoreB, scoreA]);
    expect(forward.conflicts).toHaveLength(2);
    expect(forward.conflicts.map((conflict) => conflict.source)).toEqual(["score", "odds"]);
    expect(forward.conflicts).toEqual(reversed.conflicts);
    await expect(hashCanonical(forward)).resolves.toBe(await hashCanonical(reversed));
  });

  test("journalRecord's stored payload is independent of later mutation of the caller's original object", async () => {
    // Regression for the M6 review bug: Object.freeze({ ...payload, ... })
    // only shallow-freezes the returned record; the referenced payload
    // object itself was never cloned, so mutating the caller's original
    // object after journaling silently changed the "frozen" record's
    // exposed .payload while .payloadHash kept attesting to the
    // pre-mutation bytes.
    const original = normalizeScoreRecord({ FixtureId: 42, Seq: 11, Ts: at + 11, Action: "goal" });
    const record = await journalRecord("score", original);
    const payloadBefore = { ...record.payload };
    (original as Record<string, unknown>).action = "tampered";
    (original as Record<string, unknown>).fixtureId = 999;
    expect(record.payload).toEqual(payloadBefore);
    expect(record.payload).not.toBe(original);
    expect((record.payload as Record<string, unknown>).action).not.toBe("tampered");
    await expect(hashCanonical(record.payload)).resolves.toBe(record.payloadHash);
  });

  test("buckets journal records into the official five-minute windows", async () => {
    const early = await score(1);
    const late = await journalRecord("score", normalizeScoreRecord({ FixtureId: 42, Seq: 9, Ts: at + 5 * 60_000, Action: "goal" }));
    const buckets = bucketJournalRecords([early, late]);
    expect(buckets.size).toBe(2);
    const bucket = updateBucket(at);
    expect(buckets.get(`${bucket.epochDay}:${bucket.hourOfDay}:${bucket.interval}`)!.records).toEqual([early]);
  });

  test("reconciliation reports when live delivery differed from the canonical journal", async () => {
    const first = await score(1);
    const second = await score(2);
    const bucket = updateBucket(at);
    const clean = await reconcileInterval(bucket, [first, second]);
    expect(clean).toMatchObject({ changed: false, deliveredRecords: 2, canonicalRecords: 2, conflicts: [] });
    expect(clean.intervalStart).toBe("2026-07-18T22:55:00.000Z");
    const reordered = await reconcileInterval(bucket, [second, first]);
    expect(reordered.changed).toBe(true);
    expect(reordered.canonicalHash).toBe(clean.canonicalHash);
    const duplicated = await reconcileInterval(bucket, [first, first, second]);
    expect(duplicated).toMatchObject({ changed: true, deliveredRecords: 3, canonicalRecords: 2 });
  });
});
