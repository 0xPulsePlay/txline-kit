#!/usr/bin/env node
// Builds real .trec replay recordings from a real recorded TxLINE free-guest-feed
// capture (odds-stream + fixtures-snapshot polls). No synthetic values are
// introduced: every record's body is either a verbatim JSON-stringified copy of
// a `parsed` odds message from the odds stream, a verbatim fixture-snapshot
// entry, or a verbatim heartbeat payload, all sourced from the capture files
// passed on the command line. Timestamps (`at`) are always the real
// `recordedAt` value from the source line.
//
// Usage:
//   node scripts/build-real-fixtures.mjs <odds-stream.jsonl> <snapshots.jsonl> <scores-stream.jsonl> <outDir> [fixtureId]
//
// scores-stream.jsonl is accepted for completeness (it is a valid heartbeat
// source) but is not required: odds-stream.jsonl already carries its own
// heartbeats, which is what this script uses by default.

import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";

const [, , oddsPath, snapshotsPath, , outDirArg, fixtureIdArg] = process.argv;
if (!oddsPath || !snapshotsPath || !outDirArg) {
  console.error(
    "usage: build-real-fixtures.mjs <odds-stream.jsonl> <snapshots.jsonl> <scores-stream.jsonl> <outDir> [fixtureId]",
  );
  process.exit(1);
}
const FIXTURE_ID = Number(fixtureIdArg ?? 18257739);
const OUT_DIR = outDirArg;
mkdirSync(OUT_DIR, { recursive: true });

async function readJsonl(path) {
  const rows = [];
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // skip malformed line
    }
  }
  return rows;
}

function sha256(body) {
  return createHash("sha256").update(body).digest("hex");
}

function evenIndices(length, count) {
  if (length <= count) return Array.from({ length }, (_, i) => i);
  const step = (length - 1) / (count - 1);
  const seen = new Set();
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const idx = Math.round(i * step);
    if (!seen.has(idx)) {
      seen.add(idx);
      out.push(idx);
    }
  }
  return out;
}

function buildRecording({ recordingLabel, snapshotEntry, snapshotAt, oddsRows, heartbeatRows, heartbeatCount }) {
  const events = [];

  // 1. snapshot record — real fixture metadata (Participant names, competition, kickoff)
  events.push({
    channel: "snapshot",
    at: snapshotAt,
    request: { description: "GET /api/fixtures/snapshot status=200" },
    body: JSON.stringify(snapshotEntry),
  });

  // 2. downsampled real odds events for this market family
  for (const row of oddsRows) {
    events.push({
      channel: "odds",
      at: row.recordedAt,
      request: { description: "GET /api/odds/stream status=200" },
      body: JSON.stringify(row.parsed),
    });
  }

  // 3. a few real heartbeats sprinkled across the same window
  const hbIdx = evenIndices(heartbeatRows.length, heartbeatCount);
  for (const idx of hbIdx) {
    const row = heartbeatRows[idx];
    events.push({
      channel: "sse",
      at: row.recordedAt,
      request: { description: "GET /api/odds/stream status=200" },
      body: `data: ${JSON.stringify(row.parsed)}`,
    });
  }

  events.sort((a, b) => a.at - b.at);

  const records = events.map((event, index) => {
    const recordId = index + 1;
    return {
      kind: "txline.record",
      recordId,
      at: event.at,
      fixtureId: FIXTURE_ID,
      channel: event.channel,
      request: event.request,
      body: event.body,
      bodySha256: sha256(event.body),
    };
  });

  const header = {
    kind: "txline.recording",
    version: 1,
    recordingId: randomUUID(),
    createdAt: records[0].at,
    network: "mainnet",
    fixtures: [FIXTURE_ID],
    statKeys: [],
    source: {
      format: "txline-capture-real-ndjson",
      version: 1,
      note: `real recorded TxLINE free-guest-feed capture — ${recordingLabel}`,
    },
  };

  const lines = [JSON.stringify(header), ...records.map((r) => JSON.stringify(r))];
  return lines.join("\n") + "\n";
}

async function main() {
  const oddsAll = await readJsonl(oddsPath);
  const snapshotsAll = await readJsonl(snapshotsPath);

  const forFixture = oddsAll.filter((r) => r?.parsed?.FixtureId === FIXTURE_ID);
  const heartbeats = oddsAll
    .filter((r) => r?.event === "heartbeat" && r?.parsed?.Ts != null)
    .sort((a, b) => a.recordedAt - b.recordedAt);

  const byType = new Map();
  for (const row of forFixture) {
    const t = row.parsed.SuperOddsType;
    if (!t) continue;
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(row);
  }
  for (const rows of byType.values()) rows.sort((a, b) => a.recordedAt - b.recordedAt);

  console.log("SuperOddsType survey:");
  for (const [t, rows] of [...byType.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${rows.length}\t${t}`);
  }
  console.log(`  ${heartbeats.length}\theartbeats (no SuperOddsType)`);

  // Real fixture-snapshot entry for our fixture, earliest poll available.
  const snapshotPoll = snapshotsAll
    .filter((r) => r.path === "/fixtures/snapshot")
    .sort((a, b) => a.recordedAt - b.recordedAt)
    .find((r) => (r.data ?? []).some((e) => e.FixtureId === FIXTURE_ID));
  if (!snapshotPoll) throw new Error(`no /fixtures/snapshot poll contains FixtureId ${FIXTURE_ID}`);
  const snapshotEntry = snapshotPoll.data.find((e) => e.FixtureId === FIXTURE_ID);
  const snapshotAt = snapshotPoll.recordedAt;

  const plan = [
    // Full-time only: mixing in half=1 1X2 prices under a plain "match odds" label was
    // misleading (first-half draw odds read very differently from full-time draw odds).
    { type: "1X2_PARTICIPANT_RESULT", file: "match-result.trec", label: "match result (1X2), full time only", target: 90, periodFilter: (mp) => mp == null },
    { type: "OVERUNDER_PARTICIPANT_GOALS", file: "goals-overunder.trec", label: "goals over/under", target: 110, periodFilter: null },
    { type: "ASIANHANDICAP_PARTICIPANT_GOALS", file: "asian-handicap.trec", label: "Asian handicap (goals)", target: 100, periodFilter: null },
  ];

  for (const { type, file, label, target, periodFilter } of plan) {
    const allRows = byType.get(type) ?? [];
    if (allRows.length === 0) throw new Error(`no rows for SuperOddsType ${type}`);
    const rows = periodFilter ? allRows.filter((r) => periodFilter(r.parsed.MarketPeriod)) : allRows;
    if (rows.length === 0) throw new Error(`periodFilter left no rows for SuperOddsType ${type}`);
    if (periodFilter) {
      const kept = rows.length;
      const dropped = allRows.length - kept;
      console.log(`  ${type}: kept ${kept} full-time rows, dropped ${dropped} non-full-time rows`);
    }
    const idx = evenIndices(rows.length, target);
    const sampled = idx.map((i) => rows[i]);
    const text = buildRecording({
      recordingLabel: label,
      snapshotEntry,
      snapshotAt,
      oddsRows: sampled,
      heartbeatRows: heartbeats,
      heartbeatCount: 6,
    });
    const outPath = `${OUT_DIR}/${file}`;
    writeFileSync(outPath, text);
    const bytes = Buffer.byteLength(text);
    console.log(`wrote ${outPath} — ${sampled.length} odds + 1 snapshot + up to 6 heartbeat events, ${bytes} bytes`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
