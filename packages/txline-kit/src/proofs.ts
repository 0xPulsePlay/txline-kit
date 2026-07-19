import BN from "bn.js";
import { z } from "zod";
import type { CanonicalScoreRecord } from "./data.js";
import { DataClient } from "./data.js";
import { HttpError, ProofError } from "./errors.js";
import { HttpPipeline } from "./http.js";

export type Bytes32 = readonly number[];

export interface ProofNode {
  hash: Bytes32;
  isRightSibling: boolean;
}

export interface ProvenStat {
  key: number;
  value: number;
  period: number;
}

export interface ProofBundle {
  fixtureId: number;
  seq: number;
  requestedStatKeys: readonly number[];
  apiTimestamp?: BN;
  ts: BN;
  summary: {
    fixtureId: BN;
    updateStats: { updateCount: number; minTimestamp: BN; maxTimestamp: BN };
    eventsSubTreeRoot: Bytes32;
  };
  fixtureProof: readonly ProofNode[];
  mainTreeProof: readonly ProofNode[];
  eventStatRoot: Bytes32;
  stats: readonly { stat: ProvenStat; statProof: readonly ProofNode[] }[];
}

export interface FetchProofOptions {
  fixtureId: number;
  seq: number;
  statKeys: readonly number[];
  retry?: ProofRetryPolicy | true;
  /** Cancel the fetch even when no retry policy is active. Independent from
   * `retry`'s own signal, which additionally governs the backoff loop once
   * retry is enabled; passing `signal` alone must not switch on retry. */
  signal?: AbortSignal;
}

export interface FinalProofOptions {
  statKeys?: readonly number[];
  signal?: AbortSignal;
  retry?: ProofRetryPolicy | true;
}

export interface ProofRetryPolicy {
  initialDelayMs?: number;
  maximumDelayMs?: number;
  multiplier?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const rawRecord = z.record(z.string(), z.unknown());

function proofFailure(message: string, code: string, fix: string, cause?: unknown): never {
  throw new ProofError(message, { code, fix, cause });
}

function safeInteger(value: unknown, path: string): number {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isSafeInteger(number)) proofFailure(`${path} must be a safe integer`, "PROOF_INTEGER_INVALID", "Inspect the raw proof response and network selection.");
  return number;
}

function int32(value: unknown, path: string): number {
  const number = safeInteger(value, path);
  if (number < -2_147_483_648 || number > 2_147_483_647) proofFailure(`${path} is outside the signed 32-bit range`, "PROOF_INT32_INVALID", "Use a proof response compatible with the pinned TxLINE IDL.");
  return number;
}

function decodeBase64(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") return Uint8Array.from(Buffer.from(value, "base64"));
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function decodeBytes32(value: unknown, path = "hash"): Bytes32 {
  let bytes: Uint8Array;
  if (value instanceof Uint8Array) bytes = Uint8Array.from(value);
  else if (Array.isArray(value) && value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) bytes = Uint8Array.from(value as number[]);
  else if (typeof value === "string") {
    const source = value.trim();
    if (/^0x[0-9a-fA-F]*$/.test(source)) {
      if ((source.length - 2) % 2 !== 0) proofFailure(`${path} has odd-length hexadecimal encoding`, "PROOF_HASH_ENCODING_INVALID", "Use a 0x-prefixed 64-digit hex string, base64 string, byte array, or Uint8Array.");
      bytes = Uint8Array.from(source.slice(2).match(/.{2}/g)?.map((pair) => Number.parseInt(pair, 16)) ?? []);
    } else {
      try { bytes = decodeBase64(source); } catch (cause) {
        proofFailure(`${path} is not valid base64`, "PROOF_HASH_ENCODING_INVALID", "Use a 0x-prefixed 64-digit hex string, base64 string, byte array, or Uint8Array.", cause);
      }
    }
  } else {
    proofFailure(`${path} uses an unsupported hash encoding`, "PROOF_HASH_ENCODING_INVALID", "Use a 0x-prefixed hex string, base64 string, byte array, or Uint8Array.");
  }
  if (bytes.length !== 32) proofFailure(`${path} must decode to exactly 32 bytes; received ${bytes.length}`, "PROOF_HASH_LENGTH_INVALID", "Confirm proof hashes are not truncated, reversed, or taken from a different response shape.");
  return Object.freeze([...bytes]);
}

function nodes(value: unknown, path: string): readonly ProofNode[] {
  if (!Array.isArray(value)) proofFailure(`${path} must be an array`, "PROOF_NODES_INVALID", "Use the proof array returned by the V2 stat-validation endpoint.");
  return Object.freeze(value.map((item, index) => {
    const parsed = rawRecord.safeParse(item);
    if (!parsed.success || typeof parsed.data.isRightSibling !== "boolean") {
      proofFailure(`${path}[${index}] is not a valid proof node`, "PROOF_NODE_INVALID", "Each node needs a 32-byte hash and boolean isRightSibling.", parsed.success ? undefined : parsed.error);
    }
    return Object.freeze({ hash: decodeBytes32(parsed.data.hash, `${path}[${index}].hash`), isRightSibling: parsed.data.isRightSibling });
  }));
}

function stat(value: unknown, path: string): ProvenStat {
  const parsed = rawRecord.safeParse(value);
  if (!parsed.success) proofFailure(`${path} must be an object`, "PROOF_STAT_INVALID", "Use statsToProve from the V2 response.", parsed.error);
  return Object.freeze({ key: safeInteger(parsed.data.key, `${path}.key`), value: int32(parsed.data.value, `${path}.value`), period: int32(parsed.data.period, `${path}.period`) });
}

export function normalizeProofBundle(raw: unknown, request: FetchProofOptions): ProofBundle {
  const value = rawRecord.safeParse(raw);
  if (!value.success) proofFailure("Proof response must be an object", "PROOF_RESPONSE_INVALID", "Inspect the selected endpoint and provider response.", value.error);
  const source = value.data;
  const summaryResult = rawRecord.safeParse(source.summary);
  if (!summaryResult.success) proofFailure("Proof response summary must be an object", "PROOF_SUMMARY_INVALID", "Use a successful V2 stat-validation response.", summaryResult.error);
  const summary = summaryResult.data;
  const updateResult = rawRecord.safeParse(summary.updateStats);
  if (!updateResult.success) proofFailure("Proof updateStats must be an object", "PROOF_UPDATE_STATS_INVALID", "Use a successful V2 stat-validation response.", updateResult.error);
  if (!Array.isArray(source.statsToProve) || !Array.isArray(source.statProofs) || source.statsToProve.length !== source.statProofs.length) {
    proofFailure("Proof statsToProve and statProofs must be parallel arrays", "PROOF_STAT_ARRAY_MISMATCH", "Request the current V2 shape with the statKeys query parameter.");
  }
  const statsToProve = source.statsToProve;
  const statProofs = source.statProofs;
  const proven = statsToProve.map((item, index) => stat(item, `statsToProve[${index}]`));
  if (proven.length !== request.statKeys.length || proven.some((item, index) => item.key !== request.statKeys[index])) {
    proofFailure(`Proof stat order does not match requested statKeys [${request.statKeys.join(",")}]`, "PROOF_STAT_ORDER_MISMATCH", "Keep requested statKeys and positional strategy indexes in the same order.");
  }
  const minTimestamp = safeInteger(updateResult.data.minTimestamp, "summary.updateStats.minTimestamp");
  const fixtureId = safeInteger(summary.fixtureId, "summary.fixtureId");
  if (fixtureId !== request.fixtureId) proofFailure(`Proof fixture ${fixtureId} does not match requested fixture ${request.fixtureId}`, "PROOF_FIXTURE_MISMATCH", "Do not combine a proof response with another request or fixture.");
  return Object.freeze({
    fixtureId,
    seq: request.seq,
    requestedStatKeys: Object.freeze([...request.statKeys]),
    ...(source.ts === undefined ? {} : { apiTimestamp: new BN(safeInteger(source.ts, "ts")) }),
    ts: new BN(minTimestamp),
    summary: Object.freeze({
      fixtureId: new BN(fixtureId),
      updateStats: Object.freeze({
        updateCount: int32(updateResult.data.updateCount, "summary.updateStats.updateCount"),
        minTimestamp: new BN(minTimestamp),
        maxTimestamp: new BN(safeInteger(updateResult.data.maxTimestamp, "summary.updateStats.maxTimestamp")),
      }),
      eventsSubTreeRoot: decodeBytes32(summary.eventStatsSubTreeRoot, "summary.eventStatsSubTreeRoot"),
    }),
    fixtureProof: nodes(source.subTreeProof, "subTreeProof"),
    mainTreeProof: nodes(source.mainTreeProof, "mainTreeProof"),
    eventStatRoot: decodeBytes32(source.eventStatRoot, "eventStatRoot"),
    stats: Object.freeze(proven.map((item, index) => Object.freeze({ stat: item, statProof: nodes(statProofs[index], `statProofs[${index}]`) }))),
  });
}

function requireRequest(options: FetchProofOptions): void {
  if (!Number.isSafeInteger(options.fixtureId) || options.fixtureId < 1) proofFailure("fixtureId must be a positive integer", "PROOF_FIXTURE_INVALID", "Pass the fixture ID from a score record.");
  if (!Number.isSafeInteger(options.seq) || options.seq < 1) proofFailure("seq must be at least 1; TxLINE score sequences begin at 1", "PROOF_SEQ_INVALID", "Pass Seq/seq from a real score record; seq=0 is not valid.");
  if (!options.statKeys.length || options.statKeys.some((key) => !Number.isSafeInteger(key) || key < 0) || new Set(options.statKeys).size !== options.statKeys.length) {
    proofFailure("statKeys must contain unique non-negative integer IDs", "PROOF_STAT_KEYS_INVALID", "Use confirmed stat keys once each, in strategy order.");
  }
}

function recordSeq(record: CanonicalScoreRecord): number {
  if (!Number.isSafeInteger(record.seq) || record.seq! < 1) proofFailure("Finalisation record did not contain a valid Seq/seq", "FINAL_PROOF_SEQ_MISSING", "Use a finalisation record from historical or streaming scores that includes its sequence.");
  return record.seq!;
}

const PENDING_PROOF_STATUSES = new Set([404, 409, 425]);

export function isProofPending(error: unknown): boolean {
  return error instanceof HttpError && error.status !== undefined && PENDING_PROOF_STATUSES.has(error.status);
}

function sleepUnlessAborted(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function retryNumber(value: number | undefined, fallback: number, name: string, minimum: number): number {
  const result = value ?? fallback;
  if (!Number.isFinite(result) || result < minimum) {
    proofFailure(`${name} must be a number of at least ${minimum}`, "PROOF_RETRY_POLICY_INVALID", "Use positive backoff bounds; omit fields to accept the defaults.");
  }
  return result;
}

export async function waitForProofAvailability<T>(fetchProof: () => Promise<T>, policy: ProofRetryPolicy = {}): Promise<T> {
  const initial = retryNumber(policy.initialDelayMs, 750, "initialDelayMs", 1);
  const maximum = retryNumber(policy.maximumDelayMs, 8_000, "maximumDelayMs", initial);
  const multiplier = retryNumber(policy.multiplier, 1.7, "multiplier", 1);
  const timeout = retryNumber(policy.timeoutMs, 360_000, "timeoutMs", 1);
  const now = policy.now ?? Date.now;
  const sleep = policy.sleep ?? sleepUnlessAborted;
  const started = now();
  let delay = initial;
  for (;;) {
    policy.signal?.throwIfAborted();
    try {
      return await fetchProof();
    } catch (error) {
      if (!isProofPending(error)) throw error;
      const elapsed = now() - started;
      if (elapsed >= timeout) {
        proofFailure(`Proof remained unavailable for ${timeout}ms`, "PROOF_AVAILABILITY_TIMEOUT", "TxLINE anchors roots shortly after each five-minute interval closes; extend timeoutMs or retry once the daily root is anchored.", error);
      }
      // Cap the sleep to the remaining budget so wall-clock time never
      // overshoots the advertised timeoutMs by a full backoff interval --
      // previously the deadline was only checked BEFORE sleeping, then the
      // full computed `delay` always elapsed regardless of how close to the
      // deadline it was.
      const remainingBudget = timeout - elapsed;
      await sleep(Math.min(delay, remainingBudget), policy.signal);
      delay = Math.min(maximum, Math.ceil(delay * multiplier));
    }
  }
}

/**
 * Merge a top-level AbortSignal into a proof retry policy. The signal takes
 * effect both between retry attempts (checked in waitForProofAvailability's
 * loop and its backoff sleep) and for the in-flight HTTP request itself. A
 * signal already present on an explicit retry policy wins over the
 * top-level one, mirroring KeeperClient.prepare's merge precedence.
 */
function mergeRetrySignal(retry: ProofRetryPolicy | true | undefined, signal: AbortSignal | undefined): ProofRetryPolicy | true | undefined {
  if (!signal) return retry;
  if (retry === undefined) return { signal };
  if (retry === true) return { signal };
  return { signal, ...retry };
}

export class ProofClient {
  constructor(private readonly http: HttpPipeline, private readonly data: DataClient) {}

  async fetch(options: FetchProofOptions): Promise<ProofBundle> {
    requireRequest(options);
    const retrySignal = options.retry && options.retry !== true ? options.retry.signal : undefined;
    const requestSignal = retrySignal ?? options.signal;
    const once = async (): Promise<ProofBundle> => {
      const query = new URLSearchParams({ fixtureId: String(options.fixtureId), seq: String(options.seq), statKeys: options.statKeys.join(",") });
      const response = await this.http.request(`/scores/stat-validation?${query}`, requestSignal ? { signal: requestSignal } : {});
      await this.http.expectOk(response, "score stat proof");
      let raw: unknown;
      try { raw = await response.json(); } catch (cause) {
        proofFailure("Score proof endpoint did not return valid JSON", "PROOF_JSON_INVALID", "Inspect provider availability and the selected replay or network host.", cause);
      }
      return normalizeProofBundle(raw, options);
    };
    if (options.retry === undefined) return once();
    return waitForProofAvailability(once, options.retry === true ? {} : options.retry);
  }

  /** `retry` stays opt-in even when `signal` is supplied: a caller passing
   * only a cancellation signal must keep the documented single-attempt
   * fail-fast default, not silently gain a bounded multi-minute retry wait.
   * The signal still cancels the one HTTP attempt via `fetch`'s own
   * `signal` field, independent of whether retry is active. */
  async forFinal(fixtureId: number, options: FinalProofOptions = {}): Promise<ProofBundle> {
    const final = await this.data.awaitFinal(fixtureId, options.signal ? { signal: options.signal } : {});
    const retry = options.retry === undefined ? undefined : mergeRetrySignal(options.retry, options.signal);
    return this.fetch({
      fixtureId,
      seq: recordSeq(final),
      statKeys: options.statKeys ?? [1, 2],
      ...(retry === undefined ? {} : { retry }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  }
}
