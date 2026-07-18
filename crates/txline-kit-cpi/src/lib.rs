//! Typed Anchor CPI bindings for TxLINE's `validate_stat_v2` instruction.
//!
//! The ABI in this crate is pinned to the TxODDS IDL commit documented in
//! [`IDL_COMMIT`]. The default build targets mainnet. Compile with
//! `--no-default-features --features devnet` for the TxLINE devnet deployment.

use anchor_lang::{
    prelude::*,
    solana_program::{
        instruction::{AccountMeta, Instruction},
        program::{get_return_data, invoke_signed},
    },
    ToAccountInfos, ToAccountMetas,
};

#[cfg(all(feature = "mainnet", feature = "devnet"))]
compile_error!("features `mainnet` and `devnet` are mutually exclusive");

#[cfg(not(any(feature = "mainnet", feature = "devnet")))]
compile_error!("enable exactly one TxLINE network feature: `mainnet` or `devnet`");

/// TxODDS source revision used to define this crate's ABI.
pub const IDL_COMMIT: &str = "f7e3bcd5db4c6744445f75dfab7eccc879c6d2de";

/// Anchor instruction discriminator declared by the pinned IDL.
pub const VALIDATE_STAT_V2_DISCRIMINATOR: [u8; 8] = [208, 215, 194, 214, 241, 71, 246, 178];

/// TxLINE mainnet oracle program.
pub const MAINNET_PROGRAM_ID: Pubkey = pubkey!("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA");

/// TxLINE devnet oracle program.
pub const DEVNET_PROGRAM_ID: Pubkey = pubkey!("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");

/// Program ID selected by the crate's network feature.
#[must_use]
pub const fn program_id() -> Pubkey {
    if cfg!(feature = "mainnet") {
        MAINNET_PROGRAM_ID
    } else {
        DEVNET_PROGRAM_ID
    }
}

/// Marker type for `Program<'info, TxLine>` account constraints.
pub struct TxLine;

impl Id for TxLine {
    fn id() -> Pubkey {
        program_id()
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ProofNode {
    pub hash: [u8; 32],
    pub is_right_sibling: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ScoresUpdateStats {
    pub update_count: i32,
    pub min_timestamp: i64,
    pub max_timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ScoresBatchSummary {
    pub fixture_id: i64,
    pub update_stats: ScoresUpdateStats,
    pub events_sub_tree_root: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ScoreStat {
    pub key: u32,
    pub value: i32,
    pub period: i32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct StatLeaf {
    pub stat: ScoreStat,
    pub stat_proof: Vec<ProofNode>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct StatValidationInput {
    pub ts: i64,
    pub fixture_summary: ScoresBatchSummary,
    pub fixture_proof: Vec<ProofNode>,
    pub main_tree_proof: Vec<ProofNode>,
    pub event_stat_root: [u8; 32],
    pub stats: Vec<StatLeaf>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum Comparison {
    GreaterThan,
    LessThan,
    EqualTo,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct TraderPredicate {
    pub threshold: i32,
    pub comparison: Comparison,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum BinaryExpression {
    Add,
    Subtract,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct GeometricTarget {
    pub stat_index: u8,
    pub prediction: i32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum StatPredicate {
    Single {
        index: u8,
        predicate: TraderPredicate,
    },
    Binary {
        index_a: u8,
        index_b: u8,
        op: BinaryExpression,
        predicate: TraderPredicate,
    },
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct NDimensionalStrategy {
    pub geometric_targets: Vec<GeometricTarget>,
    pub distance_predicate: Option<TraderPredicate>,
    pub discrete_predicates: Vec<StatPredicate>,
}

/// CPI accounts for `validate_stat_v2`.
#[derive(Clone)]
pub struct ValidateStatV2<'info> {
    /// TxLINE's read-only `daily_scores_roots` PDA for `payload.ts`.
    pub daily_scores_merkle_roots: AccountInfo<'info>,
}

impl ToAccountMetas for ValidateStatV2<'_> {
    fn to_account_metas(&self, _is_signer: Option<bool>) -> Vec<AccountMeta> {
        vec![AccountMeta::new_readonly(
            *self.daily_scores_merkle_roots.key,
            false,
        )]
    }
}

impl<'info> ToAccountInfos<'info> for ValidateStatV2<'info> {
    fn to_account_infos(&self) -> Vec<AccountInfo<'info>> {
        vec![self.daily_scores_merkle_roots.clone()]
    }
}

/// Returns the daily score-root PDA and bump for a timestamp in milliseconds.
pub fn daily_scores_pda(timestamp_ms: i64) -> Result<(Pubkey, u8)> {
    daily_scores_pda_for_program(timestamp_ms, &program_id())
}

/// Returns the daily score-root PDA for an explicit TxLINE program deployment.
pub fn daily_scores_pda_for_program(
    timestamp_ms: i64,
    oracle_program: &Pubkey,
) -> Result<(Pubkey, u8)> {
    require!(timestamp_ms >= 0, TxLineCpiError::InvalidTimestamp);
    let epoch_day = timestamp_ms / 86_400_000;
    let day = u16::try_from(epoch_day).map_err(|_| error!(TxLineCpiError::EpochDayOverflow))?;
    Ok(Pubkey::find_program_address(
        &[b"daily_scores_roots", &day.to_le_bytes()],
        oracle_program,
    ))
}

/// Serializes the exact Anchor ABI for `validate_stat_v2`.
pub fn validate_stat_v2_data(
    payload: &StatValidationInput,
    strategy: &NDimensionalStrategy,
) -> Result<Vec<u8>> {
    let mut data = Vec::with_capacity(256);
    data.extend_from_slice(&VALIDATE_STAT_V2_DISCRIMINATOR);
    payload
        .serialize(&mut data)
        .map_err(|_| error!(TxLineCpiError::PayloadSerializationFailed))?;
    strategy
        .serialize(&mut data)
        .map_err(|_| error!(TxLineCpiError::PayloadSerializationFailed))?;
    Ok(data)
}

/// Builds a TxLINE validation instruction after checking the network and PDA pairing.
pub fn validate_stat_v2_instruction(
    daily_scores_merkle_roots: Pubkey,
    payload: &StatValidationInput,
    strategy: &NDimensionalStrategy,
) -> Result<Instruction> {
    require_eq!(
        payload.ts,
        payload.fixture_summary.update_stats.min_timestamp,
        TxLineCpiError::PayloadTimestampMismatch
    );
    let expected_pda = daily_scores_pda(payload.ts)?.0;
    require_keys_eq!(
        daily_scores_merkle_roots,
        expected_pda,
        TxLineCpiError::DailyScoresPdaMismatch
    );
    Ok(Instruction {
        program_id: program_id(),
        accounts: vec![AccountMeta::new_readonly(daily_scores_merkle_roots, false)],
        data: validate_stat_v2_data(payload, strategy)?,
    })
}

/// Invokes TxLINE and immediately reads its boolean return value.
///
/// The return-data program ID and exact one-byte boolean encoding are checked to
/// prevent stale or nested CPI return data from being accepted.
pub fn validate_stat_v2_cpi<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, ValidateStatV2<'info>>,
    payload: StatValidationInput,
    strategy: NDimensionalStrategy,
) -> Result<bool> {
    require_keys_eq!(
        *ctx.program.key,
        program_id(),
        TxLineCpiError::IncorrectOracleProgram
    );
    require!(
        ctx.program.executable,
        TxLineCpiError::OracleProgramNotExecutable
    );
    let instruction = validate_stat_v2_instruction(
        *ctx.accounts.daily_scores_merkle_roots.key,
        &payload,
        &strategy,
    )?;
    invoke_signed(&instruction, &ctx.to_account_infos(), ctx.signer_seeds)?;
    decode_return_data(program_id(), get_return_data())
}

fn decode_return_data(
    expected_program: Pubkey,
    returned: Option<(Pubkey, Vec<u8>)>,
) -> Result<bool> {
    let (return_program, bytes) =
        returned.ok_or_else(|| error!(TxLineCpiError::MissingReturnData))?;
    require_keys_eq!(
        return_program,
        expected_program,
        TxLineCpiError::ReturnProgramMismatch
    );
    bool::try_from_slice(&bytes).map_err(|_| error!(TxLineCpiError::InvalidBooleanReturn))
}

#[error_code]
pub enum TxLineCpiError {
    #[msg("TxLINE timestamps must be non-negative milliseconds")]
    InvalidTimestamp,
    #[msg("TxLINE epoch day does not fit the oracle's u16 PDA seed")]
    EpochDayOverflow,
    #[msg("Unable to serialize the pinned validate_stat_v2 ABI")]
    PayloadSerializationFailed,
    #[msg("payload.ts must equal fixture_summary.update_stats.min_timestamp")]
    PayloadTimestampMismatch,
    #[msg("The supplied account is not the daily score-root PDA for payload.ts")]
    DailyScoresPdaMismatch,
    #[msg("The CPI program does not match the feature-selected TxLINE deployment")]
    IncorrectOracleProgram,
    #[msg("The TxLINE program account is not executable")]
    OracleProgramNotExecutable,
    #[msg("TxLINE returned no value after CPI")]
    MissingReturnData,
    #[msg("CPI return data came from a program other than TxLINE")]
    ReturnProgramMismatch,
    #[msg("TxLINE CPI return data was not an exact Anchor boolean")]
    InvalidBooleanReturn,
}

#[cfg(test)]
mod tests {
    use super::*;

    const TYPESCRIPT_GOLDEN_HEX: &str = "d0d7c2d6f147f6b214050000000000002a000000000000000300000014050000000000001405000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020000000100000001000000000000000000000002000000000000000000000000000000000000000001000000010001010000000000";
    const TYPESCRIPT_ALL_VARIANTS_HEX: &str = "d0d7c2d6f147f6b214050000000000002a0000000000000003000000140500000000000014050000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000001000000010000000000000000000000020000000000000000000000000000000100000000050000000107000000010200000000000100000002010001000200000001";
    const TYPESCRIPT_PROOF_NODES_HEX: &str = "d0d7c2d6f147f6b214050000000000002a000000000000000300000014050000000000001405000000000000000000000000000000000000000000000000000000000000000000000000000001000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0101000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb00cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc0200000001000000010000000000000001000000dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd0102000000000000000000000001000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee00000000000001000000010001010000000000";

    fn sample() -> (StatValidationInput, NDimensionalStrategy) {
        (
            StatValidationInput {
                ts: 1300,
                fixture_summary: ScoresBatchSummary {
                    fixture_id: 42,
                    update_stats: ScoresUpdateStats {
                        update_count: 3,
                        min_timestamp: 1300,
                        max_timestamp: 1300,
                    },
                    events_sub_tree_root: [0; 32],
                },
                fixture_proof: vec![],
                main_tree_proof: vec![],
                event_stat_root: [0; 32],
                stats: vec![
                    StatLeaf {
                        stat: ScoreStat {
                            key: 1,
                            value: 1,
                            period: 0,
                        },
                        stat_proof: vec![],
                    },
                    StatLeaf {
                        stat: ScoreStat {
                            key: 2,
                            value: 0,
                            period: 0,
                        },
                        stat_proof: vec![],
                    },
                ],
            },
            NDimensionalStrategy {
                geometric_targets: vec![],
                distance_predicate: None,
                discrete_predicates: vec![StatPredicate::Binary {
                    index_a: 0,
                    index_b: 1,
                    op: BinaryExpression::Subtract,
                    predicate: TraderPredicate {
                        threshold: 0,
                        comparison: Comparison::GreaterThan,
                    },
                }],
            },
        )
    }

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    #[test]
    fn network_and_pda_match_typescript() {
        #[cfg(feature = "mainnet")]
        {
            assert_eq!(program_id(), MAINNET_PROGRAM_ID);
            let (pda, bump) = daily_scores_pda(1_720_000_000_000).unwrap();
            assert_eq!(
                pda.to_string(),
                "8TWNv4gKtqpsS2qkBAHvLQMqPF5mSCbFJvYqxrQade5w"
            );
            assert_eq!(bump, 255);
        }
        #[cfg(feature = "devnet")]
        assert_eq!(program_id(), DEVNET_PROGRAM_ID);
    }

    #[test]
    fn rejects_invalid_pda_timestamps() {
        assert!(daily_scores_pda(-1).is_err());
        assert!(daily_scores_pda(i64::MAX).is_err());
    }

    #[test]
    fn instruction_is_byte_identical_to_anchor_typescript() {
        let (payload, strategy) = sample();
        let pda = daily_scores_pda(payload.ts).unwrap().0;
        let instruction = validate_stat_v2_instruction(pda, &payload, &strategy).unwrap();
        assert_eq!(hex(&instruction.data), TYPESCRIPT_GOLDEN_HEX);
        assert_eq!(instruction.program_id, program_id());
        assert_eq!(
            instruction.accounts,
            vec![AccountMeta::new_readonly(pda, false)]
        );
    }

    #[test]
    fn every_strategy_variant_is_byte_identical_to_anchor_typescript() {
        let (payload, _) = sample();
        let strategy = NDimensionalStrategy {
            geometric_targets: vec![GeometricTarget {
                stat_index: 0,
                prediction: 5,
            }],
            distance_predicate: Some(TraderPredicate {
                threshold: 7,
                comparison: Comparison::LessThan,
            }),
            discrete_predicates: vec![
                StatPredicate::Single {
                    index: 0,
                    predicate: TraderPredicate {
                        threshold: 1,
                        comparison: Comparison::EqualTo,
                    },
                },
                StatPredicate::Binary {
                    index_a: 0,
                    index_b: 1,
                    op: BinaryExpression::Add,
                    predicate: TraderPredicate {
                        threshold: 2,
                        comparison: Comparison::LessThan,
                    },
                },
            ],
        };
        assert_eq!(
            hex(&validate_stat_v2_data(&payload, &strategy).unwrap()),
            TYPESCRIPT_ALL_VARIANTS_HEX
        );
    }

    #[test]
    fn every_proof_path_is_byte_identical_to_anchor_typescript() {
        let (mut payload, strategy) = sample();
        payload.fixture_proof = vec![ProofNode {
            hash: [0xaa; 32],
            is_right_sibling: true,
        }];
        payload.main_tree_proof = vec![ProofNode {
            hash: [0xbb; 32],
            is_right_sibling: false,
        }];
        payload.event_stat_root = [0xcc; 32];
        payload.stats[0].stat_proof = vec![ProofNode {
            hash: [0xdd; 32],
            is_right_sibling: true,
        }];
        payload.stats[1].stat_proof = vec![ProofNode {
            hash: [0xee; 32],
            is_right_sibling: false,
        }];
        assert_eq!(
            hex(&validate_stat_v2_data(&payload, &strategy).unwrap()),
            TYPESCRIPT_PROOF_NODES_HEX
        );
    }

    #[test]
    fn instruction_rejects_wrong_daily_pda() {
        let (payload, strategy) = sample();
        assert!(validate_stat_v2_instruction(Pubkey::new_unique(), &payload, &strategy).is_err());
    }

    #[test]
    fn instruction_rejects_timestamp_summary_mismatch() {
        let (mut payload, strategy) = sample();
        payload.fixture_summary.update_stats.min_timestamp += 1;
        let pda = daily_scores_pda(payload.ts).unwrap().0;
        assert!(validate_stat_v2_instruction(pda, &payload, &strategy).is_err());
    }

    #[test]
    fn return_decoder_reads_exact_anchor_boolean() {
        assert!(decode_return_data(program_id(), Some((program_id(), vec![1]))).unwrap());
        assert!(!decode_return_data(program_id(), Some((program_id(), vec![0]))).unwrap());
    }

    #[test]
    fn return_decoder_rejects_missing_foreign_or_malformed_returns() {
        assert!(decode_return_data(program_id(), None).is_err());
        assert!(decode_return_data(program_id(), Some((Pubkey::new_unique(), vec![1]))).is_err());
        assert!(decode_return_data(program_id(), Some((program_id(), vec![1, 0]))).is_err());
        assert!(decode_return_data(program_id(), Some((program_id(), vec![2]))).is_err());
    }
}
