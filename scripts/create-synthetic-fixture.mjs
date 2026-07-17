import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const directory = resolve(process.argv[2] ?? "fixtures/synthetic");
const hash = (body) => createHash("sha256").update(body).digest("hex");
const zero = Array(32).fill(0);
const proof = (fixtureId, seq, home, away) => JSON.stringify({
  ts: 1000 + seq * 100,
  summary: { fixtureId, updateStats: { updateCount: seq, minTimestamp: 1000 + seq * 100, maxTimestamp: 1000 + seq * 100 }, eventStatsSubTreeRoot: zero },
  subTreeProof: [], mainTreeProof: [], eventStatRoot: zero,
  statsToProve: [{ key: 1, value: home, period: 0 }, { key: 2, value: away, period: 0 }],
  statProofs: [[], []],
});
await mkdir(directory, { recursive: true });
for (const fixture of [{ fixtureId: 42, home: 1, away: 0 }, { fixtureId: 43, home: 2, away: 2 }, { fixtureId: 44, home: 0, away: 2 }]) {
  const { fixtureId, home, away } = fixture;
  const score = { Participant1: home, Participant2: away };
  const source = [
    { at: 1000, channel: "sse", request: "GET /api/scores/stream status=200", body: `data: ${JSON.stringify({ FixtureId: fixtureId, Seq: 1, Action: "kickoff", StatusId: 1 })}` },
    { at: 1100, channel: "snapshot", request: `GET /api/scores/snapshot/${fixtureId} status=200`, body: JSON.stringify([{ FixtureId: fixtureId, Seq: 1, Action: "kickoff", StatusId: 1 }]) },
    { at: 1200, channel: "sse", request: "GET /api/scores/stream status=200", body: `data: ${JSON.stringify({ FixtureId: fixtureId, Seq: 2, Action: "goal", StatusId: 4, Score: score })}` },
    { at: 1300, channel: "proof", request: `GET /api/scores/stat-validation?fixtureId=${fixtureId}&seq=2&statKeys=1,2 status=200`, body: proof(fixtureId, 2, home, away) },
    { at: 1400, channel: "odds", request: "GET /api/odds/stream status=200", body: JSON.stringify({ FixtureId: fixtureId, MessageId: `o${fixtureId}`, Prices: [1500, 2400] }) },
    { at: 1500, channel: "sse", request: "GET /api/scores/stream status=200", body: `data: ${JSON.stringify({ FixtureId: fixtureId, Seq: 3, Action: "game_finalised", StatusId: 100, Score: score })}` },
    { at: 1600, channel: "proof", request: `GET /api/scores/stat-validation?fixtureId=${fixtureId}&seq=3&statKeys=1,2 status=200`, body: proof(fixtureId, 3, home, away) },
  ];
  const recordingId = `00000000-0000-4000-8000-${String(fixtureId).padStart(12, "0")}`;
  const header = { kind: "txline.recording", version: 1, recordingId, createdAt: 1000, network: "mainnet", fixtures: [fixtureId], statKeys: [1, 2], source: { format: "txline-capture-ndjson", version: 1 } };
  const records = source.map((item, index) => ({ kind: "txline.record", recordId: index + 1, at: item.at, fixtureId, channel: item.channel, request: { description: item.request }, body: item.body, bodySha256: hash(item.body) }));
  const out = resolve(directory, `match-${fixtureId}.trec`);
  await writeFile(out, `${[header, ...records].map(JSON.stringify).join("\n")}\n`);
  console.log(out);
}
