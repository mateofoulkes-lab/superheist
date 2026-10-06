const { test, expect } = require("@playwright/test");
async function start(page, seed = "mesa-17") {
  await page.goto("/tools/playable/");
  await page.locator("#seed").fill(seed);
  await page.getByRole("button", { name: "Repartir cartas y entrar" }).click();
  await expect(page.locator("#turnBanner")).toContainText("Tu turno");
}
for (const size of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
])
  test(`playable table visible at ${size.width}`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(size);
    await start(page);
    await expect(page.locator(".game-card")).toHaveCount(3);
    await expect(page.locator(".room")).toHaveCount(11);
    await expect(page.locator(".pawn.player")).toHaveCount(4);
    const geometry = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      panels: [
        ...document.querySelectorAll(".crew-panel,.hand-panel,.command-panel"),
      ].map((n) => ({ scroll: n.scrollHeight, client: n.clientHeight })),
      rooms: [...document.querySelectorAll(".room")].map((n) => {
        const r = n.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
      }),
      viewport: document
        .querySelector("#boardViewport")
        .getBoundingClientRect()
        .toJSON(),
    }));
    expect(geometry.width).toBeLessThanOrEqual(size.width);
    if (size.width > 900) {
      expect(geometry.height).toBeLessThanOrEqual(size.height);
      for (const p of geometry.panels)
        expect(p.scroll).toBeLessThanOrEqual(p.client + 1);
      for (const r of geometry.rooms) {
        expect(r.x).toBeGreaterThanOrEqual(geometry.viewport.x);
        expect(r.right).toBeLessThanOrEqual(geometry.viewport.right);
        expect(r.y).toBeGreaterThanOrEqual(geometry.viewport.y - 5);
        expect(r.bottom).toBeLessThanOrEqual(geometry.viewport.bottom + 5);
      }
    }
    await page.screenshot({
      path: `artifacts/mesa-${size.width}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
test("movement triggers bots, saves and resumes the same table", async ({
  page,
}) => {
  await start(page);
  await page.locator("#speed").click();
  await page.locator('[data-room="4,4"] .room-name').click();
  await page
    .getByRole("button", { name: "Mover a Recepción", exact: true })
    .click();
  await expect(page.locator("#turnBanner")).toContainText("Tu turno", {
    timeout: 15000,
  });
  const state = await page.evaluate(() => ({
    round: game.state.round,
    steps: game.steps.length,
    position: game.observation().me.position,
  }));
  expect(state.round).toBe(2);
  expect(state.steps).toBeGreaterThan(5);
  expect(state.position).toBe("4,4");
  await page.reload();
  await page.getByRole("button", { name: "Continuar mi atraco" }).click();
  expect(await page.evaluate(() => game.steps.length)).toBe(state.steps);
  await page.locator("#toggleView").click();
  await expect(page.locator(".playfield")).toHaveClass(/topdown/);
});
test("other player cards stay face down; own item can be held then dropped free", async ({
  page,
}) => {
  await start(page);
  await page.locator('[data-player="J2"]').click();
  await expect(page.locator(".secret-card")).toContainText("BOCA ABAJO");
  await page.locator("#closeDetail").click();
  await page.locator("#bag .item-slot").first().click();
  await page
    .getByRole("button", { name: "Pasar a mano 1", exact: true })
    .click();
  await expect(page.locator("#hands .item-slot").first()).not.toHaveClass(
    /empty/,
  );
  await page.locator("#speed").click();
  await expect(page.locator("#turnBanner")).toContainText("Tu turno", {
    timeout: 15000,
  });
  const before = await page.evaluate(() => game.cursor);
  await page.locator("#hands .item-slot").first().click();
  await page.getByRole("button", { name: "Soltar gratis" }).click();
  expect(await page.evaluate(() => game.cursor)).toBe(before);
  await expect(page.locator("#hands .item-slot").first()).toHaveClass(/empty/);
});

test("a complete interactive game reaches an ending and opens its Replay", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page, "mesa-17");
  await page.locator("#speed").click();
  const outcome = await page.evaluate(async () => {
    const deadline = Date.now() + 40000;
    while (!game.state.ended && Date.now() < deadline) {
      if (game.isHumanTurn() && !running)
        play(E.decide(game.observation()).action);
      await new Promise((r) => setTimeout(r, 20));
    }
    return { ended: game.state.ended, steps: game.steps.length };
  });
  expect(outcome.ended).toBe(true);
  await expect(page.locator("#ending")).toBeVisible();
  await page.reload();
  await page.locator("#resume").click();
  await expect(page.locator("#ending")).toBeVisible();
  await page.locator("#watchReplay").click();
  await expect(page.locator("#stepCounter")).toContainText(
    "Paso 1 / " + outcome.steps,
  );
  expect(errors).toEqual([]);
});
