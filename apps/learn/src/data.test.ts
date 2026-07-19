import { describe, expect, it } from "vitest";
import { dataMode, replayFixtures, settlementSteps } from "./data";

describe("public learning data", () => {
  it("parses three fixtures, each honestly labeled real or synthetic", () => {
    expect(replayFixtures).toHaveLength(3);
    expect(["real", "mixed", "synthetic"]).toContain(dataMode);

    for (const fixture of replayFixtures) {
      expect(fixture.events.length).toBeGreaterThan(0);
      expect(fixture.events.every(({ checksum }) => /^[a-f0-9]{64}$/.test(checksum))).toBe(true);

      if (fixture.source) {
        // Real capture excerpt: fixture 18257739, no fabricated score (pre-match capture).
        expect(fixture.fixtureId).toBe(18257739);
        expect(fixture.title).toContain("Spain");
        expect(fixture.title).toContain("Argentina");
        expect(fixture.source).toContain("REAL TxLINE capture");
        expect(fixture.events[0]!.channel).toBe("snapshot");
        expect(fixture.result).toBeUndefined();
        expect(fixture.events.every(({ score }) => score === undefined)).toBe(true);
        // Every odds summary must self-label its real MarketPeriod (1st half vs.
        // full time) so a first-half price is never mistaken for a full-time one.
        for (const event of fixture.events) {
          if (event.channel !== "odds") continue;
          expect(event.summary).toMatch(/\((1st half|full time)\)$/);
        }
      } else {
        // Synthetic fixture: committed deterministic demo data, original identity.
        expect([42, 43, 44]).toContain(fixture.fixtureId);
        expect(fixture.result).toBeDefined();
      }
    }
  });

  it("uses full-time-only 1X2 prices for the real match-result recording, when present", () => {
    const matchResult = replayFixtures.find((f) => f.title.includes("Match odds"));
    if (!matchResult?.source) return; // synthetic fallback for this slot — nothing to assert
    const oddsEvents = matchResult.events.filter((e) => e.channel === "odds");
    expect(oddsEvents.length).toBeGreaterThan(0);
    expect(oddsEvents.every((e) => e.summary.endsWith("(full time)"))).toBe(true);
    expect(oddsEvents.some((e) => e.summary.endsWith("(1st half)"))).toBe(false);
  });

  it("contains a complete public mainnet settlement receipt", () => {
    expect(settlementSteps.map(({ label }) => label)).toEqual([
      "Market initialized",
      "Home entered",
      "Away entered",
      "TxLINE proved away",
      "Winner claimed",
      "Accounts reclaimed",
    ]);
    expect(settlementSteps.every(({ signature }) => signature.length >= 87)).toBe(true);
  });
});
