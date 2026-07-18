# Phase 4 simulated human QA / UAT

## Required developer journey

1. Generate and validate all cleared synthetic recordings.
2. Start deterministic replay on the canonical test port.
3. Point the normal SDK at `baseUrl` and fetch snapshot, proof, and SSE without credentials.
4. Resume score SSE with `Last-Event-ID` and request an absent proof.
5. Restart paused at 10× with pause-on-goal, then play, inspect paused status, clear the breakpoint, and finish.
6. Load the protected 19 MiB recording and fetch a historical proof through replay.
7. Send that replayed proof through deployed-mainnet read-only validation.
8. Confirm no restricted body, credential, or wallet key entered Git or evidence HTML.
9. Review the evidence page on desktop, laptop, tablet, and mobile.

## Findings and fixes

| Severity | Finding | Fix | Result |
|---|---|---|---|
| High | A few milliseconds between opening SSE and pressing play could make the cursor pass kickoff and omit the first frame. | New streams include the nearest channel record at or before the connection cursor; resumed streams still begin strictly after the supplied ID. | Resolved and rerun. |
| High | A generic proof fallback could silently return a different stat-key shape. | Exact-match fixture, seq, `statKeys`, `statKey`, and `statKey2`; absent combinations return 404. | Resolved. |
| High | A five-stat proof overflowed the Anchor client transaction buffer with an opaque offset error. | Map this preflight failure to `VALIDATION_PAYLOAD_TOO_LARGE` with fewer-keys/split-call guidance. | Resolved as a typed boundary. |
| Medium | Replay auth requirements would force application forks. | Added replay-only guest and activation stubs; standard `baseUrl` client needs no special auth branch. | Resolved. |
| Medium | Pause-on-event could strand the stream without observable state. | Shared status/control endpoints expose cursor, progress, breakpoint, and play/pause operations. | Resolved. |
| Medium | Real replay could pass synthetic tests but fail with the 19 MiB archive. | Loaded all 241 records, fetched a real proof, and verified it through deployed mainnet. | Resolved. |
| Medium | Committing full recordings would violate provider terms. | Ship three deterministic synthetic matches; preserve the real archive outside Git. | Resolved. |

No Critical, unresolved High, or required-flow Medium defect remains.
