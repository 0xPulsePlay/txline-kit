import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { z } from "zod";

export const TREC_VERSION = 1 as const;
export const DEFAULT_STAT_KEYS = [1, 2, 3001] as const;

export const trecHeaderSchema = z.object({
  kind: z.literal("txline.recording"),
  version: z.literal(TREC_VERSION),
  recordingId: z.string().uuid(),
  createdAt: z.number().int().nonnegative(),
  network: z.enum(["mainnet", "devnet"]),
  fixtures: z.array(z.number().int().positive()).min(1),
  statKeys: z.array(z.number().int().nonnegative()),
  source: z.object({ format: z.literal("txline-capture-ndjson"), version: z.literal(1) }),
});

export type TrecHeader = z.infer<typeof trecHeaderSchema>;
export type TrecChannel = "sse" | "snapshot" | "updates" | "historical" | "odds" | "proof" | "root";

export const trecEnvelopeSchema = z.object({
  kind: z.literal("txline.record"),
  recordId: z.number().int().positive(),
  at: z.number().int().nonnegative(),
  fixtureId: z.number().int().positive(),
  channel: z.enum(["sse", "snapshot", "updates", "historical", "odds", "proof", "root"]),
  request: z.object({ description: z.string().min(1) }),
  body: z.string(),
  bodySha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export type TrecEnvelope = z.infer<typeof trecEnvelopeSchema>;

const captureLineSchema = z.object({
  capturedAt: z.number().int().nonnegative(),
  source: z.string().min(1),
  raw: z.string(),
});

const forbiddenSecret = /(authorization\s*[:=]|x-api-token|api[_-]?token|private[_-]?key|secret[_-]?key|bearer\s+[a-z0-9._-]{12,})/i;

function assertPublicText(value: string, context: string): void {
  if (forbiddenSecret.test(value)) throw new Error(`Refusing to record possible secret in ${context}`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function channelFor(name: string): TrecChannel | undefined {
  if (name === "proofs.ndjson") return "proof";
  if (name === "snapshots.ndjson") return "snapshot";
  if (name.includes("odds")) return "odds";
  if (name.includes("score")) return "sse";
  if (name.includes("update")) return "updates";
  if (name.includes("pda") || name.includes("root")) return "root";
  return undefined;
}

interface CaptureRecord {
  at: number;
  fixtureId: number;
  channel: TrecChannel;
  source: string;
  raw: string;
}

async function* captureRecords(file: string, fixtureId: number, channel: TrecChannel): AsyncGenerator<CaptureRecord> {
  const input = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of input) {
    lineNumber += 1;
    if (!line.trim()) continue;
    const parsed = captureLineSchema.safeParse(JSON.parse(line) as unknown);
    if (!parsed.success) throw new Error(`${basename(file)}:${lineNumber}: invalid capture envelope`);
    assertPublicText(parsed.data.source, `${basename(file)}:${lineNumber} source`);
    assertPublicText(parsed.data.raw, `${basename(file)}:${lineNumber} body`);
    yield { at: parsed.data.capturedAt, fixtureId, channel, source: parsed.data.source, raw: parsed.data.raw };
  }
}

async function captureFiles(root: string, fixtureIds: readonly number[]): Promise<Array<{ file: string; fixtureId: number; channel: TrecChannel }>> {
  const files: Array<{ file: string; fixtureId: number; channel: TrecChannel }> = [];
  for (const scope of ["historical", "live"] as const) {
    for (const fixtureId of fixtureIds) {
      const directory = join(root, scope, String(fixtureId));
      let entries;
      try { entries = await readdir(directory, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".ndjson")) continue;
        const channel = channelFor(entry.name);
        if (channel) files.push({ file: join(directory, entry.name), fixtureId, channel });
      }
    }
  }
  return files.sort((a, b) => a.file.localeCompare(b.file));
}

async function writeLine(stream: ReturnType<typeof createWriteStream>, line: string): Promise<void> {
  if (!stream.write(`${line}\n`)) await once(stream, "drain");
}

export interface ImportCaptureOptions {
  captureRoot: string;
  fixtureIds: readonly number[];
  out: string;
  network?: "mainnet" | "devnet";
  createdAt?: number;
  recordingId?: string;
}

export interface RecordingManifest {
  version: 1;
  recording: string;
  sha256: string;
  records: number;
  firstAt: number | null;
  lastAt: number | null;
  channels: Partial<Record<TrecChannel, number>>;
}

export async function importCapture(options: ImportCaptureOptions): Promise<RecordingManifest> {
  if (!options.fixtureIds.length) throw new Error("At least one fixture ID is required");
  const fixtureIds = [...new Set(options.fixtureIds)].sort((a, b) => a - b);
  const files = await captureFiles(resolve(options.captureRoot), fixtureIds);
  if (!files.length) throw new Error(`No supported capture files found for fixtures ${fixtureIds.join(",")}`);
  await mkdir(dirname(resolve(options.out)), { recursive: true });
  const output = createWriteStream(resolve(options.out), { encoding: "utf8", flags: "wx" });
  const digest = createHash("sha256");
  const header: TrecHeader = {
    kind: "txline.recording",
    version: TREC_VERSION,
    recordingId: options.recordingId ?? randomUUID(),
    createdAt: options.createdAt ?? Date.now(),
    network: options.network ?? "mainnet",
    fixtures: fixtureIds,
    statKeys: [...DEFAULT_STAT_KEYS],
    source: { format: "txline-capture-ndjson", version: 1 },
  };
  const headerLine = JSON.stringify(header);
  digest.update(`${headerLine}\n`);
  await writeLine(output, headerLine);

  const iterators = files.map(({ file, fixtureId, channel }) => captureRecords(file, fixtureId, channel)[Symbol.asyncIterator]());
  const heads: Array<IteratorResult<CaptureRecord>> = await Promise.all(iterators.map((iterator) => iterator.next()));
  const channels: RecordingManifest["channels"] = {};
  let records = 0;
  let firstAt: number | null = null;
  let lastAt: number | null = null;
  while (true) {
    let selected = -1;
    for (let index = 0; index < heads.length; index += 1) {
      const head = heads[index];
      if (!head || head.done) continue;
      const current = selected < 0 ? undefined : heads[selected];
      if (!current || current.done || head.value.at < current.value.at) selected = index;
    }
    if (selected < 0) break;
    const record = heads[selected]!.value as CaptureRecord;
    records += 1;
    firstAt ??= record.at;
    lastAt = record.at;
    channels[record.channel] = (channels[record.channel] ?? 0) + 1;
    const envelope: TrecEnvelope = {
      kind: "txline.record",
      recordId: records,
      at: record.at,
      fixtureId: record.fixtureId,
      channel: record.channel,
      request: { description: record.source },
      body: record.raw,
      bodySha256: sha256(record.raw),
    };
    const line = JSON.stringify(envelope);
    digest.update(`${line}\n`);
    await writeLine(output, line);
    heads[selected] = await iterators[selected]!.next();
  }
  output.end();
  await once(output, "close");
  const manifest: RecordingManifest = {
    version: 1,
    recording: basename(options.out),
    sha256: digest.digest("hex"),
    records,
    firstAt,
    lastAt,
    channels,
  };
  await writeFile(`${resolve(options.out)}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  return manifest;
}

export async function validateRecording(file: string): Promise<RecordingManifest> {
  const digest = createHash("sha256");
  const input = createInterface({ input: createReadStream(resolve(file), { encoding: "utf8" }), crlfDelay: Infinity });
  let lineNumber = 0;
  let records = 0;
  let priorAt = -1;
  let firstAt: number | null = null;
  let lastAt: number | null = null;
  const channels: RecordingManifest["channels"] = {};
  for await (const line of input) {
    lineNumber += 1;
    if (!line.trim()) throw new Error(`Line ${lineNumber}: blank lines are not permitted`);
    digest.update(`${line}\n`);
    const value = JSON.parse(line) as unknown;
    if (lineNumber === 1) { trecHeaderSchema.parse(value); continue; }
    const record = trecEnvelopeSchema.parse(value);
    if (record.recordId !== lineNumber - 1) throw new Error(`Line ${lineNumber}: expected recordId ${lineNumber - 1}`);
    if (record.at < priorAt) throw new Error(`Line ${lineNumber}: timestamp moved backwards`);
    if (sha256(record.body) !== record.bodySha256) throw new Error(`Line ${lineNumber}: body checksum mismatch`);
    assertPublicText(record.request.description, `line ${lineNumber} request`);
    assertPublicText(record.body, `line ${lineNumber} body`);
    priorAt = record.at;
    firstAt ??= record.at;
    lastAt = record.at;
    records += 1;
    channels[record.channel] = (channels[record.channel] ?? 0) + 1;
  }
  if (!lineNumber) throw new Error("Recording is empty");
  return { version: 1, recording: basename(file), sha256: digest.digest("hex"), records, firstAt, lastAt, channels };
}
