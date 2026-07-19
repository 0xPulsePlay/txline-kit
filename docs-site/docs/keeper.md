# Keeper

The keeper composes the full settlement pipeline: watch a fixture, wait for
*settlement* finalisation (`isSettlementFinalisation` — `game_finalised` +
`StatusId 100`, accepting the provider's real-world period-omitted variant,
not only the narrower `isStrictFinalisation`'s exact `Period 100`), fetch the
ordered proof (waiting out slow root anchoring), verify read-only, build the
validation instruction, and hand it to consumer-owned submission code.

```ts
// Dry run: stops after read-only proof verification. Always do this first.
const prepared = await txline.keeper.watchAndSettle({ fixtureId, market, dryRun: true });

// Live: provide submit; keep it idempotent.
await txline.keeper.watchAndSettle({
  fixtureId,
  market,
  submit: async (prepared, attempt) => sendMyTransaction(prepared.validation),
});
```

Contracts worth knowing:

- `prepare` waits (bounded, 3 minutes by default) for proof availability
  instead of failing on the first 404; `proofRetry: false` restores
  single-attempt, a policy object tunes it.
- A false predicate refuses to settle (`KEEPER_PREDICATE_FALSE`) — the keeper
  never submits a settlement for an outcome the proof does not prove.
- Submission retries are bounded (1–10, default 3) with confirmation checking
  on by default. Keep `submit` idempotent: an RPC timeout can hide a
  successful prior send.
- Your `AbortSignal` is honored at the points that wait: the finalisation
  wait, the proof-availability retry loop (fixed as of this release — abort
  now interrupts an in-flight retry backoff instead of only taking effect
  between attempts), the per-attempt check before each submission, and the
  backoff between submission retries. It does **not** interrupt an
  already-in-flight on-chain simulation (`verifyView`/`buildValidateIx`),
  `connection.confirmTransaction`, or your own `submit` callback once
  called — those must check the signal themselves if they need to be
  interruptible mid-flight.
