import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const OPERA = readFileSync("tests/fixtures/opera.pgn", "utf-8");

test("import, analyze, review a blunder, explore theory, and keep everything after a reload", async ({
  page,
}) => {
  // 1. Import a valid PGN.
  await page.goto("/games");
  await page.getByRole("tab", { name: "Coller un PGN" }).click();
  await page.getByLabel("Texte PGN").fill(OPERA);
  await page.getByRole("button", { name: "Importer", exact: true }).click();

  // 2. The game appears on the board.
  await expect(page).toHaveURL(/\/analysis\?game=/);
  await expect(page.getByRole("heading", { name: /Paul Morphy/ })).toBeVisible();
  await expect(page.getByTestId("chessboard")).toBeVisible();
  const gameUrl = page.url();

  // 3. The game opens on the review start screen and is analyzed by itself; "Démarrer le
  // bilan" stays disabled until that analysis is complete.
  const start = page.getByTestId("review-start");
  await expect(start).toBeVisible();
  const startButton = start.getByRole("button", { name: "Démarrer le bilan" });
  await expect(startButton).toBeDisabled();
  // Pick the quick preset to keep the test short (this restarts the analysis).
  await page.getByLabel(/Profondeur d.analyse/).selectOption("quick");
  await expect(startButton).toBeEnabled({ timeout: 180_000 });
  // The mini debrief, the players' precision and the move table come from that analysis.
  await expect(start.getByTestId("debrief")).toBeVisible();
  await expect(start.getByText(/précision \d+\.\d/i)).toBeVisible();
  await expect(start.getByRole("row", { name: /Théorie/ })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  // The button only opens the review: no analysis starts again.
  await startButton.click();

  // The three tabs appear (Game Review first); the Moves tab is selected and the first move
  // has been played by itself.
  const tabs = page.getByRole("tab");
  await expect(tabs.nth(0)).toHaveText(/Bilan/);
  await expect(tabs.nth(1)).toHaveText("Coups");
  await expect(tabs.nth(2)).toHaveText("Moteur");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("move-list").locator('[aria-current="step"]')).toHaveText("e4");
  await expect(page.getByRole("tab", { name: "Ouvertures" })).toHaveCount(0);

  // 4. The review is already complete: no progress controls, just a button to run it again.
  await page.getByRole("tab", { name: /Bilan/ }).click();
  // The debrief closes the report.
  const report = page.getByTestId("game-report");
  await expect(report.getByTestId("debrief")).toBeVisible();
  expect(await report.evaluate((el) => el.lastElementChild?.getAttribute("data-testid"))).toBe(
    "debrief",
  );
  await expect(page.getByRole("button", { name: "Relancer l’analyse" })).toBeVisible();
  await expect(page.getByTestId("analysis-runner")).toHaveCount(0);
  // The advantage chart lives in the Moves tab.
  await page.getByRole("tab", { name: "Coups" }).click();
  await expect(page.getByTestId("eval-graph")).toBeVisible();
  await page.getByRole("tab", { name: /Bilan/ }).click();

  // 5. Classifications appear, with each player's precision.
  await expect(report.getByText("Précision").first()).toBeVisible();
  await expect(report.getByRole("row", { name: /Théorie/ })).toBeVisible();
  // Precision by phase and the estimated level are part of the review.
  await expect(
    report.getByTestId("phase-precision").getByRole("row", { name: /Ouverture/ }),
  ).toBeVisible();
  await expect(report.getByText(/Niveau estimé/).first()).toBeVisible();

  // 6. Select an error and view the recommended alternative.
  await report.getByRole("heading", { name: "Plus grosses erreurs" }).waitFor();
  await report
    .getByRole("heading", { name: "Plus grosses erreurs" })
    .locator("xpath=following-sibling::ul")
    .getByRole("button")
    .first()
    .click();
  await page.getByRole("tab", { name: "Coups" }).click();
  const insight = page.getByTestId("move-insight");
  await expect(insight.getByText("Meilleur coup", { exact: true })).toBeVisible();
  await insight.getByRole("button", { name: "Voir la meilleure ligne" }).click();
  const preview = page.getByRole("region", { name: "Aperçu de ligne" });
  await expect(preview).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();

  // 7. Open the opening explorer at the start of the game.
  await page.keyboard.press("Home");
  await page.getByRole("tab", { name: /Bilan/ }).click();
  await page.getByText("Explorateur d’ouvertures").click();
  const explorer = page.getByTestId("opening-explorer");
  await expect(explorer.getByRole("cell", { name: /^e4/ })).toBeVisible();

  // 8. Explore a theoretical continuation without touching the game.
  await explorer
    .getByRole("button", { name: "Prévisualiser la ligne principale après d4" })
    .click();
  await expect(page.getByRole("region", { name: "Aperçu de ligne" })).toContainText("Théorie : d4");
  await page.getByRole("button", { name: "Garder comme variante" }).click();
  await page.getByRole("tab", { name: "Coups" }).click();
  await expect(page.getByRole("button", { name: "Partie", exact: true })).toBeVisible(); // off the main line
  await page.getByRole("button", { name: "Partie", exact: true }).click();

  // 9. Reload: the game, its explored variation and its analysis are still there.
  await page.goto(gameUrl);
  await expect(page.getByRole("heading", { name: /Paul Morphy/ })).toBeVisible();
  await page.getByRole("tab", { name: /Bilan/ }).click();
  await expect(page.getByRole("button", { name: "Relancer l’analyse" })).toBeVisible();
  await page.getByRole("tab", { name: "Coups" }).click();
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
  await page.getByRole("tab", { name: "Coller un PGN" }).click();
  await page.getByLabel("Texte PGN").fill('[Event "Bad"]\n\n1. e4 e5 2. Ke3 *');
  await page.getByRole("button", { name: "Importer", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("2. Ke3");
});

test("the analysis starts by itself and the review opens once it is complete", async ({ page }) => {
  await page.goto("/games");
  await page.getByRole("tab", { name: "Coller un PGN" }).click();
  await page.getByLabel("Texte PGN").fill(OPERA);
  await page.getByRole("button", { name: "Importer", exact: true }).click();
  await expect(page).toHaveURL(/\/analysis\?game=/);

  // The deepest preset keeps the analysis running long enough to check the waiting state.
  await page.getByLabel(/Profondeur d.analyse/).selectOption("deep");
  const startButton = page.getByRole("button", { name: "Démarrer le bilan" });
  await expect(page.getByText(/Analyse de la partie… \d+ positions sur \d+/)).toBeVisible();
  await expect(startButton).toBeDisabled();
  // The board can be browsed meanwhile, with the keyboard.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(startButton).toBeDisabled();

  // Back to a quick analysis, then open the review.
  await page.getByLabel(/Profondeur d.analyse/).selectOption("quick");
  await expect(startButton).toBeEnabled({ timeout: 180_000 });
  await startButton.click();

  // The live engine answers for the position selected in the move list.
  await page.getByRole("tab", { name: "Coups" }).click();
  await page.getByTestId("move-list").getByRole("button", { name: "Bxd7+" }).click();
  await page.getByRole("tab", { name: "Moteur" }).click();
  await expect(page.getByTestId("engine-summary")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("list", { name: "Variantes principales" })).toContainText(
    /15…Nxd7 16\.Q/,
  );

  // Nothing runs again: the Game Review tab has no progress, only a button to run it again.
  await page.getByRole("tab", { name: /Bilan/ }).click();
  await expect(page.getByRole("button", { name: "Relancer l’analyse" })).toBeVisible();
  await expect(page.getByTestId("analysis-runner")).toHaveCount(0);
});
