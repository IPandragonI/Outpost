import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const IMMORTAL = readFileSync("tests/fixtures/immortal.pgn", "utf-8");

test("phone: import a game, navigate with large controls, switch panels without losing the position", async ({
  page,
}) => {
  await page.goto("/games");
  await page.getByLabel("Texte PGN").fill(IMMORTAL);
  await page.getByRole("button", { name: "Importer", exact: true }).click();
  await expect(page).toHaveURL(/\/analysis\?game=/);

  // The board takes the width of the screen.
  const board = page.getByTestId("chessboard");
  const box = (await board.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.width).toBeGreaterThan(viewport.width * 0.9);

  // Navigation controls are within thumb reach and large enough to tap.
  const next = page.getByRole("button", { name: "Coup suivant" }).last();
  const nextBox = (await next.boundingBox())!;
  expect(nextBox.height).toBeGreaterThanOrEqual(44);
  expect(nextBox.width).toBeGreaterThanOrEqual(44);
  expect(nextBox.y).toBeGreaterThan(viewport.height * 0.8);

  for (let i = 0; i < 6; i++) await next.tap();
  const moves = page.getByTestId("move-list");
  await expect(moves.locator('[aria-current="step"]')).toHaveText("Qh4+");

  // Switching panels keeps the position.
  await page.getByRole("tab", { name: "Moteur" }).tap();
  await page.getByRole("tab", { name: "Ouvertures" }).tap();
  await expect(page.getByTestId("opening-explorer")).toBeVisible();
  await page.getByRole("tab", { name: "Coups" }).tap();
  await expect(moves.locator('[aria-current="step"]')).toHaveText("Qh4+");

  // The advantage chart sits below the move assessment and above the moves.
  const insightBox = (await page.getByTestId("move-box").boundingBox())!;
  const graphBox = (await page.getByTestId("eval-graph").boundingBox())!;
  const listBox = (await moves.boundingBox())!;
  expect(graphBox.y).toBeGreaterThanOrEqual(insightBox.y + insightBox.height);
  expect(graphBox.y + graphBox.height).toBeLessThanOrEqual(listBox.y);

  // No horizontal scrolling.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("phone: tap-to-move on an empty board enters a game", async ({ page }) => {
  await page.goto(
    "/analysis?fen=" +
      encodeURIComponent("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),
  );
  await page.locator("#board-square-e2").tap();
  await page.locator("#board-square-e4").tap();
  await page.locator("#board-square-e7").tap();
  await page.locator("#board-square-e5").tap();
  const moves = page.getByTestId("move-list");
  await expect(moves.getByRole("button", { name: "e4" })).toBeVisible();
  await expect(moves.locator('[aria-current="step"]')).toHaveText("e5");
  // An illegal tap does nothing.
  await page.locator("#board-square-e4").tap();
  await page.locator("#board-square-e6").tap();
  await expect(moves.locator('[aria-current="step"]')).toHaveText("e5");
});
