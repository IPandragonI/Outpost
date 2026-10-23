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

  // 3. Start the analysis (quick preset keeps the test short).
  await page.getByRole("tab", { name: "Bilan" }).click();
  await page.getByLabel(/Profondeur d.analyse/).selectOption("quick");
  await page.getByRole("button", { name: "Analyser la partie" }).click();

  // 4. Engine evaluations become visible, for the whole game.
  await expect(page.getByText(/Les 34 positions sont analysées/)).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId("eval-graph")).toBeVisible();

  // 5. Classifications appear, with each player's precision.
  const report = page.getByTestId("game-report");
  await expect(report.getByText("Précision").first()).toBeVisible();
  await expect(report.getByRole("row", { name: /Théorie/ })).toBeVisible();

  // 6. Select an error and view the recommended alternative.
  await report.getByRole("heading", { name: "Plus grosses erreurs" }).waitFor();
  await report.locator("ul").first().getByRole("button").first().click();
  const insight = page.getByTestId("move-insight");
  await expect(insight.getByText("Meilleur coup trouvé par Stockfish")).toBeVisible();
  await insight.getByRole("button", { name: "Voir la meilleure ligne" }).click();
  const preview = page.getByRole("region", { name: "Aperçu de ligne" });
  await expect(preview).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();

  // 7. Open the opening explorer at the start of the game.
  await page.keyboard.press("Home");
  await page.getByRole("tab", { name: "Ouvertures" }).click();
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
  await page.getByRole("tab", { name: "Bilan" }).click();
  await expect(page.getByText(/Les 34 positions sont analysées/)).toBeVisible();
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
  await page.getByRole("tab", { name: "Bilan" }).click();
  await page.getByLabel(/Profondeur d.analyse/).selectOption("deep");
  await page.getByRole("button", { name: "Analyser la partie" }).click();
  await expect(page.getByText(/Analyse… \d+ positions sur 34/)).toBeVisible();

  // Jump around while the background analysis runs: the live engine answers for the
  // position on the board, and the analysis keeps going.
  await page.getByTestId("move-list").getByRole("button", { name: "Bxd7+" }).click();
  await page.getByRole("tab", { name: "Moteur" }).click();
  await expect(page.getByText(/Profondeur \d+/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("list", { name: "Variantes principales" })).toContainText("Qb8+");

  // Cancel: the progress is kept as a partial analysis.
  await page.getByRole("tab", { name: "Bilan" }).click();
  await page.getByRole("button", { name: "Arrêter" }).click();
  await expect(page.getByText(/Analyse partielle : \d+ positions sur 34/)).toBeVisible();
});
