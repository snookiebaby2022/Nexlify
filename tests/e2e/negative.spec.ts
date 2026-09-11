import { test, expect } from "@playwright/test";
import {
  e2eEnabled,
  panelLogin,
  expectLoggedInAsReseller,
  E2E,
} from "./helpers";

test.describe("Negative auth / access", () => {
  test.beforeAll(() => {
    test.skip(!e2eEnabled(), "E2E seed / TEST_DATABASE_URL not available");
  });

  test("bad login shows error and stays on login", async ({ page }) => {
    await panelLogin(page, E2E.admin.username, "definitely-wrong-password");
    await expect(page.getByText(/invalid login|missing credentials|too many/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/\/login/);
  });

  test("expired / invalid session redirects to login", async ({ page, context }) => {
    await context.addCookies([
      {
        name: "nexlify_session",
        value: "expired.or.tampered.token",
        url: process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.E2E_PORT || "13100"}`,
      },
    ]);
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  });

  test("reseller hitting /admin is redirected away (not admin UI)", async ({ page }) => {
    await panelLogin(page, E2E.reseller.username, E2E.reseller.password);
    await expectLoggedInAsReseller(page);

    await page.goto("/admin/dashboard");
    // Admin layout redirects non-admins to reseller dashboard
    await expect(page).toHaveURL(/\/reseller\//, { timeout: 20_000 });
    await expect(page).not.toHaveURL(/\/admin\/dashboard/);

    await page.goto("/admin/resellers");
    await expect(page).toHaveURL(/\/reseller\//, { timeout: 20_000 });

    // Admin API must refuse reseller
    const res = await page.request.get("/api/admin/resellers");
    expect([401, 403].includes(res.status())).toBeTruthy();
  });

  test("unauthenticated direct admin URL redirects to login", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
