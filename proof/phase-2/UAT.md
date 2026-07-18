# Phase 2 simulated human QA / UAT

## Required developer journey

1. Fetch a V2 proof using a fixture, observed score sequence, and ordered stat-key list.
2. Inspect normalized BNs, immutable hashes, proof nodes, stats, and requested-key order.
3. Deliberately pass `seq=0`, a wrong fixture, reordered stats, short hashes, and a mismatched IDL.
4. Derive the daily score root PDA from the bundle's minimum timestamp.
5. Build an equality strategy covering each requested position exactly once.
6. Simulate the private captured bundle against mainnet and confirm `true`.
7. Build the composable instruction and inspect program ID, discriminator, accounts, payload length, and compute pre-instruction.
8. Confirm no transaction or restricted recording entered Git or the proof page.
9. Review the evidence page on desktop, laptop, tablet, and mobile.

## Findings and fixes

| Severity | Finding | Fix | Result |
|---|---|---|---|
| Critical | Top-level proof `ts` can differ slightly from `summary.updateStats.minTimestamp`; deriving the PDA from the wrong one risks `InvalidMainTreeProof`. | Bundle payload `ts` is constructed only from `minTimestamp`; the API timestamp is retained separately for inspection. | Resolved; three mainnet views passed. |
| High | V2 strategy indexes are positional, so silently reordered stats can validate the wrong fact. | Store requested order and reject any key/count mismatch between request, stats, and proofs. | Resolved. |
| High | Hash decoders could accept truncated or ambiguous values until the transaction reaches Anchor. | Normalize four accepted encodings and require exactly 32 bytes with path-specific errors. | Resolved. |
| High | A naive `verifyLocal(bundle)` implementation did not reproduce captured roots because leaf canonicalization is undocumented. | Withheld the unsafe API; exposed only the independently correct directional SHA-256 path primitive. | Safely gated for later empirical work. |
| Medium | Anchor `.view()` with a generated account fails as `AccountNotFound`, even though no transaction is sent. | Require an existing wallet account and explain that simulation spends no funds. | Resolved. |
| Medium | IDL drift could serialize a valid proof for the wrong deployed program. | Pin the official IDL commit and verify its address against the selected network before use. | Resolved. |
| Medium | Mainnet validation could be claimed from synthetic unit tests alone. | Ran three protected real bundles against the deployed mainnet program and inspected one built instruction. | Resolved. |

No Critical, unresolved High, or required-flow Medium defect remains. The full-bundle local verifier is an explicit release gate, not an unresolved implementation claim in this phase.
