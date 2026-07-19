# Rust CPI crate — `txline-kit-cpi`

Typed Anchor CPI bindings for TxLINE's `validate_stat_v2` instruction, so
consumer programs don't rebuild payload types, account wiring, return-data
handling, and error translation themselves.

- Pins the public ABI to a specific TxODDS IDL commit.
- Serializes the exact V2 payload and strategy types, byte-identical to
  Anchor's own serialization.
- Validates the timestamp-to-PDA pairing **before** the CPI.
- Constrains the oracle program by network feature (`mainnet` default,
  `devnet` behind a feature — never both).
- Accepts return data only when it comes from that exact program and decodes
  as one exact Anchor boolean — nested calls can overwrite Solana return
  data, so origin checking is not optional.

crates.io publication is deferred; depend via git:

```toml
txline-kit-cpi = { git = "https://github.com/0xPulsePlay/txline-kit" }
```

The consumer call is one typed helper inside your instruction handler —
see the crate README for the complete `settle` example with accounts.
The companion demo program (`programs/txline-demo-escrow`) exercised this
path on mainnet with an intentionally zero-value escrow; the receipt chain is
public in [`docs/mainnet-deployment.md`](https://github.com/0xPulsePlay/txline-kit/blob/main/docs/mainnet-deployment.md).
