import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const API = "https://api.chess.com/pub/player";

// Chess.com's API is replaced by fixtures (real public-domain games): the test checks the
// import flow without depending on the network or on a real account.
function chessComGame(file: string, id: number, white: string, black: string, whiteResult: string) {
  const pgn = readFileSync(`tests/fixtures/${file}`, "utf-8")
    .replace(/\[White "[^"]*"\]/, `[White "${white}"]`)
    .replace(/\[Black "[^"]*"\]/, `[Black "${black}"]`)
    .replace("\n\n", `\n[Link "https://www.chess.com/game/live/${id}"]\n\n`);
  return {
    url: `https://www.chess.com/game/live/${id}`,
    uuid: `uuid-${id}`,
    pgn,
    end_time: 1_700_000_000 + id,
    time_class: "blitz",
    time_control: "180",
    rated: true,
    rules: "chess",
    white: { username: white, rating: 1500, result: whiteResult },
    black: { username: black, rating: 1450, result: whiteResult === "win" ? "checkmated" : "win" },
  };
}

async function mockChessCom(page: Page) {
  const requested: string[] = [];
  await page.route(`${API}/**`, async (route) => {
    const url = route.request().url();
    requested.push(url);
    const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
    if (url === `${API}/testplayer/games/archives`) {
      return route.fulfill({
        headers,
        body: JSON.stringify({ archives: [`${API}/testplayer/games/2024/05`] }),
      });
    }
    if (url === `${API}/testplayer/games/2024/05`) {
      return route.fulfill({
        headers,
        body: JSON.stringify({
          games: [
            chessComGame("opera.pgn", 101, "TestPlayer", "Rival", "win"),
            chessComGame("immortal.pgn", 102, "Rival", "TestPlayer", "win"),
          ],
        }),
      });
    }
    return route.fulfill({ status: 404, headers, body: "" });
  });
  return requested;
}

test("fetches recent Chess.com games, imports them and marks them as imported", async ({
  page,
}) => {
  const requested = await mockChessCom(page);
  await page.goto("/games");
  await page.getByRole("tab", { name: "Chess.com" }).click();
  await page.getByLabel("Pseudo Chess.com").fill("TestPlayer");
  await page.getByRole("button", { name: "Récupérer mes parties" }).click();

  const list = page.getByRole("list", { name: "Parties Chess.com récentes" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list).toContainText("contre Rival");
  // Results from the player's side: the Opera game is a win, the Immortal a loss.
  await expect(list.getByTitle("Victoire")).toHaveCount(1);
  await expect(list.getByTitle("Défaite")).toHaveCount(1);
  // Only the username went to Chess.com, lowercased in the API path.
  expect(requested[0]).toBe(`${API}/testplayer/games/archives`);

  await page.getByRole("button", { name: "Importer (2)" }).click();
  await expect(page.getByRole("status").filter({ hasText: "2 parties importées." })).toBeVisible();
  // Already imported: offered to open, no longer to import.
  await expect(list.getByRole("button", { name: "Ouvrir" })).toHaveCount(2);
  await expect(page.getByTestId("game-list").getByRole("listitem")).toHaveCount(2);

  // The username is remembered.
  await page.reload();
  await page.getByRole("tab", { name: "Chess.com" }).click();
  await expect(page.getByLabel("Pseudo Chess.com")).toHaveValue("TestPlayer");
});

test("reports an unknown Chess.com username", async ({ page }) => {
  await mockChessCom(page);
  await page.goto("/games");
  await page.getByRole("tab", { name: "Chess.com" }).click();
  await page.getByLabel("Pseudo Chess.com").fill("nobody_here");
  await page.getByRole("button", { name: "Récupérer mes parties" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Aucun joueur Chess.com n’a ce pseudo." }),
  ).toBeVisible();
});

test("is in French by default and switches to English, which is remembered", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Comprenez chacune de vos parties.",
  );
  // Light theme by default.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "outpost-light");

  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Understand every game you play.",
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Understand every game you play.",
  );
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("radio", { name: "Français" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Réglages");
});
