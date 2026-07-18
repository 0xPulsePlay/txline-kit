import match42 from "../../../fixtures/synthetic/match-42.trec?raw";
import match43 from "../../../fixtures/synthetic/match-43.trec?raw";
import match44 from "../../../fixtures/synthetic/match-44.trec?raw";

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
  accent: string;
  events: ReplayEvent[];
  result: [number, number];
}

function decodeBody(body: string): Record<string, unknown> {
  const source = body.startsWith("data: ") ? body.slice(6) : body;
  try {
    const parsed = JSON.parse(source) as unknown;
    return Array.isArray(parsed) ? (parsed[0] as Record<string, unknown> ?? {}) : parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseRecording(raw: string, title: string, accent: string): ReplayFixture {
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
  return { fixtureId: header.fixtures[0]!, title, accent, events, result };
}

export const replayFixtures = [
  parseRecording(match42, "Northstar v Meridian", "cyan"),
  parseRecording(match43, "Helix v Juniper", "gold"),
  parseRecording(match44, "Orchid v Vector", "violet"),
];

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
