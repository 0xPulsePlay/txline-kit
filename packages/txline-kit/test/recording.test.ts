import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { importCapture, validateRecording } from "../src/recording.js";

async function fixture(): Promise<{ root: string; out: string }> {
  const root = await mkdtemp(join(tmpdir(), "txline-kit-"));
  const directory = join(root, "historical", "42");
  await mkdir(directory, { recursive: true });
  const line = (capturedAt: number, source: string, raw: string) => `${JSON.stringify({ capturedAt, source, raw })}\n`;
  await writeFile(join(directory, "snapshots.ndjson"), line(20, "GET /api/scores/snapshot/42 status=200", "{\"seq\":2}"));
  await writeFile(join(directory, "proofs.ndjson"), line(30, "GET /api/scores/stat-validation?fixtureId=42&seq=2 status=200", "{\"proof\":true}"));
  await writeFile(join(directory, "scores-stream.ndjson"), line(10, "GET /api/scores/historical/42 status=200", "data: {\"seq\":1}"));
  return { root, out: join(root, "fixture.trec") };
}

describe(".trec capture import", () => {
  test("merges source streams chronologically and validates checksums", async () => {
    const { root, out } = await fixture();
    const manifest = await importCapture({ captureRoot: root, fixtureIds: [42], out, createdAt: 1, recordingId: "00000000-0000-4000-8000-000000000000" });
    expect(manifest.records).toBe(3);
    expect(manifest.channels).toEqual({ sse: 1, snapshot: 1, proof: 1 });
    const lines = (await readFile(out, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(lines.slice(1).map((line) => line.at)).toEqual([10, 20, 30]);
    expect(await validateRecording(out)).toEqual(manifest);
  });

  test("refuses secrets before they enter a recording", async () => {
    const { root, out } = await fixture();
    await writeFile(join(root, "historical", "42", "proofs.ndjson"), `${JSON.stringify({ capturedAt: 30, source: "Authorization: Bearer abcdefghijklmnop", raw: "{}" })}\n`);
    await expect(importCapture({ captureRoot: root, fixtureIds: [42], out })).rejects.toThrow(/possible secret/i);
  });

  test("detects body tampering", async () => {
    const { root, out } = await fixture();
    await importCapture({ captureRoot: root, fixtureIds: [42], out });
    const value = (await readFile(out, "utf8")).replace("data:", "tampered:");
    await writeFile(out, value);
    await expect(validateRecording(out)).rejects.toThrow(/checksum mismatch/i);
  });

  test("recognizes update and root channels while ignoring unrelated logs", async () => {
    const { root, out } = await fixture();
    const directory = join(root, "historical", "42");
    await writeFile(join(directory, "updates-buckets.ndjson"), `${JSON.stringify({ capturedAt: 40, source: "GET /api/scores/updates/1/2/3 status=200", raw: "[]" })}\n`);
    await writeFile(join(directory, "pda-watch.ndjson"), `${JSON.stringify({ capturedAt: 50, source: "solana:getAccountInfo", raw: "{}" })}\n`);
    await writeFile(join(directory, "capture-log.ndjson"), `${JSON.stringify({ capturedAt: 60, source: "local:test", raw: "{}" })}\n`);
    const manifest = await importCapture({ captureRoot: root, fixtureIds: [42, 42], out, network: "devnet" });
    expect(manifest.records).toBe(5);
    expect(manifest.channels).toEqual({ sse: 1, snapshot: 1, proof: 1, updates: 1, root: 1 });
  });

  test("rejects missing fixtures and malformed capture lines", async () => {
    const root = await mkdtemp(join(tmpdir(), "txline-kit-"));
    await expect(importCapture({ captureRoot: root, fixtureIds: [], out: join(root, "none.trec") })).rejects.toThrow(/at least one/i);
    await expect(importCapture({ captureRoot: root, fixtureIds: [99], out: join(root, "missing.trec") })).rejects.toThrow(/no supported capture files/i);
    const directory = join(root, "live", "99");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "proofs.ndjson"), "{}\n");
    await expect(importCapture({ captureRoot: root, fixtureIds: [99], out: join(root, "bad.trec") })).rejects.toThrow(/invalid capture envelope/i);
  });

  test("rejects empty, blank, out-of-order, and non-contiguous recordings", async () => {
    const root = await mkdtemp(join(tmpdir(), "txline-kit-"));
    const empty = join(root, "empty.trec");
    await writeFile(empty, "");
    await expect(validateRecording(empty)).rejects.toThrow(/empty/i);

    const { root: source, out } = await fixture();
    await importCapture({ captureRoot: source, fixtureIds: [42], out });
    const original = (await readFile(out, "utf8")).trimEnd().split("\n");
    await writeFile(join(root, "blank.trec"), `${original[0]}\n\n`);
    await expect(validateRecording(join(root, "blank.trec"))).rejects.toThrow(/blank lines/i);

    const first = JSON.parse(original[1]!);
    const second = JSON.parse(original[2]!);
    first.recordId = 2;
    await writeFile(join(root, "id.trec"), `${original[0]}\n${JSON.stringify(first)}\n`);
    await expect(validateRecording(join(root, "id.trec"))).rejects.toThrow(/expected recordId/i);

    first.recordId = 1;
    second.at = first.at - 1;
    await writeFile(join(root, "time.trec"), `${original[0]}\n${JSON.stringify(first)}\n${JSON.stringify(second)}\n`);
    await expect(validateRecording(join(root, "time.trec"))).rejects.toThrow(/timestamp moved backwards/i);
  });
});
