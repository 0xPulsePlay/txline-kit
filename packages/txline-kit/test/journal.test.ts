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

  test("flags conflicting payloads observed under one source identity", async () => {
    const journal = await canonicalizeJournal([await score(3), await score(3, { StatusId: 4 })]);
    expect(journal.records).toHaveLength(2);
    expect(journal.conflicts).toHaveLength(1);
    expect(journal.conflicts[0]).toMatchObject({ source: "score", sourceId: "42:00000003" });
    expect(journal.conflicts[0]!.hashes).toHaveLength(2);
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
