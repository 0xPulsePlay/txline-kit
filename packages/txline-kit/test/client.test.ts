import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import { describe, expect, test, vi } from "vitest";
import { createTxLineClient } from "../src/client.js";
import { MemoryCredentialStore, NETWORK_CONFIGS, resolveClientConfig } from "../src/core.js";
import { ActivationError, AuthenticationError, ConfigurationError, DataShapeError, HttpError } from "../src/errors.js";
import { HttpPipeline } from "../src/http.js";

const json = (value: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(value), {
  status: 200,
  headers: { "content-type": "application/json" },
  ...init,
});

describe("client configuration and credentials", () => {
  test("pins official network constants and resolves replay overrides", () => {
    expect(NETWORK_CONFIGS.mainnet.programId.toBase58()).toBe("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA");
    expect(NETWORK_CONFIGS.devnet.tokenMint.toBase58()).toBe("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG");
    const config = resolveClientConfig({ network: "devnet", baseUrl: "http://localhost:9000/api/", requestTimeoutMs: 12 });
    expect(config.apiBase).toBe("http://localhost:9000/api");
    expect(config.authOrigin).toBe("http://localhost:9000");
    expect(config.replay).toBe(true);
    expect(config.requestTimeoutMs).toBe(12);
  });

  test("rejects bad network, URLs, protocols, and timeouts with actionable errors", () => {
    expect(() => resolveClientConfig({ network: "testnet" as never })).toThrow(ConfigurationError);
    expect(() => resolveClientConfig({ network: "mainnet", baseUrl: "nope" })).toThrow(/Invalid TxLINE base URL/);
    expect(() => resolveClientConfig({ network: "mainnet", baseUrl: "ftp://example.test" })).toThrow(/protocol/);
    expect(() => resolveClientConfig({ network: "mainnet", requestTimeoutMs: 0 })).toThrow(/positive integer/);
  });

  test("copies and clears in-memory credentials", async () => {
    const original = { jwt: "one" };
    const store = new MemoryCredentialStore(original);
    original.jwt = "changed";
    expect(await store.get()).toEqual({ jwt: "one" });
    const read = await store.get();
    read!.jwt = "mutated";
    expect(await store.get()).toEqual({ jwt: "one" });
    await store.set({ apiToken: "api" });
    expect(await store.get()).toEqual({ apiToken: "api" });
    await store.clear();
    expect(await store.get()).toBeUndefined();
  });
});

describe("authentication and HTTP behavior", () => {
  test("single-flights guest JWT requests and persists the token", async () => {
    const fetch = vi.fn(async () => json({ token: "guest-jwt" }));
    const store = new MemoryCredentialStore();
    const tx = createTxLineClient({ network: "devnet", fetch, credentialStore: store });
    await expect(Promise.all([tx.auth.startGuest(), tx.auth.startGuest(), tx.auth.startGuest()])).resolves.toEqual(["guest-jwt", "guest-jwt", "guest-jwt"]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe("https://txline-dev.txodds.com/auth/guest/start");
    expect(await store.get()).toEqual({ jwt: "guest-jwt" });
    await tx.auth.clear();
    expect(await tx.auth.credentials()).toBeUndefined();
  });

  test("signs the exact activation preimage and stores the API token", async () => {
    const wallet = Keypair.generate();
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetch = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      return calls.length === 1 ? json({ token: "guest" }) : json({ token: "api-token" });
    });
    const tx = createTxLineClient({ network: "devnet", wallet, fetch });
    const result = await tx.auth.activate({ txSig: "chain-signature", leagues: [8, 13] });
    expect(result).toMatchObject({ txSig: "chain-signature", apiToken: "api-token", jwt: "guest", walletPublicKey: wallet.publicKey.toBase58() });
    const request = JSON.parse(String(calls[1]!.init.body)) as { txSig: string; walletSignature: string; leagues: number[] };
    expect(request.leagues).toEqual([8, 13]);
    expect(nacl.sign.detached.verify(
      new TextEncoder().encode("chain-signature:8,13:guest"),
      Buffer.from(request.walletSignature, "base64"),
      wallet.publicKey.toBytes(),
    )).toBe(true);
    expect(new Headers(calls[1]!.init.headers).get("authorization")).toBe("Bearer guest");
  });

  test("reactivates an existing transaction without resubmitting on chain", async () => {
    const wallet = Keypair.generate();
    const store = new MemoryCredentialStore({ walletPublicKey: wallet.publicKey.toBase58(), txSig: "saved", jwt: "jwt" });
    const fetch = vi.fn(async () => new Response("bare-api-token"));
    const tx = createTxLineClient({ network: "devnet", wallet, fetch, credentialStore: store });
    await expect(tx.auth.subscribeFree({ serviceLevel: 1, leagues: [] })).resolves.toMatchObject({ txSig: "saved", apiToken: "bare-api-token" });
    const payload = JSON.parse(String(fetch.mock.calls[0]![1]?.body));
    expect(payload.leagues).toEqual([]);
    expect(nacl.sign.detached.verify(
      new TextEncoder().encode("saved::jwt"),
      Buffer.from(payload.walletSignature, "base64"),
      wallet.publicKey.toBytes(),
    )).toBe(true);
  });

  test("renews once on 401 and retries with both credential headers", async () => {
    const store = new MemoryCredentialStore({ jwt: "old", apiToken: "api" });
    const seen: Array<{ url: string; authorization: string | null; api: string | null }> = [];
    let count = 0;
    const fetch = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      seen.push({ url: String(url), authorization: headers.get("authorization"), api: headers.get("x-api-token") });
      count += 1;
      if (count === 1) return new Response("expired", { status: 401 });
      if (count === 2) return json({ token: "fresh" });
      return json([{ FixtureId: "42", Action: "goal" }]);
    });
    const tx = createTxLineClient({ network: "devnet", fetch, credentialStore: store });
    await expect(tx.data.snapshot(42)).resolves.toMatchObject([{ fixtureId: 42, action: "goal" }]);
    expect(seen).toEqual([
      { url: "https://txline-dev.txodds.com/api/scores/snapshot/42", authorization: "Bearer old", api: "api" },
      { url: "https://txline-dev.txodds.com/auth/guest/start", authorization: null, api: null },
      { url: "https://txline-dev.txodds.com/api/scores/snapshot/42", authorization: "Bearer fresh", api: "api" },
    ]);
  });

  test("maps authentication, activation, and transport failures", async () => {
    const noWallet = createTxLineClient({ network: "devnet", fetch: vi.fn() });
    await expect(noWallet.auth.activate({ txSig: "sig" })).rejects.toMatchObject({ code: "WALLET_MISSING" });
    const wallet = Keypair.generate();
    const badGuest = createTxLineClient({ network: "devnet", wallet, fetch: vi.fn(async () => json({ nope: true })) });
    await expect(badGuest.auth.startGuest()).rejects.toMatchObject({ code: "GUEST_TOKEN_MISSING" });
    const forbidden = createTxLineClient({ network: "devnet", wallet, credentialStore: new MemoryCredentialStore({ jwt: "jwt" }), fetch: vi.fn(async () => new Response("wrong network", { status: 403 })) });
    await expect(forbidden.auth.activate({ txSig: "sig" })).rejects.toMatchObject({ code: "ACTIVATION_FAILED", status: 403, fix: expect.stringContaining("same network") });
    await expect(forbidden.auth.activate({ txSig: " " })).rejects.toBeInstanceOf(ActivationError);
    await expect(forbidden.auth.activate({ txSig: "sig", leagues: [-1] })).rejects.toMatchObject({ code: "ACTIVATION_LEAGUES_INVALID" });
    await expect(forbidden.auth.subscribeFree({ serviceLevel: 1, durationWeeks: 3 })).rejects.toMatchObject({ code: "SUBSCRIPTION_DURATION_INVALID" });

    const config = resolveClientConfig({ network: "devnet", baseUrl: "http://replay.test", fetch: vi.fn(async () => { throw new Error("down"); }) });
    const http = new HttpPipeline(config);
    await expect(http.request("/anything")).rejects.toBeInstanceOf(HttpError);
    await expect(http.expectOk(new Response("bad\nrequest", { status: 500 }), "operation")).rejects.toMatchObject({ code: "HTTP_RESPONSE_ERROR", status: 500 });
  });

  test("requires activated credentials outside replay mode", async () => {
    const tx = createTxLineClient({ network: "mainnet", fetch: vi.fn() });
    await expect(tx.data.snapshot(1)).rejects.toBeInstanceOf(AuthenticationError);
  });

  test("accepts absolute HTTP targets and successful responses in the pipeline", async () => {
    const config = resolveClientConfig({ network: "devnet", baseUrl: "http://replay.test", fetch: vi.fn(async () => json({ ok: true })) });
    const http = new HttpPipeline(config);
    expect(http.apiUrl("https://elsewhere.test/value")).toBe("https://elsewhere.test/value");
    expect(http.authUrl("https://auth.test/start")).toBe("https://auth.test/start");
    await expect(http.expectOk(new Response("ok"), "success")).resolves.toBeInstanceOf(Response);
  });
});

describe("data endpoint integration", () => {
  test("builds endpoint paths and rejects invalid JSON shapes", async () => {
    const paths: string[] = [];
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const path = new URL(String(url)).pathname + new URL(String(url)).search;
      paths.push(path);
      if (path.includes("/fixtures/")) return json([{ FixtureId: 7, extra: true }]);
      if (path.includes("/odds/")) return json([{ FixtureId: 7, MessageId: "m", Prices: [1.5], Pct: ["50"] }]);
      return json([{ FixtureId: 7, StatusId: "100" }]);
    });
    const tx = createTxLineClient({ network: "devnet", baseUrl: "http://replay.test", fetch });
    await tx.data.snapshot(7, { asOf: new Date(1000) });
    await tx.data.updates({ at: Date.UTC(2026, 0, 2, 3, 17) });
    await tx.data.schedule({ from: new Date(0), to: new Date(1000) });
    await tx.data.odds.snapshot(7);
    await tx.data.odds.updates({ at: Date.UTC(2026, 0, 2, 3, 17) });
    expect(paths).toEqual([
      "/api/scores/snapshot/7?asOf=1000",
      "/api/scores/updates/20455/3/3",
      "/api/fixtures/snapshot?from=1970-01-01T00%3A00%3A00.000Z&to=1970-01-01T00%3A00%3A01.000Z",
      "/api/odds/snapshot/7",
      "/api/odds/updates/20455/3/3",
    ]);

    const broken = createTxLineClient({ network: "devnet", baseUrl: "http://replay.test", fetch: vi.fn(async () => new Response("not-json")) });
    await expect(broken.data.snapshot(7)).rejects.toBeInstanceOf(DataShapeError);
    const shape = createTxLineClient({ network: "devnet", baseUrl: "http://replay.test", fetch: vi.fn(async () => json({ item: 1 })) });
    await expect(shape.data.snapshot(7)).rejects.toMatchObject({ code: "API_ARRAY_EXPECTED" });
  });
});
