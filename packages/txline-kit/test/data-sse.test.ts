import { describe, expect, test, vi } from "vitest";
import { createTxLineClient } from "../src/client.js";
import {
  bucketStart,
  classifyScoreEvent,
  epochDay,
  isStrictFinalisation,
  normalizeOddsRecord,
  normalizeScoreRecord,
  semanticEvents,
  updateBucket,
} from "../src/data.js";
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
