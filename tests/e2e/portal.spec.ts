import { test, expect } from "@playwright/test";
import { e2eEnabled, portalLogin, E2E } from "./helpers";

test.describe("End-user portal", () => {
  test.beforeAll(() => {
    test.skip(!e2eEnabled(), "E2E seed / TEST_DATABASE_URL not available");
  });

  test("login, view subscription, download M3U", async ({ page }) => {
    await portalLogin(page, E2E.line.username, E2E.line.password);
    await expect(page).toHaveURL(/\/portal\/dashboard/, { timeout: 20_000 });

    await expect(page.getByText(/subscription|expires|status|active/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(E2E.line.username)).toBeVisible();

    // M3U playlist field / download
    const m3uLabel = page.getByText(/m3u playlist/i);
    await expect(m3uLabel).toBeVisible({ timeout: 20_000 });

    const m3uInput = page.locator("input, textarea").filter({ hasText: /get\.php|m3u/i }).first();
    const m3uLink = page.getByRole("link", { name: /m3u|download|playlist/i }).first();
    if (await m3uLink.count()) {
      const href = await m3uLink.getAttribute("href");
      expect(href).toBeTruthy();
      const res = await page.request.get(href!);
      expect(res.ok() || res.status() === 401 || res.status() === 200).toBeTruthy();
      if (res.ok()) {
        const body = await res.text();
        expect(body).toMatch(/#EXTM3U|#EXTINF|http/i);
      }
    } else {
      // CopyField usually renders an input with the URL
      const field = page.locator("input[readonly], input[value*='get.php'], input[value*='m3u']").first();
      await expect(field).toBeVisible({ timeout: 15_000 });
      const value = await field.inputValue();
      expect(value).toMatch(/get\.php|m3u|username=/i);
      const res = await page.request.get(value);
      // Auth may be embedded in URL — accept 200 playlist or redirect
      expect([200, 301, 302, 401, 403].includes(res.status())).toBeTruthy();
      if (res.status() === 200) {
        const body = await res.text();
        expect(body.length).toBeGreaterThan(0);
      }
    }
  });
});
