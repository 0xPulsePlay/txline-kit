# On-chain

## Verify without spending

```ts
const valid = await txline.onchain.verifyView(bundle, market.strategy);
```

`verifyView` simulates TxLINE's `validate_stat_v2` — a read-only Solana
simulation that needs an existing fee-payer account but submits nothing and
spends nothing. `buildValidateIx` returns the real validation instruction,
its daily-root account, and the 1.4M-CU pre-instruction for composition into
your settlement transaction.

## PDA rules — the millisecond trap

TxLINE root accounts are seeded by epoch day (u16 little-endian). Timestamps
are **milliseconds**; a seconds value produces a wrong but valid-looking
account. The SDK closes the trap:

- `dailyScoresPda(ms, programId)` — rejects seconds-unit inputs with
  `PDA_TIMESTAMP_UNIT_SUSPECT`.
- `deriveRootPda({namespace, timestamp, programId})` — derives any of
  `daily_scores_roots`, `daily_batch_roots`, `ten_daily_fixtures_roots`
  (ten-day bucketing included) and heals seconds inputs.
- `oddsBatchRootPda(ts, programId)` — the odds counterpart of
  `dailyScoresPda`.

Always derive the root account from the timestamp *in the proof response*,
never from the wall clock.

## Local Merkle primitives

`merkleRootFromLeaf`/`verifyMerklePath` recompute directional SHA-256 paths
from an already-canonical 32-byte leaf. `buildMerkleTree` (from `/merkle`)
generates trees and per-leaf proofs for fixtures and test vectors. A full
`verifyLocal(bundle)` is deliberately not claimed until TxLINE's exact leaf
serialization is reproduced against several known anchored roots.
