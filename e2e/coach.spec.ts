import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const OPERA = readFileSync("tests/fixtures/opera.pgn", "utf-8");

test("the Coach tab builds a profile from an analyzed game: level, results, accuracy, openings", async ({
  page,
}) => {
  // A game, analyzed to the end (the quick preset keeps the test short).
  await page.goto("/games");
  await page.getByRole("tab", { name: "Coller un PGN" }).click();
  await page.getByLabel("Texte PGN").fill(OPERA);
  await page.getByRole("button", { name: "Importer", exact: true }).click();
  await expect(page).toHaveURL(/\/analysis\?game=/);
  await page.getByLabel(/Profondeur d.analyse/).selectOption("quick");
  await expect(page.getByRole("button", { name: "Démarrer le bilan" })).toBeEnabled({
    timeout: 180_000,
  });

  // The "Coach" tab is in the navigation, right after the analysis.
  const nav = page.getByTestId("sidebar");
  const labels = await nav.getByRole("link").allInnerTexts();
  expect(labels.map((l) => l.trim()).filter(Boolean)).toEqual(
    expect.arrayContaining(["Analyse", "Coach"]),
  );
  await nav.getByRole("link", { name: "Coach", exact: true }).click();
  await expect(page).toHaveURL(/\/coach$/);

  // Without a player name nothing can be told apart: it asks for one.
  await expect(page.getByLabel("Votre pseudo")).toBeVisible();
  await page.getByLabel("Votre pseudo").fill("Paul Morphy");
  await page.getByRole("button", { name: "Enregistrer" }).click();

  const profile = page.getByTestId("coach-profile");
  await expect(profile).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("coach-username")).toHaveText("Paul Morphy");
  await expect(profile.getByTestId("level-estimate")).toContainText("~");
  await expect(profile.getByText("1 partie analysée").first()).toBeVisible();
  // Morphy (White) won this game.
  const results = profile.getByRole("region", { name: "Résultats" });
  await expect(results.getByText("Victoires").first()).toBeVisible();
  await expect(results.getByText("Score 100 %", { exact: true })).toBeVisible();
  // Accuracy by phase, move quality and the openings played with White.
  await expect(
    profile.getByRole("region", { name: "Précision" }).getByText("Ouverture"),
  ).toBeVisible();
  await expect(
    profile.getByRole("region", { name: "Qualité des coups, pour 100 coups" }),
  ).toBeVisible();
  await expect(
    profile.getByRole("region", { name: "Ouvertures" }).getByText("Philidor"),
  ).toBeVisible();

  // The profile is rebuilt from the stored summary after a reload.
  await page.reload();
  await expect(page.getByTestId("coach-profile")).toBeVisible({ timeout: 60_000 });
});

test("a player with no analyzed game is told how to fill the profile", async ({ page }) => {
  await page.goto("/coach");
  await page.getByLabel("Votre pseudo").fill("Nobody");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByTestId("coach-empty")).toBeVisible();
  await expect(page.getByRole("link", { name: "Voir les parties" })).toBeVisible();
});
