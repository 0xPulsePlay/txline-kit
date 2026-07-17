# Phase 0 simulated human QA / UAT

## Required developer journey

1. Discover the project mission and explicit non-goals.
2. Install the pinned workspace with pnpm.
3. Build the package and run `txline-replay import-capture` against a known fixture.
4. Inspect the manifest and run `txline-replay validate` independently.
5. Understand what is proven, what remains private, and why finalisation is a separate trust boundary.
6. Review the proof page at desktop, laptop, tablet, and mobile sizes.

## Findings and fixes

| Severity | Finding | Fix | Result |
|---|---|---|---|
| High | A generic raw-record importer could accidentally preserve an authorization header or token-bearing body. | Added schema-time secret-pattern refusal plus a negative test. | Resolved. |
| High | Sequentially copying files would group channels and destroy the original cross-channel timeline. | Added a bounded k-way chronological merge across source iterators. | Resolved; real output is monotonic. |
| High | `3001` was initially assumed to represent finalisation. The official soccer registry defines it as participant 1 second-half goals. | Corrected the settlement trust model to separate signed finalisation attestation from CPI-proven scores. | Resolved before strategy/program implementation. |
| Medium | Automatic port allocation first selected an active Explorer port. | Preserved the active process and registered explicit free ports inside the shared TxLINE product slot. | Resolved. |
| Medium | Full real recordings could accidentally enter repository history. | Ignore `.trec`, `.trec.zst`, indexes, traces, and videos; store the real artifact outside Git. | Resolved. |
| Medium | Provider terms prohibit public dissemination and caching unless authorised. | Full recordings remain private until written clearance; only synthetic or cleared fixtures may become public. | Resolved as a release gate. |
| Low | The Apache file uses the canonical notice and links to the complete version 2.0 terms rather than duplicating the long license text. | Expand to the complete verbatim license during release legal QA. | Documented Phase 8 cleanup. |

No Critical, unresolved High, or flow-affecting Medium finding remains.
