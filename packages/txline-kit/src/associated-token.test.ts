import {
  ASSOCIATED_TOKEN_PROGRAM_ID as referenceAssociatedProgram,
  TOKEN_2022_PROGRAM_ID as referenceTokenProgram,
  createAssociatedTokenAccountInstruction as referenceCreateInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  associatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "./associated-token.js";

describe("minimal associated Token-2022 helpers", () => {
  it("matches the canonical program IDs and address derivation", () => {
    const mint = Keypair.generate().publicKey;
    const owner = Keypair.generate().publicKey;
    expect(TOKEN_2022_PROGRAM_ID.equals(referenceTokenProgram)).toBe(true);
    expect(ASSOCIATED_TOKEN_PROGRAM_ID.equals(referenceAssociatedProgram)).toBe(true);
    expect(associatedTokenAddress(mint, owner).equals(
      getAssociatedTokenAddressSync(mint, owner, false, referenceTokenProgram, referenceAssociatedProgram),
    )).toBe(true);
  });

  it("is byte-for-byte equivalent to the canonical create instruction", () => {
    const payer = Keypair.generate().publicKey;
    const owner = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const ata = associatedTokenAddress(mint, owner);
    const actual = createAssociatedTokenAccountInstruction(payer, ata, owner, mint);
    const reference = referenceCreateInstruction(payer, ata, owner, mint, referenceTokenProgram, referenceAssociatedProgram);
    expect(actual.programId.equals(reference.programId)).toBe(true);
    expect(actual.keys).toEqual(reference.keys);
    expect(Buffer.from(actual.data)).toEqual(Buffer.from(reference.data));
  });
});
