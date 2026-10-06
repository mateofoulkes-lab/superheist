const { test, expect } = require("@playwright/test");
const path = require("node:path");
for (const size of [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
])
  test(`Replay fits ${size.width}x${size.height}`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(size);
    await page.goto("/tools/game-replay/");
    await expect(page.locator("#stepCounter")).toContainText("Paso 1 /");
    const fit = await page.evaluate(() => {
      const r = document.querySelector("#board").getBoundingClientRect(),
        main = document.documentElement;
      return {
        pageWidth: main.scrollWidth,
        pageHeight: main.scrollHeight,
        boardBottom: r.bottom,
        boardRight: r.right,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
      };
    });
    expect(fit.pageWidth).toBeLessThanOrEqual(size.width);
    expect(fit.pageHeight).toBeLessThanOrEqual(size.height);
    expect(fit.boardBottom).toBeLessThan(size.height);
    expect(fit.boardRight).toBeLessThan(size.width);
    await page.locator("#nextBtn").click();
    await expect(page.locator("#stepCounter")).toContainText("Paso 2 /");
    await page.getByTitle("Ronda siguiente").click();
    await expect(page.locator("#phase")).toHaveText("Ronda 2");
    const inspected = await page.evaluate(() => {
      let maxStory = 0,
        maxPlayers = 0;
      for (let i = 0; i < example.story.steps.length; i++) {
        stepIndex = i;
        render();
        const el = document.querySelector(".story"),
          p = document.querySelector(".players");
        maxStory = Math.max(maxStory, el.scrollHeight - el.clientHeight);
        maxPlayers = Math.max(maxPlayers, p.scrollHeight - p.clientHeight);
      }
      return { maxStory, maxPlayers };
    });
    if (size.width >= 1280) {
      expect(
        inspected.maxStory,
        "step explanations fit without scrolling",
      ).toBeLessThanOrEqual(1);
      expect(inspected.maxPlayers).toBeLessThanOrEqual(1);
    }
    expect(errors).toEqual([]);
    await page.screenshot({ path: `artifacts/replay-${size.width}.png` });
  });
test("simulator generates, opens and navigates exact states", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/tools/simulator/");
  await page.locator("#seed").fill("conflicto-0");
  await page.locator("#profile").selectOption("conflict");
  await page.locator("#run").click();
  await expect(page.locator("#result")).toBeVisible();
  await page.locator("#replay").click();
  await expect(page).toHaveURL(/simulation=1/);
  await expect(page.locator("#stepCounter")).toContainText("Paso 1 /");
  const result = await page.evaluate(() => {
    stepIndex = example.story.steps.length - 1;
    render();
    return { result: example.result, state: currentState.result };
  });
  expect(result.state).toEqual(result.result);
  expect(result.state.pushes).toBeGreaterThan(0);
  await page.getByTitle("Volver al principio").click();
  await expect(page.locator("#phase")).toHaveText("Preparación");
  expect(errors).toEqual([]);
});
test("imports simulation JSON and keeps historical replay functional", async ({
  page,
}) => {
  await page.goto("/tools/game-replay/");
  await expect(page.locator("#stepCounter")).toContainText("Paso");
  await page
    .locator("#exampleSelect")
    .selectOption({ label: "Demo histórica · no valida reglas" });
  await expect(page.locator("#stepCounter")).toHaveText("Paso 1 / 6");
  await page.locator("#nextBtn").click();
  await expect(page.locator("#phase")).toHaveText("Ronda 1");
  await page
    .locator("#importFile")
    .setInputFiles(path.resolve("tools/game-replay/examples/conflicto.json"));
  await expect(page.locator("#exampleSelect")).toHaveText("Partida importada");
  await expect(page.locator("#phase")).toHaveText("Preparación");
});
test("rejects malformed imported replay without replacing current game", async ({
  page,
}) => {
  await page.goto("/tools/game-replay/");
  await expect(page.locator("#stepCounter")).toContainText("Paso");
  await page.locator("#importFile").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"bad":true}'),
  });
  await expect(page.locator("#notice")).toContainText("inválido");
  await expect(page.locator("#replayUI")).toBeVisible();
});

test("all bundled replays remain readable without internal scroll at 1280x720", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/tools/game-replay/");
  await expect(page.locator("#stepCounter")).toContainText("Paso");
  const layouts = await page.evaluate(async () => {
    const findings = [];
    for (const entry of manifest) {
      await loadExample(entry.file);
      for (let i = 0; i < example.story.steps.length; i++) {
        stepIndex = i;
        render();
        const story = document.querySelector(".story"),
          players = document.querySelector(".players");
        if (
          story.scrollHeight > story.clientHeight + 1 ||
          players.scrollHeight > players.clientHeight + 1
        )
          findings.push({
            game: entry.id,
            step: i,
            storyOverflow: story.scrollHeight - story.clientHeight,
            playersOverflow: players.scrollHeight - players.clientHeight,
          });
      }
    }
    return findings;
  });
  expect(layouts).toEqual([]);
});
