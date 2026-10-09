import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => server.close());
const { validateAssistive, normalizePosition, positionScreen, positionMenu, moveShortcut, SIZE_BUTTON } = await server.ssrLoadModule("/src/windows/assistive/rules.ts");

test("Legacy AssistiveTouch data retains its keys while invalid values and duplicate apps are sanitized", () => {
  const result = validateAssistive({ ativo: true, fixado: true, origemCor: "dock", opacidade: 5, posicao: { x: -1, y: 8 }, apps: [{ id: "one", nome: " App " }, { id: "one", nome: "Duplicate" }, { id: "", nome: "Invalid" }] });
  assert.equal(result.ativo, true);
  assert.equal(result.fixado, true);
  assert.equal(result.origemCor, "dock");
  assert.equal(result.opacidade, 1);
  assert.deepEqual(result.posicao, { x: 0, y: 1 });
  assert.deepEqual(result.apps, [{ id: "one", nome: "App" }]);
});

test("Relative AssistiveTouch positions survive resizing and remain within the screen", () => {
  const relative = { x: 0.75, y: 0.25 };
  for (const screen of [{ largura: 1920, altura: 1080 }, { largura: 800, altura: 600 }]) {
    const position = positionScreen(relative, screen);
    assert.deepEqual(normalizePosition(position, screen), relative);
    assert.ok(position.x >= 0 && position.x + SIZE_BUTTON <= screen.largura);
    assert.ok(position.y >= 0 && position.y + SIZE_BUTTON <= screen.altura);
    const menu = positionMenu(position, screen, 300);
    assert.ok(menu.x >= 0 && menu.x + menu.largura <= screen.largura);
    assert.ok(menu.y >= 0 && menu.y + menu.altura <= screen.altura);
  }
});

test("Reordering shortcuts preserves the source list and ignores moves past its boundaries", () => {
  const apps = [{ id: "one" }, { id: "two" }, { id: "three" }];
  assert.deepEqual(moveShortcut(apps, "two", -1).map((app) => app.id), ["two", "one", "three"]);
  assert.deepEqual(apps.map((app) => app.id), ["one", "two", "three"]);
  assert.equal(moveShortcut(apps, "one", -1), apps);
  assert.equal(moveShortcut(apps, "missing", 1), apps);
});
