import { describe, expect, test, vi } from "vitest";
import { createTxLineClient } from "../src/client.js";
import {
  bucketStart,
  classifyScoreEvent,
  epochDay,
  finalisationEvidence,
  impliedProbabilities,
  isStrictFinalisation,
  isSettlementFinalisation,
  normalizeOddsRecord,
  normalizeScoreRecord,
  semanticEvents,
  updateBucket,
} from "../src/data.js";
import type { CanonicalOddsRecord } from "../src/data.js";
import { HttpPipeline } from "../src/http.js";
import { resolveClientConfig } from "../src/core.js";
import { parseSseBlock, SseDecoder, streamSse } from "../src/sse.js";

const body = (chunks: string[]): ReadableStream<Uint8Array> => new ReadableStream({
  start(controller) {
    for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
    controller.close();
  },
});

describe("normalization, buckets, and semantics", () => {
  test("normalizes documented casing and preserves unknown fields", () => {
    expect(normalizeScoreRecord({ FixtureId: "42", Seq: "9", Ts: 100, Action: "GOAL", mystery: "kept" })).toEqual({
      FixtureId: "42", Seq: "9", Ts: 100, Action: "GOAL", mystery: "kept", fixtureId: 42, seq: 9, timestamp: 100, action: "GOAL", statusId: undefined, period: undefined,
    });
    expect(normalizeOddsRecord({ FixtureId: 42, MessageId: 9, BookmakerId: "2", Prices: [1.2, 3], PriceNames: ["home"], Pct: ["40"], extension: true })).toMatchObject({
      fixtureId: 42, messageId: "9", bookmakerId: 2, prices: [1.2, 3], priceNames: ["home"], percentages: ["40"], extension: true,
    });
    expect(normalizeOddsRecord({ Prices: ["bad"], PriceNames: [1], Pct: null })).toMatchObject({ prices: undefined, priceNames: undefined, percentages: undefined });
    expect(() => normalizeScoreRecord([])).toThrow(/object/);
    expect(() => normalizeOddsRecord("nope")).toThrow(/object/);
  });

  test("round-trips official five-minute UTC buckets", () => {
    const at = Date.UTC(2026, 6, 18, 22, 59, 59);
    expect(epochDay(at)).toBe(20652);
    const bucket = updateBucket(at);
    expect(bucket).toEqual({ epochDay: 20652, hourOfDay: 22, interval: 11 });
    expect(bucketStart(bucket).toISOString()).toBe("2026-07-18T22:55:00.000Z");
    expect(() => epochDay(-1)).toThrow(RangeError);
    expect(() => updateBucket(Number.NaN)).toThrow(RangeError);
    expect(() => bucketStart({ epochDay: 1, hourOfDay: 24, interval: 0 })).toThrow(RangeError);
  });

  test("requires all three finalisation fields and classifies semantic events", async () => {
    const final = normalizeScoreRecord({ Action: "game_finalised", StatusId: 100, Period: 100 });
    expect(isStrictFinalisation(final)).toBe(true);
    for (const partial of [
      { action: "game_finalised", statusId: 100, period: 99 },
      { action: "game_finalised", statusId: 99, period: 100 },
      { action: "goal", statusId: 100, period: 100 },
    ]) expect(isStrictFinalisation(partial)).toBe(false);
    const observedMainnet = normalizeScoreRecord({ Action: "game_finalised", StatusId: 100 });
    expect(isStrictFinalisation(observedMainnet)).toBe(false);
    expect(isSettlementFinalisation(observedMainnet)).toBe(true);
    expect(finalisationEvidence(observedMainnet)).toBe("provider-period-omitted");
    expect(finalisationEvidence(final)).toBe("explicit-period-100");
    expect(finalisationEvidence({ action: "game_finalised", statusId: 100, period: 99 })).toBeUndefined();
    const records = [
      normalizeScoreRecord({ Action: "goal" }),
      normalizeScoreRecord({ Action: "yellow_card" }),
      normalizeScoreRecord({ Action: "second_half" }),
      final,
      normalizeScoreRecord({ Action: "substitution" }),
    ];
    expect(records.map((record) => classifyScoreEvent(record).type)).toEqual(["goal", "card", "phase_change", "finalised", "other"]);
    const types: string[] = [];
    for await (const event of semanticEvents(records)) types.push(event.type);
    expect(types).toEqual(["goal", "card", "phase_change", "finalised", "other"]);
  });
});

describe("SSE protocol", () => {
  test("parses comments, multiline data, ids, events, retry hints, and chunk boundaries", () => {
    expect(parseSseBlock(": heartbeat\nid: 7\nevent: score\nretry: 25\ndata: one\ndata: two")).toEqual({
      raw: ": heartbeat\nid: 7\nevent: score\nretry: 25\ndata: one\ndata: two",
      id: "7", event: "score", retry: 25, data: "one\ntwo",
    });
    expect(parseSseBlock(": only comment")).toBeUndefined();
    expect(parseSseBlock("id: bad\0id\nretry: later\nevent\ndata:value")).toMatchObject({ event: "", data: "value" });
    const decoder = new SseDecoder();
    expect(decoder.push(new TextEncoder().encode("data: fir"))).toEqual([]);
    expect(decoder.push(new TextEncoder().encode("st\r\n\r\ndata: second"))).toMatchObject([{ data: "first" }]);
    expect(decoder.finish()).toMatchObject([{ data: "second" }]);
  });

  test("reconnects with Last-Event-ID and honors retry bounds", async () => {
    const headers: Array<string | null> = [];
    let call = 0;
    const fetch = vi.fn(async (_url: string | URL | Request, init: RequestInit = {}) => {
      headers.push(new Headers(init.headers).get("last-event-id"));
      call += 1;
      return new Response(body([call === 1 ? "id: a\nretry: 0\ndata: one\n\n" : "id: b\ndata: two\n\n"]), { status: 200 });
    });
    const http = new HttpPipeline(resolveClientConfig({ network: "devnet", baseUrl: "http://replay.test", fetch }));
    const iterator = streamSse(http, "/scores/stream", { minRetryMs: 0, maxRetryMs: 1 });
    await expect(iterator.next()).resolves.toMatchObject({ value: { id: "a", data: "one" } });
    await expect(iterator.next()).resolves.toMatchObject({ value: { id: "b", data: "two" } });
    await iterator.return(undefined);
    expect(headers).toEqual([null, "a"]);
  });

  test("surfaces non-retryable stream errors", async () => {
    const http = new HttpPipeline(resolveClientConfig({ network: "devnet", baseUrl: "http://replay.test", fetch: vi.fn(async () => new Response("forbidden", { status: 403 })) }));
    await expect(streamSse(http, "/scores/stream", { minRetryMs: 0 }).next()).rejects.toMatchObject({ code: "SSE_HTTP_ERROR", status: 403 });
  });
});

describe("historical, live, and odds adapters", () => {
  test("parses JSON and SSE history and awaitFinal short-circuits from history", async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const path = new URL(String(url)).pathname;
      if (path.includes("/historical/1")) return new Response(JSON.stringify([{ FixtureId: 1, Action: "goal" }]));
      if (path.includes("/historical/2")) return new Response("data: {\"FixtureId\":2,\"Action\":\"goal\"}\n\ndata: {\"FixtureId\":2,\"Action\":\"game_finalised\",\"StatusId\":100,\"Period\":100}\n\n");
      return new Response("missing", { status: 404 });
    });
    const tx = createTxLineClient({ network: "devnet", baseUrl: "http://replay.test", fetch });
    await expect(tx.data.historical(1)).resolves.toMatchObject([{ fixtureId: 1, action: "goal" }]);
    await expect(tx.data.historical(2)).resolves.toHaveLength(2);
    await expect(tx.data.awaitFinal(2)).resolves.toMatchObject({ action: "game_finalised", statusId: 100, period: 100 });
  });

  test("filters live score fixtures and decodes odds streams", async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const path = new URL(String(url)).pathname;
      const payload = path.includes("odds")
        ? "data: {\"FixtureId\":7,\"MessageId\":\"o1\",\"Prices\":[2.1]}\n\n"
        : "data: {\"FixtureId\":6,\"Action\":\"goal\"}\n\ndata: not-json\n\ndata: {\"FixtureId\":7,\"Action\":\"goal\"}\n\n";
      return new Response(body([payload]), { status: 200 });
    });
    const tx = createTxLineClient({ network: "devnet", baseUrl: "http://replay.test", fetch });
    const scores = tx.data.stream({ fixtures: [7], minRetryMs: 0 });
    await expect(scores.next()).resolves.toMatchObject({ value: { fixtureId: 7 } });
    await scores.return(undefined);
    const odds = tx.data.odds.stream({ minRetryMs: 0 });
    await expect(odds.next()).resolves.toMatchObject({ value: { fixtureId: 7, messageId: "o1", prices: [2.1] } });
    await odds.return(undefined);
  });
});

describe("implied probabilities", () => {
  const base = { fixtureId: 42, priceNames: ["Home", "Draw", "Away"] };

  test("prefers percentages and normalizes away the margin", () => {
    const result = impliedProbabilities({ ...base, percentages: ["46.9", "29.2", "26.3"] } as CanonicalOddsRecord);
    expect(result.source).toBe("percentages");
    expect(result.home + result.draw + result.away).toBeCloseTo(1, 12);
    expect(result.home).toBeCloseTo(0.469 / 1.024, 3);
    expect(result.overround).toBeCloseTo(0.024, 3);
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("inverts decimal prices and detects TxLINE's milli-odds scaling", () => {
    const plain = impliedProbabilities({ ...base, prices: [1.85, 3.9, 4.75] } as CanonicalOddsRecord);
    const milli = impliedProbabilities({ ...base, prices: [1_850, 3_900, 4_750] } as CanonicalOddsRecord);
    expect(plain.source).toBe("prices");
    expect(milli.home).toBeCloseTo(plain.home, 12);
    expect(milli.draw).toBeCloseTo(plain.draw, 12);
    expect(plain.overround).toBeGreaterThan(0);
    const forced = impliedProbabilities({ ...base, prices: [1_850, 3_900, 4_750] } as CanonicalOddsRecord, { priceScale: 1 });
    expect(forced.home).toBeCloseTo(milli.home, 12);
    expect(forced.overround).toBeCloseTo(milli.overround / 1_000 - 0.999, 3);
    expect(forced.overround).toBeLessThan(-0.99);
  });

  test("matches 1/x/2 and participant selection vocabularies", () => {
    const result = impliedProbabilities({ fixtureId: 42, priceNames: ["1", "X", "2"], prices: [2.0, 3.4, 4.2] } as CanonicalOddsRecord);
    expect(result.home).toBeGreaterThan(result.draw);
    const participants = impliedProbabilities({ fixtureId: 42, priceNames: ["Participant 1", "Draw", "Participant 2"], prices: [2.0, 3.4, 4.2] } as CanonicalOddsRecord);
    expect(participants.home).toBeCloseTo(result.home, 12);
  });

  test("scales home/draw/away from their own prices, ignoring an unrelated array entry's scale", () => {
    // Regression for the wi-5 review bug: the milli-odds-vs-decimal decision
    // was an array-wide "every(price >= 1_000)" over the *entire* raw prices
    // array, not just the entries priceNames actually resolves to home,
    // draw, or away. A record can carry extra positional entries (another
    // market line, a combined/derived selection, or other metadata riding
    // along in the same `prices` array) that don't map to a three-way
    // outcome at all. If that extra entry's value happens to be small, the
    // old "every" check would flip the *whole record's* scale to 1 even
    // though the three relevant prices are unambiguous milli-odds.
    //
    // A uniformly-wrong scale cancels out of the home/draw/away *ratio*
    // (dividing all three raw prices by the same wrong constant scale
    // doesn't change how they compare to each other after normalizing to
    // sum to 1) — so this bug does not change the returned home/draw/away
    // numbers. It does silently corrupt `overround`, the documented
    // pre-normalization bookmaker-margin field, by three orders of
    // magnitude, which is what this test proves.
    const mixed = {
      fixtureId: 42,
      priceNames: ["Home", "Draw", "Away", "Both Teams To Score"],
      // Home/Draw/Away are unambiguous milli-odds (>= 1_000). The fourth
      // entry is an unrelated selection this function doesn't read at all,
      // whose own raw value happens to be well under 1_000.
      prices: [1_850, 3_900, 4_750, 5],
    } as CanonicalOddsRecord;
    const result = impliedProbabilities(mixed);
    expect(result.source).toBe("prices");
    // Must match the known-good milli-odds decoding of the same three
    // prices in isolation, not an array-wide-corrupted scale=1 reading.
    const isolated = impliedProbabilities({ ...base, prices: [1_850, 3_900, 4_750] } as CanonicalOddsRecord);
    expect(result.home).toBeCloseTo(isolated.home, 12);
    expect(result.draw).toBeCloseTo(isolated.draw, 12);
    expect(result.away).toBeCloseTo(isolated.away, 12);
    expect(result.home + result.draw + result.away).toBeCloseTo(1, 12);
    // The overround is where a wrong scale decision actually shows up.
    expect(result.overround).toBeCloseTo(isolated.overround, 6);
    expect(result.overround).toBeGreaterThan(0);
    expect(result.overround).toBeLessThan(1);
  });

  test("raises ODDS_PROBABILITIES_UNAVAILABLE instead of guessing", () => {
    expect(() => impliedProbabilities({ fixtureId: 42 } as CanonicalOddsRecord)).toThrow(expect.objectContaining({ code: "ODDS_PROBABILITIES_UNAVAILABLE" }));
    expect(() => impliedProbabilities({ ...base } as CanonicalOddsRecord)).toThrow(expect.objectContaining({ code: "ODDS_PROBABILITIES_UNAVAILABLE" }));
    expect(() => impliedProbabilities({ fixtureId: 42, priceNames: ["Over", "Under"], prices: [1.9, 1.9] } as CanonicalOddsRecord)).toThrow(expect.objectContaining({ code: "ODDS_PROBABILITIES_UNAVAILABLE" }));
    expect(() => impliedProbabilities({ ...base, prices: [0, 0, 0] } as CanonicalOddsRecord)).toThrow(expect.objectContaining({ code: "ODDS_PROBABILITIES_UNAVAILABLE" }));
  });
});
