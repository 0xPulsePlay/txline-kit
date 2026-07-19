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

`txline-replay` is `packages/txline-kit`'s `bin` (`dist/cli.js` after
`pnpm build`). npm publication is deferred, so it is **not** on PATH just
from cloning and building — run it with `node` from the repo root (or via
`pnpm exec txline-replay` from a project that depends on the package, which
gets it into that project's own `node_modules/.bin`):

```sh
node packages/txline-kit/dist/cli.js validate match.trec       # header, sha256, record/channel counts
node packages/txline-kit/dist/cli.js inspect match.trec
node packages/txline-kit/dist/cli.js serve match.trec --port 38770 --speed 10 --pause-on goal
node packages/txline-kit/dist/cli.js serve match.trec --port 38770 --deterministic   # CI mode
```

The replay host implements guest/activation stubs, fixture coverage, score
and odds SSE (with `Last-Event-ID` resume), snapshots, updates, history,
exact proof lookup, and health/status. `POST /__txline/control` supports
play, pause, seek, speed, and pause-on-event.

## Why replay-first

- Zero credentials, wallets, or purchases — anyone can reproduce your flow.
- `--deterministic` makes CI runs exactly reproducible.
- Replayed proofs are *synthetic recorded fixtures*: byte-identical to a real
  proof response, so `proofs.fetch`/`normalizeProofBundle` and the rest of
  the decoding path run unmodified against them. That is not the same as
  live proof: `onchain.verifyView` is a Solana simulation and needs a real
  RPC connection and funded fee payer whether the `ProofBundle` it's given
  came from replay or from a live fetch — replay cannot produce on-chain
  verification evidence on its own. Treat replay as proving the integration
  loop up through decoding a proof bundle, and verify against a live network
  separately before relying on `verifyView`.
