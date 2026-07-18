import type * as anchor from "@coral-xyz/anchor";
import { ComputeBudgetProgram, Keypair, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import type { ResolvedClientConfig, TxLineWallet, WalletAdapterLike } from "./core.js";
import { VerificationError } from "./errors.js";
import type { HttpPipeline } from "./http.js";
import type { Bytes32, ProofBundle, ProofNode } from "./proofs.js";

const IDL_COMMIT = "f7e3bcd5db4c6744445f75dfab7eccc879c6d2de";
const encoder = new TextEncoder();

function verificationFailure(message: string, code: string, fix: string, cause?: unknown): never {
  throw new VerificationError(message, { code, fix, cause });
}

export function dailyScoresPda(timestamp: number | Date, programId: PublicKey): PublicKey {
  const millis = timestamp instanceof Date ? timestamp.getTime() : timestamp;
  if (!Number.isSafeInteger(millis) || millis < 0) verificationFailure("Daily score PDA timestamp must be a non-negative integer in milliseconds", "PDA_TIMESTAMP_INVALID", "Use bundle.summary.updateStats.minTimestamp without converting it to seconds.");
  const epochDay = Math.floor(millis / 86_400_000);
  if (epochDay > 65_535) verificationFailure(`Epoch day ${epochDay} does not fit the program's u16 seed`, "PDA_EPOCH_OVERFLOW", "Confirm the timestamp is milliseconds and compatible with the deployed program.");
  const day = Uint8Array.of(epochDay & 0xff, (epochDay >>> 8) & 0xff);
  return PublicKey.findProgramAddressSync([encoder.encode("daily_scores_roots"), day], programId)[0];
}

async function sha256(parts: readonly Uint8Array[]): Promise<Bytes32> {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Object.freeze([...new Uint8Array(digest)]);
}

function equalBytes(a: Bytes32, b: Bytes32): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

export async function merkleRootFromLeaf(leafHash: Bytes32, proof: readonly ProofNode[]): Promise<Bytes32> {
  if (leafHash.length !== 32) verificationFailure("Merkle leaf hash must be exactly 32 bytes", "MERKLE_LEAF_LENGTH_INVALID", "Hash the canonical leaf serialization before applying its proof path.");
  let current: Bytes32 = Object.freeze([...leafHash]);
  for (const node of proof) current = await sha256(node.isRightSibling
    ? [Uint8Array.from(current), Uint8Array.from(node.hash)]
    : [Uint8Array.from(node.hash), Uint8Array.from(current)]);
  return current;
}

export async function verifyMerklePath(leafHash: Bytes32, proof: readonly ProofNode[], expectedRoot: Bytes32): Promise<boolean> {
  if (expectedRoot.length !== 32) verificationFailure("Expected Merkle root must be exactly 32 bytes", "MERKLE_ROOT_LENGTH_INVALID", "Decode the anchored root to a 32-byte value.");
  return equalBytes(await merkleRootFromLeaf(leafHash, proof), expectedRoot);
}

export type ValidationStrategy = Record<string, unknown>;

export interface BuiltValidation {
  instruction: TransactionInstruction;
  preInstructions: readonly TransactionInstruction[];
  accounts: { dailyScoresMerkleRoots: PublicKey };
}

type DailyScoreAccounts = { dailyScoresMerkleRoots: PublicKey };

function anchorWallet(anchorModule: typeof anchor, wallet: TxLineWallet | undefined): anchor.Wallet {
  if (!wallet) return new anchorModule.Wallet(Keypair.generate());
  if (wallet instanceof Keypair) return new anchorModule.Wallet(wallet);
  const adapter = wallet as WalletAdapterLike;
  return {
    publicKey: adapter.publicKey,
    signTransaction: (transaction) => adapter.signTransaction(transaction),
    signAllTransactions: adapter.signAllTransactions
      ? (transactions) => adapter.signAllTransactions!(transactions)
      : async (transactions) => Promise.all(transactions.map((transaction) => adapter.signTransaction(transaction))),
  } as anchor.Wallet;
}

function anchorPayload(bundle: ProofBundle): Record<string, unknown> {
  return {
    ts: bundle.ts,
    fixtureSummary: bundle.summary,
    fixtureProof: bundle.fixtureProof,
    mainTreeProof: bundle.mainTreeProof,
    eventStatRoot: bundle.eventStatRoot,
    stats: bundle.stats,
  };
}

function mappedError(error: unknown): VerificationError {
  if (error instanceof VerificationError) return error;
  const detail = error as { error?: { errorCode?: { code?: string } }; message?: string };
  const code = detail.error?.errorCode?.code;
  if (code === "InvalidMainTreeProof") return new VerificationError("TxLINE rejected the main-tree proof", {
    code,
    fix: "Derive the PDA from bundle.summary.updateStats.minTimestamp, use that same value as payload ts, and confirm every hash is 32 bytes without reversal.",
    cause: error,
  });
  if (code === "IncompleteStatCoverage") return new VerificationError("TxLINE strategy does not cover every requested stat exactly once", {
    code,
    fix: "Keep requestedStatKeys order aligned with strategy indexes and cover each payload.stats position exactly once.",
    cause: error,
  });
  return new VerificationError(`TxLINE validation simulation failed${detail.message ? `: ${detail.message}` : ""}`, {
    code: code ?? "VALIDATION_SIMULATION_FAILED",
    fix: "Check network consistency, proof freshness, PDA derivation, stat order, and strategy coverage.",
    cause: error,
  });
}

export class OnchainClient {
  private programPromise: Promise<anchor.Program> | undefined;

  constructor(private readonly config: ResolvedClientConfig, private readonly http: HttpPipeline) {}

  dailyScoresPda(timestamp: number | Date): PublicKey {
    return dailyScoresPda(timestamp, this.config.programId);
  }

  async verifyView(bundle: ProofBundle, strategy: ValidationStrategy): Promise<boolean> {
    if (!this.config.wallet) verificationFailure("Read-only Solana simulation still needs an existing fee-payer account", "SIMULATION_WALLET_MISSING", "Pass a funded Keypair or connected wallet adapter; .view() does not submit a transaction or spend funds.");
    try {
      const program = await this.program();
      const accounts: DailyScoreAccounts = { dailyScoresMerkleRoots: this.dailyScoresPda(bundle.ts.toNumber()) };
      return await (program.methods as unknown as {
        validateStatV2(payload: Record<string, unknown>, strategy: ValidationStrategy): {
          accounts(accounts: DailyScoreAccounts): { preInstructions(ix: TransactionInstruction[]): { view(): Promise<boolean> } };
        };
      }).validateStatV2(anchorPayload(bundle), strategy).accounts(accounts)
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })]).view();
    } catch (error) { throw mappedError(error); }
  }

  async buildValidateIx(bundle: ProofBundle, strategy: ValidationStrategy): Promise<BuiltValidation> {
    try {
      const program = await this.program();
      const accounts: DailyScoreAccounts = { dailyScoresMerkleRoots: this.dailyScoresPda(bundle.ts.toNumber()) };
      const instruction = await (program.methods as unknown as {
        validateStatV2(payload: Record<string, unknown>, strategy: ValidationStrategy): { accounts(accounts: DailyScoreAccounts): { instruction(): Promise<TransactionInstruction> } };
      }).validateStatV2(anchorPayload(bundle), strategy).accounts(accounts).instruction();
      return Object.freeze({ instruction, preInstructions: Object.freeze([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })]), accounts: Object.freeze(accounts) });
    } catch (error) { throw mappedError(error); }
  }

  private program(): Promise<anchor.Program> {
    this.programPromise ??= this.loadProgram();
    return this.programPromise;
  }

  private async loadProgram(): Promise<anchor.Program> {
    const anchorModule = await import("@coral-xyz/anchor");
    const networkPath = this.config.network === "mainnet" ? "mainnet" : "devnet";
    const url = `https://raw.githubusercontent.com/txodds/tx-on-chain/${IDL_COMMIT}/examples/${networkPath}/idl/txoracle.json`;
    const response = await this.http.request(url, {}, { auth: false, retry401: false });
    if (!response.ok) verificationFailure(`Unable to download pinned ${this.config.network} IDL: HTTP ${response.status}`, "IDL_DOWNLOAD_FAILED", "Check GitHub availability before building or simulating an instruction.");
    const idl = await response.json() as anchor.Idl;
    if (idl.address !== this.config.programId.toBase58()) verificationFailure(`Pinned IDL address ${idl.address} does not match ${this.config.programId.toBase58()}`, "IDL_NETWORK_MISMATCH", "Keep API host, IDL, program ID, proof, and RPC on the selected network.");
    const provider = new anchorModule.AnchorProvider(this.config.connection, anchorWallet(anchorModule, this.config.wallet), { commitment: "confirmed" });
    return new anchorModule.Program(idl, provider);
  }
}
