import type { CanonicalScoreRecord } from "./data.js";
import { isSettlementFinalisation } from "./data.js";
import { CoverageError, StrategyError } from "./errors.js";

export type Comparison = { greaterThan: Record<string, never> } | { lessThan: Record<string, never> } | { equalTo: Record<string, never> };
export interface TraderPredicate { threshold: number; comparison: Comparison }
export type BinaryExpression = { add: Record<string, never> } | { subtract: Record<string, never> };
export type DiscretePredicate =
  | { single: { index: number; predicate: TraderPredicate } }
  | { binary: { indexA: number; indexB: number; op: BinaryExpression; predicate: TraderPredicate } };

export interface NDimensionalStrategy extends Record<string, unknown> {
  geometricTargets: readonly never[];
  distancePredicate: null;
  discretePredicates: readonly DiscretePredicate[];
}

export interface CompiledStrategy {
  statKeys: readonly number[];
  positions: Readonly<Record<string, number>>;
  strategy: NDimensionalStrategy;
}

export type SoccerBaseStat = "participant1Goals" | "participant2Goals" | "participant1YellowCards" | "participant2YellowCards" | "participant1RedCards" | "participant2RedCards" | "participant1Corners" | "participant2Corners";
export type SoccerPeriod = "total" | "h1" | "ht" | "h2" | "et1" | "et2" | "penalties" | "etTotal";

export const SOCCER_BASE_STATS: Readonly<Record<SoccerBaseStat, number>> = Object.freeze({
  participant1Goals: 1,
  participant2Goals: 2,
  participant1YellowCards: 3,
  participant2YellowCards: 4,
  participant1RedCards: 5,
  participant2RedCards: 6,
  participant1Corners: 7,
  participant2Corners: 8,
});

export const SOCCER_PERIOD_PREFIXES: Readonly<Record<SoccerPeriod, number>> = Object.freeze({
  total: 0,
  h1: 1000,
  ht: 2000,
  h2: 3000,
  et1: 4000,
  et2: 5000,
  penalties: 6000,
  etTotal: 7000,
});

export function soccerStatKey(stat: SoccerBaseStat, period: SoccerPeriod = "total"): number {
  return SOCCER_PERIOD_PREFIXES[period] + SOCCER_BASE_STATS[stat];
}

const empty = Object.freeze({});

function threshold(value: number): number {
  if (!Number.isSafeInteger(value) || value < -2_147_483_648 || value > 2_147_483_647) {
    throw new StrategyError("Strategy threshold must be a signed 32-bit integer", {
      code: "STRATEGY_THRESHOLD_INVALID",
      fix: "Convert market semantics to an integer comparison before compiling; half-lines compare against integer totals.",
    });
  }
  return value;
}

function predicate(value: number, comparison: Comparison): TraderPredicate {
  return Object.freeze({ threshold: threshold(value), comparison: Object.freeze(comparison) });
}

function normalizePredicate(value: TraderPredicate): TraderPredicate {
  if (!value || typeof value !== "object" || !value.comparison || typeof value.comparison !== "object") strategyError("Strategy predicate is malformed", "STRATEGY_PREDICATE_INVALID", "Use gt(), lt(), or eq() to construct predicates.");
  const comparisons = ["greaterThan", "lessThan", "equalTo"].filter((key) => key in value.comparison);
  if (comparisons.length !== 1) strategyError("Strategy predicate must choose exactly one comparison", "STRATEGY_COMPARISON_INVALID", "Use exactly one of gt(), lt(), or eq().");
  const comparison = comparisons[0] === "greaterThan" ? { greaterThan: empty } : comparisons[0] === "lessThan" ? { lessThan: empty } : { equalTo: empty };
  return predicate(value.threshold, comparison);
}

function normalizeExpression(value: BinaryExpression): BinaryExpression {
  if (!value || typeof value !== "object") strategyError("Binary strategy operation must be add or subtract", "STRATEGY_BINARY_OP_INVALID", "Use op.add or op.subtract.");
  const operations = ["add", "subtract"].filter((key) => key in value);
  if (operations.length !== 1) strategyError("Binary strategy must choose exactly one operation", "STRATEGY_BINARY_OP_INVALID", "Use exactly one of op.add or op.subtract.");
  return operations[0] === "add" ? op.add : op.subtract;
}

export const gt = (value: number): TraderPredicate => predicate(value, { greaterThan: empty });
export const lt = (value: number): TraderPredicate => predicate(value, { lessThan: empty });
export const eq = (value: number): TraderPredicate => predicate(value, { equalTo: empty });

export const op = Object.freeze({
  add: Object.freeze({ add: empty }) as BinaryExpression,
  subtract: Object.freeze({ subtract: empty }) as BinaryExpression,
});

function strategyError(message: string, code: string, fix: string): never {
  throw new StrategyError(message, { code, fix });
}

export class StrategyBuilder {
  private readonly stats: Array<{ name: string; key: number }> = [];
  private readonly predicates: DiscretePredicate[] = [];
  private readonly coverage: number[] = [];

  stat(name: string, key: number): this {
    const clean = name.trim();
    if (!clean) strategyError("Stat alias cannot be empty", "STRATEGY_ALIAS_INVALID", "Give each requested stat a stable descriptive name.");
    if (!Number.isSafeInteger(key) || key < 0) strategyError(`Stat ${clean} needs a non-negative integer key`, "STRATEGY_STAT_KEY_INVALID", "Use a confirmed key from the sport registry.");
    if (this.stats.some((item) => item.name === clean)) strategyError(`Stat alias ${clean} is already defined`, "STRATEGY_ALIAS_DUPLICATE", "Use each alias once.");
    if (this.stats.some((item) => item.key === key)) strategyError(`Stat key ${key} is already requested`, "STRATEGY_STAT_KEY_DUPLICATE", "Request each stat key once and reference its alias position.");
    if (this.stats.length >= 256) strategyError("V2 strategy positions are u8 and cannot exceed 255", "STRATEGY_TOO_MANY_STATS", "Split the strategy into smaller validation calls.");
    this.stats.push({ name: clean, key });
    this.coverage.push(0);
    return this;
  }

  single(name: string, test: TraderPredicate): this {
    const index = this.position(name);
    this.predicates.push(Object.freeze({ single: Object.freeze({ index, predicate: normalizePredicate(test) }) }));
    this.coverage[index]! += 1;
    return this;
  }

  binary(nameA: string, nameB: string, expression: BinaryExpression, test: TraderPredicate): this {
    const indexA = this.position(nameA);
    const indexB = this.position(nameB);
    if (indexA === indexB) strategyError("Binary strategy operands must be different stats", "STRATEGY_BINARY_SELF_REFERENCE", "Define two distinct stat aliases for a binary expression.");
    this.predicates.push(Object.freeze({ binary: Object.freeze({ indexA, indexB, op: normalizeExpression(expression), predicate: normalizePredicate(test) }) }));
    this.coverage[indexA]! += 1;
    this.coverage[indexB]! += 1;
    return this;
  }

  compile(): CompiledStrategy {
    if (!this.stats.length) strategyError("A strategy must request at least one stat", "STRATEGY_EMPTY", "Add stat aliases before compiling.");
    const uncovered = this.stats.filter((_, index) => this.coverage[index] === 0).map((item) => item.name);
    const duplicated = this.stats.filter((_, index) => this.coverage[index]! > 1).map((item) => item.name);
    if (uncovered.length || duplicated.length) {
      throw new CoverageError(`Every requested stat must be covered exactly once${uncovered.length ? `; uncovered: ${uncovered.join(", ")}` : ""}${duplicated.length ? `; covered more than once: ${duplicated.join(", ")}` : ""}`, {
        code: "INCOMPLETE_STAT_COVERAGE",
        fix: "Add one predicate for each uncovered alias and remove overlapping predicates for duplicated aliases.",
      });
    }
    const positions = Object.freeze(Object.fromEntries(this.stats.map((item, index) => [item.name, index])));
    const compiled: NDimensionalStrategy = Object.freeze({ geometricTargets: Object.freeze([]), distancePredicate: null, discretePredicates: Object.freeze([...this.predicates]) });
    return Object.freeze({ statKeys: Object.freeze(this.stats.map((item) => item.key)), positions, strategy: compiled });
  }

  private position(name: string): number {
    const index = this.stats.findIndex((item) => item.name === name);
    if (index < 0) strategyError(`Unknown stat alias ${name}`, "STRATEGY_ALIAS_UNKNOWN", "Call .stat(name, key) before referencing an alias.");
    return index;
  }
}

export const strategy = (): StrategyBuilder => new StrategyBuilder();

export interface CompiledMarket extends CompiledStrategy {
  fixtureId: number;
  requiresFinalisation: boolean;
  label: string;
  assertSettlementRecord(record: CanonicalScoreRecord): void;
}

function fixture(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) strategyError("Market fixtureId must be a positive integer", "MARKET_FIXTURE_INVALID", "Use the fixture ID from the score feed.");
  return value;
}

export function marketStrategy(fixtureId: number, label: string, compiled: CompiledStrategy, requiresFinalisation = true): CompiledMarket {
  const expectedFixture = fixture(fixtureId);
  return Object.freeze({
    ...compiled,
    fixtureId: expectedFixture,
    requiresFinalisation,
    label,
    assertSettlementRecord(record: CanonicalScoreRecord): void {
      if (record.fixtureId !== expectedFixture) strategyError(`Settlement record fixture ${String(record.fixtureId)} does not match market fixture ${expectedFixture}`, "MARKET_FIXTURE_MISMATCH", "Use finalisation evidence from the same fixture as the proof and market.");
      if (requiresFinalisation && !isSettlementFinalisation(record)) strategyError("Market requires lifecycle finalisation", "MARKET_NOT_FINAL", "Wait for action=game_finalised and statusId=100. Period must be 100 when present; current mainnet records may omit it.");
    },
  });
}

function resultBuilder(fixtureId: number, label: string, test: TraderPredicate): CompiledMarket {
  const compiled = strategy()
    .stat("homeGoals", soccerStatKey("participant1Goals"))
    .stat("awayGoals", soccerStatKey("participant2Goals"))
    .binary("homeGoals", "awayGoals", op.subtract, test)
    .compile();
  return marketStrategy(fixtureId, label, compiled, true);
}

function halfLine(line: number): number {
  if (!Number.isFinite(line) || line < 0 || Math.abs(line % 1) !== 0.5) strategyError("Over/under line must be a non-negative half line such as 2.5", "MARKET_HALF_LINE_INVALID", "Use an x.5 line so integer score totals cannot push.");
  return line;
}

function totalBuilder(fixtureId: number, line: number, side: "over" | "under"): CompiledMarket {
  const normalized = halfLine(line);
  const compiled = strategy()
    .stat("homeGoals", soccerStatKey("participant1Goals"))
    .stat("awayGoals", soccerStatKey("participant2Goals"))
    .binary("homeGoals", "awayGoals", op.add, side === "over" ? gt(Math.floor(normalized)) : lt(Math.ceil(normalized)))
    .compile();
  return marketStrategy(fixtureId, `Total goals ${side} ${normalized}`, compiled, true);
}

function parlay(legs: readonly CompiledMarket[]): CompiledMarket {
  if (!legs.length) strategyError("A parlay requires at least one leg", "PARLAY_EMPTY", "Pass one or more compiled market legs.");
  const fixtureId = legs[0]!.fixtureId;
  if (legs.some((leg) => leg.fixtureId !== fixtureId)) strategyError("One validateStatV2 bundle cannot prove legs from different fixtures", "PARLAY_CROSS_FIXTURE_UNSUPPORTED", "Group legs by fixture and validate each fixture's bundle separately.");
  const statKeys: number[] = [];
  const predicates: DiscretePredicate[] = [];
  const seen = new Set<number>();
  for (const leg of legs) {
    if (leg.statKeys.some((key) => seen.has(key))) strategyError("Parlay legs reuse a stat key and would violate exact coverage", "PARLAY_OVERLAPPING_STATS", "Use disjoint stat legs in one V2 call or validate overlapping conditions separately.");
    const offset = statKeys.length;
    for (const key of leg.statKeys) { seen.add(key); statKeys.push(key); }
    for (const item of leg.strategy.discretePredicates) predicates.push("single" in item
      ? { single: { ...item.single, index: item.single.index + offset } }
      : { binary: { ...item.binary, indexA: item.binary.indexA + offset, indexB: item.binary.indexB + offset } });
  }
  const positions = Object.freeze(Object.fromEntries(statKeys.map((_, index) => [`stat${index}`, index])));
  const compiled: CompiledStrategy = Object.freeze({ statKeys: Object.freeze(statKeys), positions, strategy: Object.freeze({ geometricTargets: Object.freeze([]), distancePredicate: null, discretePredicates: Object.freeze(predicates) }) });
  return marketStrategy(fixtureId, `Parlay: ${legs.map((leg) => leg.label).join(" + ")}`, compiled, legs.some((leg) => leg.requiresFinalisation));
}

export const markets = Object.freeze({
  finalResult(fixtureId: number) {
    return Object.freeze({
      homeWin: () => resultBuilder(fixtureId, "Home win", gt(0)),
      draw: () => resultBuilder(fixtureId, "Draw", eq(0)),
      awayWin: () => resultBuilder(fixtureId, "Away win", lt(0)),
    });
  },
  overUnder(fixtureId: number, market: "totalGoals", line: number) {
    if (market !== "totalGoals") strategyError(`Unsupported over/under market ${String(market)}`, "MARKET_TYPE_UNSUPPORTED", "Use totalGoals until another confirmed stat registry mapping is added.");
    return Object.freeze({ over: () => totalBuilder(fixtureId, line, "over"), under: () => totalBuilder(fixtureId, line, "under") });
  },
  parlay,
});
