import { expect, test } from "@playwright/test";

test("the openings grid leads to an opening whose lines can be played on the board", async ({
  page,
}) => {
  await page.goto("/openings");
  await expect(page.getByRole("heading", { name: "Ouvertures des Blancs" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Défenses des Noirs" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Défense sicilienne/ })).toBeVisible();

  await page.getByRole("link", { name: /Partie italienne/ }).click();
  await expect(page).toHaveURL(/\/openings\?o=italian$/);
  const detail = page.getByTestId("opening-detail");
  await expect(detail.getByRole("heading", { level: 1 })).toHaveText("Partie italienne");
  // The board opens on the opening's defining position (1.e4 e5 2.Nf3 Nc6 3.Bc4).
  await expect(page.locator("#opening-board-square-c4 [data-piece]")).toHaveAttribute(
    "data-piece",
    "wB",
  );

  // Switch to a variation, then jump to its last move.
  const tab = page.getByRole("tab", { name: /Giuoco Pianissimo/ });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Dernier coup" }).click();
  await expect(page.getByRole("link", { name: "Analyser cette position" })).toHaveAttribute(
    "href",
    /moves=e2e4,e7e5,g1f3,b8c6,f1c4,f8c5,c2c3,g8f6,d2d3,d7d6,e1g1,e8g8$/,
  );

  await page.getByRole("link", { name: "Toutes les ouvertures" }).click();
  await expect(page).toHaveURL(/\/openings$/);
  // The advanced tools are still there.
  await page.getByRole("link", { name: "Explorateur et répertoire" }).click();
  await expect(page).toHaveURL(/view=studio/);
});

test("board colours, sound and sensitivity settings are kept", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("radio", { name: "Personnalisé" }).click();
  await expect(page.getByLabel("Cases claires")).toBeVisible();
  await page.getByLabel("Vitesse des animations").selectOption("slow");
  await page.getByLabel("Sensibilité du classement").selectOption("strict");
  const sound = page.getByRole("checkbox", { name: "Effets sonores" });
  await expect(sound).toBeChecked();
  await sound.uncheck();
  await expect(page.getByRole("button", { name: "Tester" })).toBeDisabled();

  await page.reload();
  await expect(page.getByRole("radio", { name: "Personnalisé" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByLabel("Vitesse des animations")).toHaveValue("slow");
  await expect(page.getByLabel("Sensibilité du classement")).toHaveValue("strict");
  await expect(page.getByRole("checkbox", { name: "Effets sonores" })).not.toBeChecked();
});
