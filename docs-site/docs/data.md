# Data & normalization

## The normalization contract

TxLINE responses vary in field casing across endpoints. `normalizeScoreRecord`
and `normalizeOddsRecord` produce canonical camelCase fields **while retaining
every unknown field** — normalization never destroys information. Malformed
records raise `DataShapeError` rather than flowing through half-parsed.

```ts
const snapshot = await txline.data.snapshot(fixtureId);      // scores
for await (const record of txline.data.stream()) { ... }     // resilient SSE
```

Streams reconnect with `Last-Event-ID`, honor server retry hints, and back
off exponentially.

## Semantic events and finality

`classifyScoreEvent`/`semanticEvents` map raw actions onto goal / card /
phase-change / finalised. Finality is strict and deliberate:

- `isStrictFinalisation` — `game_finalised` + `StatusId 100` + `Period 100`.
- `isSettlementFinalisation` — accepts the provider's period-omitted variant.
- `finalisationEvidence` — names the evidence quality you actually have.

Settlement software must never treat the latest in-running record as final.

## Implied probabilities

`impliedProbabilities(record)` converts a canonical odds record into a
normalized `{home, draw, away}` triple plus the bookmaker `overround`. It
prefers percentages, inverts decimal prices otherwise, and detects the
consensus feed's milli-odds convention (decimal odds ×1000). Records that
can't honestly produce a three-way triple raise
`ODDS_PROBABILITIES_UNAVAILABLE` — the SDK does not guess uniform defaults.

## Five-minute buckets and the journal

`updateBucket`/`bucketStart` express TxLINE's official five-minute windows —
the same boundaries the `/updates/{day}/{hour}/{interval}` endpoint and the
on-chain batch roots use. The [journal](proofs.md#the-journal-and-lifecycle)
builds on the same windows for canonical history and reconciliation.
