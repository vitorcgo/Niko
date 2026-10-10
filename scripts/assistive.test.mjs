import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";

const codigo = stripTypeScriptTypes(readFileSync("src/janelas/assistive/regras.ts", "utf8")).replace(/^export /gm, "");
const contexto = vm.createContext({});
vm.runInContext(`${codigo}\nglobalThis.api = { validarAssistive, limitarPosicao, normalizarPosicao, posicaoNaTela, posicionarMenu, moverAtalho };`, contexto);
const a = contexto.api;
const puro = (v) => JSON.parse(JSON.stringify(v));

test("configuração inválida é normalizada sem aceitar atalhos duplicados", () => {
  const entrada = { ativo: "sim", opacidade: NaN, origemCor: "externa", posicao: { x: -10, y: 10 }, apps: [{ id: "a", nome: " App " }, { id: "a", nome: "Outra" }, null, { id: "", nome: "Inválida" }] };
  const cfg = a.validarAssistive(entrada);
  assert.equal(cfg.ativo, false);
  assert.equal(cfg.opacidade, 0.3);
  assert.equal(cfg.origemCor, "ilha");
  assert.deepEqual(puro(cfg.posicao), { x: 0, y: 1 });
  assert.deepEqual(puro(cfg.apps), [{ id: "a", nome: "App" }]);
});

test("atalhos têm limites de quantidade e de nome", () => {
  const cfg = a.validarAssistive({ apps: Array.from({ length: 40 }, (_, i) => ({ id: String(i), nome: "x".repeat(300) })) });
  assert.equal(cfg.apps.length, 24);
  assert.ok(cfg.apps.every((item) => item.nome.length === 160));
});

test("posição proporcional se mantém ao trocar a resolução", () => {
  for (const tela of [{ largura: 1920, altura: 1080 }, { largura: 800, altura: 600 }, { largura: 40, altura: 40 }]) {
    const posicao = { x: 0.4, y: 0.75 };
    const pixels = a.posicaoNaTela(posicao, tela);
    const normal = a.normalizarPosicao(pixels, tela);
    assert.ok(Number.isFinite(pixels.x) && Number.isFinite(pixels.y));
    if (tela.largura > 40) {
      assert.ok(Math.abs(normal.x - posicao.x) < 1e-10);
      assert.ok(Math.abs(normal.y - posicao.y) < 1e-10);
    } else assert.deepEqual(puro(normal), { x: 0, y: 0 });
  }
});

test("menu abre para o lado disponível e cabe na tela", () => {
  const tela = { largura: 800, altura: 600 };
  const menu = a.posicionarMenu({ x: 744, y: 544 }, tela, 400, 300);
  assert.equal(menu.acima, true);
  assert.ok(menu.x >= 12 && menu.y >= 12);
  assert.ok(menu.x + menu.largura <= 788 && menu.y + menu.altura <= 588);
});

test("reordenar não altera a lista original nem sai dos limites", () => {
  const apps = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(puro(a.moverAtalho(apps, "b", -1)), [{ id: "b" }, { id: "a" }, { id: "c" }]);
  assert.deepEqual(apps.map((item) => item.id), ["a", "b", "c"]);
  assert.equal(a.moverAtalho(apps, "a", -1), apps);
  assert.equal(a.moverAtalho(apps, "ausente", 1), apps);
});
