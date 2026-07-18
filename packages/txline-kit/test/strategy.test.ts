import { describe, expect, test } from "vitest";
import { CoverageError, StrategyError } from "../src/errors.js";
import {
  SOCCER_BASE_STATS,
  SOCCER_PERIOD_PREFIXES,
  eq,
  gt,
  lt,
  markets,
  marketStrategy,
  op,
  soccerStatKey,
  strategy,
  type BinaryExpression,
  type TraderPredicate,
} from "../src/strategy.js";

function throwsCode(run: () => unknown, code: string): void {
  try { run(); } catch (error) { expect(error).toMatchObject({ code }); return; }
  throw new Error(`Expected ${code}`);
}

describe("confirmed soccer registry", () => {
  test("constructs all documented period-prefix and base-key combinations", () => {
    const keys = new Set<number>();
    for (const [period, prefix] of Object.entries(SOCCER_PERIOD_PREFIXES)) {
      for (const [stat, base] of Object.entries(SOCCER_BASE_STATS)) {
        const key = soccerStatKey(stat as keyof typeof SOCCER_BASE_STATS, period as keyof typeof SOCCER_PERIOD_PREFIXES);
        expect(key).toBe(prefix + base);
        keys.add(key);
      }
    }
    expect(keys.size).toBe(64);
    expect(soccerStatKey("participant1Goals", "h2")).toBe(3001);
    expect(soccerStatKey("participant2Corners", "etTotal")).toBe(7008);
  });
});

describe("low-level strategy compiler", () => {
  test("owns key order and maps aliases to positional V2 indexes", () => {
    const compiled = strategy()
      .stat("home", 1)
      .stat("away", 2)
      .stat("homeCorners", 7)
      .binary("home", "away", op.subtract, gt(0))
      .single("homeCorners", lt(9))
      .compile();
    expect(compiled.statKeys).toEqual([1, 2, 7]);
    expect(compiled.positions).toEqual({ home: 0, away: 1, homeCorners: 2 });
    expect(compiled.strategy).toEqual({
      geometricTargets: [],
      distancePredicate: null,
      discretePredicates: [
        { binary: { indexA: 0, indexB: 1, op: { subtract: {} }, predicate: { threshold: 0, comparison: { greaterThan: {} } } } },
        { single: { index: 2, predicate: { threshold: 9, comparison: { lessThan: {} } } } },
      ],
    });
    expect(Object.isFrozen(compiled.statKeys)).toBe(true);
    expect(Object.isFrozen(compiled.strategy.discretePredicates)).toBe(true);
  });

  test("reports every uncovered and multiply-covered alias", () => {
    expect(() => strategy().stat("home", 1).stat("away", 2).single("home", gt(0)).compile()).toThrow(CoverageError);
    try {
      strategy().stat("home", 1).stat("away", 2).single("home", gt(0)).single("home", lt(3)).compile();
    } catch (error) {
      expect(error).toMatchObject({ code: "INCOMPLETE_STAT_COVERAGE", message: expect.stringContaining("uncovered: away"), fix: expect.stringContaining("overlapping") });
      expect((error as Error).message).toContain("covered more than once: home");
    }
  });

  test("rejects invalid aliases, keys, references, expressions, and thresholds", () => {
    throwsCode(() => strategy().compile(), "STRATEGY_EMPTY");
    throwsCode(() => strategy().stat(" ", 1), "STRATEGY_ALIAS_INVALID");
    throwsCode(() => strategy().stat("a", -1), "STRATEGY_STAT_KEY_INVALID");
    throwsCode(() => strategy().stat("a", 1).stat("a", 2), "STRATEGY_ALIAS_DUPLICATE");
    throwsCode(() => strategy().stat("a", 1).stat("b", 1), "STRATEGY_STAT_KEY_DUPLICATE");
    throwsCode(() => strategy().stat("a", 1).single("missing", gt(0)), "STRATEGY_ALIAS_UNKNOWN");
    throwsCode(() => strategy().stat("a", 1).binary("a", "a", op.add, eq(0)), "STRATEGY_BINARY_SELF_REFERENCE");
    throwsCode(() => gt(2.5), "STRATEGY_THRESHOLD_INVALID");
    expect(() => eq(2_147_483_648)).toThrow(StrategyError);
    throwsCode(() => strategy().stat("a", 1).stat("b", 2).binary("a", "b", { multiply: {} } as unknown as BinaryExpression, gt(0)), "STRATEGY_BINARY_OP_INVALID");
    throwsCode(() => strategy().stat("a", 1).single("a", { threshold: 0, comparison: { greaterThan: {}, lessThan: {} } } as unknown as TraderPredicate), "STRATEGY_COMPARISON_INVALID");
    throwsCode(() => strategy().stat("a", 1).single("a", null as unknown as TraderPredicate), "STRATEGY_PREDICATE_INVALID");
  });
});

describe("market semantics", () => {
  test("compiles home/draw/away without exposing index arithmetic", () => {
    const home = markets.finalResult(42).homeWin();
    const draw = markets.finalResult(42).draw();
    const away = markets.finalResult(42).awayWin();
    expect(home.statKeys).toEqual([1, 2]);
    expect(home.strategy.discretePredicates[0]).toMatchObject({ binary: { indexA: 0, indexB: 1, op: { subtract: {} }, predicate: { threshold: 0, comparison: { greaterThan: {} } } } });
    expect(draw.strategy.discretePredicates[0]).toMatchObject({ binary: { predicate: { comparison: { equalTo: {} } } } });
    expect(away.strategy.discretePredicates[0]).toMatchObject({ binary: { predicate: { comparison: { lessThan: {} } } } });
    expect(home.requiresFinalisation).toBe(true);
  });

  test("encodes half-line totals against integer score values", () => {
    const over = markets.overUnder(42, "totalGoals", 2.5).over();
    const under = markets.overUnder(42, "totalGoals", 2.5).under();
    expect(over.strategy.discretePredicates[0]).toMatchObject({ binary: { op: { add: {} }, predicate: { threshold: 2, comparison: { greaterThan: {} } } } });
    expect(under.strategy.discretePredicates[0]).toMatchObject({ binary: { predicate: { threshold: 3, comparison: { lessThan: {} } } } });
    throwsCode(() => markets.overUnder(42, "totalGoals", 2).over(), "MARKET_HALF_LINE_INVALID");
    expect(() => markets.overUnder(42, "totalGoals", -0.5).under()).toThrow(/non-negative half line/);
  });

  test("gates final markets on explicit lifecycle evidence from the same fixture", () => {
    const market = markets.finalResult(42).draw();
    expect(() => market.assertSettlementRecord({ fixtureId: 42, action: "game_finalised", statusId: 100, period: 100 })).not.toThrow();
    expect(() => market.assertSettlementRecord({ fixtureId: 42, action: "game_finalised", statusId: 100 })).not.toThrow();
    throwsCode(() => market.assertSettlementRecord({ fixtureId: 42, action: "game_finalised", statusId: 100, period: 99 }), "MARKET_NOT_FINAL");
    throwsCode(() => market.assertSettlementRecord({ fixtureId: 41, action: "game_finalised", statusId: 100, period: 100 }), "MARKET_FIXTURE_MISMATCH");
    throwsCode(() => markets.finalResult(0).homeWin(), "MARKET_FIXTURE_INVALID");
  });

  test("combines only disjoint same-fixture legs and remaps positions", () => {
    const result = markets.finalResult(42).homeWin();
    const cards = marketStrategy(42, "Home more yellow cards", strategy()
      .stat("homeYellow", soccerStatKey("participant1YellowCards"))
      .stat("awayYellow", soccerStatKey("participant2YellowCards"))
      .binary("homeYellow", "awayYellow", op.subtract, gt(0))
      .compile());
    const parlay = markets.parlay([result, cards]);
    expect(parlay.statKeys).toEqual([1, 2, 3, 4]);
    expect(parlay.strategy.discretePredicates[1]).toMatchObject({ binary: { indexA: 2, indexB: 3 } });
    expect(parlay.label).toContain("Home win + Home more yellow cards");
    throwsCode(() => markets.parlay([]), "PARLAY_EMPTY");
    throwsCode(() => markets.parlay([result, markets.finalResult(43).draw()]), "PARLAY_CROSS_FIXTURE_UNSUPPORTED");
    throwsCode(() => markets.parlay([result, markets.overUnder(42, "totalGoals", 2.5).over()]), "PARLAY_OVERLAPPING_STATS");
  });
});
