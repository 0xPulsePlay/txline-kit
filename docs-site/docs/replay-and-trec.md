# Replay & `.trec`

Replay is the kit's adoption hook: matches end, free API windows close, but a
recorded match replays forever — through the **same API surface** the live
service exposes, so applications switch between live and replay via one
`baseUrl`.

## The `.trec` format

Newline-delimited JSON, versioned from day one. The header records a UUID,
creation time, network, sorted fixture IDs, requested stat keys, and source
format version — and **no** machine paths, hosts, tokens, wallets, or
signatures. Channels carry SSE events, snapshots, odds, and exact proof
responses. Full spec: [`docs/trec-v1.md`](https://github.com/0xPulsePlay/txline-kit/blob/main/docs/trec-v1.md)
in the repository.

Three committed synthetic recordings (home win, draw, away win) live in
`fixtures/synthetic/`. Real full-match recordings stay private unless
redistribution is explicitly authorized.

## The CLI

```sh
txline-replay validate match.trec       # header, sha256, record/channel counts
txline-replay inspect match.trec
txline-replay serve match.trec --port 38770 --speed 10 --pause-on goal
txline-replay serve match.trec --port 38770 --deterministic   # CI mode
```

The replay host implements guest/activation stubs, fixture coverage, score
and odds SSE (with `Last-Event-ID` resume), snapshots, updates, history,
exact proof lookup, and health/status. `POST /__txline/control` supports
play, pause, seek, speed, and pause-on-event.

## Why replay-first

- Zero credentials, wallets, or purchases — anyone can reproduce your flow.
- `--deterministic` makes CI runs exactly reproducible.
- Replayed proofs are the *recorded genuine responses*, so verification code
  paths run for real. Simulated in time only; the evidence is real.
