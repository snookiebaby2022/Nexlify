import { readFileSync, existsSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { E2E, SEED_PATH, type E2eSeed } from "./seed";

export function e2eEnabled(): boolean {
  if (process.env.E2E_SKIP === "1") return false;
  return existsSync(SEED_PATH);
}

export function readSeed(): E2eSeed & { E2E?: typeof E2E } {
  return JSON.parse(readFileSync(SEED_PATH, "utf8"));
}

export async function panelLogin(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByPlaceholder("admin").fill(username);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

export async function expectLoggedInAsAdmin(page: Page) {
  await expect(page).toHaveURL(/\/admin\//, { timeout: 30_000 });
}

export async function expectLoggedInAsReseller(page: Page) {
  await expect(page).toHaveURL(/\/reseller\//, { timeout: 30_000 });
}

export async function portalLogin(page: Page, username: string, password: string) {
  await page.goto("/portal");
  await page.locator('input').nth(0).fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

/** API helper using the browser's session cookies (after UI login). */
export async function apiJson(
  page: Page,
  path: string,
  init?: { method?: string; data?: unknown }
) {
  return page.evaluate(
    async ({ path, method, data }) => {
      const res = await fetch(path, {
        method: method ?? (data ? "POST" : "GET"),
        credentials: "same-origin",
        headers: data ? { "Content-Type": "application/json" } : undefined,
        body: data ? JSON.stringify(data) : undefined,
      });
      const body = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, body };
    },
    { path, method: init?.method, data: init?.data }
  );
}

export { E2E };
