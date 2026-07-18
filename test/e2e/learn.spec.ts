import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("learning app supports replay, strategy, proof, settlement, and module journeys", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /See the match/i })).toBeVisible();
  const navigate = (label: string) => page.locator(".side-nav").getByText(label, { exact: true }).click();

  await navigate("Replay lab");
  await expect(page.getByTestId("replay-screen")).toBeVisible();
  await page.getByRole("button", { name: "Next record" }).click();
  await expect(page.getByText("Record 2 / 7")).toBeVisible();
  const alternateFixture = page.getByRole("button", { name: /Helix v Juniper/i });
  await alternateFixture.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Fixture 43")).toBeVisible();

  await navigate("Strategy studio");
  await expect(page.getByTestId("strategy-screen")).toBeVisible();
  await page.getByRole("button", { name: "away" }).click();
  await page.getByRole("slider", { name: "Home goals" }).fill("0");
  await page.getByRole("slider", { name: "Away goals" }).fill("2");
  await expect(page.getByText("Predicate true")).toBeVisible();

  await navigate("Proof anatomy");
  await page.getByRole("button", { name: /Daily root PDA/i }).click();
  await expect(page.getByText(/exact on-chain root account/i)).toBeVisible();

  await navigate("Settlement");
  await expect(page.getByTestId("settlement-screen")).toBeVisible();
  await page.getByRole("button", { name: /TxLINE proved away/i }).click();
  await expect(page.getByRole("link", { name: /Open in Solscan/i })).toHaveAttribute("href", /52kbag/);

  await navigate("SDK map");
  const proofsModule = page.getByRole("button", { name: /proofs/i });
  await proofsModule.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "/proofs", exact: true })).toBeVisible();
});

test("learning app has no serious accessibility violations or horizontal overflow", async ({ page }) => {
  await page.goto("/#overview");
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter(({ impact }) => impact === "critical" || impact === "serious")).toEqual([]);
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
});

test("captures the Phase 7 visual proof matrix", async ({ page }, testInfo) => {
  const screens = testInfo.project.name === "desktop"
    ? ["overview", "replay", "strategy", "proof", "settlement", "modules"]
    : ["overview"];
  for (const screen of screens) {
    await page.goto(`/#${screen}`);
    await expect(page.locator("main .screen")).toBeVisible();
    await page.waitForTimeout(550);
    await page.screenshot({
      path: `proof/phase-7/screenshots/${testInfo.project.name}-${screen}.png`,
      fullPage: true,
    });
  }
});
