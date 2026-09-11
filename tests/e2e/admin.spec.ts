import { test, expect } from "@playwright/test";
import {
  e2eEnabled,
  panelLogin,
  expectLoggedInAsAdmin,
  E2E,
} from "./helpers";

test.describe("Admin UI", () => {
  test.beforeAll(() => {
    test.skip(!e2eEnabled(), "E2E seed / TEST_DATABASE_URL not available");
  });

  test.beforeEach(async ({ page }) => {
    await panelLogin(page, E2E.admin.username, E2E.admin.password);
    await expectLoggedInAsAdmin(page);
  });

  test("login lands on admin dashboard with stats", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(
      page.getByText(/online users|online streams|connections|bandwidth|live streams/i).first()
    ).toBeVisible({ timeout: 30_000 });
  });

  test("create reseller, assign credits, create stream + bouquet, view logs", async ({
    page,
  }) => {
    const stamp = Date.now().toString(36);
    const resellerUser = `e2e_ui_res_${stamp}`;
    const resellerPass = "E2eUiReseller123!";
    const streamName = `E2E UI Stream ${stamp}`;
    const bouquetName = `E2E UI Bouquet ${stamp}`;

    // --- Create reseller ---
    await page.goto("/admin/resellers/add");
    await page.getByLabel(/username/i).fill(resellerUser);
    await page.getByLabel(/^password$/i).fill(resellerPass);
    const confirm = page.getByLabel(/confirm password/i);
    if (await confirm.count()) await confirm.fill(resellerPass);
    await page.getByRole("button", { name: /add user/i }).click();
    await page.goto("/admin/resellers");
    await expect(page.getByText(resellerUser)).toBeVisible({ timeout: 25_000 });

    // --- Assign credits ---
    await page.goto("/admin/resellers/credits");
    const userSelect = page.locator("form select").first();
    await userSelect.waitFor({ state: "visible" });
    const option = userSelect.locator("option").filter({ hasText: resellerUser });
    await expect(option).toHaveCount(1, { timeout: 15_000 });
    const value = await option.first().getAttribute("value");
    expect(value).toBeTruthy();
    await userSelect.selectOption(value!);
    await page.locator('form input[type="number"]').first().fill("25");
    await page.getByRole("button", { name: /add credits/i }).click();
    await expect(page.getByText(/added .*credits/i)).toBeVisible({ timeout: 15_000 });

    // --- Create stream ---
    await page.goto("/admin/streams/add");
    // Sources tab
    await page.getByText("Sources", { exact: true }).first().click();
    await page.getByPlaceholder(/primary http/i).fill("http://127.0.0.1/mock/e2e-ui-live.ts");
    // Details tab
    await page.getByText("Details", { exact: true }).first().click();
    await page.getByPlaceholder("Stream name").fill(streamName);
    await page.getByRole("button", { name: /add stream/i }).click();
    await page.goto("/admin/streams");
    await page.getByPlaceholder(/search/i).fill(streamName).catch(() => undefined);
    await expect(page.getByText(streamName)).toBeVisible({ timeout: 30_000 });

    // --- Create bouquet ---
    await page.goto("/admin/bouquets/add");
    await page.locator("form input").first().fill(bouquetName);
    await page.getByRole("button", { name: /create bouquet/i }).click();
    await page.goto("/admin/bouquets");
    await expect(page.getByText(bouquetName)).toBeVisible({ timeout: 25_000 });

    // --- Login logs ---
    await page.goto("/admin/login_logs");
    await expect(page.getByRole("heading", { name: /login logs/i })).toBeVisible();
    await expect(page.locator("table, [class*='table']").first()).toBeVisible();
  });
});
