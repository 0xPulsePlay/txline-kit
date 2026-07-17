# Phase 1 simulated human QA / UAT

## Required developer journey

1. Install a packed tarball into a clean Node.js project.
2. Import the root client and the `data` subpath using ESM.
3. Require both entry points from CommonJS.
4. Configure a replay URL and fetch snapshots without credentials.
5. Configure a real network, acquire a guest JWT, activate an existing transaction, and inspect stored credentials.
6. Consume score and odds SSE streams, then reconnect with the last event ID.
7. Distinguish a statistical event from strict lifecycle finalisation.
8. Run the replay CLI from the installed package.
9. Review this evidence page on desktop, laptop, tablet, and mobile.

## Findings and fixes

| Severity | Finding | Fix | Result |
|---|---|---|---|
| High | A 401 retry could recurse indefinitely or retry with the stale JWT. | Capped renewal at one attempt, persisted the fresh JWT, and asserted the exact three-request header sequence. | Resolved. |
| High | Accepting only an action would permit premature settlement, while requiring the documented period blocked actual mainnet finals that omit it. | Require `game_finalised` plus status 100, reject non-100 periods, and label explicit-period versus provider-omitted evidence. | Resolved after Phase 3 empirical UAT. |
| High | Browser/read-only consumers could eagerly load Anchor and Token-2022 transaction code. | Moved subscription submission behind a dynamic import and enabled build splitting. | Resolved. |
| Medium | Concurrent guest starts could create multiple JWTs and race credential persistence. | Added a single-flight promise with concurrency coverage. | Resolved. |
| Medium | Provider payload casing varies between captured and documented surfaces. | Added boundary normalization with preservation of unknown fields. | Resolved. |
| Medium | SSE frames can be split at any byte boundary and reconnect without context. | Added a streaming decoder, `Last-Event-ID`, retry hints, bounds, and chunk/reconnect tests. | Resolved. |
| Medium | Package behavior could pass source tests but fail for actual consumers. | Packed and installed the tarball in a fresh project; verified ESM, CJS, subpaths, and binary. | Resolved. |
| Low | Solana transitive dependencies emit pure-JS bigint and deprecated `punycode` notices during tests. | Verified they are warnings only; dependency cleanup remains a later release task. | Documented. |

No Critical, unresolved High, or required-flow Medium defect remains.
