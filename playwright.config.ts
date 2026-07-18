import { defineConfig, devices } from "@playwright/test";

const proofOnly = process.env.PROOF_ONLY === "1";
const learnPort = Number(process.env.TXLINE_TEST_WEB_PORT);
if (!proofOnly && (!Number.isInteger(learnPort) || learnPort < 1)) {
  throw new Error("TXLINE_TEST_WEB_PORT is required; resolve txline-kit-test-web with port-for");
}
const learnUrl = `http://127.0.0.1:${learnPort}`;

export default defineConfig({
  testDir: "./test/e2e",
  outputDir: "./test-results",
  reporter: "list",
  webServer: proofOnly ? undefined : {
    command: `PORT=${learnPort} pnpm --filter @0xpulseplay/txline-learn dev`,
    url: learnUrl,
    reuseExistingServer: false,
  },
  use: { baseURL: proofOnly ? undefined : learnUrl, timezoneId: "America/New_York", colorScheme: "dark", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "laptop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 } } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, reducedMotion: "reduce" } },
  ],
});
