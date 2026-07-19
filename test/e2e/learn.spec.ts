import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const screens = ["overview", "replay", "strategy", "proof", "settlement", "modules"];
const visualProofPhase = process.env.VISUAL_PROOF_PHASE ?? "7";

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
  for (const screen of screens) {
    await page.goto(`/#${screen}`);
    await page.waitForTimeout(550);
    const audit = await new AxeBuilder({ page }).analyze();
    expect(audit.violations.filter(({ impact }) => impact === "critical" || impact === "serious"), `${screen} accessibility`).toEqual([]);
    const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(width.scroll, `${screen} horizontal overflow`).toBeLessThanOrEqual(width.client);
  }
});

test("captures the Phase 7 visual proof matrix", async ({ page }, testInfo) => {
  for (const screen of screens) {
    await page.goto(`/#${screen}`);
    await expect(page.locator("main .screen")).toBeVisible();
    await page.waitForTimeout(550);
    await expect(page.locator(".side-nav .active")).toBeInViewport();
    if (screen === "modules") {
      const clipped = await page.locator(".module-map").evaluate((map) => {
        const bounds = map.getBoundingClientRect();
        const tolerance = 1;
        return [...map.querySelectorAll(":scope > button")].flatMap((button) => {
          const item = button.getBoundingClientRect();
          const contained = item.left >= bounds.left - tolerance && item.right <= bounds.right + tolerance
            && item.top >= bounds.top - tolerance && item.bottom <= bounds.bottom + tolerance;
          return contained ? [] : [{ label: button.textContent?.trim(), map: bounds.toJSON(), item: item.toJSON() }];
        });
      });
      expect(clipped, "SDK module controls are not clipped").toEqual([]);
    }
    await page.screenshot({
      path: `proof/phase-${visualProofPhase}/screenshots/${testInfo.project.name}-${screen}.png`,
      fullPage: true,
    });
  }
});

test("/story loads directly on a fresh navigation with real content, and links back to the app", async ({ page }) => {
  await page.goto("/story");
  await expect(page.getByRole("heading", { name: /Solana settlement you can inspect/i })).toBeVisible();
  await expect(page.getByText(/REAL, live-captured data/i)).toBeVisible();
  await expect(page.getByText("Spain v Argentina")).toBeVisible();
  await expect(page.getByText("Another team")).toBeVisible();
  await expect(page.getByRole("link", { name: /View the real commit on GitHub/i })).toHaveAttribute("href", /proofline\/commit/);

  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(width.scroll, "/story horizontal overflow").toBeLessThanOrEqual(width.client);

  await page.getByRole("link", { name: "Open the interactive app" }).click();
  await expect(page.getByRole("heading", { name: /See the match/i })).toBeVisible();
});
