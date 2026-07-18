# Phase 7 simulated human QA / UAT

## Journeys exercised

1. Enter from the overview and understand the capture-to-settlement evidence chain.
2. Open replay, advance a record, switch fixtures, and inspect channel and envelope changes.
3. Choose the away side, slice the expected score to 0–2, and confirm predicate truth.
4. Select a Merkle node and inspect the exact on-chain root relationship.
5. Follow the finalized mainnet transaction river and open the settlement explorer target.
6. Navigate the SDK module map and inspect the `/proofs` boundary.
7. Repeat the complete journey at desktop, laptop, tablet, and mobile sizes.
8. Exercise spatial controls with keyboard focus and Enter as well as pointer navigation.
9. Scan every viewport for serious/critical accessibility defects and horizontal overflow.
10. Capture and visually inspect every major screen plus responsive overview states.

## Findings and fixes

| Severity | Finding | Fix | Result |
|---|---|---|---|
| High | SPL Token pulled an unpatched `bigint-buffer` advisory into the published runtime graph. | Replace four helper usages with a narrow compatible ATA implementation and canonical equivalence tests; keep SPL Token dev-only. | Resolved; production audit has no High advisory. |
| Medium | Accessible range output shared labels with its slider input, making automation ambiguous. | Target the semantic slider role in UAT. | Resolved in all viewports. |
| Medium | Sticky navigation can overlap Playwright's automatic centering of spatial controls at tablet size. | Add keyboard UAT for fixture and radial module controls, while retaining pointer UAT for navigation and ordinary controls. | Resolved; keyboard and pointer journeys pass. |
| Low | Screenshot capture occurred during the 450 ms entrance transition. | Wait for the visual state to settle before proof capture. | Resolved; matrix regenerated and inspected. |

No unresolved blocking defect remains. Phase 7 is ready for deployment and merge.
