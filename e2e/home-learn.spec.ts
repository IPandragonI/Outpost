import { expect, test } from "@playwright/test";

test("the home page presents the app and leads to the library and the lessons", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Comprenez chacune de vos parties.",
  );
  // No PGN text area on arrival: the app is presented first.
  await expect(page.getByLabel("Texte PGN")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Stockfish sur votre appareil" })).toBeVisible();

  await page.getByRole("link", { name: "Analyser une partie" }).click();
  await expect(page).toHaveURL(/\/games$/);
  await expect(page.getByLabel("Texte PGN")).toBeVisible();
});

test("a lesson can be stepped through and its exercise solved on the board", async ({ page }) => {
  await page.goto("/learn");
  await expect(page.getByText("Exercices résolus : 0 sur 7.")).toBeVisible();
  await page.getByRole("link", { name: /Le mat du couloir/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Le mat du couloir");

  const exercise = page.getByTestId("exercise");
  // A wrong move first: e1 to e2.
  await page.locator("#exercise-board-square-e1").click();
  await page.locator("#exercise-board-square-e2").click();
  await expect(exercise).toContainText("Re2 n’est pas le coup");
  // Then the mate: Re8#.
  await page.locator("#exercise-board-square-e1").click();
  await page.locator("#exercise-board-square-e8").click();
  await expect(exercise).toContainText("Bravo : Re8# !");

  // Progress is remembered.
  await page.getByRole("link", { name: "Toutes les leçons" }).click();
  await expect(page.getByText("Exercices résolus : 1 sur 7.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Exercices résolus : 1 sur 7.")).toBeVisible();
});

test("an opening lesson line can be replayed move by move", async ({ page }) => {
  await page.goto("/learn?lesson=center");
  await expect(page.getByText("0 / 7")).toBeVisible();
  await page.getByRole("button", { name: "Coup suivant" }).click();
  await page.getByRole("button", { name: "Coup suivant" }).click();
  await expect(page.getByText("2 / 7")).toBeVisible();
  await page.getByRole("button", { name: /Nxd4/ }).click();
  await expect(page.getByText("7 / 7")).toBeVisible();
});
