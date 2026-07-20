import { expect, test } from "@playwright/test";

test("OdontIQ application loads", async ({ page }) => {
  const response = await page.goto("/");

  expect(response).not.toBeNull();
  expect(response?.status()).toBeLessThan(500);

  await expect(page.locator("body")).toBeVisible();
});