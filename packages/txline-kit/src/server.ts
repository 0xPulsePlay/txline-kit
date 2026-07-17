import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { trecEnvelopeSchema, trecHeaderSchema, validateRecording, type TrecEnvelope, type TrecHeader } from "./recording.js";

export interface LoadedRecording {
  file: string;
  header: TrecHeader;
  records: readonly TrecEnvelope[];
  firstAt: number;
  lastAt: number;
}

export async function loadRecording(file: string): Promise<LoadedRecording> {
  await validateRecording(file);
  const lines = (await readFile(resolve(file), "utf8")).trimEnd().split("\n");
  const header = trecHeaderSchema.parse(JSON.parse(lines[0]!) as unknown);
  const records = Object.freeze(lines.slice(1).map((line) => Object.freeze(trecEnvelopeSchema.parse(JSON.parse(line) as unknown))));
  const firstAt = records[0]?.at ?? header.createdAt;
  const lastAt = records.at(-1)?.at ?? firstAt;
  return Object.freeze({ file: resolve(file), header: Object.freeze(header), records, firstAt, lastAt });
}

export interface ReplaySessionOptions {
  speed?: number;
  deterministic?: boolean;
  paused?: boolean;
  pauseOn?: string;
}

export interface ReplayStatus {
  recordingId: string;
  network: TrecHeader["network"];
  fixtures: readonly number[];
  firstAt: number;
  lastAt: number;
  cursorAt: number;
  progress: number;
  speed: number;
  paused: boolean;
  deterministic: boolean;
  pauseOn?: string;
}

function positiveSpeed(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 10_000) throw new RangeError("Replay speed must be greater than 0 and at most 10000");
  return value;
}

export class ReplaySession {
  private speedValue: number;
  private pausedValue: boolean;
  private cursorValue: number;
  private wallStartedAt: number;
  private pauseOnValue: string | undefined;
  readonly deterministic: boolean;

  constructor(readonly recording: LoadedRecording, options: ReplaySessionOptions = {}) {
    this.speedValue = positiveSpeed(options.speed ?? 1);
    this.deterministic = options.deterministic ?? false;
    this.pausedValue = options.paused ?? false;
    this.cursorValue = recording.firstAt;
    this.wallStartedAt = Date.now();
    this.pauseOnValue = options.pauseOn;
  }

  get cursorAt(): number {
    if (this.deterministic) return this.recording.lastAt;
    if (this.pausedValue) return this.cursorValue;
    return Math.min(this.recording.lastAt, this.cursorValue + (Date.now() - this.wallStartedAt) * this.speedValue);
  }

  status(): ReplayStatus {
    const cursorAt = this.cursorAt;
    const span = this.recording.lastAt - this.recording.firstAt;
    return Object.freeze({
      recordingId: this.recording.header.recordingId,
      network: this.recording.header.network,
      fixtures: Object.freeze([...this.recording.header.fixtures]),
      firstAt: this.recording.firstAt,
      lastAt: this.recording.lastAt,
      cursorAt,
      progress: span === 0 ? 1 : Math.max(0, Math.min(1, (cursorAt - this.recording.firstAt) / span)),
      speed: this.speedValue,
      paused: this.pausedValue,
      deterministic: this.deterministic,
      ...(this.pauseOnValue ? { pauseOn: this.pauseOnValue } : {}),
    });
  }

  play(): void {
    if (!this.pausedValue || this.deterministic) return;
    this.pausedValue = false;
    this.wallStartedAt = Date.now();
  }

  pause(): void {
    if (this.pausedValue || this.deterministic) return;
    this.cursorValue = this.cursorAt;
    this.pausedValue = true;
  }

  seek(value: number): void {
    if (!Number.isFinite(value)) throw new RangeError("Replay seek value must be a finite timestamp or offset");
    const absolute = value < this.recording.firstAt ? this.recording.firstAt + value : value;
    this.cursorValue = Math.max(this.recording.firstAt, Math.min(this.recording.lastAt, absolute));
    this.wallStartedAt = Date.now();
  }

  setSpeed(value: number): void {
    const cursor = this.cursorAt;
    this.speedValue = positiveSpeed(value);
    this.cursorValue = cursor;
    this.wallStartedAt = Date.now();
  }

  setPauseOn(action: string | undefined): void {
    this.pauseOnValue = action?.trim() || undefined;
  }

  maybePause(record: TrecEnvelope): void {
    if (!this.pauseOnValue || this.deterministic) return;
    const values = bodyValues(record.body);
    if (values.some((value) => objectAction(value) === this.pauseOnValue)) this.pause();
  }

  async waitUntil(timestamp: number, signal: AbortSignal): Promise<void> {
    if (this.deterministic) return;
    while (!signal.aborted) {
      const remaining = timestamp - this.cursorAt;
      if (remaining <= 0) return;
      const wait = this.pausedValue ? 25 : Math.max(1, Math.min(100, remaining / this.speedValue));
      await new Promise<void>((resolveWait) => setTimeout(resolveWait, wait));
    }
    throw signal.reason;
  }
}

function requestPath(description: string): string | undefined {
  return description.match(/(?:GET|POST)\s+(\/[^\s]+)(?:\s+status=\d+)?/)?.[1];
}

function bodyValues(body: string): unknown[] {
  try {
    const parsed = JSON.parse(body) as unknown;
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch { /* attempt SSE below */ }
  const values: unknown[] = [];
  for (const match of body.matchAll(/^data:\s?(.*)$/gm)) {
    try { values.push(JSON.parse(match[1]!) as unknown); } catch { /* skip provider comments or malformed frames */ }
  }
  return values;
}

function objectAction(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const action = record.action ?? record.Action;
  return typeof action === "string" ? action : undefined;
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(`${JSON.stringify(value)}\n`);
}

function cors(response: ServerResponse): void {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-headers", "authorization,x-api-token,content-type,last-event-id");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 64 * 1024) throw new Error("Replay control body exceeds 64 KiB");
    chunks.push(bytes);
  }
  if (!chunks.length) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Replay control body must be a JSON object");
  return parsed as Record<string, unknown>;
}

function routeRecords(recording: LoadedRecording, pathname: string, url: URL, cursorAt: number): TrecEnvelope[] {
  const eligible = recording.records.filter((record) => record.at <= cursorAt);
  const fixtureMatch = pathname.match(/\/(?:snapshot|historical)\/(\d+)$/);
  const fixtureId = fixtureMatch ? Number(fixtureMatch[1]) : undefined;
  if (pathname.includes("/scores/stat-validation")) {
    return recording.records.filter((record) => {
      if (record.channel !== "proof") return false;
      const path = requestPath(record.request.description);
      if (!path?.includes("/scores/stat-validation")) return false;
      const captured = new URL(path, "http://replay.invalid");
      return ["fixtureId", "seq", "statKeys", "statKey", "statKey2"].every((key) => (captured.searchParams.get(key) ?? "") === (url.searchParams.get(key) ?? ""));
    });
  }
  if (pathname.includes("/scores/snapshot/")) return eligible.filter((record) => record.fixtureId === fixtureId && record.channel === "snapshot");
  if (pathname.includes("/scores/historical/")) return recording.records.filter((record) => record.fixtureId === fixtureId && (record.channel === "historical" || record.request.description.includes("/scores/historical/")));
  if (pathname.includes("/scores/updates/")) return eligible.filter((record) => record.channel === "updates" && requestPath(record.request.description)?.includes(pathname.replace(/^\/api/, "")));
  if (pathname.includes("/odds/snapshot/")) return eligible.filter((record) => record.fixtureId === fixtureId && record.channel === "odds" && record.request.description.includes("/odds/snapshot/"));
  if (pathname.includes("/odds/updates/")) return eligible.filter((record) => record.channel === "odds" && record.request.description.includes("/odds/updates/"));
  return [];
}

function latestPayload(records: readonly TrecEnvelope[]): unknown {
  const record = records.at(-1);
  if (!record) return [];
  const values = bodyValues(record.body);
  return values.length === 1 && Array.isArray(values[0]) ? values[0] : values;
}

function sseText(record: TrecEnvelope): string {
  const values = bodyValues(record.body);
  if (values.length) return values.map((value) => `id: ${record.recordId}\ndata: ${JSON.stringify(value)}\n\n`).join("");
  const body = record.body.trim();
  return `id: ${record.recordId}\ndata: ${JSON.stringify({ raw: body })}\n\n`;
}

async function streamRecords(request: IncomingMessage, response: ServerResponse, session: ReplaySession, channel: "sse" | "odds"): Promise<void> {
  const controller = new AbortController();
  request.on("close", () => controller.abort(new Error("client disconnected")));
  const lastId = Number(request.headers["last-event-id"] ?? 0);
  const startAt = session.deterministic ? session.recording.firstAt : session.cursorAt;
  const channelRecords = session.recording.records.filter((record) => channel === "sse" ? record.channel === "sse" || record.channel === "historical" : record.channel === "odds");
  const resumeIndex = lastId > 0
    ? channelRecords.findIndex((record) => record.recordId > lastId)
    : channelRecords.findLastIndex((record) => record.at <= startAt);
  const records = resumeIndex < 0 ? (lastId > 0 ? [] : channelRecords) : channelRecords.slice(resumeIndex);
  response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
  response.write(": txline-replay\n\n");
  try {
    for (const record of records) {
      await session.waitUntil(record.at, controller.signal);
      response.write(sseText(record));
      session.maybePause(record);
    }
    response.end();
  } catch {
    if (!response.writableEnded) response.end();
  }
}

export interface ReplayServerOptions extends ReplaySessionOptions {}

export function createReplayServer(recording: LoadedRecording, options: ReplayServerOptions = {}): { server: Server; session: ReplaySession } {
  const session = new ReplaySession(recording, options);
  const server = createServer(async (request, response) => {
    cors(response);
    if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
    const url = new URL(request.url ?? "/", "http://replay.invalid");
    const path = url.pathname;
    try {
      if (path === "/healthz") { json(response, 200, { ok: true }); return; }
      if (path === "/__txline/status" && request.method === "GET") { json(response, 200, session.status()); return; }
      if (path === "/__txline/control" && request.method === "POST") {
        const body = await readJson(request);
        if (body.action === "play") session.play();
        else if (body.action === "pause") session.pause();
        else if (body.action === "seek" && typeof body.value === "number") session.seek(body.value);
        else if (body.action === "speed" && typeof body.value === "number") session.setSpeed(body.value);
        else if (body.action === "pauseOn" && (typeof body.value === "string" || body.value === null)) session.setPauseOn(body.value ?? undefined);
        else throw new Error("Unknown replay control action or invalid value");
        json(response, 200, session.status()); return;
      }
      if (path === "/auth/guest/start" && request.method === "POST") { json(response, 200, { token: "txline-replay-guest" }); return; }
      if (path === "/api/token/activate" && request.method === "POST") { json(response, 200, { token: "txline-replay-api" }); return; }
      if (path === "/api/scores/stream") { await streamRecords(request, response, session, "sse"); return; }
      if (path === "/api/odds/stream") { await streamRecords(request, response, session, "odds"); return; }
      if (path === "/api/fixtures/snapshot") { json(response, 200, recording.header.fixtures.map((fixtureId) => ({ fixtureId, replay: true }))); return; }
      const records = routeRecords(recording, path, url, session.cursorAt);
      if (path.includes("/stat-validation")) {
        const record = records.at(-1);
        if (!record) { json(response, 404, { error: "proof not recorded", fixtureId: url.searchParams.get("fixtureId"), seq: url.searchParams.get("seq") }); return; }
        response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        response.end(record.body.endsWith("\n") ? record.body : `${record.body}\n`); return;
      }
      if (path.startsWith("/api/scores/") || path.startsWith("/api/odds/")) { json(response, 200, latestPayload(records)); return; }
      json(response, 404, { error: "not found", path });
    } catch (error) {
      json(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });
  return { server, session };
}

export interface StartReplayServerOptions extends ReplayServerOptions { port: number; host?: string }

export async function startReplayServer(file: string, options: StartReplayServerOptions): Promise<{ server: Server; session: ReplaySession; url: string }> {
  if (!Number.isSafeInteger(options.port) || options.port < 1 || options.port > 65_535) throw new RangeError("Replay port must be an integer from 1 to 65535");
  const recording = await loadRecording(file);
  const { server, session } = createReplayServer(recording, options);
  const host = options.host ?? "127.0.0.1";
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(options.port, host, () => { server.off("error", reject); resolveListen(); });
  });
  return { server, session, url: `http://${host}:${options.port}` };
}
