# TxLINE Kit

!!! tip "Agents: start here"
    **To onboard any new or existing project onto this SDK, follow the
    [onboarding skill](onboarding-skill.md).** It is the complete, ordered
    procedure — project-shape detection, install-from-source, network
    pinning, replay-first development, proof round-trip, and the final
    verification checklist. The skill also ships in the repository at
    `skills/txline-kit-onboarding/SKILL.md` for direct loading.

    Minimal bootstrap (act from this page alone):

    ```sh
    git clone https://github.com/0xPulsePlay/txline-kit
    cd txline-kit && pnpm install && pnpm build
    # replay smoke test — zero credentials
    node packages/txline-kit/dist/cli.js validate fixtures/synthetic/match-42.trec
    node packages/txline-kit/dist/cli.js serve fixtures/synthetic/match-42.trec --port 38770 --deterministic
    ```

    ```ts
    import { createTxLineClient } from "@0xpulseplay/txline-kit";
    const txline = createTxLineClient({ network: "mainnet", baseUrl: "http://127.0.0.1:38770" });
    for await (const event of txline.data.stream()) console.log(event);
    ```

    npm publication is deferred — install from source. Registry links do not
    work yet.

## What this is

TxLINE anchors every score and odds update on Solana with Merkle proofs.
TxLINE Kit is the integration layer that makes that evidence usable:

- **Typed TypeScript SDK** — auth lifecycle, normalized scores and odds,
  resilient SSE, proof-bundle decoding, typed errors with `fix` strings.
- **Deterministic replay** — `.trec` recordings served through
  TxLINE-compatible routes on a virtual clock; live matches on demand for
  tests, agents, and judges.
- **Verification** — proof normalization, availability retry, daily-root PDA
  derivation, read-only on-chain validation, proof lifecycle states.
- **Settlement** — a coverage-safe strategy compiler, a bounded keeper, and
  the `txline-kit-cpi` Rust crate for Anchor programs. The full path is
  proven by a public mainnet settlement receipt.

## For humans

Start with [Getting started](getting-started.md), then read
[Replay & .trec](replay-and-trec.md) — replay-first development is the
kit's core workflow. The [safety boundary](safety-boundary.md) states
plainly what this software is and is not.
