import { VerificationError } from "./errors.js";
import type { Bytes32, ProofNode } from "./proofs.js";

function merkleFailure(message: string, code: string, fix: string): never {
  throw new VerificationError(message, { code, fix });
}

async function sha256(parts: readonly Uint8Array[]): Promise<Bytes32> {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Object.freeze([...new Uint8Array(digest)]);
}

/** Hash a raw leaf serialization into the 32-byte form the tree and the
 * on-chain verifier operate on. */
export async function hashLeaf(serialized: Uint8Array): Promise<Bytes32> {
  return sha256([serialized]);
}

export interface BuiltMerkleTree {
  root: Bytes32;
  /** The leaf hashes, in input order. */
  leaves: readonly Bytes32[];
  /** One directional proof path per leaf, consumable by `verifyMerklePath`. */
  proofs: readonly (readonly ProofNode[])[];
}

/** Build a Merkle tree over already-hashed 32-byte leaves and extract a
 * directional proof path for every leaf. Odd layers duplicate their last
 * node, matching the direction conventions `merkleRootFromLeaf` verifies.
 * This is test and fixture tooling: it generates known-good (and, by
 * mutation, known-bad) proof vectors for synthetic `.trec` recordings and
 * for reproducing TxLINE's leaf serialization against anchored roots. */
export async function buildMerkleTree(leafHashes: readonly Bytes32[]): Promise<BuiltMerkleTree> {
  if (leafHashes.length === 0) merkleFailure("At least one leaf hash is required", "MERKLE_LEAVES_EMPTY", "Pass the 32-byte leaf hashes the tree should commit to.");
  const leaves = leafHashes.map((leaf, index) => {
    if (leaf.length !== 32) merkleFailure(`Leaf ${index} must be exactly 32 bytes; received ${leaf.length}`, "MERKLE_LEAF_LENGTH_INVALID", "Hash each canonical leaf serialization (hashLeaf) before building the tree.");
    return Object.freeze([...leaf]);
  });
  const proofs: ProofNode[][] = leaves.map(() => []);
  let layer = leaves.map((hash, index) => ({ hash: hash as Bytes32, indexes: [index] }));
  while (layer.length > 1) {
    const next: typeof layer = [];
    for (let index = 0; index < layer.length; index += 2) {
      const left = layer[index]!;
      const right = layer[index + 1] ?? left;
      for (const leafIndex of left.indexes) proofs[leafIndex]!.push({ hash: right.hash, isRightSibling: true });
      if (right !== left) for (const leafIndex of right.indexes) proofs[leafIndex]!.push({ hash: left.hash, isRightSibling: false });
      next.push({
        hash: await sha256([Uint8Array.from(left.hash), Uint8Array.from(right.hash)]),
        indexes: right === left ? [...left.indexes] : [...left.indexes, ...right.indexes],
      });
    }
    layer = next;
  }
  return Object.freeze({
    root: layer[0]!.hash,
    leaves: Object.freeze(leaves),
    proofs: Object.freeze(proofs.map((path) => Object.freeze(path.map((node) => Object.freeze(node))))),
  });
}
