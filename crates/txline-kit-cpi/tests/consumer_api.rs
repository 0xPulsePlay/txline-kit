use anchor_lang::prelude::*;
use txline_cpi::{validate_stat_v2_cpi, NDimensionalStrategy, StatValidationInput, ValidateStatV2};

// Compile-time consumer proof: an Anchor program can pass its constrained
// program/PDA AccountInfos straight into the public three-argument helper.
#[allow(dead_code)]
fn settle_like_a_consumer<'info>(
    oracle_program: AccountInfo<'info>,
    daily_scores_merkle_roots: AccountInfo<'info>,
    payload: StatValidationInput,
    strategy: NDimensionalStrategy,
) -> Result<bool> {
    validate_stat_v2_cpi(
        CpiContext::new(
            oracle_program,
            ValidateStatV2 {
                daily_scores_merkle_roots,
            },
        ),
        payload,
        strategy,
    )
}

#[test]
fn consumer_surface_is_linkable() {
    let helper = settle_like_a_consumer;
    let _ = helper;
}
