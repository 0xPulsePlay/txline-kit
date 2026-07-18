#!/usr/bin/env node
import { importCapture, validateRecording } from "./recording.js";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage(): never {
  throw new Error("Usage: txline-replay <import-capture|validate|inspect> [options]");
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "import-capture") {
    const captureRoot = flag("capture-root") ?? usage();
    const fixtures = (flag("fixtures") ?? usage()).split(",").map(Number);
    if (fixtures.some((fixture) => !Number.isSafeInteger(fixture) || fixture <= 0)) throw new Error("--fixtures must be positive integer IDs");
    const out = flag("out") ?? usage();
    console.log(JSON.stringify(await importCapture({ captureRoot, fixtureIds: fixtures, out }), null, 2));
    return;
  }
  if (command === "validate" || command === "inspect") {
    const file = process.argv[3] ?? usage();
    console.log(JSON.stringify(await validateRecording(file), null, 2));
    return;
  }
  usage();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
