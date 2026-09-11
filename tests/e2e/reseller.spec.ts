import { test, expect } from "@playwright/test";
import {
  e2eEnabled,
  panelLogin,
  expectLoggedInAsReseller,
  E2E,
  apiJson,
  readSeed,
} from "./helpers";

test.describe("Reseller UI", () => {
  test.beforeAll(() => {
    test.skip(!e2eEnabled(), "E2E seed / TEST_DATABASE_URL not available");
  });

  test.beforeEach(async ({ page }) => {
    await panelLogin(page, E2E.reseller.username, E2E.reseller.password);
    await expectLoggedInAsReseller(page);
  });

  test("create trial line, paid line, extend, ban; credits deduct; isolation", async ({
    page,
  }) => {
    const stamp = Date.now().toString(36);
    const trialUser = `e2e_trial_${stamp}`;
    const paidUser = `e2e_paid_${stamp}`;
    const linePass = "E2eLinePass123!";

    // Credits before
    const before = await apiJson(page, "/api/admin/profile");
    expect(before.ok).toBeTruthy();
    const creditsBefore = Number(before.body?.user?.credits ?? 0);
    expect(creditsBefore).toBeGreaterThan(0);

    // --- Trial line via trial package ---
    await page.goto("/reseller/lines/add?package=1");
    await page.getByLabel(/username/i).fill(trialUser);
    await page.getByLabel(/^password$/i).first().fill(linePass);
    {
      const selects = page.locator("select");
      const n = await selects.count();
      for (let i = 0; i < n; i++) {
        const text = await selects.nth(i).innerText();
        if (text.includes(E2E.packageTrial.name)) {
          await selects.nth(i).selectOption({ label: new RegExp(E2E.packageTrial.name) });
          break;
        }
      }
    }
    await page.getByRole("button", { name: /create line/i }).click();
    await page.goto("/reseller/lines");
    await expect(page.getByText(trialUser)).toBeVisible({ timeout: 30_000 });

    // --- Paid line via package ---
    await page.goto("/reseller/lines/add?package=1");
    await page.getByLabel(/username/i).fill(paidUser);
    await page.getByLabel(/^password$/i).first().fill(linePass);
    {
      const selects = page.locator("select");
      const n = await selects.count();
      let picked = false;
      for (let i = 0; i < n; i++) {
        const text = await selects.nth(i).innerText();
        if (text.includes(E2E.packagePaid.name)) {
          await selects.nth(i).selectOption({ label: new RegExp(E2E.packagePaid.name) });
          picked = true;
          break;
        }
      }
      expect(picked, `paid package "${E2E.packagePaid.name}" should appear in a select`).toBeTruthy();
    }
    await page.getByRole("button", { name: /create line/i }).click();
    await page.goto("/reseller/lines");
    await expect(page.getByText(paidUser)).toBeVisible({ timeout: 30_000 });

    const afterPaid = await apiJson(page, "/api/admin/profile");
    const creditsAfterPaid = Number(afterPaid.body?.user?.credits ?? 0);
    expect(creditsAfterPaid).toBeLessThan(creditsBefore);

    // --- Extend paid line ---
    const seed = readSeed();
    // Find paid line id via reseller lines API
    const linesRes = await apiJson(page, "/api/reseller/lines");
    const lines = (linesRes.body?.lines ?? []) as Array<{
      id: string;
      username: string;
    }>;
    expect(linesRes.ok, JSON.stringify(linesRes.body)).toBeTruthy();
    const paid = lines.find((l) => l.username === paidUser);
    expect(paid?.id, `expected paid line ${paidUser} in list`).toBeTruthy();

    await page.goto(`/reseller/lines?edit=${paid!.id}`);
    await expect(page.getByRole("button", { name: /^ban$/i })).toBeVisible({ timeout: 20_000 });
    await page.getByLabel(/extend subscription/i).fill("30");
    // Select paid package again if shown
    const extendPkg = page.locator("select").filter({ hasText: E2E.packagePaid.name }).first();
    if (await extendPkg.count()) {
      await extendPkg.selectOption({ label: new RegExp(E2E.packagePaid.name) });
    }
    const creditsMid = Number((await apiJson(page, "/api/admin/profile")).body?.user?.credits ?? 0);
    await page.getByRole("button", { name: /save line/i }).click();
    await expect(page.getByText(paidUser)).toBeVisible({ timeout: 20_000 });
    const creditsAfterExtend = Number(
      (await apiJson(page, "/api/admin/profile")).body?.user?.credits ?? 0
    );
    expect(creditsAfterExtend).toBeLessThanOrEqual(creditsMid);

    // --- Ban line ---
    await page.goto(`/reseller/lines?edit=${paid!.id}`);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /^ban$/i }).click();
    await page.goto("/reseller/lines");
    // Status may show Banned / YES in Ban column
    await expect(page.getByText(paidUser)).toBeVisible();
    const banned = await apiJson(page, `/api/reseller/lines/${paid!.id}`);
    expect(String(banned.body?.line?.status ?? banned.body?.status ?? "")).toMatch(/BANNED/i);

    // --- Isolation: cannot see other reseller's line ---
    await page.goto("/reseller/lines");
    await expect(page.getByText(E2E.foreignLine.username)).toHaveCount(0);
    const foreign = await apiJson(page, `/api/reseller/lines/${seed.foreignLineId}`);
    expect(foreign.status === 403 || foreign.status === 404 || foreign.ok === false).toBeTruthy();

    // Keep seed id referenced for typecheck
    expect(seed.resellerId).toBeTruthy();
  });
});
