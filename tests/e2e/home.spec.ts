import { expect, test } from "@playwright/test";

test("renders an accessible platform landing page", async ({ page }) => {
  await page.route("**/api/v1/health/live", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "ok",
        service: "slabx-api",
        version: "0.1.0",
        timestamp: new Date().toISOString(),
      }),
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /great cards deserve/i }),
  ).toBeVisible();
  await expect(page.getByText("Platform online")).toBeVisible();
});
