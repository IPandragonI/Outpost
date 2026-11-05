import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const OPERA = readFileSync("tests/fixtures/opera.pgn", "utf-8");

test("import, analyze, review a blunder, explore theory, and keep everything after a reload", async ({
  page,
}) => {
  // 1. Import a valid PGN.
  await page.goto("/games");
  await page.getByLabel("Texte PGN").fill(OPERA);
  await page.getByRole("button", { name: "Importer", exact: true }).click();

  // 2. The game appears on the board.
  await expect(page).toHaveURL(/\/analysis\?game=/);
  await expect(page.getByRole("heading", { name: /Paul Morphy/ })).toBeVisible();
  await expect(page.getByTestId("chessboard")).toBeVisible();
  await expect(page.getByTestId("move-list").getByRole("button", { name: "Rd8#" })).toBeVisible();
  const gameUrl = page.url();

  // 3. Game Review is the first tab and is selected; the analysis started by itself.
  const tabs = page.getByRole("tab");
  await expect(tabs.nth(0)).toHaveText(/Bilan/);
  await expect(tabs.nth(1)).toHaveText("Moteur");
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Ouvertures" })).toHaveCount(0);
  await expect(page.getByText(/Analyse du coup/)).toBeVisible();
  // Switch to the quick preset to keep the test short: stop, pick it, start again.
  await page.getByRole("button", { name: "Arrêter" }).click();
  await page.getByLabel(/Profondeur d.analyse/).selectOption("quick");
  await page.getByRole("button", { name: "Analyser la partie" }).click();

  // 4. Results fill in progressively; when all positions are done the run says so.
  await expect(page.getByText(/Analyse terminée/)).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText("34 positions analysées sur 34")).toBeVisible();
  await expect(page.getByTestId("eval-graph")).toBeVisible();

  // 5. Classifications appear, with each player's precision.
  const report = page.getByTestId("game-report");
  await expect(report.getByText("Précision").first()).toBeVisible();
  await expect(report.getByRole("row", { name: /Théorie/ })).toBeVisible();

  // 6. Select an error and view the recommended alternative.
  await report.getByRole("heading", { name: "Plus grosses erreurs" }).waitFor();
  await report
    .getByRole("heading", { name: "Plus grosses erreurs" })
    .locator("xpath=following-sibling::ul")
    .getByRole("button")
    .first()
    .click();
  const insight = page.getByTestId("move-insight");
  await expect(insight.getByText("Meilleur coup", { exact: true })).toBeVisible();
  await insight.getByRole("button", { name: "Voir la meilleure ligne" }).click();
  const preview = page.getByRole("region", { name: "Aperçu de ligne" });
  await expect(preview).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();

  // 7. Open the opening explorer at the start of the game.
  await page.keyboard.press("Home");
  await page.getByText("Explorateur d’ouvertures").click();
  const explorer = page.getByTestId("opening-explorer");
  await expect(explorer.getByRole("cell", { name: /^e4/ })).toBeVisible();

  // 8. Explore a theoretical continuation without touching the game.
  await explorer
    .getByRole("button", { name: "Prévisualiser la ligne principale après d4" })
    .click();
  await expect(page.getByRole("region", { name: "Aperçu de ligne" })).toContainText("Théorie : d4");
  await page.getByRole("button", { name: "Garder comme variante" }).click();
  await expect(page.getByRole("button", { name: "Partie", exact: true })).toBeVisible(); // off the main line
  await page.getByRole("button", { name: "Partie", exact: true }).click();

  // 9. Reload: the game, its explored variation and its analysis are still there.
  await page.goto(gameUrl);
  await expect(page.getByRole("heading", { name: /Paul Morphy/ })).toBeVisible();
  await expect(page.getByText(/Analyse terminée/)).toBeVisible();
  await expect(
    page.getByTestId("move-list").getByRole("button", { name: "d4" }).first(),
  ).toBeVisible();

  // 10. The library lists the game as analyzed.
  await page.getByRole("link", { name: "Parties", exact: true }).click();
  const list = page.getByTestId("game-list");
  await expect(list.getByText(/Paul Morphy/)).toBeVisible();
  await expect(list.getByText("Analysée")).toBeVisible();
});

test("reports invalid PGN with the faulty move", async ({ page }) => {
  await page.goto("/games");
  await page.getByLabel("Texte PGN").fill('[Event "Bad"]\n\n1. e4 e5 2. Ke3 *');
  await page.getByRole("button", { name: "Importer", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("2. Ke3");
});

test("navigating while the analysis runs keeps the board and engine in sync", async ({ page }) => {
  await page.goto("/games");
  await page.getByLabel("Texte PGN").fill(OPERA);
  await page.getByRole("button", { name: "Importer", exact: true }).click();
  await expect(page).toHaveURL(/\/analysis\?game=/);
  // The analysis starts by itself when the game opens.
  await expect(page.getByText(/Analyse du coup/)).toBeVisible();

  // Jump around while the background analysis runs: the live engine answers for the
  // position on the board, and the analysis keeps going.
  await page.getByTestId("move-list").getByRole("button", { name: "Bxd7+" }).click();
  await page.getByRole("tab", { name: "Moteur" }).click();
  await expect(page.getByTestId("engine-summary")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("list", { name: "Variantes principales" })).toContainText("Qb8+");

  // Cancel: the progress is kept, and the analysis can be resumed.
  await page.getByRole("tab", { name: /Bilan/ }).click();
  await page.getByRole("button", { name: "Arrêter" }).click();
  await expect(page.getByText(/Analyse arrêtée/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reprendre l’analyse" })).toBeVisible();
});
