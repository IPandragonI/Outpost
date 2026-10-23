import { expect, test } from "@playwright/test";

const POSITION = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 2 3";

test("works offline once the app and engine have been loaded", async ({ page, context }) => {
  // First visit online: the service worker installs and precaches the app.
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  // Use the engine once so its files are cached.
  await page.goto(`/analysis?fen=${encodeURIComponent(POSITION)}`);
  await expect(page.getByText(/Profondeur \d+/).first()).toBeVisible({ timeout: 60_000 });

  // Offline: the app, the engine and the opening book keep working.
  await context.setOffline(true);
  await page.goto(`/analysis?fen=${encodeURIComponent(POSITION)}`);
  await expect(page.getByRole("banner").getByText("Hors ligne")).toBeVisible();
  await expect(page.getByRole("list", { name: "Variantes principales" })).toContainText("Qxf7#", {
    timeout: 60_000,
  });
  await page.getByRole("tab", { name: "Ouvertures" }).click();
  await expect(page.getByTestId("opening-explorer")).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByText("Disponible hors ligne").first()).toBeVisible();
  await context.setOffline(false);
});
