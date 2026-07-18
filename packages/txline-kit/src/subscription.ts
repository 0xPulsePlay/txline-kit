import * as anchor from "@coral-xyz/anchor";
import type { Idl } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, associatedTokenAddress, createAssociatedTokenAccountInstruction } from "./associated-token.js";
import type { ResolvedClientConfig, TxLineWallet, WalletAdapterLike } from "./core.js";
import { walletPublicKey } from "./core.js";
import { ConfigurationError } from "./errors.js";
import type { HttpPipeline } from "./http.js";

const IDL_COMMIT = "f7e3bcd5db4c6744445f75dfab7eccc879c6d2de";

function adapterWallet(wallet: TxLineWallet): anchor.Wallet {
  if (wallet instanceof Keypair) return new anchor.Wallet(wallet);
  const adapter = wallet as WalletAdapterLike;
  return {
    publicKey: adapter.publicKey,
    signTransaction: (transaction) => adapter.signTransaction(transaction),
    signAllTransactions: adapter.signAllTransactions
      ? (transactions) => adapter.signAllTransactions!(transactions)
      : async (transactions) => Promise.all(transactions.map((transaction) => adapter.signTransaction(transaction))),
  } as anchor.Wallet;
}

async function fetchPinnedIdl(config: ResolvedClientConfig, http: HttpPipeline): Promise<Idl> {
  const networkPath = config.network === "mainnet" ? "mainnet" : "devnet";
  const url = `https://raw.githubusercontent.com/txodds/tx-on-chain/${IDL_COMMIT}/examples/${networkPath}/idl/txoracle.json`;
  const response = await http.request(url, {}, { auth: false, retry401: false });
  if (!response.ok) {
    throw new ConfigurationError(`Unable to download pinned ${config.network} IDL: HTTP ${response.status}`, {
      code: "IDL_DOWNLOAD_FAILED",
      status: response.status,
      fix: "Check GitHub availability or provide network access before subscribing.",
    });
  }
  const idl = await response.json() as Idl;
  if (idl.address !== config.programId.toBase58()) {
    throw new ConfigurationError(`Pinned IDL address ${idl.address} does not match ${config.programId.toBase58()}`, {
      code: "IDL_NETWORK_MISMATCH",
      fix: "Keep the selected network, API host, program ID, mint, and IDL together.",
    });
  }
  return idl;
}

export async function submitFreeSubscription(
  config: ResolvedClientConfig,
  http: HttpPipeline,
  wallet: TxLineWallet,
  serviceLevel: 1 | 12,
  durationWeeks: number,
): Promise<string> {
  const idl = await fetchPinnedIdl(config, http);
  const provider = new anchor.AnchorProvider(config.connection, adapterWallet(wallet), { commitment: "confirmed" });
  const program = new anchor.Program(idl, provider);
  if (!program.programId.equals(config.programId)) {
    throw new ConfigurationError(`Pinned IDL program ${program.programId.toBase58()} does not match ${config.programId.toBase58()}`, {
      code: "IDL_NETWORK_MISMATCH",
      fix: "Do not combine an IDL, program, mint, RPC, or API host from different networks.",
    });
  }
  const publicKey = walletPublicKey(wallet);
  const userTokenAccount = associatedTokenAddress(config.tokenMint, publicKey);
  const preInstructions = [];
  if (!(await config.connection.getAccountInfo(userTokenAccount, "confirmed"))) {
    preInstructions.push(createAssociatedTokenAccountInstruction(publicKey, userTokenAccount, publicKey, config.tokenMint));
  }
  const [pricingMatrix] = PublicKey.findProgramAddressSync([new TextEncoder().encode("pricing_matrix")], program.programId);
  const matrix = await (program.account as unknown as {
    pricingMatrix: { fetch(address: PublicKey): Promise<{ rows: Array<{ rowId: number }> }> };
  }).pricingMatrix.fetch(pricingMatrix);
  if (!matrix.rows.some((row) => Number(row.rowId) === serviceLevel)) {
    throw new ConfigurationError(`Service level ${serviceLevel} is absent from the on-chain pricing matrix`, {
      code: "SERVICE_LEVEL_UNAVAILABLE",
      fix: "Use free service level 1 or 12 only when it is present on the selected network.",
    });
  }
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync([new TextEncoder().encode("token_treasury_v2")], program.programId);
  const tokenTreasuryVault = associatedTokenAddress(config.tokenMint, tokenTreasuryPda);
  const builder = (program.methods as unknown as {
    subscribe(level: number, weeks: number): {
      accounts(accounts: Record<string, PublicKey>): { preInstructions(ix: unknown[]): { rpc(): Promise<string> } };
    };
  }).subscribe(serviceLevel, durationWeeks).accounts({
    user: publicKey,
    pricingMatrix,
    tokenMint: config.tokenMint,
    userTokenAccount,
    tokenTreasuryVault,
    tokenTreasuryPda,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  });
  return builder.preInstructions(preInstructions).rpc();
}
