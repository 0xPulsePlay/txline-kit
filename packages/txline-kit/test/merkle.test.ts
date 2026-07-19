import { describe, expect, test } from "vitest";
import { buildMerkleTree, hashLeaf } from "../src/merkle.js";
import { merkleRootFromLeaf, verifyMerklePath } from "../src/onchain.js";

const leaf = (seed: number) => hashLeaf(Uint8Array.from({ length: 40 }, (_, index) => (seed * 7 + index) % 256));

describe("merkle tree builder", () => {
  test.each([1, 2, 3, 5, 8])("every extracted proof for %i leaves verifies against the built root", async (count) => {
    const leaves = await Promise.all(Array.from({ length: count }, (_, index) => leaf(index)));
    const tree = await buildMerkleTree(leaves);
    expect(tree.leaves).toHaveLength(count);
    expect(tree.proofs).toHaveLength(count);
    for (let index = 0; index < count; index += 1) {
      await expect(verifyMerklePath(tree.leaves[index]!, tree.proofs[index]!, tree.root)).resolves.toBe(true);
    }
  });

  test("odd layers duplicate their last node exactly like the verifier expects", async () => {
    const leaves = await Promise.all([leaf(1), leaf(2), leaf(3)]);
    const tree = await buildMerkleTree(leaves);
    const lastProof = tree.proofs[2]!;
    expect(lastProof[0]).toMatchObject({ isRightSibling: true, hash: tree.leaves[2] });
    await expect(merkleRootFromLeaf(tree.leaves[2]!, lastProof)).resolves.toEqual(tree.root);
  });

  test("altered leaves and truncated proofs fail verification", async () => {
    const leaves = await Promise.all([leaf(1), leaf(2), leaf(3), leaf(4)]);
    const tree = await buildMerkleTree(leaves);
    const tampered = Object.freeze([...tree.leaves[0]!.slice(0, 31), (tree.leaves[0]![31]! + 1) % 256]);
    await expect(verifyMerklePath(tampered, tree.proofs[0]!, tree.root)).resolves.toBe(false);
    await expect(verifyMerklePath(tree.leaves[0]!, tree.proofs[0]!.slice(1), tree.root)).resolves.toBe(false);
    await expect(verifyMerklePath(tree.leaves[1]!, tree.proofs[0]!, tree.root)).resolves.toBe(false);
  });

  test("single-leaf trees are their own root and inputs are validated", async () => {
    const only = await leaf(9);
    const tree = await buildMerkleTree([only]);
    expect(tree.root).toEqual(only);
    expect(tree.proofs[0]).toEqual([]);
    await expect(buildMerkleTree([])).rejects.toMatchObject({ code: "MERKLE_LEAVES_EMPTY" });
    await expect(buildMerkleTree([[1, 2, 3]])).rejects.toMatchObject({ code: "MERKLE_LEAF_LENGTH_INVALID" });
    expect(Object.isFrozen(tree.root)).toBe(true);
    expect(Object.isFrozen(tree.proofs[0])).toBe(true);
  });
});
