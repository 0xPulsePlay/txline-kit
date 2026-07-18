import anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  burn,
  closeAccount,
  createInitializeMintCloseAuthorityInstruction,
  createInitializeMintInstruction,
  getAccount,
  getMintLen,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { chmodSync, createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { normalizeProofBundle } from "../dist/proofs.js";

const { AnchorProvider, BN, Program, Wallet } = anchor;
const fixtureId = 18_241_006;
const finalSeq = 962;
const expectedGenesis = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const programId = new PublicKey("AzfXDFdCyMY99KbcnhcqFud56SG2Xn9c88tGSzjtXQRS");
const txlineProgramId = new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA");
const rpcUrl = process.env.TXLINE_DEMO_RPC;
const recordingPath = process.env.TXLINE_DEMO_RECORDING;
const payerPath = process.env.TXLINE_DEMO_PAYER;
const checkpointPath = process.env.TXLINE_DEMO_CHECKPOINT;

if (process.env.TXLINE_MAINNET_CONFIRM !== "DEPLOY_VALUELESS_ESCROW") {
  throw new Error("Set TXLINE_MAINNET_CONFIRM=DEPLOY_VALUELESS_ESCROW to authorize mainnet writes");
}
if (!rpcUrl || !recordingPath || !payerPath || !checkpointPath) {
  throw new Error("TXLINE_DEMO_RPC, TXLINE_DEMO_RECORDING, TXLINE_DEMO_PAYER, and TXLINE_DEMO_CHECKPOINT are required");
}

const idl = JSON.parse(readFileSync(new URL("../../../programs/txline-demo-escrow/idl/txline_demo_escrow.json", import.meta.url), "utf8"));
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(payerPath, "utf8"))));

function loadOrCreateCheckpoint() {
  if (existsSync(checkpointPath)) {
    const saved = JSON.parse(readFileSync(checkpointPath, "utf8"));
    return Object.fromEntries(Object.entries(saved).map(([name, secret]) => [name, Keypair.fromSecretKey(Uint8Array.from(secret))]));
  }
  const signers = {
    authority: Keypair.generate(),
    homePlayer: Keypair.generate(),
    awayPlayer: Keypair.generate(),
    mint: Keypair.generate(),
  };
  writeFileSync(checkpointPath, `${JSON.stringify(Object.fromEntries(Object.entries(signers).map(([name, signer]) => [name, [...signer.secretKey]])))}\n`, { mode: 0o600, flag: "wx" });
  chmodSync(checkpointPath, 0o600);
  return signers;
}

async function recordedProof() {
  const lines = createInterface({ input: createReadStream(recordingPath), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.includes(`fixtureId=${fixtureId}&seq=${finalSeq}&statKeys=1,2,3001`)) continue;
    const envelope = JSON.parse(line);
    const raw = JSON.parse(envelope.body);
    raw.statsToProve = raw.statsToProve.slice(0, 2);
    raw.statProofs = raw.statProofs.slice(0, 2);
    return normalizeProofBundle(raw, { fixtureId, seq: finalSeq, statKeys: [1, 2] });
  }
  throw new Error(`Protected recording has no fixture ${fixtureId} seq ${finalSeq} proof`);
}

function anchorPayload(bundle) {
  return {
    ts: bundle.ts,
    fixtureSummary: bundle.summary,
    fixtureProof: bundle.fixtureProof,
    mainTreeProof: bundle.mainTreeProof,
    eventStatRoot: bundle.eventStatRoot,
    stats: bundle.stats,
  };
}

function marketPda(authority) {
  return PublicKey.findProgramAddressSync([
    Buffer.from("market"),
    authority.toBuffer(),
    new BN(fixtureId).toArrayLike(Buffer, "le", 8),
  ], programId)[0];
}

function positionPda(market, player) {
  return PublicKey.findProgramAddressSync([
    Buffer.from("position"),
    market.toBuffer(),
    player.toBuffer(),
  ], programId)[0];
}

function transactionSigners(additional = []) {
  return [payer, ...additional.filter((signer) => !signer.publicKey.equals(payer.publicKey))];
}

async function sendBuilder(builder, additionalSigners = []) {
  return sendAndConfirmTransaction(connection, await builder.transaction(), transactionSigners(additionalSigners), { commitment: "confirmed" });
}

async function expectBuilderFailure(label, builder, additionalSigners = []) {
  const transaction = await builder.transaction();
  transaction.feePayer = payer.publicKey;
  transaction.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
  transaction.partialSign(...transactionSigners(additionalSigners));
  const simulation = await connection.simulateTransaction(transaction);
  if (simulation.value.err) {
    return { label, rejected: true, message: JSON.stringify({ err: simulation.value.err, logs: simulation.value.logs }).slice(0, 500) };
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

async function fund(connection, recipient, lamports) {
  return sendAndConfirmTransaction(connection, new Transaction().add(SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: recipient,
    lamports,
  })), [payer], { commitment: "confirmed" });
}

async function ensureFunded(connection, recipient, lamports) {
  const balance = await connection.getBalance(recipient, "confirmed");
  return balance >= lamports ? null : fund(connection, recipient, lamports - balance);
}

async function sweep(connection, signer) {
  const balance = await connection.getBalance(signer.publicKey, "confirmed");
  if (balance <= 5_000) return null;
  return sendAndConfirmTransaction(connection, new Transaction().add(SystemProgram.transfer({
    fromPubkey: signer.publicKey,
    toPubkey: payer.publicKey,
    lamports: balance - 5_000,
  })), [signer], { commitment: "confirmed" });
}

const connection = new Connection(rpcUrl, "confirmed");
if (await connection.getGenesisHash() !== expectedGenesis) {
  throw new Error("RPC is not Solana mainnet; refusing all writes");
}
const deployed = await connection.getAccountInfo(programId, "confirmed");
if (!deployed?.executable) throw new Error("demo escrow program is not executable on mainnet");
if (await connection.getBalance(payer.publicKey, "confirmed") < 100_000_000) {
  throw new Error("payer needs at least 0.1 SOL for guarded mainnet UAT");
}

const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" });
const program = new Program(idl, provider);
const proof = await recordedProof();
const { authority, homePlayer, awayPlayer, mint } = loadOrCreateCheckpoint();
const startingBalance = await connection.getBalance(payer.publicKey, "confirmed");
const fundingSignatures = await Promise.all([
  ensureFunded(connection, authority.publicKey, 20_000_000),
  ensureFunded(connection, homePlayer.publicKey, 10_000_000),
  ensureFunded(connection, awayPlayer.publicKey, 10_000_000),
]);

const mintLen = getMintLen([ExtensionType.MintCloseAuthority]);
const mintRent = await connection.getMinimumBalanceForRentExemption(mintLen, "confirmed");
const createMintSignature = await connection.getAccountInfo(mint.publicKey, "confirmed") ? null : await sendAndConfirmTransaction(connection, new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports: mintRent,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMintCloseAuthorityInstruction(mint.publicKey, payer.publicKey, TOKEN_2022_PROGRAM_ID),
    createInitializeMintInstruction(mint.publicKey, 0, payer.publicKey, null, TOKEN_2022_PROGRAM_ID),
  ), [payer, mint], { commitment: "confirmed" });

const homeTokens = await getOrCreateAssociatedTokenAccount(connection, payer, mint.publicKey, homePlayer.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
const awayTokens = await getOrCreateAssociatedTokenAccount(connection, payer, mint.publicKey, awayPlayer.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
const homeBefore = await getAccount(connection, homeTokens.address, "confirmed", TOKEN_2022_PROGRAM_ID);
const awayBefore = await getAccount(connection, awayTokens.address, "confirmed", TOKEN_2022_PROGRAM_ID);
const mintHomeSignature = homeBefore.amount >= 1_000n ? null : await mintTo(connection, payer, mint.publicKey, homeTokens.address, payer, 1_000n - homeBefore.amount, [], undefined, TOKEN_2022_PROGRAM_ID);
const mintAwaySignature = awayBefore.amount >= 1_000n ? null : await mintTo(connection, payer, mint.publicKey, awayTokens.address, payer, 1_000n - awayBefore.amount, [], undefined, TOKEN_2022_PROGRAM_ID);

const market = marketPda(authority.publicKey);
const vault = PublicKey.findProgramAddressSync([
  market.toBuffer(),
  TOKEN_2022_PROGRAM_ID.toBuffer(),
  mint.publicKey.toBuffer(),
], ASSOCIATED_TOKEN_PROGRAM_ID)[0];
const homePosition = positionPda(market, homePlayer.publicKey);
const awayPosition = positionPda(market, awayPlayer.publicKey);
const settleNotBefore = Math.floor(Date.now() / 1_000) + 120;
const refundAfter = settleNotBefore + 3_600;

const initializeBuilder = program.methods.initializeMarket(new BN(fixtureId), new BN(settleNotBefore), new BN(refundAfter)).accountsStrict({
  authority: authority.publicKey,
  mint: mint.publicKey,
  market,
  vault,
  tokenProgram: TOKEN_2022_PROGRAM_ID,
  associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  systemProgram: SystemProgram.programId,
}).signers([authority]);
const initializeTransaction = await initializeBuilder.transaction();
initializeTransaction.feePayer = payer.publicKey;
initializeTransaction.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
initializeTransaction.partialSign(...transactionSigners([authority]));
const initializeSimulation = await connection.simulateTransaction(initializeTransaction);
if (initializeSimulation.value.err) {
  throw new Error(`initialize simulation failed: ${JSON.stringify({ err: initializeSimulation.value.err, logs: initializeSimulation.value.logs })}`);
}
const initializeSignature = await sendBuilder(initializeBuilder, [authority]);
const enterHomeSignature = await sendBuilder(program.methods.enter({ home: {} }, new BN(1_000)).accountsStrict({
  player: homePlayer.publicKey,
  market,
  mint: mint.publicKey,
  vault,
  playerTokens: homeTokens.address,
  position: homePosition,
  tokenProgram: TOKEN_2022_PROGRAM_ID,
  systemProgram: SystemProgram.programId,
}), [homePlayer]);
const enterAwaySignature = await sendBuilder(program.methods.enter({ away: {} }, new BN(1_000)).accountsStrict({
  player: awayPlayer.publicKey,
  market,
  mint: mint.publicKey,
  vault,
  playerTokens: awayTokens.address,
  position: awayPosition,
  tokenProgram: TOKEN_2022_PROGRAM_ID,
  systemProgram: SystemProgram.programId,
}), [awayPlayer]);

const dailyScoresMerkleRoots = PublicKey.findProgramAddressSync([
  Buffer.from("daily_scores_roots"),
  Buffer.from([Math.floor(proof.ts.toNumber() / 86_400_000) & 0xff, Math.floor(proof.ts.toNumber() / 86_400_000) >>> 8]),
], txlineProgramId)[0];
const settleAccounts = { keeper: payer.publicKey, market, dailyScoresMerkleRoots, txlineProgram: txlineProgramId };
const compute = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
const tooEarly = await expectBuilderFailure("settlement before immutable time gate", program.methods.settle({ away: {} }, anchorPayload(proof)).accountsStrict(settleAccounts).preInstructions([compute]));
await new Promise((resolve) => setTimeout(resolve, Math.max(0, settleNotBefore * 1_000 - Date.now() + 2_000)));
const wrongOutcome = await expectBuilderFailure("home outcome against recorded 1-2 proof", program.methods.settle({ home: {} }, anchorPayload(proof)).accountsStrict(settleAccounts).preInstructions([compute]));
const settleSignature = await sendBuilder(program.methods.settle({ away: {} }, anchorPayload(proof)).accountsStrict(settleAccounts).preInstructions([compute]));

const losingClaim = await expectBuilderFailure("losing home position claim", program.methods.claim().accountsStrict({
  player: homePlayer.publicKey,
  market,
  mint: mint.publicKey,
  vault,
  playerTokens: homeTokens.address,
  position: homePosition,
  tokenProgram: TOKEN_2022_PROGRAM_ID,
}), [homePlayer]);
const claimSignature = await sendBuilder(program.methods.claim().accountsStrict({
  player: awayPlayer.publicKey,
  market,
  mint: mint.publicKey,
  vault,
  playerTokens: awayTokens.address,
  position: awayPosition,
  tokenProgram: TOKEN_2022_PROGRAM_ID,
}), [awayPlayer]);

const [homeAfter, awayAfter, vaultAfter] = await Promise.all([
  getAccount(connection, homeTokens.address, "confirmed", TOKEN_2022_PROGRAM_ID),
  getAccount(connection, awayTokens.address, "confirmed", TOKEN_2022_PROGRAM_ID),
  getAccount(connection, vault, "confirmed", TOKEN_2022_PROGRAM_ID),
]);
if (homeAfter.amount !== 0n || awayAfter.amount !== 2_000n || vaultAfter.amount !== 0n) {
  throw new Error(`unexpected payout balances home=${homeAfter.amount} away=${awayAfter.amount} vault=${vaultAfter.amount}`);
}

const prematureMarketClose = await expectBuilderFailure("market close while positions remain", program.methods.closeMarket().accountsStrict({
  authority: authority.publicKey,
  market,
  vault,
  tokenProgram: TOKEN_2022_PROGRAM_ID,
}), [authority]);
const closeHomePositionSignature = await sendBuilder(program.methods.closePosition().accountsStrict({ owner: homePlayer.publicKey, market, position: homePosition }), [homePlayer]);
const closeAwayPositionSignature = await sendBuilder(program.methods.closePosition().accountsStrict({ owner: awayPlayer.publicKey, market, position: awayPosition }), [awayPlayer]);
const closeMarketSignature = await sendBuilder(program.methods.closeMarket().accountsStrict({ authority: authority.publicKey, market, vault, tokenProgram: TOKEN_2022_PROGRAM_ID }), [authority]);

const burnSignature = await burn(connection, payer, awayTokens.address, mint.publicKey, awayPlayer, 2_000, [], undefined, TOKEN_2022_PROGRAM_ID);
const closeHomeTokensSignature = await closeAccount(connection, payer, homeTokens.address, payer.publicKey, homePlayer, [], undefined, TOKEN_2022_PROGRAM_ID);
const closeAwayTokensSignature = await closeAccount(connection, payer, awayTokens.address, payer.publicKey, awayPlayer, [], undefined, TOKEN_2022_PROGRAM_ID);
const closeMintSignature = await closeAccount(connection, payer, mint.publicKey, payer.publicKey, payer, [], undefined, TOKEN_2022_PROGRAM_ID);
const sweepSignatures = await Promise.all([sweep(connection, authority), sweep(connection, homePlayer), sweep(connection, awayPlayer)]);

const closed = await connection.getMultipleAccountsInfo([market, vault, homePosition, awayPosition, mint.publicKey, homeTokens.address, awayTokens.address], "confirmed");
if (closed.some((account) => account !== null)) throw new Error("mainnet UAT left a temporary escrow or token account allocated");
const endingBalance = await connection.getBalance(payer.publicKey, "confirmed");

console.log(JSON.stringify({
  outcome: "PASS",
  cluster: "mainnet-beta",
  fixtureId,
  finalSeq,
  score: proof.stats.map(({ stat }) => stat.value),
  program: programId.toBase58(),
  txlineProgram: txlineProgramId.toBase58(),
  market: market.toBase58(),
  mint: mint.publicKey.toBase58(),
  transactions: {
    fundingSignatures, createMintSignature, mintHomeSignature, mintAwaySignature, initializeSignature,
    enterHomeSignature, enterAwaySignature, settleSignature, claimSignature, closeHomePositionSignature,
    closeAwayPositionSignature, closeMarketSignature, burnSignature, closeHomeTokensSignature,
    closeAwayTokensSignature, closeMintSignature, sweepSignatures,
  },
  negativeTests: [tooEarly.label, wrongOutcome.label, losingClaim.label, prematureMarketClose.label],
  teardown: { temporaryAccountsClosed: closed.length },
  payer: { startingLamports: startingBalance, endingLamports: endingBalance, costLamports: startingBalance - endingBalance },
}, null, 2));
process.exit(0);
