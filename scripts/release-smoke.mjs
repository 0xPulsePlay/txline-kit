import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const packageRoot = join(root, "packages/txline-kit");
const work = mkdtempSync(join(tmpdir(), "txline-kit-release-smoke-"));
const run = (command, args, cwd = work) => execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

try {
  run("pnpm", ["build"], packageRoot);
  const pack = JSON.parse(run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", work], packageRoot));
  const tarball = join(work, pack[0].filename);
  const files = pack[0].files.map(({ path }) => path);
  const forbidden = files.filter((path) => /(^|\/)(\.env|fixtures|scripts|.*(?:keypair|credential))/i.test(path));
  if (forbidden.length) throw new Error(`Forbidden npm archive paths: ${forbidden.join(", ")}`);

  writeFileSync(join(work, "package.json"), JSON.stringify({ private: true, type: "module" }));
  run("npm", ["install", tarball, "--ignore-scripts"]);
  run("node", ["--input-type=module", "-e", `
    const root = await import("@0xpulseplay/txline-kit");
    const strategy = await import("@0xpulseplay/txline-kit/strategy");
    if (typeof root.createTxLineClient !== "function" || !strategy.markets) process.exit(1);
  `]);
  run("node", ["-e", `
    const root = require("@0xpulseplay/txline-kit");
    const onchain = require("@0xpulseplay/txline-kit/onchain");
    if (typeof root.createTxLineClient !== "function" || typeof onchain.verifyMerklePath !== "function") process.exit(1);
  `]);
  copyFileSync(join(root, "fixtures/synthetic/match-42.trec"), join(work, "match-42.trec"));
  const validation = JSON.parse(run(join(work, "node_modules/.bin/txline-replay"), ["validate", "match-42.trec"]));
  if (validation.recording !== "match-42.trec" || validation.records !== 7 || validation.channels.proof !== 2) {
    throw new Error("Installed CLI returned an unexpected fixture receipt");
  }

  run("cargo", ["package", "-p", "txline-kit-cpi", "--locked", "--allow-dirty"], root);
  const crate = readFileSync(join(root, "target/package/txline-kit-cpi-0.1.0.crate"));
  if (crate.length < 1_000) throw new Error("Cargo package artifact is unexpectedly small");
  process.stdout.write(JSON.stringify({ npm: pack[0], crateBytes: crate.length, consumer: "pass" }, null, 2) + "\n");
} finally {
  rmSync(work, { recursive: true, force: true });
}
