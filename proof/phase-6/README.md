# Phase 6 acceptance record

Generated July 18, 2026 Eastern Time.

## Outcome

PASS — the bounded keeper SDK, valueless Anchor escrow, reversible upgradeable-loader deployment, actual local TxLINE CPI rehearsal, and auditable mainnet escrow transaction chain are complete. No unresolved Critical, High, or required-flow Medium defect remains.

## Mainnet deployment

- Program: `AzfXDFdCyMY99KbcnhcqFud56SG2Xn9c88tGSzjtXQRS`.
- ProgramData: `5GsqAeMyJTJ2dz98ZEcBgd2oYBSLkexnC9uFGWnHoF5C`.
- Deployment transaction: `5bdtYk6BhKyCRWEB4rMneQavMnpaFew7HEfNcH4sdLLAhT3KEpiuLghuRR8wJaxwoWaJ3sE16DGeWtqfPZEXDuuH`.
- Artifact: 400,128 bytes; SHA-256 `1ea875ab3a0bf6b35c7b9a2e6b0c8329bf77b548ad804e0ca81674dd7607459b`.
- The deployed binary was dumped back from mainnet and matched the rehearsed artifact byte for byte.
- Upgrade/close authority remains `Cd5i4a2ydUY8xBVcGWLtdumvPPwfEeyMyXX8ZacLCyMP`; the program is not immutable.
- ProgramData holds `2.78609496 SOL`, reclaimable by permanently closing this program address.

## Auditable mainnet escrow chain

Protected fixture 18,241,006 at sequence 962 proved a final 1–2 score through the live TxLINE program.

- Market initialize: `u5DEEjmykDRvWVSxuf2m9ktpC6n3Y9aGYiUBGvRW1XSnJkqS4WXN5TJBNMjifnTgM624XTQmQp4pA7At8faEUUC`.
- Home entry: `4XNyk8bDK3NbuHRYLRaVCgCZvKajJAZrjTMCGdstFKPJgEG1AzELYD2hwdNuzV1z59cwYHioPjwNDwAjVvJrBuAu`.
- Away entry: `zVF3w6KdVbBRWwV5tgyXi85X9ZRaPPhf29tueuRRFaJtqwxnuUUqJTsLqhhYnaiH1BTzozcmkfM6XKhPDo7nMTe`.
- TxLINE CPI settlement: `52kbagjiugz6bL7TPwRZmHYGpGPoLBycpoZQH9uSyqkyMaNb7E1hhuamt72Bfg2obaq2vLxngBQZvRzbJ5Rd5kok`.
- Winner claim: `5qD5LaKjveKwxJpvtMfz3qxkdDSgoUz2NXfUTukkUWFSZoqSY5f3CfggVrHsxZsnVg55XUwJfrxy7ZMhWfPYXpJt`.
- Market teardown: `2mPAhTuruGLbjihsvxXgXZd6Pisb2Nb9kYA3efxybR8Uc7yDicjLxjYcYLPR8yqK9dWGcTUvA8Ec4FHe91BeC5Ad`.

All six key transactions are finalized with no error. The settlement ran in slot 433,642,899 at 3:09:13 AM EDT, invoked live TxLINE as CPI, consumed 216,993 compute units, and received exact return data `AQ==` (`01`) from TxLINE. The away winner received all 2,000 valueless units.

The market, vault, both position accounts, both player token accounts, and closable Token-2022 mint were closed after reconciliation. The deployed program remains live and upgradeable.

## Automated validation

- TypeScript CI on Node 20, 22, and 24: PASS.
- Browser proof CI: PASS.
- Rust CPI/program CI: PASS.
- Native Rust tests and formatting: PASS.
- Solana SBF build and generated IDL: PASS.
- Local mainnet-clone settlement, refund, negative-path, account teardown, program deployment, and program-close rehearsal: PASS.
- Mainnet deployment, downloaded artifact hash comparison, settlement, claim, and cleanup: PASS.

## Boundary

This is a hackathon demonstration, not an audit or real-money wagering system. The token had no economic value. Restricted recordings, credentials, signer material, authorization data, and host paths are excluded from Git and this report.
