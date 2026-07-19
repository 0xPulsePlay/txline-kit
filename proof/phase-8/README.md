# Phase 8 release record

Generated July 18, 2026 Eastern Time.

## Source-release outcome

PASS FOR PUBLIC SOURCE RELEASE — all local package, archive, clean-room consumer, unit, type, build, Rust, production-audit, browser, and GitHub CI gates pass. The operator explicitly deferred npm and crates.io publication and registry-origin install checks on July 18, 2026; the verified archives remain ready for a later registry release.

## Validated candidate

- npm package: `@0xpulseplay/txline-kit@0.1.0`.
- Rust crate: `txline-kit-cpi@0.1.0`.
- npm archive: 147,511 bytes packed; 601,533 bytes unpacked; 112 entries.
- crate archive: 16,731 bytes compressed; nine intended files.
- Empty npm consumer: ESM, CommonJS, strategy/onchain subpaths, and installed CLI PASS.
- Cargo package verification: clean archive recompilation PASS.
- Archive boundary scan: no credentials, signer material, restricted fixtures, operational scripts, or host paths.
- Production dependency audit: no Critical or High advisory; one documented Moderate Web3/UUID advisory.

## Explicitly deferred registry receipts

- npm registry publication and registry-origin install.
- crates.io publication and registry-origin consumer compile.

These are not claimed as complete. They require a future authenticated release action and a Phase 8 addendum.

## Source-release finalization

- `0xPulsePlay/txline-capture` is public at main `8403533`; authenticated metadata and anonymous API/web requests confirm public visibility.
- `0xPulsePlay/txline-kit` is public at main `7ac7a9c`; authenticated metadata and anonymous API/web requests confirm public visibility.
- Annotated tag `v0.1.0` and the [GitHub source release](https://github.com/0xPulsePlay/txline-kit/releases/tag/v0.1.0) point to the merged Phase 8 main head.
- Final PR #10 CI: TypeScript Node 20/22/24, release archive smoke, browser proof, and Rust CPI all PASS.
- Final production artifact: `7ac7a9c-20260718T092633Z`.
- Rollback rehearsal: production switched to `21396bb-20260718T075242Z`, returned HTTP 200, then restored the final artifact and returned HTTP 200 locally and publicly.
- Production is public HTTP 200; development remains HTTP 302 to Cloudflare Access; both app services, Caddy, and cloudflared are active.

All non-registry Phase 8 requirements pass. The two operator-deferred registries remain the only intentionally unfinished items and are not represented as published.

## World-ready production addendum

- PR #12 merged the expanded visual UAT, responsive SDK-map containment, mobile deep-link navigation, proof-report correction, and change-scoped CI caching.
- PR #13 resolved a production-only tablet min-content overflow without weakening the 820px overflow assertion; browser and Node CI passed while untouched Rust/Solana CI correctly skipped.
- Final deployed artifact: `98ea21e-20260719T063220Z`.
- Production UAT against `https://txline-kit.claude.do` passed all 12 scenarios: full interaction journeys, six-screen accessibility/overflow checks, and screenshot capture across desktop, laptop, tablet, and mobile.
- All 24 product screenshots were manually inspected for clipping, overlap, alignment, contrast, containment, and visual hierarchy.
- Phase 8 report generation excludes the four obsolete self-referential report-renderer images and includes only named product-screen evidence.
- Production remains HTTP 200; development remains HTTP 302 to Cloudflare Access; app services, Caddy, and cloudflared are active.
