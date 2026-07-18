#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked},
};
use txline_cpi::{
    validate_stat_v2_cpi, BinaryExpression, Comparison, NDimensionalStrategy, StatPredicate,
    StatValidationInput, TraderPredicate, TxLine, ValidateStatV2,
};

declare_id!("AzfXDFdCyMY99KbcnhcqFud56SG2Xn9c88tGSzjtXQRS");

#[program]
pub mod txline_demo_escrow {
    use super::*;

    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        fixture_id: i64,
        settle_not_before: i64,
        refund_after: i64,
    ) -> Result<()> {
        require!(fixture_id > 0, EscrowError::InvalidFixture);
        require!(
            settle_not_before > Clock::get()?.unix_timestamp,
            EscrowError::SettleTimeNotFuture
        );
        require!(
            refund_after > settle_not_before,
            EscrowError::RefundTimeInvalid
        );
        let market = &mut ctx.accounts.market;
        market.authority = ctx.accounts.authority.key();
        market.fixture_id = fixture_id;
        market.mint = ctx.accounts.mint.key();
        market.vault = ctx.accounts.vault.key();
        market.token_program = ctx.accounts.token_program.key();
        market.settle_not_before = settle_not_before;
        market.refund_after = refund_after;
        market.outcome = None;
        market.proof_timestamp = 0;
        market.total_pool = 0;
        market.pools = [0; 3];
        market.paid_out = 0;
        market.claimed_winning_stake = 0;
        market.open_positions = 0;
        market.settled = false;
        market.bump = ctx.bumps.market;
        emit!(MarketInitialized {
            market: market.key(),
            authority: market.authority,
            fixture_id,
            settle_not_before,
            refund_after,
            mint: market.mint,
        });
        Ok(())
    }

    pub fn enter(ctx: Context<Enter>, side: Outcome, amount: u64) -> Result<()> {
        require!(amount > 0, EscrowError::ZeroStake);
        let now = Clock::get()?.unix_timestamp;
        let market = &mut ctx.accounts.market;
        require!(!market.settled, EscrowError::AlreadySettled);
        require!(now < market.settle_not_before, EscrowError::MarketClosed);

        let position = &mut ctx.accounts.position;
        if position.owner == Pubkey::default() {
            position.market = market.key();
            position.owner = ctx.accounts.player.key();
            position.side = side;
            position.stake = 0;
            position.claimed = false;
            position.bump = ctx.bumps.position;
            market.open_positions = market
                .open_positions
                .checked_add(1)
                .ok_or(EscrowError::ArithmeticOverflow)?;
        } else {
            require!(position.side == side, EscrowError::PositionSideLocked);
            require!(!position.claimed, EscrowError::AlreadyClaimed);
        }

        let vault_before = ctx.accounts.vault.amount;
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.player_tokens.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.player.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;
        ctx.accounts.vault.reload()?;
        require_eq!(
            ctx.accounts.vault.amount,
            vault_before
                .checked_add(amount)
                .ok_or(EscrowError::ArithmeticOverflow)?,
            EscrowError::UnsupportedTransferBehavior
        );

        position.stake = position
            .stake
            .checked_add(amount)
            .ok_or(EscrowError::ArithmeticOverflow)?;
        market.total_pool = market
            .total_pool
            .checked_add(amount)
            .ok_or(EscrowError::ArithmeticOverflow)?;
        let pool = &mut market.pools[side.index()];
        *pool = pool
            .checked_add(amount)
            .ok_or(EscrowError::ArithmeticOverflow)?;
        emit!(PositionEntered {
            market: market.key(),
            owner: position.owner,
            side,
            amount,
            total_stake: position.stake,
        });
        Ok(())
    }

    pub fn settle(
        ctx: Context<Settle>,
        outcome: Outcome,
        payload: StatValidationInput,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let market = &mut ctx.accounts.market;
        require!(!market.settled, EscrowError::AlreadySettled);
        require!(
            now >= market.settle_not_before,
            EscrowError::SettlementTooEarly
        );
        require!(
            now < market.refund_after,
            EscrowError::SettlementWindowExpired
        );
        require!(market.total_pool > 0, EscrowError::EmptyPool);
        require!(
            market.pools[outcome.index()] > 0,
            EscrowError::NoWinningPool
        );
        require_eq!(
            payload.fixture_summary.fixture_id,
            market.fixture_id,
            EscrowError::FixtureMismatch
        );
        require!(
            payload.stats.len() == 2,
            EscrowError::InvalidScoreProofShape
        );
        require!(
            payload.stats[0].stat.key == 1 && payload.stats[1].stat.key == 2,
            EscrowError::InvalidScoreProofShape
        );
        require!(
            payload.stats[0].stat.period == 100 && payload.stats[1].stat.period == 100,
            EscrowError::NonFinalPeriod
        );

        let proof_timestamp = payload.ts;
        let valid = validate_stat_v2_cpi(
            CpiContext::new(
                ctx.accounts.txline_program.to_account_info(),
                ValidateStatV2 {
                    daily_scores_merkle_roots: ctx
                        .accounts
                        .daily_scores_merkle_roots
                        .to_account_info(),
                },
            ),
            payload,
            strategy_for(outcome),
        )?;
        require!(valid, EscrowError::OutcomeNotProven);

        market.outcome = Some(outcome);
        market.proof_timestamp = proof_timestamp;
        market.settled = true;
        emit!(MarketSettled {
            market: market.key(),
            keeper: ctx.accounts.keeper.key(),
            outcome,
            proof_timestamp,
            total_pool: market.total_pool,
        });
        Ok(())
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(market.settled, EscrowError::NotSettled);
        let outcome = market.outcome.ok_or(EscrowError::NotSettled)?;
        let position = &mut ctx.accounts.position;
        require!(!position.claimed, EscrowError::AlreadyClaimed);
        require!(position.side == outcome, EscrowError::LosingPosition);
        let winning_pool = market.pools[outcome.index()];
        let claimed_winning_stake = market
            .claimed_winning_stake
            .checked_add(position.stake)
            .ok_or(EscrowError::ArithmeticOverflow)?;
        require!(
            claimed_winning_stake <= winning_pool,
            EscrowError::ArithmeticOverflow
        );
        let payout = if claimed_winning_stake == winning_pool {
            market
                .total_pool
                .checked_sub(market.paid_out)
                .ok_or(EscrowError::ArithmeticOverflow)?
        } else {
            proportional_payout(position.stake, market.total_pool, winning_pool)?
        };
        require!(payout > 0, EscrowError::ZeroPayout);

        let fixture_bytes = market.fixture_id.to_le_bytes();
        let bump = [market.bump];
        let signer_seeds: &[&[u8]] = &[
            b"market",
            market.authority.as_ref(),
            fixture_bytes.as_ref(),
            bump.as_ref(),
        ];
        let player_before = ctx.accounts.player_tokens.amount;
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.player_tokens.to_account_info(),
                    authority: market.to_account_info(),
                },
                &[signer_seeds],
            ),
            payout,
            ctx.accounts.mint.decimals,
        )?;
        ctx.accounts.player_tokens.reload()?;
        require_eq!(
            ctx.accounts.player_tokens.amount,
            player_before
                .checked_add(payout)
                .ok_or(EscrowError::ArithmeticOverflow)?,
            EscrowError::UnsupportedTransferBehavior
        );

        position.claimed = true;
        market.claimed_winning_stake = claimed_winning_stake;
        market.paid_out = market
            .paid_out
            .checked_add(payout)
            .ok_or(EscrowError::ArithmeticOverflow)?;
        require!(
            market.paid_out <= market.total_pool,
            EscrowError::ArithmeticOverflow
        );
        emit!(PayoutClaimed {
            market: market.key(),
            owner: position.owner,
            amount: payout,
        });
        Ok(())
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(!market.settled, EscrowError::AlreadySettled);
        require!(
            Clock::get()?.unix_timestamp >= market.refund_after,
            EscrowError::RefundTooEarly
        );
        let position = &mut ctx.accounts.position;
        require!(!position.claimed, EscrowError::AlreadyClaimed);
        require!(position.stake > 0, EscrowError::ZeroStake);

        let fixture_bytes = market.fixture_id.to_le_bytes();
        let bump = [market.bump];
        let signer_seeds: &[&[u8]] = &[
            b"market",
            market.authority.as_ref(),
            fixture_bytes.as_ref(),
            bump.as_ref(),
        ];
        let player_before = ctx.accounts.player_tokens.amount;
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.player_tokens.to_account_info(),
                    authority: market.to_account_info(),
                },
                &[signer_seeds],
            ),
            position.stake,
            ctx.accounts.mint.decimals,
        )?;
        ctx.accounts.player_tokens.reload()?;
        require_eq!(
            ctx.accounts.player_tokens.amount,
            player_before
                .checked_add(position.stake)
                .ok_or(EscrowError::ArithmeticOverflow)?,
            EscrowError::UnsupportedTransferBehavior
        );
        position.claimed = true;
        market.paid_out = market
            .paid_out
            .checked_add(position.stake)
            .ok_or(EscrowError::ArithmeticOverflow)?;
        require!(
            market.paid_out <= market.total_pool,
            EscrowError::ArithmeticOverflow
        );
        emit!(PositionRefunded {
            market: market.key(),
            owner: position.owner,
            amount: position.stake,
        });
        Ok(())
    }

    pub fn close_position(ctx: Context<ClosePosition>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let position = &ctx.accounts.position;
        let terminal = if market.settled {
            let outcome = market.outcome.ok_or(EscrowError::NotSettled)?;
            position.side != outcome || position.claimed
        } else {
            Clock::get()?.unix_timestamp >= market.refund_after && position.claimed
        };
        require!(terminal, EscrowError::PositionNotTerminal);
        market.open_positions = market
            .open_positions
            .checked_sub(1)
            .ok_or(EscrowError::ArithmeticOverflow)?;
        emit!(PositionClosed {
            market: market.key(),
            owner: position.owner,
        });
        Ok(())
    }

    pub fn close_market(ctx: Context<CloseMarket>) -> Result<()> {
        let market = &ctx.accounts.market;
        require!(market.open_positions == 0, EscrowError::OpenPositionsRemain);
        require!(
            market.settled || Clock::get()?.unix_timestamp >= market.refund_after,
            EscrowError::MarketNotTerminal
        );
        require_eq!(market.paid_out, market.total_pool, EscrowError::UnpaidFunds);
        require_eq!(ctx.accounts.vault.amount, 0, EscrowError::UnpaidFunds);

        let fixture_bytes = market.fixture_id.to_le_bytes();
        let bump = [market.bump];
        let signer_seeds: &[&[u8]] = &[
            b"market",
            market.authority.as_ref(),
            fixture_bytes.as_ref(),
            bump.as_ref(),
        ];
        token_interface::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.authority.to_account_info(),
                authority: market.to_account_info(),
            },
            &[signer_seeds],
        ))?;
        emit!(MarketClosed {
            market: market.key(),
            authority: market.authority,
        });
        Ok(())
    }
}

fn strategy_for(outcome: Outcome) -> NDimensionalStrategy {
    let comparison = match outcome {
        Outcome::Home => Comparison::GreaterThan,
        Outcome::Draw => Comparison::EqualTo,
        Outcome::Away => Comparison::LessThan,
    };
    NDimensionalStrategy {
        geometric_targets: vec![],
        distance_predicate: None,
        discrete_predicates: vec![StatPredicate::Binary {
            index_a: 0,
            index_b: 1,
            op: BinaryExpression::Subtract,
            predicate: TraderPredicate {
                threshold: 0,
                comparison,
            },
        }],
    }
}

fn proportional_payout(stake: u64, total_pool: u64, winning_pool: u64) -> Result<u64> {
    require!(winning_pool > 0, EscrowError::NoWinningPool);
    let amount = u128::from(stake)
        .checked_mul(u128::from(total_pool))
        .ok_or(EscrowError::ArithmeticOverflow)?
        / u128::from(winning_pool);
    u64::try_from(amount).map_err(|_| error!(EscrowError::ArithmeticOverflow))
}

#[derive(Accounts)]
#[instruction(fixture_id: i64)]
pub struct InitializeMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = authority,
        space = 8 + Market::INIT_SPACE,
        seeds = [b"market", authority.key().as_ref(), &fixture_id.to_le_bytes()],
        bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = market,
        associated_token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Enter<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(
        mut,
        seeds = [b"market", market.authority.as_ref(), &market.fixture_id.to_le_bytes()],
        bump = market.bump,
        has_one = mint,
        has_one = vault,
        constraint = market.token_program == token_program.key() @ EscrowError::TokenProgramMismatch
    )]
    pub market: Account<'info, Market>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, address = market.vault)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = player,
        token::token_program = token_program
    )]
    pub player_tokens: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = player,
        space = 8 + Position::INIT_SPACE,
        seeds = [b"position", market.key().as_ref(), player.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    pub keeper: Signer<'info>,
    #[account(
        mut,
        seeds = [b"market", market.authority.as_ref(), &market.fixture_id.to_le_bytes()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    /// CHECK: `txline-kit-cpi` derives and checks this PDA from `payload.ts` before invoking.
    pub daily_scores_merkle_roots: UncheckedAccount<'info>,
    pub txline_program: Program<'info, TxLine>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(
        mut,
        seeds = [b"market", market.authority.as_ref(), &market.fixture_id.to_le_bytes()],
        bump = market.bump,
        has_one = mint,
        has_one = vault,
        constraint = market.token_program == token_program.key() @ EscrowError::TokenProgramMismatch
    )]
    pub market: Account<'info, Market>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, address = market.vault)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = player,
        token::token_program = token_program
    )]
    pub player_tokens: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), player.key().as_ref()],
        bump = position.bump,
        has_one = market,
        constraint = position.owner == player.key() @ EscrowError::PositionOwnerMismatch
    )]
    pub position: Account<'info, Position>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(
        mut,
        seeds = [b"market", market.authority.as_ref(), &market.fixture_id.to_le_bytes()],
        bump = market.bump,
        has_one = mint,
        has_one = vault,
        constraint = market.token_program == token_program.key() @ EscrowError::TokenProgramMismatch
    )]
    pub market: Account<'info, Market>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, address = market.vault)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = player,
        token::token_program = token_program
    )]
    pub player_tokens: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), player.key().as_ref()],
        bump = position.bump,
        has_one = market,
        constraint = position.owner == player.key() @ EscrowError::PositionOwnerMismatch
    )]
    pub position: Account<'info, Position>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"market", market.authority.as_ref(), &market.fixture_id.to_le_bytes()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        close = owner,
        seeds = [b"position", market.key().as_ref(), owner.key().as_ref()],
        bump = position.bump,
        has_one = market,
        constraint = position.owner == owner.key() @ EscrowError::PositionOwnerMismatch
    )]
    pub position: Account<'info, Position>,
}

#[derive(Accounts)]
pub struct CloseMarket<'info> {
    #[account(mut, address = market.authority)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        close = authority,
        seeds = [b"market", market.authority.as_ref(), &market.fixture_id.to_le_bytes()],
        bump = market.bump,
        has_one = vault,
        constraint = market.token_program == token_program.key() @ EscrowError::TokenProgramMismatch
    )]
    pub market: Account<'info, Market>,
    #[account(mut, address = market.vault)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub authority: Pubkey,
    pub fixture_id: i64,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub token_program: Pubkey,
    pub settle_not_before: i64,
    pub refund_after: i64,
    pub outcome: Option<Outcome>,
    pub proof_timestamp: i64,
    pub total_pool: u64,
    pub pools: [u64; 3],
    pub paid_out: u64,
    pub claimed_winning_stake: u64,
    pub open_positions: u64,
    pub settled: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub side: Outcome,
    pub stake: u64,
    pub claimed: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum Outcome {
    Home,
    Draw,
    Away,
}

impl Outcome {
    const fn index(self) -> usize {
        match self {
            Self::Home => 0,
            Self::Draw => 1,
            Self::Away => 2,
        }
    }
}

#[event]
pub struct MarketInitialized {
    pub market: Pubkey,
    pub authority: Pubkey,
    pub fixture_id: i64,
    pub settle_not_before: i64,
    pub refund_after: i64,
    pub mint: Pubkey,
}

#[event]
pub struct PositionEntered {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub side: Outcome,
    pub amount: u64,
    pub total_stake: u64,
}

#[event]
pub struct MarketSettled {
    pub market: Pubkey,
    pub keeper: Pubkey,
    pub outcome: Outcome,
    pub proof_timestamp: i64,
    pub total_pool: u64,
}

#[event]
pub struct PayoutClaimed {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct PositionRefunded {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct PositionClosed {
    pub market: Pubkey,
    pub owner: Pubkey,
}

#[event]
pub struct MarketClosed {
    pub market: Pubkey,
    pub authority: Pubkey,
}

#[error_code]
pub enum EscrowError {
    #[msg("fixture_id must be positive")]
    InvalidFixture,
    #[msg("settle_not_before must be in the future")]
    SettleTimeNotFuture,
    #[msg("refund_after must be later than settle_not_before")]
    RefundTimeInvalid,
    #[msg("stake must be greater than zero")]
    ZeroStake,
    #[msg("market is already settled")]
    AlreadySettled,
    #[msg("market is closed to new positions")]
    MarketClosed,
    #[msg("one wallet position cannot switch sides")]
    PositionSideLocked,
    #[msg("position payout was already claimed")]
    AlreadyClaimed,
    #[msg("arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("settlement is not yet allowed")]
    SettlementTooEarly,
    #[msg("settlement window closed when refunds became available")]
    SettlementWindowExpired,
    #[msg("market has no deposited tokens")]
    EmptyPool,
    #[msg("the proven outcome has no winning positions")]
    NoWinningPool,
    #[msg("proof fixture does not match this market")]
    FixtureMismatch,
    #[msg("proof must contain ordered full-match home and away goal stats")]
    InvalidScoreProofShape,
    #[msg("score proof stats must use period 100")]
    NonFinalPeriod,
    #[msg("TxLINE did not prove the declared outcome")]
    OutcomeNotProven,
    #[msg("market has not settled")]
    NotSettled,
    #[msg("only a winning position can claim")]
    LosingPosition,
    #[msg("calculated payout is zero")]
    ZeroPayout,
    #[msg("token program does not match market configuration")]
    TokenProgramMismatch,
    #[msg("position owner does not match claimant")]
    PositionOwnerMismatch,
    #[msg("token transfer extensions changed the expected escrow amount")]
    UnsupportedTransferBehavior,
    #[msg("refund deadline has not passed")]
    RefundTooEarly,
    #[msg("position must be paid, refunded, or a settled loser before it can close")]
    PositionNotTerminal,
    #[msg("all position accounts must close before the market")]
    OpenPositionsRemain,
    #[msg("market has not settled and its refund deadline has not passed")]
    MarketNotTerminal,
    #[msg("escrow still contains unpaid funds")]
    UnpaidFunds,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn outcome_strategies_are_bound_to_score_difference() {
        for (outcome, expected) in [
            (Outcome::Home, Comparison::GreaterThan),
            (Outcome::Draw, Comparison::EqualTo),
            (Outcome::Away, Comparison::LessThan),
        ] {
            let strategy = strategy_for(outcome);
            assert_eq!(strategy.discrete_predicates.len(), 1);
            match &strategy.discrete_predicates[0] {
                StatPredicate::Binary {
                    index_a,
                    index_b,
                    op,
                    predicate,
                } => {
                    assert_eq!((*index_a, *index_b), (0, 1));
                    assert_eq!(*op, BinaryExpression::Subtract);
                    assert_eq!(predicate.threshold, 0);
                    assert_eq!(predicate.comparison, expected);
                }
                StatPredicate::Single { .. } => {
                    panic!("outcome must use a binary score difference")
                }
            }
        }
    }

    #[test]
    fn payout_is_proportional_and_checked() {
        assert_eq!(proportional_payout(50, 200, 100).unwrap(), 100);
        assert_eq!(proportional_payout(100, 200, 100).unwrap(), 200);
        assert_eq!(proportional_payout(1, 10, 3).unwrap(), 3);
        assert_eq!(10_u64.checked_sub(3).unwrap(), 7);
        assert!(proportional_payout(1, 1, 0).is_err());
    }
}
