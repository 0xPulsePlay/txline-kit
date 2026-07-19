import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { describe, expect, test, vi } from "vitest";
import type { DataClient } from "../src/data.js";
import { KeeperError } from "../src/errors.js";
import { KeeperClient } from "../src/keeper.js";
import type { BuiltValidation, OnchainClient } from "../src/onchain.js";
import type { ProofBundle, ProofClient } from "../src/proofs.js";
import { markets } from "../src/strategy.js";

const fixtureId = 42;
const proof = Object.freeze({ fixtureId, seq: 7, requestedStatKeys: [1, 2] }) as unknown as ProofBundle;
const validation: BuiltValidation = {
  instruction: new TransactionInstruction({ programId: PublicKey.default, keys: [], data: Buffer.alloc(0) }),
  preInstructions: [],
  accounts: { dailyScoresMerkleRoots: PublicKey.default },
};

function harness(overrides: { record?: Record<string, unknown>; valid?: boolean } = {}) {
  const record = overrides.record ?? { fixtureId, seq: 7, action: "game_finalised", statusId: 100, period: 100 };
  const data = { awaitFinal: vi.fn(async () => record) } as unknown as DataClient;
  const proofs = { fetch: vi.fn(async () => proof) } as unknown as ProofClient;
  const onchain = {
    verifyView: vi.fn(async () => overrides.valid ?? true),
    buildValidateIx: vi.fn(async () => validation),
  } as unknown as OnchainClient;
  const connection = { confirmTransaction: vi.fn(async () => ({ value: { err: null } })) };
  const keeper = new KeeperClient(connection as never, data, proofs, onchain);
  return { keeper, data, proofs, onchain, connection };
}

describe("keeper preparation", () => {
  test("composes final lifecycle, ordered proof, read-only verification, and validation instruction", async () => {
    const { keeper, data, proofs, onchain } = harness();
    const market = markets.finalResult(fixtureId).awayWin();
    const prepared = await keeper.prepare({ fixtureId, market });
    expect(prepared).toMatchObject({ fixtureId, market, proof, validation, valid: true });
    expect(data.awaitFinal).toHaveBeenCalledWith(fixtureId, {});
    expect(proofs.fetch).toHaveBeenCalledWith({ fixtureId, seq: 7, statKeys: [1, 2] });
    expect(onchain.verifyView).toHaveBeenCalledWith(proof, market.strategy);
    expect(onchain.buildValidateIx).toHaveBeenCalledWith(proof, market.strategy);
    expect(Object.isFrozen(prepared)).toBe(true);
  });

  test("does not wait for slow root anchoring by default; opts in via proofRetry", async () => {
    const bydefault = harness();
    const market = markets.finalResult(fixtureId).awayWin();
    await bydefault.keeper.prepare({ fixtureId, market });
    // No options at all: single-attempt, fail-fast contract (v0.1.0 parity) --
    // no retry key should reach ProofClient.fetch.
    expect(bydefault.proofs.fetch).toHaveBeenCalledWith({ fixtureId, seq: 7, statKeys: [1, 2] });

    const optedIn = harness();
    await optedIn.keeper.prepare({ fixtureId, market, proofRetry: true });
    expect(optedIn.proofs.fetch).toHaveBeenCalledWith(expect.objectContaining({ retry: { timeoutMs: 180_000 } }));

    const tuned = harness();
    const controller = new AbortController();
    await tuned.keeper.prepare({ fixtureId, market, signal: controller.signal, proofRetry: { timeoutMs: 30_000, initialDelayMs: 250 } });
    expect(tuned.proofs.fetch).toHaveBeenCalledWith(expect.objectContaining({
      retry: { timeoutMs: 30_000, initialDelayMs: 250, signal: controller.signal },
    }));

    const disabled = harness();
    await disabled.keeper.prepare({ fixtureId, market, proofRetry: false });
    expect(disabled.proofs.fetch).toHaveBeenCalledWith({ fixtureId, seq: 7, statKeys: [1, 2] });
  });

  test("refuses mismatched fixtures, missing sequences, false predicates, and aborted work", async () => {
    await expect(harness().keeper.prepare({ fixtureId, market: markets.finalResult(41).homeWin() })).rejects.toMatchObject({ code: "KEEPER_FIXTURE_MISMATCH" });
    await expect(harness({ record: { fixtureId, action: "game_finalised", statusId: 100 } }).keeper.prepare({ fixtureId, market: markets.finalResult(fixtureId).homeWin() })).rejects.toMatchObject({ code: "KEEPER_FINAL_SEQ_MISSING" });
    await expect(harness({ valid: false }).keeper.prepare({ fixtureId, market: markets.finalResult(fixtureId).homeWin() })).rejects.toMatchObject({ code: "KEEPER_PREDICATE_FALSE" });
    const controller = new AbortController();
    controller.abort("operator stop");
    await expect(harness().keeper.prepare({ fixtureId, market: markets.finalResult(fixtureId).homeWin(), signal: controller.signal })).rejects.toMatchObject({ code: "KEEPER_ABORTED" });
  });
});

describe("keeper submission", () => {
  test("supports proof-only dry runs without a submit callback", async () => {
    const result = await harness().keeper.watchAndSettle({ fixtureId, market: markets.finalResult(fixtureId).awayWin(), dryRun: true });
    expect(result).toMatchObject({ dryRun: true, attempts: 0, valid: true });
    expect(result.signature).toBeUndefined();
  });

  test("retries a caller-owned consumer submission, confirms, and reports settlement", async () => {
    const { keeper, connection } = harness();
    const submit = vi.fn()
      .mockRejectedValueOnce(new Error("expired blockhash"))
      .mockResolvedValueOnce("signature-2");
    const onError = vi.fn();
    const onSettled = vi.fn();
    const result = await keeper.watchAndSettle({
      fixtureId,
      market: markets.finalResult(fixtureId).awayWin(),
      maxSubmitAttempts: 2,
      submit,
      onError,
      onSettled,
    });
    expect(result).toMatchObject({ dryRun: false, attempts: 2, signature: "signature-2" });
    expect(submit).toHaveBeenNthCalledWith(1, expect.objectContaining({ valid: true }), 1);
    expect(submit).toHaveBeenNthCalledWith(2, expect.objectContaining({ valid: true }), 2);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "KEEPER_SUBMIT_FAILED" }), 1);
    expect(connection.confirmTransaction).toHaveBeenCalledWith("signature-2", "confirmed");
    expect(onSettled).toHaveBeenCalledWith(result);
  });

  test("requires live submit configuration and exposes bounded terminal failure", async () => {
    await expect(harness().keeper.watchAndSettle({ fixtureId, market: markets.finalResult(fixtureId).homeWin() })).rejects.toMatchObject({ code: "KEEPER_SUBMIT_MISSING" });
    await expect(harness().keeper.watchAndSettle({ fixtureId, market: markets.finalResult(fixtureId).homeWin(), maxSubmitAttempts: 0, submit: vi.fn() })).rejects.toMatchObject({ code: "KEEPER_ATTEMPTS_INVALID" });
    const submit = vi.fn(async () => { throw new Error("consumer rejected"); });
    await expect(harness().keeper.watchAndSettle({ fixtureId, market: markets.finalResult(fixtureId).homeWin(), maxSubmitAttempts: 1, confirmation: false, submit })).rejects.toMatchObject({ code: "KEEPER_RETRIES_EXHAUSTED", cause: expect.any(Error) });
  });

  test("rejects empty signatures as failed attempts", async () => {
    await expect(harness().keeper.watchAndSettle({ fixtureId, market: markets.finalResult(fixtureId).homeWin(), maxSubmitAttempts: 1, submit: vi.fn(async () => " ") })).rejects.toBeInstanceOf(KeeperError);
  });

  test("treats chain confirmation errors as retryable and never resubmits for observer failures", async () => {
    const failedConfirmation = harness();
    failedConfirmation.connection.confirmTransaction
      .mockResolvedValueOnce({ value: { err: { InstructionError: [1, "Custom"] } } })
      .mockResolvedValueOnce({ value: { err: null } });
    const retrySubmit = vi.fn()
      .mockResolvedValueOnce("failed-signature")
      .mockResolvedValueOnce("successful-signature");
    await expect(failedConfirmation.keeper.watchAndSettle({
      fixtureId,
      market: markets.finalResult(fixtureId).awayWin(),
      maxSubmitAttempts: 2,
      submit: retrySubmit,
    })).resolves.toMatchObject({ attempts: 2, signature: "successful-signature" });

    const observed = harness();
    const submit = vi.fn(async () => "confirmed-signature");
    await expect(observed.keeper.watchAndSettle({
      fixtureId,
      market: markets.finalResult(fixtureId).awayWin(),
      submit,
      onSettled: async () => { throw new Error("observer failed"); },
    })).rejects.toThrow("observer failed");
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
