import { createHash } from "node:crypto";
import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, test, vi } from "vitest";
import { createTxLineClient } from "../src/client.js";
import { resolveClientConfig } from "../src/core.js";
import { DataClient } from "../src/data.js";
import { HttpError, ProofError, VerificationError } from "../src/errors.js";
import { HttpPipeline } from "../src/http.js";
import { dailyScoresPda, deriveRootPda, healTimestampMillis, merkleRootFromLeaf, OnchainClient, oddsBatchRootPda, verifyMerklePath } from "../src/onchain.js";
import { decodeBytes32, isProofPending, normalizeProofBundle, ProofClient, waitForProofAvailability } from "../src/proofs.js";

const bytes = (seed: number) => Array.from({ length: 32 }, (_, index) => (seed + index) % 256);
const node = (seed: number, isRightSibling = true) => ({ hash: bytes(seed), isRightSibling });

function rawProof(statKeys: readonly number[] = [1, 2]) {
  return {
    ts: 1_783_828_320_805,
    summary: {
      fixtureId: "18241006",
      updateStats: { updateCount: 2, minTimestamp: "1783828320792", maxTimestamp: 1_783_828_320_805 },
      eventStatsSubTreeRoot: `0x${Buffer.from(bytes(1)).toString("hex")}`,
    },
    subTreeProof: [node(2, false)],
    mainTreeProof: [{ hash: Buffer.from(bytes(3)).toString("base64"), isRightSibling: true }],
    eventStatRoot: bytes(4),
    statsToProve: statKeys.map((key, index) => ({ key, value: index, period: 100 })),
    statProofs: statKeys.map((_, index) => [node(5 + index)]),
  };
}

describe("proof normalization", () => {
  test("decodes every supported hash format to immutable 32-byte arrays", () => {
    const value = bytes(9);
    expect(decodeBytes32(value)).toEqual(value);
    expect(decodeBytes32(Uint8Array.from(value))).toEqual(value);
    expect(decodeBytes32(`0x${Buffer.from(value).toString("hex")}`)).toEqual(value);
    expect(decodeBytes32(Buffer.from(value).toString("base64"))).toEqual(value);
    expect(Object.isFrozen(decodeBytes32(value))).toBe(true);
    expect(() => decodeBytes32([1, 2], "mainTreeProof[3].hash")).toThrow(/mainTreeProof\[3\].hash.*32 bytes/);
    expect(() => decodeBytes32(Buffer.from([1, 2]).toString("base64"))).toThrow(/32 bytes/);
    expect(() => decodeBytes32([256])).toThrow(/unsupported/);
    expect(() => decodeBytes32("0xabc")).toThrow(/odd-length/);
    expect(() => decodeBytes32({ nope: true })).toThrow(/unsupported/);
  });

  test("constructs BNs, preserves requested order, and uses minTimestamp for payload ts", () => {
    const bundle = normalizeProofBundle(rawProof(), { fixtureId: 18_241_006, seq: 108, statKeys: [1, 2] });
    expect(bundle.fixtureId).toBe(18_241_006);
    expect(bundle.seq).toBe(108);
    expect(bundle.requestedStatKeys).toEqual([1, 2]);
    expect(bundle.summary.fixtureId.toString()).toBe("18241006");
    expect(bundle.apiTimestamp?.toString()).toBe("1783828320805");
    expect(bundle.ts.toString()).toBe("1783828320792");
    expect(bundle.summary.updateStats.minTimestamp.toString()).toBe(bundle.ts.toString());
    expect(bundle.stats.map(({ stat }) => stat.key)).toEqual([1, 2]);
    expect(bundle.fixtureProof[0]).toMatchObject({ isRightSibling: false, hash: bytes(2) });
    expect(Object.isFrozen(bundle)).toBe(true);
    const withoutApiTs = normalizeProofBundle({ ...rawProof(), ts: undefined }, { fixtureId: 18_241_006, seq: 108, statKeys: [1, 2] });
    expect(withoutApiTs.apiTimestamp).toBeUndefined();
  });

  test("rejects positional, fixture, integer, and shape mismatches with fix hints", () => {
    const request = { fixtureId: 18_241_006, seq: 108, statKeys: [1, 2] } as const;
    expect(() => normalizeProofBundle({ ...rawProof(), statsToProve: [{ key: 2, value: 0, period: 0 }, { key: 1, value: 0, period: 0 }] }, request)).toThrow(/stat order/);
    expect(() => normalizeProofBundle({ ...rawProof(), summary: { ...rawProof().summary, fixtureId: 99 } }, request)).toThrow(/does not match requested/);
    expect(() => normalizeProofBundle({ ...rawProof(), statProofs: [] }, request)).toThrow(/parallel arrays/);
    expect(() => normalizeProofBundle({ ...rawProof(), subTreeProof: [{ hash: bytes(1), isRightSibling: "yes" }] }, request)).toThrow(/valid proof node/);
    expect(() => normalizeProofBundle([], request)).toThrow(ProofError);
    try { normalizeProofBundle({ ...rawProof(), eventStatRoot: [1] }, request); } catch (error) {
      expect(error).toMatchObject({ code: "PROOF_HASH_LENGTH_INVALID", fix: expect.stringContaining("truncated") });
    }
  });
});

describe("proof client", () => {
  test("builds the V2 query, authenticates through the client, and normalizes", async () => {
    const seen: string[] = [];
    const fetch = vi.fn(async (url: string | URL | Request) => { seen.push(String(url)); return new Response(JSON.stringify(rawProof()), { status: 200 }); });
    const tx = createTxLineClient({ network: "mainnet", baseUrl: "http://replay.test", fetch });
    await expect(tx.proofs.fetch({ fixtureId: 18_241_006, seq: 108, statKeys: [1, 2] })).resolves.toMatchObject({ fixtureId: 18_241_006, seq: 108 });
    expect(seen).toEqual(["http://replay.test/api/scores/stat-validation?fixtureId=18241006&seq=108&statKeys=1%2C2"]);
  });

  test("guards seq, keys, provider JSON, and final-record composition", async () => {
    const http = new HttpPipeline(resolveClientConfig({ network: "mainnet", baseUrl: "http://replay.test", fetch: vi.fn(async () => new Response("bad")) }));
    const data = { awaitFinal: vi.fn(async () => ({ seq: 400 })) } as unknown as DataClient;
    const proofs = new ProofClient(http, data);
    await expect(proofs.fetch({ fixtureId: 0, seq: 1, statKeys: [1] })).rejects.toMatchObject({ code: "PROOF_FIXTURE_INVALID" });
    await expect(proofs.fetch({ fixtureId: 1, seq: 0, statKeys: [1] })).rejects.toMatchObject({ code: "PROOF_SEQ_INVALID" });
    await expect(proofs.fetch({ fixtureId: 1, seq: 1, statKeys: [1, 1] })).rejects.toMatchObject({ code: "PROOF_STAT_KEYS_INVALID" });
    await expect(proofs.fetch({ fixtureId: 1, seq: 1, statKeys: [1] })).rejects.toMatchObject({ code: "PROOF_JSON_INVALID" });

    const finalHttp = new HttpPipeline(resolveClientConfig({ network: "mainnet", baseUrl: "http://replay.test", fetch: vi.fn(async () => new Response(JSON.stringify(rawProof([1, 2])), { status: 200 })) }));
    const finalProofs = new ProofClient(finalHttp, data);
    await expect(finalProofs.forFinal(18_241_006)).resolves.toMatchObject({ seq: 400, requestedStatKeys: [1, 2] });
    expect(data.awaitFinal).toHaveBeenCalledWith(18_241_006, {});
  });
});

describe("on-chain primitives", () => {
  test("derives the exact u16 little-endian daily scores PDA", () => {
    const programId = new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA");
    const timestamp = 1_783_828_320_792;
    const epochDay = Math.floor(timestamp / 86_400_000);
    const expected = PublicKey.findProgramAddressSync([
      Buffer.from("daily_scores_roots"),
      Buffer.from([epochDay & 0xff, epochDay >>> 8]),
    ], programId)[0];
    expect(dailyScoresPda(timestamp, programId).toBase58()).toBe(expected.toBase58());
    expect(dailyScoresPda(new Date(timestamp), programId).toBase58()).toBe(expected.toBase58());
    expect(() => dailyScoresPda(-1, programId)).toThrow(VerificationError);
    expect(() => dailyScoresPda(70_000 * 86_400_000, programId)).toThrow(/u16/);
  });

  test("recomputes directional SHA-256 paths without claiming leaf serialization", async () => {
    const hash = (left: number[], right: number[]) => [...createHash("sha256").update(Buffer.from([...left, ...right])).digest()];
    const leaf = bytes(0);
    const right = bytes(32);
    const parent = hash(leaf, right);
    const left = bytes(64);
    const root = hash(left, parent);
    const proof = [{ hash: right, isRightSibling: true }, { hash: left, isRightSibling: false }];
    await expect(merkleRootFromLeaf(leaf, proof)).resolves.toEqual(root);
    await expect(verifyMerklePath(leaf, proof, root)).resolves.toBe(true);
    await expect(verifyMerklePath(bytes(1), proof, root)).resolves.toBe(false);
    await expect(merkleRootFromLeaf([1], proof)).rejects.toMatchObject({ code: "MERKLE_LEAF_LENGTH_INVALID" });
    await expect(verifyMerklePath(leaf, proof, [1])).rejects.toMatchObject({ code: "MERKLE_ROOT_LENGTH_INVALID" });
  });

  test("refuses an IDL from a different network before simulation", async () => {
    const config = resolveClientConfig({ network: "mainnet", wallet: Keypair.generate(), fetch: vi.fn(async () => new Response(JSON.stringify({ address: PublicKey.default.toBase58() }), { status: 200 })) });
    const onchain = new OnchainClient(config, new HttpPipeline(config));
    const bundle = normalizeProofBundle(rawProof(), { fixtureId: 18_241_006, seq: 108, statKeys: [1, 2] });
    await expect(onchain.verifyView(bundle, {})).rejects.toMatchObject({ code: "IDL_NETWORK_MISMATCH" });
  });

  test("explains why an existing wallet is required for a read-only view", async () => {
    const config = resolveClientConfig({ network: "mainnet", fetch: vi.fn() });
    const onchain = new OnchainClient(config, new HttpPipeline(config));
    const bundle = normalizeProofBundle(rawProof(), { fixtureId: 18_241_006, seq: 108, statKeys: [1, 2] });
    await expect(onchain.verifyView(bundle, {})).rejects.toMatchObject({ code: "SIMULATION_WALLET_MISSING", fix: expect.stringContaining("does not submit") });
  });
});

describe("proof availability retry", () => {
  const pending = (status: number) => new HttpError(`score stat proof failed with HTTP ${status}`, { code: "HTTP_STATUS", fix: "wait", status });

  function manualClock() {
    let at = 0;
    const sleeps: number[] = [];
    return {
      policy: {
        now: () => at,
        sleep: async (ms: number) => { sleeps.push(ms); at += ms; },
      },
      sleeps,
      advance: (ms: number) => { at += ms; },
    };
  }

  test("retries pending statuses with bounded exponential backoff until the proof lands", async () => {
    const clock = manualClock();
    const fetchProof = vi.fn()
      .mockRejectedValueOnce(pending(404))
      .mockRejectedValueOnce(pending(425))
      .mockRejectedValueOnce(pending(409))
      .mockResolvedValueOnce("bundle");
    await expect(waitForProofAvailability(fetchProof, { ...clock.policy, initialDelayMs: 100, multiplier: 2, maximumDelayMs: 150 })).resolves.toBe("bundle");
    expect(fetchProof).toHaveBeenCalledTimes(4);
    expect(clock.sleeps).toEqual([100, 150, 150]);
  });

  test("raises PROOF_AVAILABILITY_TIMEOUT once the bounded window is spent", async () => {
    const clock = manualClock();
    const fetchProof = vi.fn(async () => { throw pending(404); });
    await expect(waitForProofAvailability(fetchProof, { ...clock.policy, initialDelayMs: 1_000, timeoutMs: 2_500 }))
      .rejects.toMatchObject({ code: "PROOF_AVAILABILITY_TIMEOUT" });
  });

  test("caps the backoff sleep to the remaining timeout budget so elapsed time never overshoots timeoutMs", async () => {
    // Regression: the deadline was previously only checked BEFORE sleeping,
    // then the full computed backoff `delay` always elapsed regardless of
    // how close to the deadline it was -- so wall-clock time could overshoot
    // the advertised timeoutMs by up to one full backoff interval. With
    // initialDelayMs=1000, multiplier=2, timeoutMs=1500: the first sleep is
    // capped to min(1000, 1500)=1000 (elapsed 0 -> 1000); the second would
    // naturally be 2000ms of backoff, but only 500ms remains until the
    // 1500ms deadline, so it must be capped to 500 (elapsed 1000 -> 1500),
    // at which point the timeout fires exactly at the advertised budget
    // instead of overshooting to 3000ms.
    const clock = manualClock();
    const fetchProof = vi.fn(async () => { throw pending(404); });
    await expect(waitForProofAvailability(fetchProof, { ...clock.policy, initialDelayMs: 1_000, multiplier: 2, maximumDelayMs: 8_000, timeoutMs: 1_500 }))
      .rejects.toMatchObject({ code: "PROOF_AVAILABILITY_TIMEOUT" });
    expect(clock.sleeps).toEqual([1_000, 500]);
    expect(clock.sleeps.reduce((sum, ms) => sum + ms, 0)).toBeLessThanOrEqual(1_500);
  });

  test("propagates non-pending failures immediately and validates the policy", async () => {
    const boom = new HttpError("score stat proof failed with HTTP 500", { code: "HTTP_STATUS", fix: "retry", status: 500 });
    const fetchProof = vi.fn(async () => { throw boom; });
    await expect(waitForProofAvailability(fetchProof, manualClock().policy)).rejects.toBe(boom);
    expect(fetchProof).toHaveBeenCalledTimes(1);
    await expect(waitForProofAvailability(fetchProof, { timeoutMs: -1 })).rejects.toMatchObject({ code: "PROOF_RETRY_POLICY_INVALID" });
    expect(isProofPending(pending(404))).toBe(true);
    expect(isProofPending(boom)).toBe(false);
    expect(isProofPending(new Error("404"))).toBe(false);
  });

  test("honors an abort raised while waiting between attempts", async () => {
    const controller = new AbortController();
    const fetchProof = vi.fn(async () => { throw pending(404); });
    const waiting = waitForProofAvailability(fetchProof, { signal: controller.signal, initialDelayMs: 5_000 });
    queueMicrotask(() => controller.abort(new Error("operator stop")));
    await expect(waiting).rejects.toThrow("operator stop");
  });

  test("ProofClient.fetch({retry}) rides out early 404s from a slow root anchor", async () => {
    const responses = [
      new Response("not anchored", { status: 404 }),
      new Response("not anchored", { status: 404 }),
      new Response(JSON.stringify(rawProof([1, 2])), { status: 200 }),
    ];
    const fetchMock = vi.fn(async () => responses.shift()!);
    const http = new HttpPipeline(resolveClientConfig({ network: "mainnet", baseUrl: "http://replay.test", fetch: fetchMock }));
    const data = {} as unknown as DataClient;
    const proofs = new ProofClient(http, data);
    const bundle = await proofs.fetch({ fixtureId: 18_241_006, seq: 400, statKeys: [1, 2], retry: { initialDelayMs: 1, maximumDelayMs: 2, timeoutMs: 60_000 } });
    expect(bundle.fixtureId).toBe(18_241_006);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("ProofClient.fetch without retry keeps the single-attempt contract", async () => {
    const fetchMock = vi.fn(async () => new Response("not anchored", { status: 404 }));
    const http = new HttpPipeline(resolveClientConfig({ network: "mainnet", baseUrl: "http://replay.test", fetch: fetchMock }));
    const proofs = new ProofClient(http, {} as unknown as DataClient);
    await expect(proofs.fetch({ fixtureId: 1, seq: 1, statKeys: [1] })).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("sleepUnlessAborted (via waitForProofAvailability's default sleep) removes its abort listener once the timer resolves normally", async () => {
    // Regression for the wi-1 review bug: the abort listener registered per
    // retry sleep was never removed on the normal-resolve path, so a
    // long-lived/reused AbortSignal accumulated one stale listener per
    // completed sleep. addEventListener/removeEventListener calls on the
    // signal must stay balanced across multiple sleep cycles that all
    // complete normally (no abort fired).
    const controller = new AbortController();
    const addSpy = vi.spyOn(controller.signal, "addEventListener");
    const removeSpy = vi.spyOn(controller.signal, "removeEventListener");
    const fetchProof = vi.fn()
      .mockRejectedValueOnce(pending(404))
      .mockRejectedValueOnce(pending(409))
      .mockRejectedValueOnce(pending(425))
      .mockResolvedValueOnce("bundle");
    await expect(waitForProofAvailability(fetchProof, {
      signal: controller.signal,
      initialDelayMs: 1,
      maximumDelayMs: 2,
      timeoutMs: 60_000,
    })).resolves.toBe("bundle");
    expect(addSpy).toHaveBeenCalledTimes(3);
    expect(removeSpy).toHaveBeenCalledTimes(3);
    expect(controller.signal.aborted).toBe(false);
  });

  test("ProofClient.forFinal aborts the proof-availability wait promptly instead of exhausting the retry budget", async () => {
    // Regression for the wi-1 review bug: forFinal only threaded its top-level
    // AbortSignal into data.awaitFinal, never into the retry policy handed to
    // waitForProofAvailability, so aborting mid-wait had no effect on the
    // proof retry loop and callers had to wait out the full timeout.
    const fetchMock = vi.fn(async () => new Response("not anchored", { status: 404 }));
    const http = new HttpPipeline(resolveClientConfig({ network: "mainnet", baseUrl: "http://replay.test", fetch: fetchMock }));
    const data = { awaitFinal: vi.fn(async () => ({ seq: 400 })) } as unknown as DataClient;
    const proofs = new ProofClient(http, data);
    const controller = new AbortController();
    // A large retry budget: if the abort signal is not honored, this would
    // only reject after ~5 minutes (or never, in this mocked test run).
    const waiting = proofs.forFinal(18_241_006, {
      signal: controller.signal,
      retry: { initialDelayMs: 60_000, maximumDelayMs: 60_000, timeoutMs: 300_000 },
    });
    const started = Date.now();
    queueMicrotask(() => controller.abort(new Error("caller stop")));
    await expect(waiting).rejects.toThrow("caller stop");
    expect(Date.now() - started).toBeLessThan(2_000);
    // Only the initial attempt (if any) should have fired before the abort
    // short-circuited the backoff wait; it must not have retried repeatedly.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(1);
  });

  test("ProofClient.forFinal({signal}) alone keeps the fail-fast single-attempt default; retry stays opt-in", async () => {
    // Regression for the wi-1 review bug: mergeRetrySignal returned a
    // truthy {signal} retry-policy shape whenever ANY signal was passed to
    // forFinal, even without an explicit `retry`, silently flipping the
    // documented single-attempt fail-fast default into a bounded
    // multi-minute retry wait.
    const fetchMock = vi.fn(async () => new Response("not anchored", { status: 404 }));
    const http = new HttpPipeline(resolveClientConfig({ network: "mainnet", baseUrl: "http://replay.test", fetch: fetchMock }));
    const data = { awaitFinal: vi.fn(async () => ({ seq: 400 })) } as unknown as DataClient;
    const proofs = new ProofClient(http, data);
    const controller = new AbortController();
    await expect(proofs.forFinal(18_241_006, { signal: controller.signal })).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The same signal still cancels that single in-flight attempt.
    const hangingFetch = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      if (init?.signal?.aborted) { reject(init.signal.reason); return; }
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
    }));
    const hangingHttp = new HttpPipeline(resolveClientConfig({ network: "mainnet", baseUrl: "http://replay.test", fetch: hangingFetch }));
    const hangingProofs = new ProofClient(hangingHttp, data);
    const abortController = new AbortController();
    const hanging = hangingProofs.forFinal(18_241_006, { signal: abortController.signal });
    queueMicrotask(() => abortController.abort(new Error("caller stop")));
    await expect(hanging).rejects.toThrow("caller stop");

    // With an explicit retry policy alongside the signal, retry activates.
    const retryFetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("not anchored", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(rawProof([1, 2])), { status: 200 }));
    const retryHttp = new HttpPipeline(resolveClientConfig({ network: "mainnet", baseUrl: "http://replay.test", fetch: retryFetchMock }));
    const retryProofs = new ProofClient(retryHttp, data);
    const bundle = await retryProofs.forFinal(18_241_006, {
      signal: new AbortController().signal,
      retry: { initialDelayMs: 1, maximumDelayMs: 2, timeoutMs: 60_000 },
    });
    expect(bundle.fixtureId).toBe(18_241_006);
    expect(retryFetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("root PDA namespaces and timestamp healing", () => {
  const programId = new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA");
  const millis = 1_783_828_320_792;
  const seconds = Math.floor(millis / 1_000);
  const expected = (namespace: string, day: number) => PublicKey.findProgramAddressSync([
    Buffer.from(namespace),
    Buffer.from([day & 0xff, day >>> 8]),
  ], programId)[0].toBase58();

  test("derives every namespace, applying the ten-day fixture bucketing rule", () => {
    const day = Math.floor(millis / 86_400_000);
    expect(deriveRootPda({ namespace: "daily_scores_roots", timestamp: millis, programId }).toBase58()).toBe(expected("daily_scores_roots", day));
    expect(deriveRootPda({ namespace: "daily_batch_roots", timestamp: millis, programId }).toBase58()).toBe(expected("daily_batch_roots", day));
    expect(deriveRootPda({ namespace: "ten_daily_fixtures_roots", timestamp: millis, programId }).toBase58()).toBe(expected("ten_daily_fixtures_roots", Math.floor(day / 10) * 10));
    expect(deriveRootPda({ namespace: "daily_scores_roots", timestamp: millis, programId }).toBase58()).toBe(dailyScoresPda(millis, programId).toBase58());
  });

  test("heals seconds-unit timestamps to the same account as milliseconds", () => {
    expect(healTimestampMillis(seconds)).toBe(seconds * 1_000);
    expect(healTimestampMillis(millis)).toBe(millis);
    expect(healTimestampMillis(new Date(millis))).toBe(millis);
    expect(deriveRootPda({ namespace: "daily_scores_roots", timestamp: seconds, programId }).toBase58()).toBe(dailyScoresPda(millis, programId).toBase58());
  });

  test("dailyScoresPda({ strict: true }) rejects seconds-unit inputs that would otherwise derive a wrong PDA silently", () => {
    expect(() => dailyScoresPda(seconds, programId, { strict: true })).toThrow(expect.objectContaining({ code: "PDA_TIMESTAMP_UNIT_SUSPECT" }));
    expect(() => dailyScoresPda(-1, programId)).toThrow(expect.objectContaining({ code: "PDA_TIMESTAMP_INVALID" }));
    expect(dailyScoresPda(0, programId).toBase58()).toBe(expected("daily_scores_roots", 0));
  });

  test("dailyScoresPda defaults to strict:false, reproducing v0.1.0's silent seconds-unit behavior byte-for-byte", () => {
    // v0.1.0 had no unit check at all: it took the raw number as-is and
    // derived whatever (wrong, but non-throwing) PDA that implied. The
    // default here (options omitted, and options.strict omitted) must
    // reproduce that exact result so existing v0.1.0 callers upgrading with
    // no code changes get the identical PDA they got before.
    const wrongDay = Math.floor(seconds / 86_400_000);
    const wrongExpected = expected("daily_scores_roots", wrongDay);
    expect(() => dailyScoresPda(seconds, programId)).not.toThrow();
    expect(dailyScoresPda(seconds, programId).toBase58()).toBe(wrongExpected);
    expect(dailyScoresPda(seconds, programId, {}).toBase58()).toBe(wrongExpected);
    expect(dailyScoresPda(seconds, programId, { strict: false }).toBase58()).toBe(wrongExpected);
  });

  test("guards namespace names and u16 seed overflow", () => {
    expect(() => deriveRootPda({ namespace: "daily_odds_roots" as never, timestamp: millis, programId })).toThrow(expect.objectContaining({ code: "PDA_NAMESPACE_INVALID" }));
    expect(() => deriveRootPda({ namespace: "daily_scores_roots", timestamp: 65_536 * 86_400_000, programId })).toThrow(expect.objectContaining({ code: "PDA_EPOCH_OVERFLOW" }));
    expect(() => healTimestampMillis(Number.NaN)).toThrow(expect.objectContaining({ code: "PDA_TIMESTAMP_INVALID" }));
  });

  describe("Date inputs are unambiguous and bypass the seconds heuristic", () => {
    // A value under SECONDS_SUSPECT_BOUND (100_000_000_000, ~March 1973) that
    // is nonetheless a legitimate millisecond timestamp: e.g. a synthetic
    // fixture clock, or any real epoch time before 1973. Passed as a raw
    // number it is ambiguous and the existing heuristic is expected to heal
    // it (multiply by 1000). Passed as a `Date`, the unit is certain — the
    // caller got it from `.getTime()` or `Date.now()` — and healing it would
    // silently corrupt an otherwise-correct timestamp.
    const smallMillis = 50_000_000_000; // 1971-08-02T... well under the bound

    test("healTimestampMillis uses a Date's getTime() exactly, never reinterpreting it as seconds", () => {
      expect(healTimestampMillis(new Date(smallMillis))).toBe(smallMillis);
      // The identical numeric value, passed as a raw number, is ambiguous and
      // is still healed the old way — proving the fix is Date-specific, not
      // a change to the heuristic bound itself.
      expect(healTimestampMillis(smallMillis)).toBe(smallMillis * 1_000);
    });

    test("healTimestampMillis honors an explicit unit override for raw numbers, bypassing the heuristic", () => {
      expect(healTimestampMillis(smallMillis, "ms")).toBe(smallMillis);
      expect(healTimestampMillis(seconds, "s")).toBe(seconds * 1_000);
    });

    test("the heuristic still fires correctly for raw-number seconds vs milliseconds from external data", () => {
      // Large-but-valid seconds timestamp near the bound (100_000_000_000):
      // still ambiguous as a raw number, still healed.
      const nearBoundSeconds = 99_999_999; // *1_000 = 99_999_999_000, just under the bound
      expect(healTimestampMillis(nearBoundSeconds)).toBe(nearBoundSeconds * 1_000);
      // Comfortably-milliseconds raw number (current, real epoch time): left
      // untouched.
      expect(healTimestampMillis(millis)).toBe(millis);
    });

    test("dailyScoresPda derives directly from a Date's getTime(), never throwing PDA_TIMESTAMP_UNIT_SUSPECT even under strict:true", () => {
      const epochDay = Math.floor(smallMillis / 86_400_000);
      expect(dailyScoresPda(new Date(smallMillis), programId).toBase58()).toBe(expected("daily_scores_roots", epochDay));
      expect(dailyScoresPda(new Date(smallMillis), programId, { strict: true }).toBase58()).toBe(expected("daily_scores_roots", epochDay));
      // The same value as a raw number remains ambiguous and, under
      // strict:true, still throws — proving dailyScoresPda's Date handling,
      // not its safety check, changed.
      expect(() => dailyScoresPda(smallMillis, programId, { strict: true })).toThrow(expect.objectContaining({ code: "PDA_TIMESTAMP_UNIT_SUSPECT" }));
      // Without strict, the raw number is silently healed the old way.
      expect(() => dailyScoresPda(smallMillis, programId)).not.toThrow();
    });

    test("deriveRootPda accepts a Date and an explicit timestampUnit override without misclassifying small values", () => {
      const epochDay = Math.floor(smallMillis / 86_400_000);
      expect(deriveRootPda({ namespace: "daily_scores_roots", timestamp: new Date(smallMillis), programId }).toBase58())
        .toBe(expected("daily_scores_roots", epochDay));
      expect(deriveRootPda({ namespace: "daily_scores_roots", timestamp: smallMillis, timestampUnit: "ms", programId }).toBase58())
        .toBe(expected("daily_scores_roots", epochDay));
    });

    test("oddsBatchRootPda (deriveRootPda's daily_batch_roots counterpart) gets the same Date/timestampUnit bypass", () => {
      const epochDay = Math.floor(smallMillis / 86_400_000);
      expect(oddsBatchRootPda(new Date(smallMillis), programId).toBase58())
        .toBe(expected("daily_batch_roots", epochDay));
      expect(oddsBatchRootPda(smallMillis, programId, "ms").toBase58())
        .toBe(expected("daily_batch_roots", epochDay));
    });
  });
});

describe("experimental odds proofs", () => {
  const request = { messageId: "m-77", timestamp: 1_783_828_320_792 };

  test("fetches through the configurable path, decoding known fields and preserving raw", async () => {
    const payload = {
      oddsSubTreeProof: [node(11, false)],
      mainTreeProof: [{ hash: Buffer.from(bytes(12)).toString("base64"), isRightSibling: true }],
      batchRoot: `0x${Buffer.from(bytes(13)).toString("hex")}`,
      vendorField: "kept",
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    const http = new HttpPipeline(resolveClientConfig({ network: "mainnet", baseUrl: "http://replay.test", fetch: fetchMock }));
    const proofs = new ProofClient(http, {} as unknown as DataClient);
    const proof = await proofs.fetchOdds(request);
    expect(proof.oddsSubTreeProof).toEqual([{ hash: bytes(11), isRightSibling: false }]);
    expect(proof.mainTreeProof).toEqual([{ hash: bytes(12), isRightSibling: true }]);
    expect(proof.batchRoot).toEqual(bytes(13));
    expect(proof.raw.vendorField).toBe("kept");
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/odds/validation?messageId=m-77");

    await proofs.fetchOdds({ ...request, path: "/odds/proof-v2" });
    expect(String(fetchMock.mock.calls[1]![0])).toContain("/odds/proof-v2?");
  });

  test("stays permissive about unknown shapes but rejects non-objects and bad inputs", async () => {
    const http = new HttpPipeline(resolveClientConfig({ network: "mainnet", baseUrl: "http://replay.test", fetch: vi.fn(async () => new Response(JSON.stringify({ unexpected: true }), { status: 200 })) }));
    const proofs = new ProofClient(http, {} as unknown as DataClient);
    const proof = await proofs.fetchOdds(request);
    expect(proof).toMatchObject({ messageId: "m-77", raw: { unexpected: true } });
    expect(proof.batchRoot).toBeUndefined();
    const bad = new ProofClient(new HttpPipeline(resolveClientConfig({ network: "mainnet", baseUrl: "http://replay.test", fetch: vi.fn(async () => new Response("[]", { status: 200 })) })), {} as unknown as DataClient);
    await expect(bad.fetchOdds(request)).rejects.toMatchObject({ code: "ODDS_PROOF_RESPONSE_INVALID" });
    await expect(bad.fetchOdds({ ...request, messageId: "" })).rejects.toMatchObject({ code: "ODDS_PROOF_MESSAGE_ID_INVALID" });
    await expect(bad.fetchOdds({ ...request, timestamp: 1.5 })).rejects.toMatchObject({ code: "ODDS_PROOF_TIMESTAMP_INVALID" });
  });

  test("rides the availability retry and derives the odds batch root account", async () => {
    const responses = [new Response("pending", { status: 425 }), new Response(JSON.stringify({}), { status: 200 })];
    const fetchMock = vi.fn(async () => responses.shift()!);
    const http = new HttpPipeline(resolveClientConfig({ network: "mainnet", baseUrl: "http://replay.test", fetch: fetchMock }));
    const proofs = new ProofClient(http, {} as unknown as DataClient);
    await proofs.fetchOdds({ ...request, retry: { initialDelayMs: 1, timeoutMs: 60_000 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const programId = new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA");
    expect(oddsBatchRootPda(request.timestamp, programId).toBase58())
      .toBe(deriveRootPda({ namespace: "daily_batch_roots", timestamp: request.timestamp, programId }).toBase58());
  });

  test("rejects an absolute or scheme-relative override path before any request fires (H2: credential exfiltration guard)", async () => {
    // Regression for the H2 review bug: fetchOdds({ path }) is a public
    // "route-drift override" field passed straight into
    // this.http.request(...) with default auth: true. HttpPipeline.apiUrl
    // passes any path matching /^https?:\/\// through UNCHANGED (no
    // same-origin check), and the request pipeline attaches the live JWT +
    // X-Api-Token headers regardless of destination -- so a caller-supplied
    // absolute URL in `path` would get the authenticated request sent to
    // that arbitrary origin. fetchOdds must reject before ever touching
    // this.http.request.
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    const http = new HttpPipeline(resolveClientConfig({ network: "mainnet", baseUrl: "http://replay.test", fetch: fetchMock }));
    const proofs = new ProofClient(http, {} as unknown as DataClient);

    await expect(proofs.fetchOdds({ ...request, path: "https://evil.example/steal" }))
      .rejects.toMatchObject({ code: "ODDS_PROOF_PATH_INVALID" });
    await expect(proofs.fetchOdds({ ...request, path: "HTTP://evil.example/steal" }))
      .rejects.toMatchObject({ code: "ODDS_PROOF_PATH_INVALID" });
    await expect(proofs.fetchOdds({ ...request, path: "//evil.example/steal" }))
      .rejects.toMatchObject({ code: "ODDS_PROOF_PATH_INVALID" });
    // Confirm no request was ever dispatched for any of the rejected paths.
    expect(fetchMock).not.toHaveBeenCalled();

    // A normal relative path still works.
    await expect(proofs.fetchOdds({ ...request, path: "/odds/proof-v2" })).resolves.toMatchObject({ messageId: request.messageId });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/odds/proof-v2?");
  });

  test("rejects a non-string override path before any request fires (H2-residual: type-coercion bypass)", async () => {
    // Regression for the H2-residual review bug: the original H2 guard was
    // gated on `typeof options.path === "string"`, so a non-string `path`
    // (e.g. a single-element array) skipped the regex check entirely, then
    // got coerced to a plain string by the template literal at the fetch
    // call site (`${options.path ?? DEFAULT_ODDS_PROOF_PATH}?${query}`).
    // A single-element array stringifies via Array.prototype.toString with
    // no separator, so `["https://evil.example/steal"]` coerces to exactly
    // "https://evil.example/steal" -- the same credential-exfiltration
    // vector H2 was meant to close, just via a different input shape.
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    const http = new HttpPipeline(resolveClientConfig({ network: "mainnet", baseUrl: "http://replay.test", fetch: fetchMock }));
    const proofs = new ProofClient(http, {} as unknown as DataClient);

    await expect(proofs.fetchOdds({ ...request, path: ["https://evil.example/steal"] as unknown as string }))
      .rejects.toMatchObject({ code: "ODDS_PROOF_PATH_INVALID" });
    await expect(proofs.fetchOdds({ ...request, path: { toString: () => "https://evil.example/steal" } as unknown as string }))
      .rejects.toMatchObject({ code: "ODDS_PROOF_PATH_INVALID" });
    // Confirm no request was ever dispatched for either rejected shape.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
