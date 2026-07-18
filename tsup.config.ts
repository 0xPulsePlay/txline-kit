import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    core: "src/core.ts",
    auth: "src/auth.ts",
    data: "src/data.ts",
    errors: "src/errors.ts",
    replay: "src/replay.ts",
    proofs: "src/proofs.ts",
    onchain: "src/onchain.ts",
    strategy: "src/strategy.ts",
    keeper: "src/keeper.ts",
    cli: "src/cli.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  outDir: "dist",
  outExtension({ format }) { return { js: format === "cjs" ? ".cjs" : ".js" }; },
  banner: { js: "/* SPDX-License-Identifier: MIT OR Apache-2.0 */" },
});
