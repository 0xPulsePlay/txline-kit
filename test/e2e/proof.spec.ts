import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const phase = process.env.PROOF_PHASE ?? "0";

test("phase proof is legible, responsive, and accessible", async ({ page }, testInfo) => {
  await page.goto(pathToFileURL(resolve(`proof/phase-${phase}/index.html`)).href);
  await expect(page.getByRole("heading", { name: `Phase ${phase} proof` })).toBeVisible();
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
  await page.screenshot({ path: resolve(`proof/phase-${phase}/screenshots`, `${testInfo.project.name}.png`), fullPage: true, animations: "disabled" });
});
