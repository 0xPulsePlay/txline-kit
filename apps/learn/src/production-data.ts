// Real excerpts from Proofline's public commit 15b6697 on 0xPulsePlay/proofline (main),
// "Solana MAINNET: adapter deployed + real on-chain TxLINE proof verification".
// https://github.com/0xPulsePlay/proofline/commit/15b6697
//
// These are verbatim slices of `git diff 15b6697~1 15b6697` — nothing here is
// paraphrased or reconstructed. Full files are linked from the UI.

export interface DiffFile {
  path: string;
  status: "deleted" | "rewritten";
  before: number;
  after: number;
  added: number;
  removed: number;
  diff: string;
}

export const productionCommit = {
  project: "Proofline",
  title: "Solana MAINNET: adapter deployed + real on-chain TxLINE proof verification",
  sha: "15b6697",
  fullSha: "15b66974af7b6ff29e2623f9b6078edc5ca96c45",
  url: "https://github.com/0xPulsePlay/proofline/commit/15b6697",
  repo: "0xPulsePlay/proofline",
};

export const productionDiffFiles: DiffFile[] = [
  {
    path: "src/txline/idl_types.rs",
    status: "deleted",
    before: 68,
    after: 0,
    added: 0,
    removed: 68,
    diff: "-//! Rust mirrors of the TxLINE TxOracle IDL types this adapter touches.\n-//!\n-//! These are transcribed from TxOracle's published Anchor IDL, not invented\n-//! here: TxOracle is the deployed mainnet verifier\n-//! (`9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA`, see\n-//! `packages/protocol/src/constants.ts`, the cross-language source of\n-//! truth) and this adapter must produce byte-identical instruction data to\n-//! what TxLINE's own clients produce.\n-\n-use anchor_lang::prelude::*;\n-\n-/// TxLINE final-settlement marker: a score record is terminal when\n-/// `period == 100` (equivalently `statusId == 100`, the `game_finalised`\n-/// action). This adapter refuses to verify anything else — Proofline\n-/// attests final outcomes only, never in-play scores.\n-pub const FINAL_PERIOD: i32 = 100;\n-\n-/// `source_validation_version` value for the `validate_stat_v2` generation.\n-pub const SOURCE_VALIDATION_V2: u8 = 2;\n-\n-/// Argument struct for TxOracle `validate_stat_v2`, borsh-serialized after\n-/// the 8-byte Anchor discriminator.\n-///\n-/// VALIDATION PREDICATE — exact equality. TxOracle walks the Merkle proof\n-/// in `proof` against the daily root account passed as the instruction's",
  },
  {
    path: "src/txline/instruction.rs",
    status: "rewritten",
    before: 104,
    after: 36,
    added: 3,
    removed: 71,
    diff: "-//! Raw instruction builder for TxOracle `validate_stat_v2`.\n+//! Adapter-specific commitment for an official TxLINE instruction.\n //!\n-//! Built by hand (rather than via a generated CPI crate) because TxOracle\n-//! ships no public crate — only a deployed program + IDL. The instruction\n-//! is always built against the program id stored in `Config`, never against\n-//! a caller-supplied id.\n+//! Construction and serialization of `validate_stat_v2` live exclusively in\n+//! the pinned `txline_cpi` crate. This module deliberately contains no ABI.\n \n use anchor_lang::prelude::*;\n-use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};\n use solana_keccak_hasher as keccak;\n-use solana_sha256_hasher as sha256;\n-\n-use super::idl_types::ValidateStatV2Args;\n-\n-/// Anchor global-namespace method discriminator:\n-/// `sha256(\"global:validate_stat_v2\")[..8]`.\n-pub fn validate_stat_v2_discriminator() -> [u8; 8] {\n-    let h = sha256::hash(b\"global:validate_stat_v2\");\n-    let mut d = [0u8; 8];\n-    d.copy_from_slice(&h.to_bytes()[..8]);\n-    d\n-}\n-\n-/// Serialize discriminator + borsh args into raw instruction data.\n-pub fn validate_stat_v2_data(args: &ValidateStatV2Args) -> Result<Vec<u8>> {\n-    let mut data = validate_stat_v2_discriminator().to_vec();\n-    args.serialize(&mut data)",
  },
];
