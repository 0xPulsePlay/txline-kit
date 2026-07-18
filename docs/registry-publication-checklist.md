# Deferred registry publication checklist

The public source release is complete. npm and crates.io publication were explicitly deferred and must not be inferred from the `v0.1.0` GitHub release.

When publication resumes:

1. Authenticate directly with npm and crates.io without sending credentials through chat or committing them.
2. Confirm `@0xpulseplay/txline-kit@0.1.0` and `txline-kit-cpi@0.1.0` are still absent.
3. Check out annotated tag `v0.1.0` in a clean worktree and rerun `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm build`, and `pnpm release:smoke`.
4. Publish npm from `packages/txline-kit` with public access; use provenance only from a configured trusted-publisher environment.
5. Publish the Rust crate from the workspace root with `cargo publish -p txline-kit-cpi --locked`.
6. Install both registry versions into new empty consumer directories. Repeat ESM, CommonJS, every documented subpath, CLI fixture validation, default Rust features, and devnet-only Rust features.
7. Record immutable registry URLs, checksums, package owners, clean-room outputs, and any warnings in the Phase 8 addendum.
8. Republish the private Phase 8 HTML report and remove the registry TODO only after those checks pass.
