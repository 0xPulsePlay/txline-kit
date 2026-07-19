import { z } from "zod";
import { DataShapeError } from "./errors.js";
import { HttpPipeline } from "./http.js";
import { parseSseBlock, streamSse, type SseMessage, type StreamSseOptions } from "./sse.js";

const unknownRecord = z.record(z.string(), z.unknown());

function first(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) if (record[key] !== undefined) return record[key];
  return undefined;
}

function integer(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : value === undefined || value === null ? undefined : String(value);
}

export interface CanonicalScoreRecord extends Record<string, unknown> {
  fixtureId?: number | undefined;
  seq?: number | undefined;
  timestamp?: number | undefined;
  action?: string | undefined;
  statusId?: number | undefined;
  period?: number | undefined;
}

export interface CanonicalOddsRecord extends Record<string, unknown> {
  fixtureId?: number | undefined;
  messageId?: string | undefined;
  timestamp?: number | undefined;
  bookmaker?: string | undefined;
  bookmakerId?: number | undefined;
  superOddsType?: string | undefined;
  marketPeriod?: string | undefined;
  priceNames?: string[] | undefined;
  prices?: number[] | undefined;
  percentages?: string[] | undefined;
}

export function normalizeScoreRecord(value: unknown): CanonicalScoreRecord {
  const record = unknownRecord.safeParse(value);
  if (!record.success) {
    throw new DataShapeError("Expected a TxLINE score record object", {
      code: "SCORE_RECORD_INVALID",
      fix: "Inspect the raw provider response and update boundary normalization before consuming it.",
      cause: record.error,
    });
  }
  const source = record.data;
  return {
    ...source,
    fixtureId: integer(first(source, "fixtureId", "FixtureId")),
    seq: integer(first(source, "seq", "Seq")),
    timestamp: integer(first(source, "timestamp", "Timestamp", "ts", "Ts")),
    action: text(first(source, "action", "Action")),
    statusId: integer(first(source, "statusId", "StatusId")),
    period: integer(first(source, "period", "Period")),
  };
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? [...value] : undefined;
}

function numberArray(value: unknown): number[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item)) ? [...value] : undefined;
}

export function normalizeOddsRecord(value: unknown): CanonicalOddsRecord {
  const record = unknownRecord.safeParse(value);
  if (!record.success) {
    throw new DataShapeError("Expected a TxLINE odds record object", {
      code: "ODDS_RECORD_INVALID",
      fix: "Inspect the raw odds response before consuming an undocumented provider shape.",
      cause: record.error,
    });
  }
  const source = record.data;
  return {
    ...source,
    fixtureId: integer(first(source, "fixtureId", "FixtureId")),
    messageId: text(first(source, "messageId", "MessageId")),
    timestamp: integer(first(source, "timestamp", "Timestamp", "ts", "Ts")),
    bookmaker: text(first(source, "bookmaker", "Bookmaker")),
    bookmakerId: integer(first(source, "bookmakerId", "BookmakerId")),
    superOddsType: text(first(source, "superOddsType", "SuperOddsType")),
    marketPeriod: text(first(source, "marketPeriod", "MarketPeriod")),
    priceNames: stringArray(first(source, "priceNames", "PriceNames")),
    prices: numberArray(first(source, "prices", "Prices")),
    percentages: stringArray(first(source, "percentages", "Pct", "pct")),
  };
}

export interface ImpliedProbabilities {
  home: number;
  draw: number;
  away: number;
  /** Which record field produced the numbers. */
  source: "percentages" | "prices";
  /** Bookmaker margin before normalization: sum of raw implied probabilities minus one. */
  overround: number;
}

function oddsFailure(message: string, fix: string, cause?: unknown): never {
  throw new DataShapeError(message, { code: "ODDS_PROBABILITIES_UNAVAILABLE", fix, cause });
}

function outcomeFor(name: string): "home" | "draw" | "away" | undefined {
  const normalized = name.trim().toLowerCase();
  if (normalized.includes("draw") || normalized === "x") return "draw";
  if (normalized.includes("home") || normalized.includes("participant 1") || normalized.includes("participant1") || normalized === "1") return "home";
  if (normalized.includes("away") || normalized.includes("participant 2") || normalized.includes("participant2") || normalized === "2") return "away";
  return undefined;
}

/** Convert a canonical odds record's raw `percentages` or decimal `prices`
 * into a normalized match-result probability triple.
 *
 * Percentages are preferred when present; otherwise decimal prices are
 * inverted, treating uniformly large values (all >= 1000) as milli-odds —
 * TxLINE's consensus feed publishes decimal odds scaled by 1000. Pass
 * `priceScale` to bypass that heuristic. The triple is normalized to sum to
 * one and the pre-normalization margin is reported as `overround`. */
export function impliedProbabilities(record: CanonicalOddsRecord, options: { priceScale?: number } = {}): ImpliedProbabilities {
  const names = record.priceNames;
  if (!names || names.length === 0) oddsFailure("Odds record carries no priceNames to identify outcomes", "Use a match-result odds record that names its selections (home/draw/away, participant 1/2, or 1/x/2).");
  const raw: Partial<Record<"home" | "draw" | "away", number>> = {};
  let source: "percentages" | "prices";
  if (record.percentages && record.percentages.length > 0) {
    source = "percentages";
    const percentages = record.percentages;
    names.forEach((name, index) => {
      const outcome = outcomeFor(name);
      const value = Number(percentages[index]);
      if (outcome && Number.isFinite(value) && value > 0) raw[outcome] = value > 1 ? value / 100 : value;
    });
  } else if (record.prices && record.prices.length > 0) {
    source = "prices";
    const prices = record.prices;
    const scale = options.priceScale ?? (prices.every((price) => price >= 1_000) ? 1_000 : 1);
    names.forEach((name, index) => {
      const entry = prices[index];
      const outcome = outcomeFor(name);
      const price = entry === undefined ? Number.NaN : entry / scale;
      if (outcome && Number.isFinite(price) && price > 0) raw[outcome] = 1 / price;
    });
  } else {
    oddsFailure("Odds record carries neither percentages nor prices", "Use a record from the odds snapshot, updates, or stream endpoints; do not strip its price arrays.");
  }
  if (raw.home === undefined || raw.draw === undefined || raw.away === undefined) {
    oddsFailure(`Could not identify home, draw, and away among priceNames [${names.join(", ")}]`, "Implied probabilities support three-way match-result markets; check superOddsType and marketPeriod for the record you selected.");
  }
  const total = raw.home + raw.draw + raw.away;
  if (!Number.isFinite(total) || total <= 0) oddsFailure("Implied probabilities did not sum to a positive value", "Inspect the record's price values; zero or negative prices are not usable.");
  return Object.freeze({
    home: raw.home / total,
    draw: raw.draw / total,
    away: raw.away / total,
    source,
    overround: total - 1,
  });
}

function requireArray(value: unknown, operation: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new DataShapeError(`${operation} returned a non-array payload`, {
      code: "API_ARRAY_EXPECTED",
      fix: "Inspect the raw provider response and confirm the endpoint/network combination.",
    });
  }
  return value;
}

export function epochDay(timestamp: number | Date): number {
  const millis = timestamp instanceof Date ? timestamp.getTime() : timestamp;
  if (!Number.isFinite(millis) || millis < 0) throw new RangeError("timestamp must be a non-negative millisecond value");
  return Math.floor(millis / 86_400_000);
}

export interface UpdateBucket { epochDay: number; hourOfDay: number; interval: number }

export function updateBucket(timestamp: number | Date): UpdateBucket {
  const millis = timestamp instanceof Date ? timestamp.getTime() : timestamp;
  if (!Number.isFinite(millis) || millis < 0) throw new RangeError("timestamp must be a non-negative millisecond value");
  const date = new Date(millis);
  return { epochDay: epochDay(millis), hourOfDay: date.getUTCHours(), interval: Math.floor(date.getUTCMinutes() / 5) };
}

export function bucketStart(bucket: UpdateBucket): Date {
  if (!Number.isSafeInteger(bucket.epochDay) || bucket.epochDay < 0 || !Number.isSafeInteger(bucket.hourOfDay) || bucket.hourOfDay < 0 || bucket.hourOfDay > 23 || !Number.isSafeInteger(bucket.interval) || bucket.interval < 0 || bucket.interval > 11) {
    throw new RangeError("Invalid five-minute update bucket");
  }
  return new Date((bucket.epochDay * 86_400 + bucket.hourOfDay * 3_600 + bucket.interval * 300) * 1000);
}

export function isStrictFinalisation(record: CanonicalScoreRecord): boolean {
  return record.action?.toLowerCase() === "game_finalised" && record.statusId === 100 && record.period === 100;
}

export type FinalisationEvidence = "explicit-period-100" | "provider-period-omitted";

export function finalisationEvidence(record: CanonicalScoreRecord): FinalisationEvidence | undefined {
  if (record.action?.toLowerCase() !== "game_finalised" || record.statusId !== 100) return undefined;
  if (record.period === 100) return "explicit-period-100";
  if (record.period === undefined) return "provider-period-omitted";
  return undefined;
}

export function isSettlementFinalisation(record: CanonicalScoreRecord): boolean {
  return finalisationEvidence(record) !== undefined;
}

export type SemanticEventType = "goal" | "card" | "phase_change" | "finalised" | "other";
export interface SemanticScoreEvent { type: SemanticEventType; record: CanonicalScoreRecord }

export function classifyScoreEvent(record: CanonicalScoreRecord): SemanticScoreEvent {
  if (isSettlementFinalisation(record)) return { type: "finalised", record };
  const action = record.action?.toLowerCase() ?? "";
  if (action === "goal" || action === "penalty_goal" || action === "own_goal") return { type: "goal", record };
  if (action.includes("card") || action === "booking") return { type: "card", record };
  if (action.includes("period") || action.includes("half") || action.includes("phase") || action === "kickoff") return { type: "phase_change", record };
  return { type: "other", record };
}

async function* toAsync<T>(source: AsyncIterable<T> | Iterable<T>): AsyncGenerator<T> {
  for await (const item of source) yield item;
}

export async function* semanticEvents(source: AsyncIterable<CanonicalScoreRecord> | Iterable<CanonicalScoreRecord>): AsyncGenerator<SemanticScoreEvent> {
  for await (const record of toAsync(source)) yield classifyScoreEvent(record);
}

export interface ScoreStreamOptions extends StreamSseOptions { fixtures?: readonly number[] }

function scoreFromMessage(message: SseMessage): CanonicalScoreRecord | undefined {
  if (!message.data) return undefined;
  try { return normalizeScoreRecord(JSON.parse(message.data)); } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

function historicalRecords(body: string): CanonicalScoreRecord[] {
  try {
    return requireArray(JSON.parse(body), "scores historical").map(normalizeScoreRecord);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  const records: CanonicalScoreRecord[] = [];
  for (const block of body.split(/\r?\n\r?\n/)) {
    const message = parseSseBlock(block);
    const record = message ? scoreFromMessage(message) : undefined;
    if (record) records.push(record);
  }
  return records;
}

export class DataClient {
  readonly odds: OddsDataClient;

  constructor(private readonly http: HttpPipeline) {
    this.odds = new OddsDataClient(http);
  }

  async snapshot(fixtureId: number, options: { asOf?: number | Date } = {}): Promise<CanonicalScoreRecord[]> {
    const asOf = options.asOf instanceof Date ? options.asOf.getTime() : options.asOf;
    const query = asOf === undefined ? "" : `?asOf=${encodeURIComponent(String(asOf))}`;
    return requireArray(await this.json(`/scores/snapshot/${fixtureId}${query}`, "scores snapshot"), "scores snapshot").map(normalizeScoreRecord);
  }

  async updates(options: { at: Date | number }): Promise<CanonicalScoreRecord[]> {
    const bucket = updateBucket(options.at);
    return requireArray(await this.json(`/scores/updates/${bucket.epochDay}/${bucket.hourOfDay}/${bucket.interval}`, "scores updates"), "scores updates").map(normalizeScoreRecord);
  }

  async historical(fixtureId: number): Promise<CanonicalScoreRecord[]> {
    const response = await this.http.request(`/scores/historical/${fixtureId}`);
    await this.http.expectOk(response, "scores historical");
    return historicalRecords(await response.text());
  }

  async schedule(options: { from?: Date; to?: Date } = {}): Promise<Record<string, unknown>[]> {
    const query = new URLSearchParams();
    if (options.from) query.set("from", options.from.toISOString());
    if (options.to) query.set("to", options.to.toISOString());
    const suffix = query.size ? `?${query}` : "";
    return requireArray(await this.json(`/fixtures/snapshot${suffix}`, "fixture schedule"), "fixture schedule").map((value) => unknownRecord.parse(value));
  }

  async *stream(options: ScoreStreamOptions = {}): AsyncGenerator<CanonicalScoreRecord> {
    const fixtureSet = options.fixtures ? new Set(options.fixtures) : undefined;
    for await (const message of streamSse(this.http, "/scores/stream", options)) {
      const record = scoreFromMessage(message);
      if (!record) continue;
      if (fixtureSet && (record.fixtureId === undefined || !fixtureSet.has(record.fixtureId))) continue;
      yield record;
    }
  }

  events(source: AsyncIterable<CanonicalScoreRecord> | Iterable<CanonicalScoreRecord>): AsyncGenerator<SemanticScoreEvent> {
    return semanticEvents(source);
  }

  async awaitFinal(fixtureId: number, options: StreamSseOptions = {}): Promise<CanonicalScoreRecord> {
    try {
      const historical = await this.historical(fixtureId);
      for (let index = historical.length - 1; index >= 0; index -= 1) {
        const candidate = historical[index];
        if (candidate && isSettlementFinalisation(candidate)) return candidate;
      }
    } catch { /* historical availability is bounded; continue with live stream */ }
    for await (const record of this.stream({ ...options, fixtures: [fixtureId] })) {
      if (isSettlementFinalisation(record)) return record;
    }
    throw options.signal?.reason ?? new Error(`Finalisation stream ended for fixture ${fixtureId}`);
  }

  private async json(path: string, operation: string): Promise<unknown> {
    const response = await this.http.request(path);
    await this.http.expectOk(response, operation);
    try { return await response.json(); } catch (cause) {
      throw new DataShapeError(`${operation} did not return valid JSON`, {
        code: "API_JSON_INVALID",
        fix: "Inspect the raw provider response and selected endpoint.",
        cause,
      });
    }
  }
}

export class OddsDataClient {
  constructor(private readonly http: HttpPipeline) {}

  async snapshot(fixtureId: number): Promise<CanonicalOddsRecord[]> {
    return requireArray(await this.json(`/odds/snapshot/${fixtureId}`, "odds snapshot"), "odds snapshot").map(normalizeOddsRecord);
  }

  async updates(options: { at: Date | number }): Promise<CanonicalOddsRecord[]> {
    const bucket = updateBucket(options.at);
    return requireArray(await this.json(`/odds/updates/${bucket.epochDay}/${bucket.hourOfDay}/${bucket.interval}`, "odds updates"), "odds updates").map(normalizeOddsRecord);
  }

  async *stream(options: StreamSseOptions = {}): AsyncGenerator<CanonicalOddsRecord> {
    for await (const message of streamSse(this.http, "/odds/stream", options)) {
      if (!message.data) continue;
      try { yield normalizeOddsRecord(JSON.parse(message.data)); } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    }
  }

  private async json(path: string, operation: string): Promise<unknown> {
    const response = await this.http.request(path);
    await this.http.expectOk(response, operation);
    try { return await response.json(); } catch (cause) {
      throw new DataShapeError(`${operation} did not return valid JSON`, {
        code: "API_JSON_INVALID",
        fix: "Inspect the raw provider response and selected endpoint.",
        cause,
      });
    }
  }
}
