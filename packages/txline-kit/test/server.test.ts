import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { createReplayServer, loadRecording, ReplaySession, startReplayServer } from "../src/server.js";

const fixture = resolve("fixtures/synthetic/match-42.trec");

describe("recording loader and virtual clock", () => {
  test("loads an independently validated immutable recording", async () => {
    const recording = await loadRecording(fixture);
    expect(recording.header.fixtures).toEqual([42]);
    expect(recording.records).toHaveLength(7);
    expect(recording.firstAt).toBe(1000);
    expect(recording.lastAt).toBe(1600);
    expect(Object.isFrozen(recording.records)).toBe(true);
  });

  test("seeks, pauses, resumes, changes speed, and reports progress", async () => {
    const recording = await loadRecording(fixture);
    const session = new ReplaySession(recording, { paused: true, speed: 2, pauseOn: "goal" });
    expect(session.status()).toMatchObject({ cursorAt: 1000, speed: 2, paused: true, progress: 0, pauseOn: "goal" });
    session.seek(300);
    expect(session.status().cursorAt).toBe(1300);
    session.setSpeed(4);
    expect(session.status().speed).toBe(4);
    session.play();
    await new Promise((resolveWait) => setTimeout(resolveWait, 5));
    expect(session.cursorAt).toBeGreaterThan(1300);
    session.pause();
    const paused = session.cursorAt;
    await new Promise((resolveWait) => setTimeout(resolveWait, 5));
    expect(session.cursorAt).toBe(paused);
    session.setPauseOn(undefined);
    expect(session.status().pauseOn).toBeUndefined();
    expect(() => session.setSpeed(0)).toThrow(/greater than 0/);
    expect(() => session.seek(Number.NaN)).toThrow(/finite/);
  });

  test("deterministic mode is instant and does not mutate its clock", async () => {
    const recording = await loadRecording(fixture);
    const session = new ReplaySession(recording, { deterministic: true, paused: true });
    expect(session.status()).toMatchObject({ cursorAt: 1600, progress: 1, deterministic: true });
    session.seek(0); session.play(); session.pause();
    expect(session.cursorAt).toBe(1600);
    await expect(session.waitUntil(1600, new AbortController().signal)).resolves.toBeUndefined();
  });

  test("constructs a server without binding and rejects invalid ports", async () => {
    const recording = await loadRecording(fixture);
    const { server, session } = createReplayServer(recording, { deterministic: true });
    expect(session.status().recordingId).toBe("00000000-0000-4000-8000-000000000042");
    server.close();
    await expect(startReplayServer(fixture, { port: 0 })).rejects.toThrow(/1 to 65535/);
  });
});
