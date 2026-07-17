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

## Data guarantees

- Network hosts, program IDs, and token mints are pinned by network.
- Provider casing is normalized at the boundary while unknown fields are retained.
- SSE reconnects carry `Last-Event-ID` and respect server retry hints.
- HTTP 401 responses trigger one JWT renewal and one retry.
- Finality is strict: `action=game_finalised`, `statusId=100`, and `period=100` must all be present.
- A TxLINE stat proof establishes the selected stat value; lifecycle finality is a separate trust claim.

## Subpath exports

- `@0xpulseplay/txline-kit/core`
- `@0xpulseplay/txline-kit/auth`
- `@0xpulseplay/txline-kit/data`
- `@0xpulseplay/txline-kit/errors`
- `@0xpulseplay/txline-kit/replay`

The `txline-replay` binary imports, validates, and inspects `.trec` recordings. Full provider recordings must remain private unless redistribution is explicitly authorized.

License: MIT OR Apache-2.0.
