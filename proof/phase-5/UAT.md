# Phase 5 simulated human QA / UAT

## Required developer journey

1. Read the pinned mainnet IDL rather than infer the Rust layout from TypeScript types.
2. Confirm program IDs, account mutability/signing, instruction discriminator, return type, and every nested V2 type.
3. Generate working Anchor TypeScript instruction bytes for a basic payload, every strategy variant, and directional proof nodes.
4. Reproduce those bytes independently from the Rust crate.
5. Compile the consumer-facing three-argument CPI call as ordinary Anchor code.
6. Exercise every return-data rejection boundary without invoking a fake oracle.
7. Compile mainnet, devnet, Rust 1.85, native, rustdoc, and Solana SBF targets.
8. Package the crate, inspect included files, and build/run a new consumer outside the monorepo.
9. Confirm Phase 6—not this crate-only phase—owns the real deployed CPI transaction.

## Findings and fixes

| Severity | Finding | Fix | Result |
|---|---|---|---|
| Critical | Generic Anchor return helpers can accept stale/nested return bytes without checking their source. | Read immediately after invoke; require the returned program ID to equal the feature-selected TxLINE program; decode exactly one boolean byte. | Resolved and negatively tested. |
| High | A runtime program-ID argument would preserve the mainnet/devnet cross-wire footgun. | Compile exactly one `mainnet` or `devnet` feature and expose `Program<'info, TxLine>`. | Resolved; mixed/empty feature builds intentionally fail. |
| High | A caller could pair a valid-looking PDA with a different payload timestamp. | Require `payload.ts == min_timestamp`, derive the PDA internally, and compare before building/invoking. | Resolved and negatively tested. |
| High | Hand-authored Borsh types can silently drift while still compiling. | Pin the IDL commit and assert three TypeScript-generated golden vectors covering all fields, proof directions, options, and enum variants. | Resolved; 170/187/302-byte vectors match exactly. |
| Medium | Native compilation alone would not prove the crate survives Solana's target/toolchain. | Add an actual `cargo build-sbf` gate. | Resolved. |
| Medium | A repository-path test can hide missing package files or bad public imports. | Run `cargo package`, inspect its file list, and compile/run an external clean-room consumer against the packaged crate. | Resolved. |
| Low | The box initially lacked standard rustfmt/clippy components. | Install the components and add formatter/linter steps to CI. | Resolved. |

No Critical, unresolved High, or required-flow Medium defect remains. Actual on-chain CPI execution is intentionally gated in Phase 6 and is not represented as complete here.
