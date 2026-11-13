import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Playwright cannot intercept requests that go through the app's service worker, and the
// Chess.com API is replaced by a fixture here.
test.use({ serviceWorkers: "block" });

// A long game with plenty of moves played while the position was still open.
const GAME = readFileSync("tests/fixtures/immortal.pgn", "utf-8");

test("the Coach tab builds a profile from an analyzed game: level, results, accuracy, openings", async ({
  page,
}) => {
  // A game, analyzed to the end (the quick preset keeps the test short).
  await page.goto("/games");
  await page.getByRole("tab", { name: "Coller un PGN" }).click();
  await page.getByLabel("Texte PGN").fill(GAME);
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
  await page.getByLabel("Votre pseudo").fill("Adolf Anderssen");
  await page.getByRole("button", { name: "Enregistrer" }).click();

  const profile = page.getByTestId("coach-profile");
  await expect(profile).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("coach-username")).toHaveText("Adolf Anderssen");
  await expect(profile.getByTestId("level-estimate")).toContainText("~");
  await expect(profile.getByText("1 partie analysée").first()).toBeVisible();
  // Anderssen (White) won this game.
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
    profile.getByRole("region", { name: "Ouvertures" }).getByText("King's Gambit").first(),
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

const API = "https://api.chess.com/pub/player";

/** Chess.com's API, replaced by a 600-rated player's history: a third won, a third lost, a third drawn. */
async function mockHistory(page: import("@playwright/test").Page) {
  const now = Math.floor(Date.now() / 1000);
  const results = ["win", "resigned", "agreed"];
  const games = Array.from({ length: 45 }, (_, i) => ({
    end_time: now - i * 3600,
    time_class: "blitz",
    rated: true,
    rules: "chess",
    white: { username: "testplayer", rating: 600, result: results[i % 3] },
    black: { username: "rival", rating: 610, result: "x" },
  }));
  await page.route(`${API}/**`, async (route) => {
    const url = route.request().url();
    const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
    if (url.endsWith("/games/archives")) {
      return route.fulfill({
        headers,
        body: JSON.stringify({ archives: [`${API}/testplayer/games/2024/05`] }),
      });
    }
    if (url.endsWith("/games/2024/05")) {
      return route.fulfill({ headers, body: JSON.stringify({ games }) });
    }
    if (url.endsWith("/stats")) {
      return route.fulfill({
        headers,
        body: JSON.stringify({ chess_blitz: { last: { rating: 600 }, best: { rating: 650 } } }),
      });
    }
    return route.fulfill({ status: 404, headers, body: "" });
  });
}

test("the Coach tab anchors the level to the Chess.com history instead of trusting the moves alone", async ({
  page,
}) => {
  await mockHistory(page);
  // One analyzed game, won: not a fair sample of a player who wins a third of their games.
  await page.goto("/games");
  await page.getByRole("tab", { name: "Coller un PGN" }).click();
  await page
    .getByLabel("Texte PGN")
    .fill(GAME.replace(/\[White "[^"]*"\]/, '[White "testplayer"]'));
  await page.getByRole("button", { name: "Importer", exact: true }).click();
  await expect(page).toHaveURL(/\/analysis\?game=/);
  await page.getByLabel(/Profondeur d.analyse/).selectOption("quick");
  await expect(page.getByRole("button", { name: "Démarrer le bilan" })).toBeEnabled({
    timeout: 180_000,
  });

  await page.goto("/coach");
  await page.getByLabel("Votre pseudo").fill("testplayer");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  const profile = page.getByTestId("coach-profile");
  await expect(profile).toBeVisible({ timeout: 60_000 });
  // Without the history the estimate is not anchored, and says so.
  await expect(profile.getByTestId("level-anchor")).toContainText("Non calé");

  await page.getByRole("button", { name: "Charger mon historique Chess.com" }).click();
  await expect(page.getByTestId("history-summary")).toContainText("45 parties lues");
  await expect(profile.getByTestId("level-anchor")).toContainText("Calé sur votre classement");
  await expect(profile.getByTestId("level-anchor")).toContainText("600");
  // The estimate follows the real rating (600), not what the moves alone would suggest.
  const text = await profile.getByTestId("level-estimate").innerText();
  const estimate = Number(/(\d+)/.exec(text)![1]);
  expect(estimate).toBeGreaterThanOrEqual(550);
  expect(estimate).toBeLessThan(900);
  // The analyzed game was a win: the sample is flagged as unrepresentative.
  await expect(profile.getByTestId("selection-bias")).toBeVisible();
  // Style and habits are there.
  await expect(profile.getByRole("region", { name: "Style de jeu" })).toBeVisible();

  // The history is kept: it is still there after a reload.
  await page.reload();
  await expect(page.getByTestId("history-summary")).toContainText("45 parties lues");
});
