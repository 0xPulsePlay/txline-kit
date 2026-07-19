# txline-kit-cpi

Typed Anchor CPI bindings for TxLINE's `validate_stat_v2` instruction.

The crate pins the public ABI to TxODDS IDL commit `f7e3bcd5db4c6744445f75dfab7eccc879c6d2de`. It serializes the exact V2 payload and strategy types, validates the timestamp-to-PDA pairing before CPI, constrains the oracle program by network feature, and accepts return data only when it comes from that exact program and decodes as one exact Anchor boolean.

```rust
use anchor_lang::prelude::*;
use txline_cpi::{
    validate_stat_v2_cpi, NDimensionalStrategy, StatValidationInput,
    TxLine, ValidateStatV2,
};

pub fn settle(
    ctx: Context<Settle>,
    payload: StatValidationInput,
    strategy: NDimensionalStrategy,
) -> Result<()> {
    let valid = validate_stat_v2_cpi(
        CpiContext::new(
            ctx.accounts.txline_program.to_account_info(),
            ValidateStatV2 {
                daily_scores_merkle_roots: ctx.accounts.daily_scores_merkle_roots.to_account_info(),
            },
        ),
        payload,
        strategy,
    )?;
    require!(valid, SettlementError::OutcomeNotProven);
    Ok(())
}

#[derive(Accounts)]
pub struct Settle<'info> {
    /// CHECK: The TxLINE program validates this PDA against `payload.ts`.
    pub daily_scores_merkle_roots: UncheckedAccount<'info>,
    pub txline_program: Program<'info, TxLine>,
}

#[error_code]
pub enum SettlementError {
    OutcomeNotProven,
}
```

crates.io publication is deferred (see [`docs/registry-publication-checklist.md`](../../docs/registry-publication-checklist.md)); depend on the crate via git:

```toml
txline-kit-cpi = { git = "https://github.com/0xPulsePlay/txline-kit", default-features = false, features = ["devnet"] }
```

Mainnet is the default (drop `default-features = false` and the `devnet` feature).

Do not enable `mainnet` and `devnet` together. This crate is integration tooling, not a security audit of TxLINE or a consumer settlement program.
