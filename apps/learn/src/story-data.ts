// Real, live-captured World Cup Final 2026 data for the /story submission page.
//
// Every number in this module is derived from a real TxLINE free-guest-feed
// capture of fixture 18257739 (Spain v Argentina), taken while the match was
// actually being played. It is a frozen snapshot as of the timestamp below,
// not a live feed — the capture kept growing after this page was built, so
// the numbers here are the honest state of the match at build time, not the
// final result.
//
// Each real match event (a shot, corner, card, or substitution) is delivered
// by the upstream feed multiple times in quick succession as it gets
// confirmed (same event `Id`, different sequence numbers, ~1-3s apart). The
// counts below are DISTINCT event counts (deduplicated by the feed's own
// event `Id`), not raw stream-record counts, so they describe real match
// events, not feed chatter. `rawNonHeartbeatRecords` below reports the raw
// figure separately for transparency.

export const captureMeta = {
  fixtureId: 18257739,
  home: "Spain",
  away: "Argentina",
  competition: "World Cup Final 2026",
  /** Wall-clock time this snapshot was frozen, from the capture recorder's own timestamp. */
  asOfEt: "2026-07-19 17:00:51 ET",
  /** Total lines (incl. heartbeats, all fixtures) in the growing capture file at snapshot time. */
  rawCaptureFileLines: 5572,
  /** Non-heartbeat records for this fixture at snapshot time -- the raw feed-chatter figure. */
  rawNonHeartbeatRecords: 826,
  /** Match clock at snapshot time. */
  clockMMSS: "83:26",
  /** 2 = first half in progress, 3 = halftime, 4 = second half in progress (from the feed's own StatusId). */
  statusId: 4,
  /** No "Goals" key has ever appeared in a Score record for this fixture in the capture -- still scoreless. */
  scoreline: "0–0" as const,
};

export interface TimelineEvent {
  action: "kickoff_team" | "kickoff" | "shot" | "corner" | "yellow_card" | "substitution" | "halftime_finalised";
  /** 1 = Spain, 2 = Argentina, null = not team-attributed (e.g. kickoff). */
  participant: 1 | 2 | null;
  clockSeconds: number | null;
  clockMMSS: string | null;
  statusId: number;
}

// Deduplicated by the feed's own event `Id` (first-seen occurrence kept).
// Source: scores-stream.jsonl, fixture 18257739, non-heartbeat records.
export const timeline: TimelineEvent[] = [
  { action: "kickoff_team", participant: 2, clockSeconds: 0, clockMMSS: "0:00", statusId: 1 },
  { action: "kickoff", participant: null, clockSeconds: 0, clockMMSS: "0:00", statusId: 2 },
  { action: "shot", participant: 1, clockSeconds: 257, clockMMSS: "4:17", statusId: 2 },
  { action: "corner", participant: 1, clockSeconds: 682, clockMMSS: "11:22", statusId: 2 },
  { action: "corner", participant: 1, clockSeconds: 1367, clockMMSS: "22:47", statusId: 2 },
  { action: "shot", participant: 1, clockSeconds: 2312, clockMMSS: "38:32", statusId: 2 },
  { action: "yellow_card", participant: 2, clockSeconds: 2408, clockMMSS: "40:08", statusId: 2 },
  { action: "shot", participant: 1, clockSeconds: 2554, clockMMSS: "42:34", statusId: 2 },
  { action: "substitution", participant: 2, clockSeconds: 2609, clockMMSS: "43:29", statusId: 2 },
  { action: "halftime_finalised", participant: null, clockSeconds: 2700, clockMMSS: "45:00", statusId: 3 },
  { action: "substitution", participant: 2, clockSeconds: 2700, clockMMSS: "45:00", statusId: 3 },
  { action: "kickoff", participant: null, clockSeconds: 2700, clockMMSS: "45:00", statusId: 4 },
  { action: "shot", participant: 1, clockSeconds: 2744, clockMMSS: "45:44", statusId: 4 },
  { action: "corner", participant: 2, clockSeconds: 2824, clockMMSS: "47:04", statusId: 4 },
  { action: "yellow_card", participant: 2, clockSeconds: 3078, clockMMSS: "51:18", statusId: 4 },
  { action: "corner", participant: 1, clockSeconds: 3347, clockMMSS: "55:47", statusId: 4 },
  { action: "substitution", participant: 2, clockSeconds: 3425, clockMMSS: "57:05", statusId: 4 },
  { action: "shot", participant: 1, clockSeconds: 3638, clockMMSS: "60:38", statusId: 4 },
  { action: "substitution", participant: 1, clockSeconds: 3655, clockMMSS: "60:55", statusId: 4 },
  { action: "substitution", participant: 1, clockSeconds: 3675, clockMMSS: "61:15", statusId: 4 },
  { action: "shot", participant: 1, clockSeconds: 3806, clockMMSS: "63:26", statusId: 4 },
  { action: "corner", participant: 1, clockSeconds: 3808, clockMMSS: "63:28", statusId: 4 },
  { action: "corner", participant: 1, clockSeconds: 3869, clockMMSS: "64:29", statusId: 4 },
  { action: "corner", participant: 1, clockSeconds: 3942, clockMMSS: "65:42", statusId: 4 },
  { action: "shot", participant: 1, clockSeconds: 3982, clockMMSS: "66:22", statusId: 4 },
  { action: "substitution", participant: 2, clockSeconds: 4185, clockMMSS: "69:45", statusId: 4 },
  { action: "substitution", participant: 2, clockSeconds: 4196, clockMMSS: "69:56", statusId: 4 },
  { action: "shot", participant: 1, clockSeconds: 4421, clockMMSS: "73:41", statusId: 4 },
  { action: "substitution", participant: 1, clockSeconds: 4469, clockMMSS: "74:29", statusId: 4 },
  { action: "substitution", participant: 1, clockSeconds: 4484, clockMMSS: "74:44", statusId: 4 },
  { action: "shot", participant: 1, clockSeconds: 4572, clockMMSS: "76:12", statusId: 4 },
  { action: "shot", participant: 1, clockSeconds: 4611, clockMMSS: "76:51", statusId: 4 },
  { action: "shot", participant: 1, clockSeconds: 4615, clockMMSS: "76:55", statusId: 4 },
  { action: "corner", participant: 1, clockSeconds: 4622, clockMMSS: "77:02", statusId: 4 },
  { action: "corner", participant: 1, clockSeconds: 4794, clockMMSS: "79:54", statusId: 4 },
  { action: "shot", participant: 1, clockSeconds: 4827, clockMMSS: "80:27", statusId: 4 },
  { action: "yellow_card", participant: 2, clockSeconds: 4918, clockMMSS: "81:58", statusId: 4 },
];

export const matchStats = {
  shots: { home: 12, away: 0 },
  corners: { home: 8, away: 1 },
  yellowCards: { home: 0, away: 3 },
  substitutions: { home: 4, away: 5 },
};

/**
 * "Possession-state feed ticks" -- how many times the live feed reported each
 * team as the participant of a possession-type action (safe / attack /
 * danger / high-danger / neutral possession). This is a real, traceable
 * count of feed ticks, not an official time-weighted possession percentage
 * -- labeled as such wherever it's shown.
 * Source: scores-stream.jsonl, Action in {safe_possession, attack_possession,
 * possession, danger_possession, high_danger_possession}, tallied by Participant.
 */
export const possessionTicks = {
  home: 109 + 113 + 46 + 48 + 33, // safe, attack, neutral, danger, high-danger
  away: 116 + 54 + 46 + 11 + 2,
};

export interface OddsPoint {
  ts: number;
  home: number;
  draw: number;
  away: number;
}

// Real full-time 1X2 match-odds series (TXLineStablePriceDemargined), sampled
// evenly across the captured window. Decimal odds, decoded from the wire's
// milli-odds scaling. Source: odds-stream.jsonl, SuperOddsType
// "1X2_PARTICIPANT_RESULT", MarketPeriod null (full time only).
export const oddsSeries: OddsPoint[] = [
  { ts: 1784447872551, home: 2.374, draw: 3.168, away: 3.801 },
  { ts: 1784450644900, home: 2.387, draw: 3.165, away: 3.771 },
  { ts: 1784455343060, home: 2.371, draw: 3.151, away: 3.834 },
  { ts: 1784458095284, home: 2.374, draw: 3.157, away: 3.817 },
  { ts: 1784459966848, home: 2.377, draw: 3.155, away: 3.811 },
  { ts: 1784462273326, home: 2.393, draw: 3.174, away: 3.745 },
  { ts: 1784464117626, home: 2.399, draw: 3.172, away: 3.733 },
  { ts: 1784467054813, home: 2.381, draw: 3.179, away: 3.768 },
  { ts: 1784473339561, home: 2.377, draw: 3.183, away: 3.771 },
  { ts: 1784480024818, home: 2.38, draw: 3.193, away: 3.751 },
  { ts: 1784483199028, home: 2.377, draw: 3.207, away: 3.737 },
  { ts: 1784485367243, home: 2.369, draw: 3.202, away: 3.766 },
  { ts: 1784487194796, home: 2.357, draw: 3.208, away: 3.789 },
  { ts: 1784487844950, home: 2.347, draw: 3.192, away: 3.836 },
  { ts: 1784488091233, home: 2.32, draw: 3.173, away: 3.941 },
  { ts: 1784488228983, home: 2.348, draw: 3.158, away: 3.884 },
  { ts: 1784488367810, home: 2.245, draw: 3.176, away: 4.172 },
  { ts: 1784488528452, home: 2.229, draw: 3.191, away: 4.203 },
  { ts: 1784488702522, home: 2.247, draw: 3.158, away: 4.196 },
  { ts: 1784488876614, home: 2.226, draw: 3.127, away: 4.329 },
  { ts: 1784489040201, home: 2.239, draw: 3.087, away: 4.357 },
  { ts: 1784489235321, home: 2.274, draw: 3.038, away: 4.328 },
  { ts: 1784489356490, home: 2.323, draw: 2.974, away: 4.287 },
  { ts: 1784489528042, home: 2.371, draw: 2.995, away: 4.091 },
  { ts: 1784489755550, home: 2.39, draw: 2.903, away: 4.217 },
  { ts: 1784489949749, home: 2.426, draw: 2.86, away: 4.201 },
  { ts: 1784490109718, home: 2.48, draw: 2.787, away: 4.202 },
  { ts: 1784490275895, home: 2.471, draw: 2.76, away: 4.293 },
  { ts: 1784490485398, home: 2.469, draw: 2.695, away: 4.466 },
  { ts: 1784490668294, home: 2.481, draw: 2.643, away: 4.578 },
  { ts: 1784490881245, home: 2.519, draw: 2.577, away: 4.652 },
  { ts: 1784491435901, home: 2.557, draw: 2.517, away: 4.727 },
  { ts: 1784492357791, home: 2.546, draw: 2.56, away: 4.617 },
  { ts: 1784492678686, home: 2.605, draw: 2.528, away: 4.533 },
  { ts: 1784492841444, home: 2.656, draw: 2.459, away: 4.614 },
  { ts: 1784493016661, home: 2.76, draw: 2.348, away: 4.723 },
  { ts: 1784493144549, home: 2.807, draw: 2.252, away: 5.005 },
  { ts: 1784493294172, home: 2.788, draw: 2.201, away: 5.351 },
  { ts: 1784493439207, home: 2.759, draw: 2.158, away: 5.746 },
  { ts: 1784493565784, home: 2.824, draw: 2.09, away: 5.974 },
  { ts: 1784493720979, home: 2.808, draw: 2.041, away: 6.49 },
  { ts: 1784493870104, home: 2.902, draw: 1.97, away: 6.765 },
  { ts: 1784494049031, home: 2.992, draw: 1.914, away: 6.974 },
  { ts: 1784494183075, home: 3.055, draw: 1.908, away: 6.73 },
  { ts: 1784494318179, home: 3.067, draw: 1.88, away: 7.041 },
  { ts: 1784494407961, home: 3.17, draw: 1.804, away: 7.688 },
  { ts: 1784494545329, home: 3.218, draw: 1.754, away: 8.405 },
  { ts: 1784494679984, home: 3.362, draw: 1.681, away: 9.288 },
  { ts: 1784494794363, home: 3.545, draw: 1.62, away: 9.924 },
  { ts: 1784494854457, home: 3.697, draw: 1.59, away: 9.924 },
];

export const oddsMeta = {
  totalRealPricePoints: 4023,
};

// Verbatim from CHANGELOG.md's "Unreleased (0.2.0)" section on the v0.2 review
// stack (branch wi-8-docs-and-skill, tip of the stacked PRs). Not merged to
// main/v0.2 as of this snapshot -- presented here as "in review," never as
// "released."
export const releaseNote = {
  heading: "v0.2.0 -- in review, not yet released",
  stackSize: 8,
  // Counted directly from the top-level `it(`/`test(` calls across the
  // stack's *.test.ts files (12 files) at review time.
  testCaseCount: 101,
  testFileCount: 12,
  highlights: [
    "Proof lifecycle attestations (observed -> canonical -> verified -> quarantined) with a pre-proof content hash sealing never recomputes.",
    "A canonical journal with deterministic record identities, exact-duplicate dedupe, and conflict detection for diverging payloads under one identity.",
    "A local Merkle tree builder (buildMerkleTree/hashLeaf) with per-leaf proof extraction and known-good/known-bad test vectors.",
    "impliedProbabilities() -- converts canonical odds into a normalized home/draw/away probability triple, raising a typed error instead of guessing.",
    "Namespace-generic root PDAs and an opt-in strict timestamp-unit check -- the v0.1.0 default (strict: false) is kept byte-for-byte.",
    "Bounded-retry proof availability -- keeper.prepare/watchAndSettle keep v0.1.0's single-attempt, fail-fast default unless you opt in.",
  ],
};
