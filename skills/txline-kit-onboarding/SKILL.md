---
name: txline-kit-onboarding
description: >-
  Onboard any new or existing project onto the TxLINE Kit SDK quickly and
  safely. Use when integrating TxLINE data, proofs, or settlement into a
  project; when asked to "add TxLINE", "use txline-kit", "wire up match
  data/odds", or "settle on TxLINE proofs"; or when validating an existing
  integration. Covers install-from-source, network pinning, replay-first
  development, choosing subpath exports, auth, the proof/verification path,
  optional keeper settlement, and the final verification checklist.
---

# TxLINE Kit onboarding

You are integrating a project with TxLINE Kit: typed TxLINE data, deterministic
`.trec` replay, Merkle-proof verification, and Solana CPI settlement. Follow
the steps in order; each ends with something you can verify.

## 1. Detect the project shape and install

Identify which of these you are onboarding — it decides how much of the kit
you need:

- **Fresh project** → scaffold with your package manager, then install.
- **Existing Solana app** (has `@solana/web3.js`/Anchor) → you likely want
  proofs + onchain + (maybe) the Rust CPI crate.
- **Existing data consumer** (dashboards, bots, feeds) → data + replay first;
  add proofs later.

npm publication is deferred — install from source:

```sh
git clone https://github.com/0xPulsePlay/txline-kit
cd txline-kit && pnpm install && pnpm build
```

Consume `packages/txline-kit` via a workspace/file dependency (or
`pnpm link`). For Anchor programs, depend on the Rust crate via git:
`txline-kit-cpi = { git = "https://github.com/0xPulsePlay/txline-kit" }`.

## 2. Pin the network and create the client

One network per client; hosts, program IDs, and IDL are derived from it and
must never be mixed:

```ts
import { createTxLineClient } from "@0xpulseplay/txline-kit";
const txline = createTxLineClient({ network: "mainnet" });
```

The SDK raises typed errors (`code` + `fix` on every failure). Read the `fix`
string before debugging anything else.

## 3. Replay first — prove the loop with zero credentials

Stand up the replay server on a committed synthetic recording and point the
unchanged client at it:

```sh
txline-replay serve fixtures/synthetic/match-42.trec --port <port> --deterministic
```

```ts
const txline = createTxLineClient({ network: "mainnet", baseUrl: "http://127.0.0.1:<port>" });
```

Consume the score stream until you see `game_finalised`. If the project can
render/consume the replayed match, the integration loop is proven — no keys,
no wallets, no live API. Keep this as the project's test mode forever
(`--deterministic` makes CI reproducible).

## 4. Map the domain onto the kit's exports

Pick the smallest subpath set the project actually needs:

| Project needs | Import |
|---|---|
| Scores/odds/streams only | `@0xpulseplay/txline-kit/data` |
| Implied probabilities | `impliedProbabilities` from `/data` |
| Canonical history / reconciliation | `/journal` |
| Market predicates (home win, over/under, parlays) | `/strategy` — use `markets.*`; never hand-build positional indexes |
| Proof bundles | `/proofs` (use `retry` for availability) |
| On-chain verification / settlement ix | `/onchain` |
| Trust-level vocabulary | `/lifecycle` |
| Autonomous settlement | `/keeper` |
| Anchor program CPI | `txline-kit-cpi` crate |

## 5. Auth for live data

Live TxLINE uses a wallet-signed free-subscription flow; the SDK owns the
activation, token renewal, and header lifecycle. Provide a wallet and a
credential store; never persist tokens into source directories, and never
paste credentials into code or logs.

## 6. The proof and verification path

Fetch → wait for availability → verify, in one motion:

```ts
const market = markets.finalResult(fixtureId).homeWin();
const proof = await txline.proofs.fetch({ fixtureId, seq, statKeys: market.statKeys, retry: true });
const valid = await txline.onchain.verifyView(proof, market.strategy);
```

Rules that prevent real bugs:
- Proof roots anchor on a delay — always pass `retry` (or accept the keeper's
  default wait) instead of treating early 404s as failure.
- Proof validity and match finality are separate claims: settle only from a
  record that passes `isSettlementFinalisation`, and bind the proof to the
  intended fixture and sequence.
- Timestamps are milliseconds; PDA helpers reject or heal seconds inputs.
- Use `/lifecycle` states (`observed → canonical → verified`, quarantine on
  conflict) as the vocabulary for what the app may claim at each stage.

## 7. Settlement (optional)

Wire the keeper only if the project settles on-chain:

```ts
await txline.keeper.watchAndSettle({ fixtureId, market, dryRun: true });
```

Dry-run first — it stops after read-only proof verification. Going live:
provide `submit`, keep it idempotent (RPC timeouts can hide a successful
send), and leave confirmation checking on. Never custody meaningful value in
unaudited demo programs.

## 8. Verification checklist — run before declaring onboarding done

- [ ] Replay smoke: server on a synthetic `.trec`, project consumes the
      stream to `game_finalised`, deterministically in CI.
- [ ] One proof round-trip: fetch (with retry) → `verifyView` returns true on
      the replayed fixture's bundled proof.
- [ ] Error handling: at least the typed codes for auth, proof availability
      timeout, and strategy coverage are surfaced, not swallowed.
- [ ] No credentials in the repo; live config comes from the environment.
- [ ] If settling: dry-run keeper output reviewed; submit path idempotent.

If any box cannot be ticked, the onboarding is not done — fix or escalate
rather than shipping a partial integration.
