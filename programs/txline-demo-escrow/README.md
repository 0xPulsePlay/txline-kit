# TxLINE demo escrow

An intentionally valueless Anchor demonstration of TxLINE-proven settlement. Three outcome pools accept a Token or Token-2022 mint, then a permissionless keeper proves the final home/draw/away result through the TxLINE program before winners claim proportional payouts.

The program binds each market to one fixture, creates its result predicate internally, requires ordered full-match home and away goal stats, and verifies the CPI return-data origin and exact boolean through `txline-kit-cpi`. Entry closes at `settle_not_before`. Settlement is permitted only until `refund_after`; if no proof is submitted in that window, participants can recover their original stakes. These disjoint windows prevent settlement from racing a refund.

Additional controls reject wrong fixtures, non-final periods, impossible outcomes, double claims, double refunds, transfer extensions that change the exact escrowed amount, arithmetic overflow, and payout totals above the pool. The final winner receives any integer-division dust. Positions can close only after their claim or refund is terminal; a market can close only after every position is closed, every deposited token is paid, and its vault is empty.

Program ID: `AzfXDFdCyMY99KbcnhcqFud56SG2Xn9c88tGSzjtXQRS`

The program is deployed on Solana mainnet under the upgradeable loader. Deployment details and independently reproducible binary verification are recorded in [`docs/mainnet-deployment.md`](../../docs/mainnet-deployment.md).

```sh
pnpm program:build
pnpm program:idl
```

The local integration test deploys this program through the upgradeable loader beside a clone of the live mainnet TxLINE program and root account. It uses an authorized recording held outside Git to exercise real CPI settlement, claims, refunds, protected account teardown, and negative paths. The deployment rehearsal then closes the program with its retained authority and confirms the ProgramData rent is reclaimed.

This is a hackathon demonstration, not an audited contract. A valid stat proof establishes the score values anchored by TxLINE; the separate lifecycle/finality assertion remains a keeper trust input. Do not use this program for real-money wagering or valuable custody.
