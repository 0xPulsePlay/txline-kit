import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: { lines: 90, statements: 90, branches: 85, functions: 90 },
      include: [
        "packages/txline-kit/src/{auth,client,core,data,errors,http,proofs,recording,sse,strategy}.ts",
      ],
    },
  },
});
