import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  burn,
  closeAccount,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { readFileSync } from "node:fs";

const expectedGenesis = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const rpcUrl = process.env.TXLINE_DEMO_RPC;
const payerPath = process.env.TXLINE_DEMO_PAYER;
const checkpointPath = process.env.TXLINE_DEMO_CHECKPOINT;

if (process.env.TXLINE_MAINNET_CONFIRM !== "CLEAN_VALUELESS_SETUP") {
  throw new Error("Set TXLINE_MAINNET_CONFIRM=CLEAN_VALUELESS_SETUP to authorize cleanup writes");
}
if (!rpcUrl || !payerPath || !checkpointPath) {
  throw new Error("TXLINE_DEMO_RPC, TXLINE_DEMO_PAYER, and TXLINE_DEMO_CHECKPOINT are required");
}

const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(payerPath, "utf8"))));
const saved = JSON.parse(readFileSync(checkpointPath, "utf8"));
const signer = (name) => Keypair.fromSecretKey(Uint8Array.from(saved[name]));
const authority = signer("authority");
const homePlayer = signer("homePlayer");
const awayPlayer = signer("awayPlayer");
const mint = signer("mint");
const connection = new Connection(rpcUrl, "confirmed");

if (await connection.getGenesisHash() !== expectedGenesis) {
  throw new Error("RPC is not Solana mainnet; refusing all writes");
}

async function closePlayerTokens(player) {
  const address = getAssociatedTokenAddressSync(mint.publicKey, player.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const info = await connection.getAccountInfo(address, "confirmed");
  if (!info) return { address: address.toBase58(), burnSignature: null, closeSignature: null };
  const account = await getAccount(connection, address, "confirmed", TOKEN_2022_PROGRAM_ID);
  const burnSignature = account.amount === 0n ? null : await burn(connection, payer, address, mint.publicKey, player, account.amount, [], undefined, TOKEN_2022_PROGRAM_ID);
  const closeSignature = await closeAccount(connection, payer, address, payer.publicKey, player, [], undefined, TOKEN_2022_PROGRAM_ID);
  return { address: address.toBase58(), burnSignature, closeSignature };
}

async function sweep(player) {
  const balance = await connection.getBalance(player.publicKey, "confirmed");
  if (balance <= 5_000) return null;
  return sendAndConfirmTransaction(connection, new Transaction().add(SystemProgram.transfer({
    fromPubkey: player.publicKey,
    toPubkey: payer.publicKey,
    lamports: balance - 5_000,
  })), [player], { commitment: "confirmed" });
}

const startingLamports = await connection.getBalance(payer.publicKey, "confirmed");
const home = await closePlayerTokens(homePlayer);
const away = await closePlayerTokens(awayPlayer);
const closeMintSignature = await connection.getAccountInfo(mint.publicKey, "confirmed")
  ? await closeAccount(connection, payer, mint.publicKey, payer.publicKey, payer, [], undefined, TOKEN_2022_PROGRAM_ID)
  : null;
const sweepSignatures = [];
for (const player of [authority, homePlayer, awayPlayer]) sweepSignatures.push(await sweep(player));
const endingLamports = await connection.getBalance(payer.publicKey, "confirmed");

console.log(JSON.stringify({
  outcome: "PASS",
  mint: mint.publicKey.toBase58(),
  home,
  away,
  closeMintSignature,
  sweepSignatures,
  reclaimedLamports: endingLamports - startingLamports,
}, null, 2));
process.exit(0);
