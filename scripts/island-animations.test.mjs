import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => server.close());
const { createStateStages, receiveStages, advanceStage, calculateDestinationCharacter, calculatePathFile } = await server.ssrLoadModule("/src/windows/island/animations/rules.ts");
const stage = (id) => ({ id: String(id), texto: `Etapa ${id}` });

test("Initial opening shows current history without replaying old animations", () => {
  const state = createStateStages("sessao-a", [stage(1), stage(2), stage(3)]);
  assert.equal(state.anterior.id, "2");
  assert.equal(state.atual.id, "3");
  assert.deepEqual(state.fila, []);
});

test("Burst updates queue without overlapping stages", () => {
  let state = createStateStages("sessao-a", [stage(1)]);
  state = receiveStages(state, "sessao-a", [stage(1), stage(2), stage(3)]);
  assert.equal(state.atual.id, "1");
  assert.deepEqual(state.fila.map((e) => e.id), ["2", "3"]);
  state = advanceStage(state);
  assert.equal(state.anterior.id, "1");
  assert.equal(state.atual.id, "2");
  state = advanceStage(state);
  assert.equal(state.anterior.id, "2");
  assert.equal(state.atual.id, "3");
  assert.deepEqual(state.fila, []);
});

test("Repeating an update does not queue the same stage twice", () => {
  const stages = [stage(1), stage(2)];
  const state = receiveStages(createStateStages("a", [stage(1)]), "a", stages);
  assert.deepEqual(receiveStages(state, "a", stages), state);
});

test("Identical text with different identifiers still creates a new stage", () => {
  const state = receiveStages(createStateStages("a", [{ id: "1", texto: "Lendo arquivo" }]), "a", [{ id: "1", texto: "Lendo arquivo" }, { id: "2", texto: "Lendo arquivo" }]);
  assert.equal(state.fila.length, 1);
});

test("Switching sessions clears the queue without mixing projects", () => {
  const previous = receiveStages(createStateStages("a", [stage(1)]), "a", [stage(1), stage(2)]);
  const newItem = receiveStages(previous, "b", [stage(9)]);
  assert.equal(newItem.contexto, "b");
  assert.equal(newItem.anterior, null);
  assert.equal(newItem.atual.id, "9");
  assert.deepEqual(newItem.fila, []);
});

test("The queue is bounded and ends with the latest information", () => {
  let state = receiveStages(createStateStages("a", [stage(0)]), "a", Array.from({ length: 40 }, (_, i) => stage(i)));
  assert.equal(state.fila.length, 4);
  while (state.fila.length) state = advanceStage(state);
  assert.equal(state.atual.id, "39");
});

test("Reset or truncated history does not retain stale animations", () => {
  const previous = receiveStages(createStateStages("a", [stage(1)]), "a", [stage(1), stage(2)]);
  const newItem = receiveStages(previous, "a", [stage(8)]);
  assert.equal(newItem.atual.id, "8");
  assert.deepEqual(newItem.fila, []);
  assert.equal(receiveStages(newItem, "a", []).atual, null);
});

test("Animations do not turn previous stages into success confirmations", () => {
  const state = advanceStage(receiveStages(createStateStages("a", [stage(1)]), "a", [stage(1), stage(2)]));
  assert.deepEqual(state.anterior, stage(1));
  assert.equal("concluida" in state.anterior, false);
});

test("Character destinations respect scale and preserve the center when enlarged", () => {
  const originValue = { left: 100, top: 0, width: 990, height: 375 };
  const destination = calculateDestinationCharacter(originValue, { left: 175, top: 105, width: 105, height: 105 }, 1.5);
  assert.deepEqual(destination, { x: 50, y: 70, escala: 1 });
  const small = calculateDestinationCharacter(originValue, { left: 118, top: 6, width: 33, height: 33 }, 1.5);
  assert.equal(small.escala, 22 / 70);
  assert.equal(small.x + 35, 23);
  assert.equal(small.y + 35, 15);
});

test("Invalid destinations do not produce NaN or place characters outside the screen", () => {
  const r = { left: 0, top: 0, width: 100, height: 100 };
  assert.equal(calculateDestinationCharacter(r, { ...r, width: 0 }, 1), null);
  assert.equal(calculateDestinationCharacter(r, r, 0), null);
  assert.equal(calculateDestinationCharacter(r, { ...r, left: NaN }, 1), null);
});

test("Files travel from the drop position to the character using local coordinates", () => {
  const zone = { left: 100, top: 50, width: 600, height: 300 };
  const character = { left: 310, top: 125, width: 81, height: 81 };
  const path = calculatePathFile(zone, character, { x: 610, y: 230 }, 1.5);
  assert.deepEqual(path.origem, { x: 340, y: 120 });
  assert.equal(path.destino.x, 167);
  assert.ok(path.destino.y > 50 && path.destino.y < 100);
});

test("Drops outside the zone or with invalid coordinates do not start the effect", () => {
  const r = { left: 0, top: 0, width: 100, height: 100 };
  assert.equal(calculatePathFile(r, r, { x: 101, y: 50 }, 1), null);
  assert.equal(calculatePathFile(r, r, { x: NaN, y: 50 }, 1), null);
});
