import { HttpPipeline } from "./http.js";
import { StreamError } from "./errors.js";

export interface SseMessage {
  raw: string;
  data: string;
  id?: string;
  event?: string;
  retry?: number;
}

export function parseSseBlock(raw: string): SseMessage | undefined {
  const message: SseMessage = { raw, data: "" };
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    const value = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");
    if (field === "data") message.data += `${value}\n`;
    else if (field === "id" && !value.includes("\0")) message.id = value;
    else if (field === "event") message.event = value;
    else if (field === "retry" && /^\d+$/.test(value)) message.retry = Number(value);
  }
  message.data = message.data.replace(/\n$/, "");
  return message.data || message.id || message.event ? message : undefined;
}

export class SseDecoder {
  private buffer = "";
  private readonly decoder = new TextDecoder();

  push(chunk: Uint8Array): SseMessage[] {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    return this.extract(false);
  }

  finish(): SseMessage[] {
    this.buffer += this.decoder.decode();
    return this.extract(true);
  }

  private extract(final: boolean): SseMessage[] {
    const messages: SseMessage[] = [];
    let boundary = this.buffer.match(/\r?\n\r?\n/);
    while (boundary?.index !== undefined) {
      const raw = this.buffer.slice(0, boundary.index);
      this.buffer = this.buffer.slice(boundary.index + boundary[0].length);
      const parsed = parseSseBlock(raw);
      if (parsed) messages.push(parsed);
      boundary = this.buffer.match(/\r?\n\r?\n/);
    }
    if (final && this.buffer) {
      const parsed = parseSseBlock(this.buffer);
      if (parsed) messages.push(parsed);
      this.buffer = "";
    }
    return messages;
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
}

export interface StreamSseOptions {
  signal?: AbortSignal;
  lastEventId?: string;
  minRetryMs?: number;
  maxRetryMs?: number;
}

export async function* streamSse(http: HttpPipeline, path: string, options: StreamSseOptions = {}): AsyncGenerator<SseMessage> {
  let lastEventId = options.lastEventId;
  let retryMs = options.minRetryMs ?? 500;
  const maxRetryMs = options.maxRetryMs ?? 15_000;
  while (!options.signal?.aborted) {
    const headers = new Headers({ Accept: "text/event-stream", "Cache-Control": "no-cache" });
    if (lastEventId) headers.set("Last-Event-ID", lastEventId);
    try {
      const init: RequestInit = options.signal ? { headers, signal: options.signal } : { headers };
      const response = await http.request(path, init);
      if (!response.ok || !response.body) {
        const body = await response.text();
        throw new StreamError(`TxLINE SSE rejected with HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`, {
          code: "SSE_HTTP_ERROR",
          status: response.status,
          fix: "Check credentials, fixture coverage, and the selected network host.",
        });
      }
      retryMs = options.minRetryMs ?? 500;
      const reader = response.body.getReader();
      const decoder = new SseDecoder();
      while (true) {
        const chunk = await reader.read();
        const messages = chunk.done ? decoder.finish() : decoder.push(chunk.value);
        for (const message of messages) {
          if (message.id !== undefined) lastEventId = message.id;
          if (message.retry !== undefined) retryMs = Math.min(maxRetryMs, Math.max(0, message.retry));
          yield message;
        }
        if (chunk.done) break;
      }
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason;
      if (error instanceof StreamError && error.status && error.status < 500) throw error;
    }
    await delay(retryMs, options.signal);
    retryMs = Math.min(maxRetryMs, Math.max(1, retryMs * 2));
  }
  throw options.signal?.reason ?? new StreamError("TxLINE stream stopped", {
    code: "SSE_STOPPED",
    fix: "Pass a live AbortSignal and reconnect when the caller is ready.",
  });
}
