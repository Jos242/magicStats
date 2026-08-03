const { expect, test } = require("@playwright/test");

const tabs = [
  ["summary", "Resumen"],
  ["charts", "Graficos"],
  ["reports", "Reportes"],
  ["matchups", "Matchups"],
  ["profiles", "Perfiles"],
  ["players", "Jugadores/Decks"],
  ["history", "Partidas"],
  ["combat", "Combate"],
  ["extras", "Badges/Calidad"],
];

test("dashboard loads and tab panels switch without JS errors", async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await expect(page.locator("#statusMessage")).toContainText("Datos cargados");
  await expect(page.locator("#visibleCounter")).toContainText("partidas visibles");

  await expect(page.locator("#tab-summary")).toBeVisible();
  await expect(page.locator("#tab-charts")).toBeHidden();

  for (const [tabName, label] of tabs) {
    await page.getByRole("tab", { name: label }).click();
    await expect(page.locator(`#tab-${tabName}`)).toBeVisible();
    await expect(page.getByRole("tab", { name: label })).toHaveAttribute("aria-selected", "true");
  }

  await page.getByRole("tab", { name: "Graficos" }).click();
  await expect(page.locator("#winsByPlayerChart")).toBeVisible();

  await page.getByRole("tab", { name: "Reportes" }).click();
  await expect(page.locator("#reportSummary .kpi").first()).toBeVisible();
  await expect(page.locator("#periodRankingChart")).toBeVisible();
  await expect(page.locator("#discordSummaryText")).toHaveValue(/MTG Commander/);

  await page.getByRole("tab", { name: "Matchups" }).click();
  await expect(page.locator("#deckMatchupMatrix")).toBeVisible();
  await expect(page.locator("#matchupTable")).toBeVisible();

  await page.getByRole("tab", { name: "Perfiles" }).click();
  await expect(page.locator("#playerProfileSummary .kpi").first()).toBeVisible();
  await expect(page.locator("#deckProfileSummary .kpi").first()).toBeVisible();

  await page.getByRole("tab", { name: "Partidas" }).click();
  await expect(page.locator("#gamesTable table")).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});