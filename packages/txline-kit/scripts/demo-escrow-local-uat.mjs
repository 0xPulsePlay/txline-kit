import anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { createReadStream, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { normalizeProofBundle } from "../dist/proofs.js";

const { AnchorProvider, BN, Program, Wallet } = anchor;
const fixtureId = 18_241_006;
const finalSeq = 962;
const rpcUrl = process.env.TXLINE_DEMO_RPC;
const recordingPath = process.env.TXLINE_DEMO_RECORDING;
if (!rpcUrl) throw new Error("TXLINE_DEMO_RPC is required; resolve the worktree test port with port-for");
if (!recordingPath) throw new Error("TXLINE_DEMO_RECORDING is required and must point to a protected .trec file");

const programId = new PublicKey("AzfXDFdCyMY99KbcnhcqFud56SG2Xn9c88tGSzjtXQRS");
const txlineProgramId = new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA");
const idl = JSON.parse(readFileSync(new URL("../../../programs/txline-demo-escrow/idl/txline_demo_escrow.json", import.meta.url), "utf8"));

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

async function airdrop(connection, key, sol = 20) {
  const signature = await connection.requestAirdrop(key, sol * 1_000_000_000);
  const latest = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
}

function marketPda(authority, marketFixtureId = fixtureId) {
  return PublicKey.findProgramAddressSync([
    Buffer.from("market"),
    authority.toBuffer(),
    new BN(marketFixtureId).toArrayLike(Buffer, "le", 8),
  ], programId)[0];
}

function positionPda(market, player) {
  return PublicKey.findProgramAddressSync([
    Buffer.from("position"),
    market.toBuffer(),
    player.toBuffer(),
  ], programId)[0];
}

async function expectFailure(label, action) {
  try {
    await action();
  } catch (error) {
    return { label, rejected: true, message: String(error).slice(0, 180) };
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

const connection = new Connection(rpcUrl, "confirmed");
const payer = Keypair.generate();
const homePlayer = Keypair.generate();
const awayPlayer = Keypair.generate();
const refundPlayer = Keypair.generate();
await Promise.all([
  airdrop(connection, payer.publicKey),
  airdrop(connection, homePlayer.publicKey),
  airdrop(connection, awayPlayer.publicKey),
  airdrop(connection, refundPlayer.publicKey),
]);
const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" });
const program = new Program(idl, provider);
const proof = await recordedProof();

const mint = await createMint(connection, payer, payer.publicKey, null, 0, undefined, undefined, TOKEN_2022_PROGRAM_ID);
const homeTokens = await getOrCreateAssociatedTokenAccount(connection, payer, mint, homePlayer.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
const awayTokens = await getOrCreateAssociatedTokenAccount(connection, payer, mint, awayPlayer.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
const refundTokens = await getOrCreateAssociatedTokenAccount(connection, payer, mint, refundPlayer.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
await mintTo(connection, payer, mint, homeTokens.address, payer, 1_000, [], undefined, TOKEN_2022_PROGRAM_ID);
await mintTo(connection, payer, mint, awayTokens.address, payer, 1_000, [], undefined, TOKEN_2022_PROGRAM_ID);
await mintTo(connection, payer, mint, refundTokens.address, payer, 500, [], undefined, TOKEN_2022_PROGRAM_ID);

const market = marketPda(payer.publicKey);
const vault = PublicKey.findProgramAddressSync([
  market.toBuffer(),
  TOKEN_2022_PROGRAM_ID.toBuffer(),
  mint.toBuffer(),
], ASSOCIATED_TOKEN_PROGRAM_ID)[0];
const settleNotBefore = Math.floor(Date.now() / 1000) + 8;
const refundAfter = settleNotBefore + 3_600;
const initializeSignature = await program.methods.initializeMarket(new BN(fixtureId), new BN(settleNotBefore), new BN(refundAfter)).accountsStrict({
  authority: payer.publicKey,
  mint,
  market,
  vault,
  tokenProgram: TOKEN_2022_PROGRAM_ID,
  associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  systemProgram: SystemProgram.programId,
}).rpc();

const homePosition = positionPda(market, homePlayer.publicKey);
const awayPosition = positionPda(market, awayPlayer.publicKey);
const enterHomeSignature = await program.methods.enter({ home: {} }, new BN(1_000)).accountsStrict({
  player: homePlayer.publicKey,
  market,
  mint,
  vault,
  playerTokens: homeTokens.address,
  position: homePosition,
  tokenProgram: TOKEN_2022_PROGRAM_ID,
  systemProgram: SystemProgram.programId,
}).signers([homePlayer]).rpc();
const enterAwaySignature = await program.methods.enter({ away: {} }, new BN(1_000)).accountsStrict({
  player: awayPlayer.publicKey,
  market,
  mint,
  vault,
  playerTokens: awayTokens.address,
  position: awayPosition,
  tokenProgram: TOKEN_2022_PROGRAM_ID,
  systemProgram: SystemProgram.programId,
}).signers([awayPlayer]).rpc();

const refundMarket = marketPda(refundPlayer.publicKey);
const refundVault = PublicKey.findProgramAddressSync([
  refundMarket.toBuffer(),
  TOKEN_2022_PROGRAM_ID.toBuffer(),
  mint.toBuffer(),
], ASSOCIATED_TOKEN_PROGRAM_ID)[0];
const refundPosition = positionPda(refundMarket, refundPlayer.publicKey);
const refundSettleTime = Math.floor(Date.now() / 1000) + 4;
const refundDeadline = refundSettleTime + 3;
const initializeRefundSignature = await program.methods.initializeMarket(new BN(fixtureId), new BN(refundSettleTime), new BN(refundDeadline)).accountsStrict({
  authority: refundPlayer.publicKey,
  mint,
  market: refundMarket,
  vault: refundVault,
  tokenProgram: TOKEN_2022_PROGRAM_ID,
  associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  systemProgram: SystemProgram.programId,
}).signers([refundPlayer]).rpc();
const enterRefundSignature = await program.methods.enter({ draw: {} }, new BN(500)).accountsStrict({
  player: refundPlayer.publicKey,
  market: refundMarket,
  mint,
  vault: refundVault,
  playerTokens: refundTokens.address,
  position: refundPosition,
  tokenProgram: TOKEN_2022_PROGRAM_ID,
  systemProgram: SystemProgram.programId,
}).signers([refundPlayer]).rpc();
const refundAccounts = {
  player: refundPlayer.publicKey,
  market: refundMarket,
  mint,
  vault: refundVault,
  playerTokens: refundTokens.address,
  position: refundPosition,
  tokenProgram: TOKEN_2022_PROGRAM_ID,
};
const earlyRefund = await expectFailure("refund before immutable deadline", () => program.methods.refund().accountsStrict(refundAccounts).signers([refundPlayer]).rpc());

const dailyScoresMerkleRoots = PublicKey.findProgramAddressSync([
  Buffer.from("daily_scores_roots"),
  Buffer.from([Math.floor(proof.ts.toNumber() / 86_400_000) & 0xff, Math.floor(proof.ts.toNumber() / 86_400_000) >>> 8]),
], txlineProgramId)[0];
const settleAccounts = {
  keeper: payer.publicKey,
  market,
  dailyScoresMerkleRoots,
  txlineProgram: txlineProgramId,
};
const compute = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
const tooEarly = await expectFailure("settlement before immutable time gate", () => program.methods
  .settle({ away: {} }, anchorPayload(proof))
  .accountsStrict(settleAccounts)
  .preInstructions([compute])
  .rpc());

const waitMs = Math.max(0, settleNotBefore * 1000 - Date.now() + 1_500);
await new Promise((resolve) => setTimeout(resolve, waitMs));
const wrongOutcome = await expectFailure("home outcome against 1-2 proof", () => program.methods
  .settle({ home: {} }, anchorPayload(proof))
  .accountsStrict(settleAccounts)
  .preInstructions([compute])
  .rpc());

const settlementAfterRefundDeadline = await expectFailure("settlement after refund window opens", () => program.methods
  .settle({ away: {} }, anchorPayload(proof))
  .accountsStrict({ ...settleAccounts, market: refundMarket })
  .preInstructions([compute])
  .rpc());

const settleSignature = await program.methods.settle({ away: {} }, anchorPayload(proof)).accountsStrict(settleAccounts).preInstructions([compute]).rpc();
const settled = await program.account.market.fetch(market);
if (!settled.settled || !("away" in settled.outcome) || settled.proofTimestamp.toString() !== proof.ts.toString()) {
  throw new Error("settled market state does not bind the away outcome and proof timestamp");
}

const claimBase = {
  market,
  mint,
  vault,
  tokenProgram: TOKEN_2022_PROGRAM_ID,
};
const losingClaim = await expectFailure("losing home position claim", () => program.methods.claim().accountsStrict({
  player: homePlayer.publicKey,
  ...claimBase,
  playerTokens: homeTokens.address,
  position: homePosition,
}).signers([homePlayer]).rpc());
const claimSignature = await program.methods.claim().accountsStrict({
  player: awayPlayer.publicKey,
  ...claimBase,
  playerTokens: awayTokens.address,
  position: awayPosition,
}).signers([awayPlayer]).rpc();
const doubleClaim = await expectFailure("winner double claim", () => program.methods.claim().accountsStrict({
  player: awayPlayer.publicKey,
  ...claimBase,
  playerTokens: awayTokens.address,
  position: awayPosition,
}).signers([awayPlayer]).rpc());
const refundSignature = await program.methods.refund().accountsStrict(refundAccounts).signers([refundPlayer]).rpc();
const doubleRefund = await expectFailure("position double refund", () => program.methods.refund().accountsStrict(refundAccounts).signers([refundPlayer]).rpc());

const [homeAfter, awayAfter, vaultAfter, refundAfterBalance, refundVaultAfter] = await Promise.all([
  getAccount(connection, homeTokens.address, "confirmed", TOKEN_2022_PROGRAM_ID),
  getAccount(connection, awayTokens.address, "confirmed", TOKEN_2022_PROGRAM_ID),
  getAccount(connection, vault, "confirmed", TOKEN_2022_PROGRAM_ID),
  getAccount(connection, refundTokens.address, "confirmed", TOKEN_2022_PROGRAM_ID),
  getAccount(connection, refundVault, "confirmed", TOKEN_2022_PROGRAM_ID),
]);
if (homeAfter.amount !== 0n || awayAfter.amount !== 2_000n || vaultAfter.amount !== 0n) {
  throw new Error(`unexpected payouts home=${homeAfter.amount} away=${awayAfter.amount} vault=${vaultAfter.amount}`);
}
if (refundAfterBalance.amount !== 500n || refundVaultAfter.amount !== 0n) {
  throw new Error(`unexpected refund player=${refundAfterBalance.amount} vault=${refundVaultAfter.amount}`);
}

const prematureMarketClose = await expectFailure("market close while positions remain", () => program.methods.closeMarket().accountsStrict({
  authority: payer.publicKey,
  market,
  vault,
  tokenProgram: TOKEN_2022_PROGRAM_ID,
}).rpc());
const closeHomePositionSignature = await program.methods.closePosition().accountsStrict({
  owner: homePlayer.publicKey,
  market,
  position: homePosition,
}).signers([homePlayer]).rpc();
const closeAwayPositionSignature = await program.methods.closePosition().accountsStrict({
  owner: awayPlayer.publicKey,
  market,
  position: awayPosition,
}).signers([awayPlayer]).rpc();
const closeMarketSignature = await program.methods.closeMarket().accountsStrict({
  authority: payer.publicKey,
  market,
  vault,
  tokenProgram: TOKEN_2022_PROGRAM_ID,
}).rpc();
const closeRefundPositionSignature = await program.methods.closePosition().accountsStrict({
  owner: refundPlayer.publicKey,
  market: refundMarket,
  position: refundPosition,
}).signers([refundPlayer]).rpc();
const closeRefundMarketSignature = await program.methods.closeMarket().accountsStrict({
  authority: refundPlayer.publicKey,
  market: refundMarket,
  vault: refundVault,
  tokenProgram: TOKEN_2022_PROGRAM_ID,
}).signers([refundPlayer]).rpc();

const closedAccounts = await connection.getMultipleAccountsInfo([
  homePosition,
  awayPosition,
  market,
  vault,
  refundPosition,
  refundMarket,
  refundVault,
], "confirmed");
if (closedAccounts.some((account) => account !== null)) {
  throw new Error("escrow teardown left a position, market, or vault account allocated");
}

console.log(JSON.stringify({
  outcome: "PASS",
  fixtureId,
  finalSeq,
  score: proof.stats.map(({ stat }) => stat.value),
  proofTimestamp: proof.ts.toString(),
  program: programId.toBase58(),
  txlineProgram: txlineProgramId.toBase58(),
  market: market.toBase58(),
  mint: mint.toBase58(),
  transactions: { initializeSignature, enterHomeSignature, enterAwaySignature, settleSignature, claimSignature, initializeRefundSignature, enterRefundSignature, refundSignature, closeHomePositionSignature, closeAwayPositionSignature, closeMarketSignature, closeRefundPositionSignature, closeRefundMarketSignature },
  balances: { home: homeAfter.amount.toString(), away: awayAfter.amount.toString(), vault: vaultAfter.amount.toString(), refunded: refundAfterBalance.amount.toString(), refundVault: refundVaultAfter.amount.toString() },
  teardown: { escrowAccountsClosed: closedAccounts.length, programUpgradeableLoaderClosePending: true },
  negativeTests: [tooEarly.label, wrongOutcome.label, settlementAfterRefundDeadline.label, losingClaim.label, doubleClaim.label, earlyRefund.label, doubleRefund.label, prematureMarketClose.label],
}, null, 2));
