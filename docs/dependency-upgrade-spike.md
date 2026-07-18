# Dependency upgrade spike

Date: July 18, 2026

## Decision

Accept five evidence-backed upgrades before Phase 7:

| Package | Before | Accepted | Reason |
|---|---:|---:|---|
| `bn.js` | 5.2.2 | 5.2.5 | Latest patch and removes the direct `GHSA-378v-28hj-76wf` advisory. |
| `@solana/spl-token` | 0.4.14 | 0.4.15 | Latest compatible Token/Token-2022 patch. |
| `tsup` | 8.5.0 | 8.5.1 | Latest patch; ESM, CJS, declarations, and source maps remain valid. |
| `vitest` | 3.2.7 | 4.1.10 | Latest major passed all 53 tests without source changes. |
| `@vitest/coverage-v8` | 3.2.7 | 4.1.10 | Must match Vitest; coverage remains above the project gates. |

Keep the following versions intentionally:

| Package | Kept | Latest considered | Evidence and reason |
|---|---:|---:|---|
| `typescript` | 5.9.3 | 7.0.2 | Typecheck and tests passed on 7, but `tsup` declaration generation crashed in `rollup-plugin-dts` while reading `useCaseSensitiveFileNames`. A library release without declarations is unacceptable. |
| `@types/node` | 24.13.3 | 26.1.1 | The package supports Node 20, 22, and 24. Node 26 declarations would assert a runtime baseline the package does not claim. |
| pnpm | 10.14.0 | 11.14.0 | Workspace-only tooling. The current pinned release is deterministic and already proven across the CI matrix; a package-manager major provides no user-facing SDK benefit in this phase. |

## Current runtime inventory

- `@coral-xyz/anchor` 0.32.1: latest compatible release; kept exact because transaction, IDL, and wallet behavior are protocol-facing.
- `@solana/web3.js` 1.98.4: latest v1 release. The newer modular Solana client is a different package and API, not a drop-in update. Migration is deferred until it can demonstrate a material safety or bundle benefit without breaking Anchor consumers.
- `@solana/spl-token` 0.4.15: latest release.
- `bn.js` 5.2.5: latest release.
- `tweetnacl` 1.0.3: latest release.
- `zod` resolves to 4.4.3: latest release within the declared Zod 4 range.
- Anchor Rust crates remain exactly 0.32.1 so the TypeScript client, generated IDL, CPI crate, and deployed demo share one ABI/toolchain generation.

## Validation evidence

The accepted set passed:

- TypeScript typecheck.
- 53 of 53 unit/integration tests.
- ESM, CJS, declaration, source-map, and CLI build.
- Vitest 4 coverage: 92.52% statements, 86.78% branches, 96.93% functions, and 95.07% lines.
- Cargo format and Clippy with warnings denied.
- Mainnet and devnet Rust feature checks.
- 13 Rust unit/consumer tests.

The GitHub gate will additionally rerun TypeScript on Node 20, 22, and 24, browser proof tests, and the Rust CPI lane from a clean checkout.

## Advisory review

`pnpm audit` has no Critical advisory. The direct `bn.js` moderate advisory is fixed. Three transitive findings remain and are not hidden:

1. `bigint-buffer` 1.1.5, High, arrives through `@solana/spl-token` and has no patched release. Its reported impact is process denial of service through malformed buffer-length use in `toBigIntLE`. Before public package release, Phase 7 must either remove SPL Token from the published runtime dependency graph by owning the two small ATA helpers used by subscriptions, or demonstrate a safe upstream replacement. This is a release gate, not an ignored advisory.
2. `uuid` 8.3.2, Moderate, arrives through `@solana/web3.js` → `jayson`. The advisory affects caller-provided buffers in UUID v3, v5, and v6; Jayson uses UUID generation internally and the SDK does not expose those buffer APIs. A forced transitive major override could break Web3 RPC behavior, so it is rejected pending an upstream Web3/Jayson release.
3. `esbuild` 0.27.7, Low, arrives through `tsup`. The finding affects only the esbuild development server on Windows. This repository uses esbuild through `tsup` for builds and does not run its development server. Forcing esbuild beyond tsup's declared `^0.27.0` range is not justified.

## Phase 7 constraints created by this spike

- Remove the unpatched SPL Token advisory from the published runtime graph before npm release.
- Preserve Node 20/22/24 clean-install and runtime coverage.
- Do not adopt TypeScript 7 until declaration generation passes without a workaround or downgraded declaration quality.
- Re-run the inventory and audit at the Phase 8 release gate because registry state can change.
