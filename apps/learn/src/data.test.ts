import { describe, expect, it } from "vitest";
import { replayFixtures, settlementSteps } from "./data";

describe("public learning data", () => {
  it("parses three deterministic synthetic recordings", () => {
    expect(replayFixtures).toHaveLength(3);
    for (const fixture of replayFixtures) {
      expect(fixture.events).toHaveLength(7);
      expect(fixture.events.map(({ recordId }) => recordId)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(fixture.events.at(-1)?.channel).toBe("proof");
      expect(fixture.events.some(({ action }) => action === "game_finalised")).toBe(true);
      expect(fixture.events.every(({ checksum }) => /^[a-f0-9]{64}$/.test(checksum))).toBe(true);
    }
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
