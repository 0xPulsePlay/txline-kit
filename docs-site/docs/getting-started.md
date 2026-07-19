# Getting started

## Install (from source — npm publication is deferred)

```sh
git clone https://github.com/0xPulsePlay/txline-kit
cd txline-kit && pnpm install && pnpm build
```

Node.js 20+. The package builds ESM and CommonJS with subpath exports
(`/core`, `/auth`, `/data`, `/errors`, `/replay`, `/proofs`, `/onchain`,
`/merkle`, `/journal`, `/lifecycle`, `/strategy`, `/keeper`). Consume it as a
workspace or file dependency; Anchor programs depend on the Rust crate via
git (see [Rust CPI crate](cpi-crate.md)).

## Pin a network

```ts
import { createTxLineClient } from "@0xpulseplay/txline-kit";
const txline = createTxLineClient({ network: "mainnet" });
```

Every host, program ID, mint, and account constant derives from that one
choice. Never mix networks across clients, proofs, or programs — the SDK's
typed errors will refuse most mixes, but don't make it try.

## Develop replay-first

Before touching credentials, run against a bundled synthetic recording.
`txline-replay` is this package's `bin` field (`packages/txline-kit/dist/cli.js`);
npm publication is deferred, so nothing puts it on PATH automatically — run
the built file with `node` from the repo root:

```sh
node packages/txline-kit/dist/cli.js serve fixtures/synthetic/match-42.trec --port 38770 --deterministic
```

Point the unchanged client at `baseUrl: "http://127.0.0.1:38770"` and build
your feature against the replayed match. Everything — snapshots, streams,
proofs — works identically live. See [Replay & .trec](replay-and-trec.md).

## Errors are the manual

Every failure carries `code` and `fix`:

```text
ProofError PROOF_STAT_ORDER_MISMATCH
fix: Keep requested statKeys and positional strategy indexes in the same order.
```

Read the `fix` string first; it names the documented footgun you just hit.
