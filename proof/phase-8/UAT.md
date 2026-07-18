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
| Medium | npm and crates.io credentials are intentionally absent from this host. | Complete every non-credentialed gate first; use an operator-authenticated client or short-lived trusted publisher without persisting secrets. | Pending external publication only. |
| Low | Web3 emits UUID and Node `punycode` deprecation warnings in a clean consumer. | Keep the documented upstream advisory; no unsafe forced override. | Accepted for 0.1.0. |

Final release UAT will add registry-origin installs, public repository checks, tag/release receipts, and final CI before this phase passes.
