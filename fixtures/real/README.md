# fixtures/real — TxLINE World Cup Final 2026 capture

This directory holds a real recorded excerpt of TxLINE's free guest feed —
not synthetic, not fabricated. Everything here traces back to a live capture
of fixture `18257739` (Spain v Argentina, FIFA World Cup Final, kickoff
19:00 UTC on 2026-07-19), recorded pre-match on 2026-07-19 under TxLINE's
free-tier guest access. Shared under the hackathon data license.

## Demo excerpts (`fixtures/real/*.trec`)

The three `.trec` files are what `apps/learn` actually loads (via
`import.meta.glob`) to render the live demo. Each one is a downsampled,
demo-sized excerpt of one real odds-market family, built from the raw
streams below by `scripts/build-real-fixtures.mjs`. Every record's `body` is
a verbatim JSON copy of a captured message and every `bodySha256` is a real
sha256 of that body — nothing in them is invented.

| file | market | events | bytes |
|---|---|---|---|
| `match-result.trec` | 1X2 match result, full-time only | 97 (1 snapshot + 90 odds + 6 heartbeats) | 62,010 |
| `goals-overunder.trec` | goals over/under, mixed period | 117 (1 snapshot + 110 odds + 6 heartbeats) | 73,623 |
| `asian-handicap.trec` | Asian handicap (goals), mixed period | 107 (1 snapshot + 100 odds + 6 heartbeats) | 67,697 |

Capture window covered by the excerpts: 2026-07-19T07:40:59.507Z through
2026-07-19T17:20:29.413Z — all pre-match (kickoff was 19:00 UTC that day),
so there are no score events in any excerpt by design; the demo never
fabricates a scoreline.

`apps/learn/src/data.ts` derives team names, market summaries, and the
provenance label straight from these files at build time — none of that
text is hardcoded. If any of the three `.trec` files here is ever removed,
that demo slot honestly falls back to the repo's committed synthetic
fixture (`fixtures/synthetic/`) instead of silently going blank or lying
about its data source.

## Raw capture streams (`fixtures/real/raw/*.jsonl`)

A point-in-time snapshot of the raw recorder output the excerpts above were
built from — the full, un-downsampled feed, in case you want to build your
own excerpts differently.

| file | bytes | lines |
|---|---|---|
| `raw/odds-stream.jsonl` | 8,336,953 | 22,846 |
| `raw/snapshots.jsonl` | 7,301,774 | 2,991 |
| `raw/scores-stream.jsonl` | 358,032 | 4,078 |

Copied from the live recorder at **2026-07-19T18:11:35Z** (the recorder was
still running at copy time, so this is a snapshot, not a final/closed
capture). Every line is one recorded envelope: `odds-stream.jsonl` and
`scores-stream.jsonl` are `{recordedAt, id?, event?, parsed}` SSE captures
from TxLINE's `/odds/stream` and `/scores/stream`; `snapshots.jsonl` is
`{recordedAt, path, count, data}` poll captures of
`/fixtures/snapshot`, `/odds/snapshot/18257739`, and
`/scores/snapshot/18257739`. These are feed payloads only — no auth
material (tokens, JWTs, API keys, credentials) is present; that was
verified line-by-line before this data was committed.

## Regenerating your own excerpts

```
node scripts/build-real-fixtures.mjs \
  fixtures/real/raw/odds-stream.jsonl \
  fixtures/real/raw/snapshots.jsonl \
  fixtures/real/raw/scores-stream.jsonl \
  fixtures/real \
  18257739
```

Or point it at your own capture of the same shape (recorded with your own
TxLINE guest credentials) to regenerate against fresher or longer data.
