# @0xpulseplay/txline-kit

Typed TxLINE authentication, normalized score and odds data, resilient SSE streams, replay tooling, and Solana integration primitives.

## Install

```sh
pnpm add @0xpulseplay/txline-kit
```

Node.js 20 or newer is required. The package ships ESM and CommonJS entry points.

## Read from a replay server

```ts
import { createTxLineClient } from "@0xpulseplay/txline-kit";

const txline = createTxLineClient({
  network: "devnet",
  baseUrl: "http://127.0.0.1:38770",
});

const snapshot = await txline.data.snapshot(18_241_006);
for await (const update of txline.data.stream({ fixtures: [18_241_006] })) {
  console.log(update.fixtureId, update.action, update.seq);
}
```

## Authenticate against TxLINE

```ts
import { createTxLineClient } from "@0xpulseplay/txline-kit";

const txline = createTxLineClient({ network: "devnet", wallet });
const credentials = await txline.auth.subscribeFree({
  serviceLevel: 1,
  durationWeeks: 4,
});
```

`wallet` may be a Solana `Keypair` or a compatible wallet adapter. Credentials are held in memory by default; pass a `CredentialStore` to control persistence.

## Fetch and simulate a proof

```ts
const bundle = await txline.proofs.fetch({
  fixtureId: 18_241_006,
  seq: 962,
  statKeys: [1, 2],
});

const strategy = {
  geometricTargets: [],
  distancePredicate: null,
  discretePredicates: bundle.stats.map(({ stat }, index) => ({
    single: {
      index,
      predicate: { threshold: stat.value, comparison: { equalTo: {} } },
    },
  })),
};

const verified = await txline.onchain.verifyView(bundle, strategy);
```

`verifyView` is a read-only Solana simulation. It requires an existing fee-payer account for simulation, but it does not submit a transaction or spend funds. `buildValidateIx` returns the validation instruction, daily-root account, and 1.4M-CU pre-instruction for composition.

`verifyMerklePath` locally recomputes a directional SHA-256 path from an already-canonical 32-byte leaf hash. The SDK intentionally does not yet claim a full `verifyLocal(bundle)` API: TxLINE's exact score-stat leaf serialization must first be reproduced against several known roots.

## Compile a safe market

```ts
import { markets } from "@0xpulseplay/txline-kit/strategy";

const market = markets.finalResult(18_241_006).awayWin();
const bundle = await txline.proofs.fetch({
  fixtureId: market.fixtureId,
  seq: 963,
  statKeys: market.statKeys,
});

const won = await txline.onchain.verifyView(bundle, market.strategy);
market.assertSettlementRecord(finalisationRecord);
```

The low-level `strategy()` builder owns stat order and positional indexes, and refuses compilation unless every requested stat is covered exactly once. `markets.overUnder(..., "totalGoals", 2.5)` converts the half-line into correct integer predicates. Same-call parlays must use one fixture and disjoint stat keys; unsupported atomic claims fail before a proof is fetched.

## Data guarantees

- Network hosts, program IDs, and token mints are pinned by network.
- Provider casing is normalized at the boundary while unknown fields are retained.
- SSE reconnects carry `Last-Event-ID` and respect server retry hints.
- HTTP 401 responses trigger one JWT renewal and one retry.
- Settlement finality requires `action=game_finalised` and `statusId=100`; `period` must equal `100` when present. `finalisationEvidence` distinguishes explicit period 100 from the provider-observed mainnet omission.
- A TxLINE stat proof establishes the selected stat value; lifecycle finality is a separate trust claim.

## Subpath exports

- `@0xpulseplay/txline-kit/core`
- `@0xpulseplay/txline-kit/auth`
- `@0xpulseplay/txline-kit/data`
- `@0xpulseplay/txline-kit/errors`
- `@0xpulseplay/txline-kit/replay`
- `@0xpulseplay/txline-kit/proofs`
- `@0xpulseplay/txline-kit/onchain`
- `@0xpulseplay/txline-kit/strategy`

The `txline-replay` binary imports, validates, and inspects `.trec` recordings. Full provider recordings must remain private unless redistribution is explicitly authorized.

License: MIT OR Apache-2.0.
