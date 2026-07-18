# Phase 8 release record

Generated July 18, 2026 Eastern Time.

## Candidate outcome

RELEASE CANDIDATE — all local package, archive, clean-room consumer, unit, type, build, Rust, and production-audit gates pass. Registry publication, registry-origin consumer installs, repository visibility changes, tag/release creation, and final GitHub CI are recorded here only after they occur.

## Validated candidate

- npm package: `@0xpulseplay/txline-kit@0.1.0`.
- Rust crate: `txline-kit-cpi@0.1.0`.
- npm archive: 147,511 bytes packed; 601,533 bytes unpacked; 112 entries.
- crate archive: 16,731 bytes compressed; nine intended files.
- Empty npm consumer: ESM, CommonJS, strategy/onchain subpaths, and installed CLI PASS.
- Cargo package verification: clean archive recompilation PASS.
- Archive boundary scan: no credentials, signer material, restricted fixtures, operational scripts, or host paths.
- Production dependency audit: no Critical or High advisory; one documented Moderate Web3/UUID advisory.

## Pending final receipts

- npm registry publication and registry-origin install.
- crates.io publication and registry-origin consumer compile.
- Public visibility audit for `txline-kit` and `txline-capture`.
- `v0.1.0` tag and GitHub release.
- Final CI and stop-condition audit.
