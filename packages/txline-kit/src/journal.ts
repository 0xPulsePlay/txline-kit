import type { CanonicalOddsRecord, CanonicalScoreRecord, UpdateBucket } from "./data.js";
import { bucketStart, updateBucket } from "./data.js";
import { JournalError } from "./errors.js";

export type JournalSource = "score" | "odds";

export interface JournalRecord<T = CanonicalScoreRecord | CanonicalOddsRecord> {
  source: JournalSource;
  fixtureId: number;
  /** Stable provider identity: score `fixtureId:seq` (zero-padded) or the odds messageId. */
  sourceId: string;
  sourceTimestamp: number;
  receivedTimestamp: number;
  /** SHA-256 over the canonical JSON serialization of the payload. */
  payloadHash: string;
  payload: T;
}

export interface JournalConflict {
  source: JournalSource;
  sourceId: string;
  /** The distinct payload hashes observed under one source identity. */
  hashes: readonly string[];
}

export interface CanonicalJournal<T = CanonicalScoreRecord | CanonicalOddsRecord> {
  records: readonly JournalRecord<T>[];
  conflicts: readonly JournalConflict[];
  /** Chained hash over the canonical sequence; equal journals hash equal. */
  headHash: string;
}

export interface ReconciliationReport {
  bucket: UpdateBucket;
  intervalStart: string;
  /** Hash of the sequence exactly as it was delivered. */
  witnessHash: string;
  /** Hash of the canonicalized (deduped, deterministically ordered) sequence. */
  canonicalHash: string;
  /** True when live delivery differed from the canonical journal. */
  changed: boolean;
  deliveredRecords: number;
  canonicalRecords: number;
  conflicts: readonly JournalConflict[];
}

const ZERO_HASH = `0x${"0".repeat(64)}`;
const CHAIN_TAG = "TXLINE_KIT_JOURNAL_V1";
const encoder = new TextEncoder();

function journalFailure(message: string, code: string, fix: string): never {
  throw new JournalError(message, { code, fix });
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) journalFailure("Canonical JSON cannot encode non-finite numbers", "JOURNAL_PAYLOAD_INVALID", "Strip NaN/Infinity fields before journaling a record.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === "bigint") return value.toString(10);
  if (value instanceof Uint8Array) return Array.from(value);
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  journalFailure(`Canonical JSON cannot encode ${typeof value}`, "JOURNAL_PAYLOAD_INVALID", "Journal only plain data records; drop functions and symbols.");
}

/** Deterministic JSON: sorted keys, dropped undefined, normalized -0. */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(text));
  return `0x${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Hash any record's canonical serialization. */
export function hashCanonical(value: unknown): Promise<string> {
  return sha256Hex(canonicalStringify(value));
}

async function chainHash(parts: readonly string[][]): Promise<string> {
  let head = ZERO_HASH;
  for (const part of parts) head = await sha256Hex([CHAIN_TAG, head, ...part].join("\u0000"));
  return head;
}

/** Create a journal record from a canonical score or odds record. */
export async function journalRecord<T extends CanonicalScoreRecord | CanonicalOddsRecord>(
  source: JournalSource,
  payload: T,
  receivedTimestamp?: number,
): Promise<JournalRecord<T>> {
  if (source !== "score" && source !== "odds") journalFailure(`Unknown journal source ${String(source)}`, "JOURNAL_SOURCE_INVALID", 'Use "score" or "odds".');
  const fixtureId = payload.fixtureId;
  if (!Number.isSafeInteger(fixtureId)) journalFailure("Journal records need a fixtureId", "JOURNAL_FIXTURE_MISSING", "Normalize the record (normalizeScoreRecord/normalizeOddsRecord) before journaling.");
  const timestamp = payload.timestamp;
  if (!Number.isSafeInteger(timestamp)) journalFailure("Journal records need a provider timestamp", "JOURNAL_TIMESTAMP_MISSING", "Journal only records that carry their source timestamp.");
  let sourceId: string;
  if (source === "score") {
    const seq = (payload as CanonicalScoreRecord).seq;
    if (!Number.isSafeInteger(seq) || seq! < 1) journalFailure("Score journal records need Seq/seq >= 1", "JOURNAL_SOURCE_ID_MISSING", "Journal score records that include their sequence.");
    sourceId = `${fixtureId}:${String(seq).padStart(8, "0")}`;
  } else {
    const messageId = (payload as CanonicalOddsRecord).messageId;
    if (typeof messageId !== "string" || messageId.length === 0) journalFailure("Odds journal records need a messageId", "JOURNAL_SOURCE_ID_MISSING", "Journal odds records that include MessageId.");
    sourceId = messageId;
  }
  return Object.freeze({
    source,
    fixtureId: fixtureId!,
    sourceId,
    sourceTimestamp: timestamp!,
    receivedTimestamp: receivedTimestamp ?? timestamp!,
    payloadHash: await hashCanonical(payload),
    payload,
  });
}

function compareRecords(left: JournalRecord, right: JournalRecord): number {
  if (left.sourceTimestamp !== right.sourceTimestamp) return left.sourceTimestamp - right.sourceTimestamp;
  if (left.source !== right.source) return left.source === "score" ? -1 : 1;
  if (left.sourceId !== right.sourceId) return left.sourceId < right.sourceId ? -1 : 1;
  return left.payloadHash < right.payloadHash ? -1 : left.payloadHash > right.payloadHash ? 1 : 0;
}

/** Deterministically pick a survivor between two records that collide on the
 * exact same (source, sourceId, payloadHash) key -- true exact duplicates,
 * since an identical payloadHash means an identical canonical payload (and
 * therefore an identical sourceTimestamp, derived from the payload). The
 * only field that can legitimately differ between them is receivedTimestamp
 * (the same content journaled more than once, e.g. redelivered by the
 * source). This comparison is symmetric -- preferRecord(a, b) always returns
 * the same winner regardless of which side is `current` vs `candidate` --
 * so the survivor never depends on which one the input array happened to
 * list first. */
function preferRecord<T extends CanonicalScoreRecord | CanonicalOddsRecord>(current: JournalRecord<T>, candidate: JournalRecord<T>): JournalRecord<T> {
  if (candidate.receivedTimestamp !== current.receivedTimestamp) {
    return candidate.receivedTimestamp < current.receivedTimestamp ? candidate : current;
  }
  // Fully tied, including receivedTimestamp: fall back to a stable,
  // content-derived secondary key (the payload's own canonical JSON) so the
  // pick stays deterministic even here, rather than "whichever came last".
  const currentKey = canonicalStringify(current.payload);
  const candidateKey = canonicalStringify(candidate.payload);
  return candidateKey < currentKey ? candidate : current;
}

/** Dedupe exact duplicates, order deterministically (ignoring arrival), list
 * conflicting payloads observed under one source identity, and chain a head
 * hash over the result. Same records in any arrival order → same journal. */
export async function canonicalizeJournal<T extends CanonicalScoreRecord | CanonicalOddsRecord>(
  records: readonly JournalRecord<T>[],
): Promise<CanonicalJournal<T>> {
  const exact = new Map<string, JournalRecord<T>>();
  const byIdentity = new Map<string, Set<string>>();
  for (const record of records) {
    const identity = `${record.source}\u0000${record.sourceId}`;
    const key = `${identity}\u0000${record.payloadHash}`;
    const existing = exact.get(key);
    exact.set(key, existing === undefined ? record : preferRecord(existing, record));
    const set = byIdentity.get(identity) ?? new Set<string>();
    set.add(record.payloadHash);
    byIdentity.set(identity, set);
  }
  const conflicts: JournalConflict[] = [...byIdentity.entries()]
    .filter(([, hashes]) => hashes.size > 1)
    .map(([identity, hashes]) => {
      const [source, sourceId] = identity.split("\u0000") as [JournalSource, string];
      return Object.freeze({ source, sourceId, hashes: Object.freeze([...hashes].sort()) });
    })
    .sort((a, b) => (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0));
  const canonical = [...exact.values()].sort(compareRecords);
  const headHash = await chainHash(canonical.map((record) => [record.source, record.sourceId, String(record.sourceTimestamp), record.payloadHash]));
  return Object.freeze({ records: Object.freeze(canonical), conflicts: Object.freeze(conflicts), headHash });
}

/** Group journal records into the SDK's five-minute update buckets — the same
 * windows the `/updates/{day}/{hour}/{interval}` endpoint and TxLINE's batch
 * roots use, so a journal interval maps one-to-one onto both. */
export function bucketJournalRecords<T extends CanonicalScoreRecord | CanonicalOddsRecord>(
  records: readonly JournalRecord<T>[],
): Map<string, { bucket: UpdateBucket; records: JournalRecord<T>[] }> {
  const buckets = new Map<string, { bucket: UpdateBucket; records: JournalRecord<T>[] }>();
  for (const record of records) {
    const bucket = updateBucket(record.sourceTimestamp);
    const key = `${bucket.epochDay}:${bucket.hourOfDay}:${bucket.interval}`;
    const entry = buckets.get(key) ?? { bucket, records: [] };
    entry.records.push(record);
    buckets.set(key, entry);
  }
  return buckets;
}

/** Compare what was delivered live against the canonical journal for one
 * five-minute bucket: "did what I saw match what everyone agrees on?" */
export async function reconcileInterval<T extends CanonicalScoreRecord | CanonicalOddsRecord>(
  bucket: UpdateBucket,
  delivered: readonly JournalRecord<T>[],
): Promise<ReconciliationReport> {
  const witnessHash = await chainHash(delivered.map((record) => [record.source, record.sourceId, record.payloadHash]));
  const canonical = await canonicalizeJournal(delivered);
  const canonicalHash = await chainHash(canonical.records.map((record) => [record.source, record.sourceId, record.payloadHash]));
  return Object.freeze({
    bucket,
    intervalStart: bucketStart(bucket).toISOString(),
    witnessHash,
    canonicalHash,
    changed: witnessHash !== canonicalHash,
    deliveredRecords: delivered.length,
    canonicalRecords: canonical.records.length,
    conflicts: canonical.conflicts,
  });
}
