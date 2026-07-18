# Phase 8 clean-room developer UAT

## Completed candidate journeys

1. Build the npm archive from package metadata and inspect every included path.
2. Install the exact tarball into an empty npm project with lifecycle scripts disabled.
3. Import the root and strategy surfaces through ESM.
4. Require the root and onchain surfaces through CommonJS.
5. Run the installed `txline-replay` binary against synthetic fixture 42 and reconcile its seven-record receipt.
6. Build and verify the crates.io archive with the frozen workspace lockfile.
7. Compile the crate archive as an independent packaged source.
8. Scan both repository candidates for credential, key, authorization, recording, attachment, and host-path hazards.

## Candidate findings

| Severity | Finding | Resolution | Status |
|---|---|---|---|
| High | Published npm runtime graph inherited an unpatched SPL Token advisory. | Phase 7 replaced the four runtime helper calls with canonical byte-equivalent internal helpers and kept SPL Token dev-only. | Resolved before release. |
| Medium | The first manual clean-room assertion looked for `verifyMerklePath` under `/proofs`; its documented export is root and `/onchain`. | Corrected the consumer assertion and encoded it in `release-smoke.mjs`. | Resolved. |
| Medium | npm and crates.io credentials are intentionally absent from this host. | The operator explicitly deferred both registry publications; preserve the verified artifacts and authenticated release checklist for later. | Accepted deferral; not claimed as published. |
| Low | Web3 emits UUID and Node `punycode` deprecation warnings in a clean consumer. | Keep the documented upstream advisory; no unsafe forced override. | Accepted for 0.1.0. |

Source-release UAT will add public repository checks, tag/release receipts, and final CI. Registry-origin checks remain a clearly labeled future addendum.

## Source-release receipts

1. Both repositories returned public visibility through authenticated GitHub metadata.
2. Both repositories returned HTTP 200 from anonymous GitHub API and web requests.
3. The annotated `v0.1.0` tag and GitHub release resolve to the merged Phase 8 source.
4. PR #10 passed all five GitHub jobs after the deferral documentation change.
5. Final production release `7ac7a9c-20260718T092633Z` returned HTTP 200.
6. Rollback to `21396bb-20260718T075242Z` returned HTTP 200; forward recovery returned HTTP 200 locally and publicly.
7. Development remained protected by Cloudflare Access throughout.

No unresolved Critical, High, or required-flow Medium defect remains in the public source release. npm and crates.io remain deliberately unpublished.
