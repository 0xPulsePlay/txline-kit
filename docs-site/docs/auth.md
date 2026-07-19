# Authentication

Live TxLINE access uses a wallet-signed free-subscription flow. The SDK owns
the whole lifecycle: guest start, activation signature, subscription, token
renewal, and headers.

```ts
const txline = createTxLineClient({ network: "mainnet", wallet });
const credentials = await txline.auth.subscribeFree({ serviceLevel: 1, durationWeeks: 4 });
```

- `wallet` is a Solana `Keypair` or a compatible wallet adapter.
- Credentials live in memory by default. Pass a `CredentialStore` to control
  persistence — and never let one write secrets into a source directory.
- 401 responses trigger a single-flight token renewal and retry inside the
  HTTP pipeline; ten concurrent 401s cause one renewal, not ten.
- Replay servers stub the auth endpoints, which is why replay-first
  development needs no credentials at all.

Failures surface as `AuthenticationError`/`ActivationError` with `code` and
`fix`. Do not hand-assemble activation signatures; the exact preimage is a
known footgun the SDK exists to own.
