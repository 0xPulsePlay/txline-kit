import syntheticMatch42 from "../../../fixtures/synthetic/match-42.trec?raw";
import syntheticMatch43 from "../../../fixtures/synthetic/match-43.trec?raw";
import syntheticMatch44 from "../../../fixtures/synthetic/match-44.trec?raw";

// fixtures/real/*.trec holds TxLINE guest-feed capture excerpts. Only one
// sample (match-result.trec) is committed to the public repo — the other two
// are local-only (see fixtures/real/.gitignore and fixtures/real/README.md).
// This glob picks up whichever real files actually exist on disk; each demo
// slot below falls back to its own committed synthetic fixture when its real
// file is absent. Either way, every card labels which one it is showing —
// see `copy`, and per-fixture `source`.
const realRaw = import.meta.glob("../../../fixtures/real/*.trec", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function findReal(fileName: string): string | undefined {
  const entry = Object.entries(realRaw).find(([path]) => path.endsWith(`/${fileName}`));
  return entry?.[1];
}

const realMatchResult = findReal("match-result.trec");
const realGoalsOverUnder = findReal("goals-overunder.trec");
const realAsianHandicap = findReal("asian-handicap.trec");

export type Channel = "sse" | "snapshot" | "odds" | "proof" | "updates" | "historical" | "root";

export interface ReplayEvent {
  recordId: number;
  at: number;
  channel: Channel;
  action: string;
  sequence: number | undefined;
  score: [number, number] | undefined;
  summary: string;
  checksum: string;
}

export interface ReplayFixture {
  fixtureId: number;
  title: string;
  home: string;
  away: string;
  accent: string;
  events: ReplayEvent[];
  /** Final [home, away] score, or undefined when no score event was captured (pre-match). */
  result: [number, number] | undefined;
  /** Provenance label shown to readers so real vs. synthetic data is never ambiguous. Real-mode only. */
  source: string | undefined;
}

// Every real recording is downsampled straight from a real TxLINE
// free-guest-feed capture taken live before kickoff. Team names are never
// hardcoded here — they're read from each recording's own real snapshot
// record, so no real-world team name can appear in the bundle unless a real
// .trec file that actually names that team was present at build time.
const REAL_SOURCE = "REAL TxLINE capture — World Cup Final 2026, recorded live 2026-07-19 (pre-match)";

function decodeBody(body: string): Record<string, unknown> {
  const source = body.startsWith("data: ") ? body.slice(6) : body;
  try {
    const parsed = JSON.parse(source) as unknown;
    return Array.isArray(parsed) ? (parsed[0] as Record<string, unknown> ?? {}) : parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function participantLabel(name: string, home: string, away: string): string {
  if (name === "part1") return home;
  if (name === "part2") return away;
  return name;
}

/** Milli-odds (as sent on the wire) -> readable decimal odds, e.g. 2137 -> "2.137". */
function decimalOdds(milliOdds: number): string {
  return (milliOdds / 1000).toFixed(3);
}

/**
 * TxLINE prices the same market separately per period (full time vs. first
 * half), and those prices are not comparable — e.g. a draw is far more
 * likely at full time than at half time. Every summary must therefore carry
 * its own real MarketPeriod so a first-half price is never mistaken for a
 * full-time one.
 */
function periodLabel(body: Record<string, unknown>): string {
  const period = body.MarketPeriod as string | null | undefined;
  return period === "half=1" ? " (1st half)" : " (full time)";
}

function describeOdds(body: Record<string, unknown>, home: string, away: string): string {
  const type = body.SuperOddsType as string | undefined;
  const names = (body.PriceNames as string[] | undefined) ?? [];
  const prices = (body.Prices as number[] | undefined) ?? [];
  const marketParameters = body.MarketParameters as string | null | undefined;
  const line = typeof marketParameters === "string" ? marketParameters.match(/line=(-?[\d.]+)/)?.[1] : undefined;
  const labelled = names.map((name, index) => `${participantLabel(name, home, away)} ${decimalOdds(prices[index] ?? 0)}`).join(" / ");
  const period = periodLabel(body);
  if (type === "OVERUNDER_PARTICIPANT_GOALS") return `over/under ${line ?? "?"} → ${labelled}${period}`;
  if (type === "ASIANHANDICAP_PARTICIPANT_GOALS") return `handicap ${line ?? "?"} → ${labelled}${period}`;
  if (type === "1X2_PARTICIPANT_RESULT") return `match odds → ${labelled}${period}`;
  return `${type ?? "odds update"} → ${labelled}${period}`;
}

function describeSnapshot(body: Record<string, unknown>, home: string, away: string): string {
  const competition = String(body.Competition ?? "fixture");
  return `Fixture snapshot — ${competition}: ${home} v ${away}`;
}

/** Parses a real captured recording: team names are read from the recording's
 * own snapshot record (never hardcoded), milli-odds decoded, MarketPeriod
 * always labelled, and no score is ever fabricated (pre-match capture has
 * none). */
function parseRealRecording(raw: string, marketLabel: string, accent: string): ReplayFixture {
  const [headerLine, ...recordLines] = raw.trim().split("\n");
  const header = JSON.parse(headerLine!) as { fixtures: number[] };
  const rawRecords = recordLines.map(
    (line) => JSON.parse(line) as { recordId: number; at: number; channel: Channel; body: string; bodySha256: string },
  );

  const snapshotRecord = rawRecords.find((record) => record.channel === "snapshot");
  const snapshotBody = snapshotRecord ? decodeBody(snapshotRecord.body) : {};
  const home = String(snapshotBody.Participant1 ?? "Home");
  const away = String(snapshotBody.Participant2 ?? "Away");
  const title = `${home} v ${away} — ${marketLabel}`;

  const events = rawRecords.map((record) => {
    const body = decodeBody(record.body);
    const score = body.Score as { Participant1?: number; Participant2?: number } | undefined;
    const values = body.statsToProve as Array<{ value?: number }> | undefined;
    const normalizedScore: [number, number] | undefined = score
      ? [Number(score.Participant1 ?? 0), Number(score.Participant2 ?? 0)]
      : values?.length ? [Number(values[0]?.value ?? 0), Number(values[1]?.value ?? 0)] : undefined;

    let action: string;
    let summary: string;
    if (record.channel === "odds") {
      action = "odds_update";
      summary = describeOdds(body, home, away);
    } else if (record.channel === "snapshot") {
      action = "snapshot";
      summary = describeSnapshot(body, home, away);
    } else if (record.channel === "proof") {
      action = "proof_bundle";
      summary = "Ordered stat proof captured";
    } else {
      action = String(body.Action ?? record.channel);
      summary = record.channel === "sse" ? "Live feed heartbeat" : action.replaceAll("_", " ");
    }

    return {
      recordId: record.recordId,
      at: record.at,
      channel: record.channel,
      action,
      sequence: body.Seq == null ? undefined : Number(body.Seq),
      score: normalizedScore,
      summary,
      checksum: record.bodySha256,
    } satisfies ReplayEvent;
  });
  const result = [...events].reverse().find((event) => event.score)?.score;
  return {
    fixtureId: header.fixtures[0]!,
    title,
    home,
    away,
    accent,
    events,
    result,
    source: REAL_SOURCE,
  };
}

/** Parses a committed synthetic recording — unchanged from the original public demo. */
function parseSyntheticRecording(raw: string, title: string, accent: string): ReplayFixture {
  const [headerLine, ...recordLines] = raw.trim().split("\n");
  const header = JSON.parse(headerLine!) as { fixtures: number[] };
  const events = recordLines.map((line) => {
    const record = JSON.parse(line) as { recordId: number; at: number; channel: Channel; body: string; bodySha256: string };
    const body = decodeBody(record.body);
    const score = body.Score as { Participant1?: number; Participant2?: number } | undefined;
    const action = String(body.Action ?? (record.channel === "proof" ? "proof_bundle" : record.channel));
    const values = body.statsToProve as Array<{ value?: number }> | undefined;
    const normalizedScore: [number, number] | undefined = score
      ? [Number(score.Participant1 ?? 0), Number(score.Participant2 ?? 0)]
      : values?.length ? [Number(values[0]?.value ?? 0), Number(values[1]?.value ?? 0)] : undefined;
    return {
      recordId: record.recordId,
      at: record.at,
      channel: record.channel,
      action,
      sequence: body.Seq == null ? undefined : Number(body.Seq),
      score: normalizedScore,
      summary: record.channel === "proof" ? "Ordered stat proof captured" : action.replaceAll("_", " "),
      checksum: record.bodySha256,
    } satisfies ReplayEvent;
  });
  const result = [...events].reverse().find((event) => event.score)?.score ?? [0, 0];
  const [home, away] = title.split(" v ");
  return {
    fixtureId: header.fixtures[0]!,
    title,
    home: home ?? title,
    away: away ?? title,
    accent,
    events,
    result,
    source: undefined,
  };
}

// Each demo slot falls back independently: real capture excerpt if its .trec
// file is present on disk, else the slot's own committed synthetic fixture
// (original title/accent). This keeps every card honestly labeled no matter
// how many real files happen to be available.
export const replayFixtures: ReplayFixture[] = [
  realMatchResult
    ? parseRealRecording(realMatchResult, "Match odds (1X2)", "cyan")
    : parseSyntheticRecording(syntheticMatch42, "Northstar v Meridian", "cyan"),
  realGoalsOverUnder
    ? parseRealRecording(realGoalsOverUnder, "Goals over/under", "gold")
    : parseSyntheticRecording(syntheticMatch43, "Helix v Juniper", "gold"),
  realAsianHandicap
    ? parseRealRecording(realAsianHandicap, "Asian handicap", "violet")
    : parseSyntheticRecording(syntheticMatch44, "Orchid v Vector", "violet"),
];

const realCount = replayFixtures.filter((fixture) => fixture.source).length;

export type DataMode = "real" | "mixed" | "synthetic";

export const dataMode: DataMode = realCount === 3 ? "real" : realCount === 0 ? "synthetic" : "mixed";

function countWord(n: number): string {
  return n === 1 ? "one" : n === 2 ? "two" : String(n);
}

/** All user-visible mode claims live here so real vs. synthetic can never be mislabeled. */
export const copy =
  dataMode === "real"
    ? {
        networkBadge: "MAINNET PROOF · REAL TXLINE CAPTURE",
        fixtureEyebrow: "Real, by capture",
        fixtureHeadingLine1: "Three real market views.",
        fixtureHeadingLine2: "Recorded live from TxLINE's free guest feed — World Cup Final 2026.",
        fixtureAriaLabel: "Real fixture library",
      }
    : dataMode === "synthetic"
      ? {
          networkBadge: "MAINNET PROOF · PUBLIC SYNTHETIC DATA",
          fixtureEyebrow: "Public by construction",
          fixtureHeadingLine1: "Three synthetic matches.",
          fixtureHeadingLine2: "Zero restricted feed data.",
          fixtureAriaLabel: "Synthetic fixture library",
        }
      : {
          networkBadge: "MAINNET PROOF · REAL SAMPLE + SYNTHETIC",
          fixtureEyebrow: "Real sample, synthetic rest",
          fixtureHeadingLine1: `${countWord(realCount).replace(/^\w/, (c) => c.toUpperCase())} real capture sample${realCount > 1 ? "s" : ""} + ${countWord(3 - realCount)} synthetic match${3 - realCount > 1 ? "es" : ""}.`,
          fixtureHeadingLine2: "Recorded live from TxLINE's free guest feed — World Cup Final 2026; the rest use the repo's public synthetic fixtures.",
          fixtureAriaLabel: "Mixed real/synthetic fixture library",
        };

export const settlementSteps = [
  { label: "Market initialized", signature: "u5DEEjmykDRvWVSxuf2m9ktpC6n3Y9aGYiUBGvRW1XSnJkqS4WXN5TJBNMjifnTgM624XTQmQp4pA7At8faEUUC", detail: "Immutable fixture and time gates" },
  { label: "Home entered", signature: "4XNyk8bDK3NbuHRYLRaVCgCZvKajJAZrjTMCGdstFKPJgEG1AzELYD2hwdNuzV1z59cwYHioPjwNDwAjVvJrBuAu", detail: "1,000 valueless units" },
  { label: "Away entered", signature: "zVF3w6KdVbBRWwV5tgyXi85X9ZRaPPhf29tueuRRFaJtqwxnuUUqJTsLqhhYnaiH1BTzozcmkfM6XKhPDo7nMTe", detail: "1,000 valueless units" },
  { label: "TxLINE proved away", signature: "52kbagjiugz6bL7TPwRZmHYGpGPoLBycpoZQH9uSyqkyMaNb7E1hhuamt72Bfg2obaq2vLxngBQZvRzbJ5Rd5kok", detail: "Live CPI returned exact true" },
  { label: "Winner claimed", signature: "5qD5LaKjveKwxJpvtMfz3qxkdDSgoUz2NXfUTukkUWFSZoqSY5f3CfggVrHsxZsnVg55XUwJfrxy7ZMhWfPYXpJt", detail: "2,000 units paid" },
  { label: "Accounts reclaimed", signature: "2mPAhTuruGLbjihsvxXgXZd6Pisb2Nb9kYA3efxybR8Uc7yDicjLxjYcYLPR8yqK9dWGcTUvA8Ec4FHe91BeC5Ad", detail: "Empty vault and market closed" },
];

export const modules = [
  { name: "core", role: "One network-safe client", tone: "cyan" },
  { name: "auth", role: "Guest → subscribe → activate", tone: "gold" },
  { name: "data", role: "Normalize feeds and finality", tone: "violet" },
  { name: "proofs", role: "Decode ordered proof bundles", tone: "cyan" },
  { name: "strategy", role: "Compile total-coverage predicates", tone: "gold" },
  { name: "onchain", role: "Local, view, or instruction", tone: "violet" },
  { name: "replay", role: "Deterministic virtual match clock", tone: "cyan" },
  { name: "keeper", role: "Bounded settlement workflow", tone: "gold" },
  { name: "txline-cpi", role: "Return-safe Anchor CPI", tone: "violet" },
];
