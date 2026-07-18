# TxLINE Kit delivery goal

## Mission

Deliver a production-quality TxLINE integration kit that authenticates, ingests and normalizes feeds, preserves and deterministically replays matches, compiles safe validation predicates, verifies cryptographic proofs, supports Solana CPI settlement, and demonstrates the complete flow with a valueless mainnet token.

The work is complete only when the TypeScript package, replay CLI, Rust CPI crate, demo program, public learning application, registries, documentation, deployments, stacked PRs, and proof reports are all finished.

## Required outcomes

- Private development repositories `0xPulsePlay/txline-capture` and `0xPulsePlay/txline-kit`, made public only at the final release gate.
- `@0xpulseplay/txline-kit` with documented subpath exports and the `txline-replay` binary.
- `txline-kit-cpi` on crates.io.
- A deterministic `.trec` recording format and three to five useful match recordings.
- A valueless mainnet SPL-token escrow whose settlement is proven by TxLINE CPI.
- Public production at `txline-kit.claude.do` and Access-protected development at `txline-kit-dev.claude.do`.
- Dual code license: `MIT OR Apache-2.0`.

## Boundaries

- No real-money wagering, USDC custody, production betting platform, or claim of contract audit.
- No credentials, wallet keys, authorization headers, host paths, or restricted raw data in Git or proof reports.
- Full real-match recordings stay private until written TxODDS redistribution permission exists.
- No guessed hash function, stat key, odds shape, finalisation state, or provider behavior.
- Existing capture services must remain operational and must not be restarted or slowed for SDK work.

## Phase and quality contract

Nine stacked phases, numbered 0 through 8, are mandatory. Every phase ends with automated tests, clean-room developer UAT, visual/accessibility QA where applicable, written findings and fixes, deterministic screenshots, a self-contained private HTML proof report, and a draft PR based on the preceding phase.

The next phase cannot start with an unresolved Critical or High defect. A Medium defect affecting a required flow is also blocking. Only documented Low issues may be deferred.

## Stop condition

Stop successfully only when all phase gates pass; both PR stacks merge in order; both repositories are public and clean; npm and crates.io installs work in fresh consumers; replay proofs verify locally, through RPC view, and through the demo CPI; the mainnet escrow transaction chain is auditable; production and rollback checks pass; and every phase proof URL has been shared.
