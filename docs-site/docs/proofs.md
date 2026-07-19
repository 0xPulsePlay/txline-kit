# Proofs

## Bundle anatomy

A `ProofBundle` is the normalized form of TxLINE's V2 stat-validation
response: fixture summary, update-stats window, `eventStatRoot`, the fixture
and main-tree proof paths, and one directional proof per proven stat. Every
hash is decoded to exactly 32 bytes with an explicit sibling direction;
requested stat order is enforced (`PROOF_STAT_ORDER_MISMATCH`) because
on-chain strategy indexes are positional; fixture mismatches refuse
(`PROOF_FIXTURE_MISMATCH`).

```ts
const bundle = await txline.proofs.fetch({ fixtureId, seq, statKeys: [1, 2], retry: true });
```

## Availability retry

TxLINE anchors daily roots on a delay after each five-minute interval closes.
A proof requested at the moment of finalisation can 404 even though it will
exist seconds later. Pass `retry: true` (or a policy) and the fetch rides out
the pending statuses (404/409/425) with bounded exponential backoff;
exhaustion raises `PROOF_AVAILABILITY_TIMEOUT`. The keeper keeps the v0.1.0
single-attempt, fail-fast default; pass `proofRetry: true` (or an explicit
policy object) to opt in to the bounded wait.

## Odds proofs (experimental)

`proofs.fetchOdds({messageId, timestamp})` opens the odds-checkpoint path.
The wire shape is not yet validated against live `daily_batch_roots`
accounts, so decoding is permissive and the raw response is always preserved.
The endpoint path is per-call configurable — TxLINE has renamed proof routes
before ("route drift").

## The journal and lifecycle

- **Journal** (`/journal`): stable record identities, exact-duplicate dedupe,
  arrival-order-independent canonical ordering with a chained head hash,
  conflict detection, five-minute bucketing, and witness-vs-canonical
  `ReconciliationReport`s — "did what I saw live match what everyone agrees
  on?"
- **Lifecycle** (`/lifecycle`): the four honest trust levels for proof-backed
  content — `observed` (liquid), `canonical` (amber), `verified` (crystal),
  `quarantined`. The content hash is computed before any proof exists and is
  never recomputed; sealing produces a *separate* hash over (content hash,
  proof fingerprint, anchors), so late proofs cannot mutate content, partial
  coverage stays representable, and conflicting source records quarantine and
  refuse to seal.

Use the lifecycle states as the vocabulary for what your app may claim: show
live data as observed, promote to canonical when the interval's journal is
reconciled, and claim verified only after on-chain validation.
