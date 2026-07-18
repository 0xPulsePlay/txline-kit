import type { Commitment, Connection } from "@solana/web3.js";
import type { CanonicalScoreRecord } from "./data.js";
import type { DataClient } from "./data.js";
import { KeeperError } from "./errors.js";
import type { BuiltValidation, OnchainClient } from "./onchain.js";
import type { ProofBundle, ProofClient } from "./proofs.js";
import type { CompiledMarket } from "./strategy.js";

export interface PreparedSettlement {
  fixtureId: number;
  finalRecord: CanonicalScoreRecord;
  proof: ProofBundle;
  market: CompiledMarket;
  validation: BuiltValidation;
  valid: true;
}

export interface PrepareSettlementOptions {
  fixtureId: number;
  market: CompiledMarket;
  signal?: AbortSignal;
}

export interface WatchAndSettleOptions extends PrepareSettlementOptions {
  dryRun?: boolean;
  maxSubmitAttempts?: number;
  confirmation?: Commitment | false;
  submit?: (prepared: PreparedSettlement, attempt: number) => Promise<string>;
  onSettled?: (result: SettlementResult) => void | Promise<void>;
  onError?: (error: KeeperError, attempt: number) => void | Promise<void>;
}

export interface SettlementResult extends PreparedSettlement {
  dryRun: boolean;
  attempts: number;
  signature?: string;
}

function keeperFailure(message: string, code: string, fix: string, cause?: unknown): KeeperError {
  return new KeeperError(message, { code, fix, cause });
}

function attempts(value: number | undefined): number {
  const result = value ?? 3;
  if (!Number.isSafeInteger(result) || result < 1 || result > 10) {
    throw keeperFailure("maxSubmitAttempts must be an integer from 1 through 10", "KEEPER_ATTEMPTS_INVALID", "Use a small bounded retry count; three attempts is the default.");
  }
  return result;
}

function finalSeq(record: CanonicalScoreRecord): number {
  if (!Number.isSafeInteger(record.seq) || record.seq! < 1) {
    throw keeperFailure("Finalisation record has no valid score sequence", "KEEPER_FINAL_SEQ_MISSING", "Settle only from a final score record carrying Seq/seq >= 1.");
  }
  return record.seq!;
}

function aborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw keeperFailure("Settlement was aborted", "KEEPER_ABORTED", "Retry with a live AbortSignal when settlement should continue.", signal.reason);
}

async function backoff(attempt: number, signal: AbortSignal | undefined): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(keeperFailure("Settlement was aborted during retry", "KEEPER_ABORTED", "Retry with a live AbortSignal when settlement should continue.", signal?.reason));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, Math.min(2_000, 250 * 2 ** (attempt - 1)));
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export class KeeperClient {
  constructor(
    private readonly connection: Connection,
    private readonly data: DataClient,
    private readonly proofs: ProofClient,
    private readonly onchain: OnchainClient,
  ) {}

  async prepare(options: PrepareSettlementOptions): Promise<PreparedSettlement> {
    aborted(options.signal);
    if (options.market.fixtureId !== options.fixtureId) {
      throw keeperFailure(`Keeper fixture ${options.fixtureId} does not match market fixture ${options.market.fixtureId}`, "KEEPER_FIXTURE_MISMATCH", "Use one fixture ID consistently for the stream, proof, market, and consumer transaction.");
    }
    const finalRecord = await this.data.awaitFinal(options.fixtureId, options.signal ? { signal: options.signal } : {});
    options.market.assertSettlementRecord(finalRecord);
    const proof = await this.proofs.fetch({ fixtureId: options.fixtureId, seq: finalSeq(finalRecord), statKeys: options.market.statKeys });
    const valid = await this.onchain.verifyView(proof, options.market.strategy);
    if (!valid) {
      throw keeperFailure(`TxLINE proof did not satisfy ${options.market.label}`, "KEEPER_PREDICATE_FALSE", "Choose the outcome whose predicate matches the proven final stats; never submit a settlement for false.");
    }
    const validation = await this.onchain.buildValidateIx(proof, options.market.strategy);
    return Object.freeze({ fixtureId: options.fixtureId, finalRecord, proof, market: options.market, validation, valid: true as const });
  }

  async watchAndSettle(options: WatchAndSettleOptions): Promise<SettlementResult> {
    const maximum = options.dryRun ? 0 : attempts(options.maxSubmitAttempts);
    if (!options.dryRun && !options.submit) {
      throw keeperFailure("A live keeper needs a submit callback", "KEEPER_SUBMIT_MISSING", "Pass submit(prepared, attempt), or set dryRun: true to stop after read-only verification.");
    }
    const prepared = await this.prepare(options);
    if (options.dryRun) return Object.freeze({ ...prepared, dryRun: true, attempts: 0 });
    let lastError: unknown;
    for (let attempt = 1; attempt <= maximum; attempt += 1) {
      aborted(options.signal);
      let result: SettlementResult;
      try {
        const signature = await options.submit!(prepared, attempt);
        if (!signature.trim()) throw new Error("submit callback returned an empty signature");
        if (options.confirmation !== false) {
          const confirmation = await this.connection.confirmTransaction(signature, options.confirmation ?? "confirmed");
          if (confirmation.value.err) throw new Error(`settlement transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }
        result = Object.freeze({ ...prepared, dryRun: false, attempts: attempt, signature });
      } catch (cause) {
        lastError = cause;
        const error = keeperFailure(`Settlement submission attempt ${attempt} failed`, "KEEPER_SUBMIT_FAILED", "Inspect the consumer-program error, refresh the blockhash, and make submit safe to retry.", cause);
        await options.onError?.(error, attempt);
        if (attempt < maximum) {
          await backoff(attempt, options.signal);
          continue;
        }
        break;
      }
      await options.onSettled?.(result);
      return result;
    }
    throw keeperFailure(`Settlement failed after ${maximum} attempts`, "KEEPER_RETRIES_EXHAUSTED", "Resolve the consumer-program or RPC failure before retrying; the proof remains reusable while its anchored root exists.", lastError);
  }
}
