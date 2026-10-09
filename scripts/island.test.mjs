import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

globalThis.BroadcastChannel = undefined;
globalThis.localStorage = { getItem: () => null, setItem: () => undefined };
globalThis.window = { setTimeout, clearTimeout };
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => server.close());
const { tabNeighbor, toggleTabBar, createToggleStart } = await server.ssrLoadModule("/src/windows/island/bar/barActions.ts");
const { useIsland } = await server.ssrLoadModule("/src/state/island.ts");
const { control, system } = await server.ssrLoadModule("/src/bridge/localBridge.ts");

test("Clicking the selected tab again collapses the island", () => {
  useIsland.setState({ estado: "compacta", aba: "hoje" });
  toggleTabBar("hoje");
  assert.equal(useIsland.getState().estado, "expandida");
  toggleTabBar("hoje");
  assert.equal(useIsland.getState().estado, "compacta");
});

test("Opening greetings run for first use, new days and new versions, but not the same day", async () => {
  const { decideGreetingOnOpen } = await server.ssrLoadModule("/src/windows/island/animations/useDailyGreeting.ts");
  assert.deepEqual(decideGreetingOnOpen(null, "2026-10-07", "0.2.1"), { saudar: true });
  assert.deepEqual(decideGreetingOnOpen({ dia: "2026-10-07", versao: "0.2.1" }, "2026-10-07", "0.2.1"), { saudar: false });
  assert.deepEqual(decideGreetingOnOpen({ dia: "2026-10-06", versao: "0.2.1" }, "2026-10-07", "0.2.1"), { saudar: true });
  assert.deepEqual(decideGreetingOnOpen({ dia: "2026-10-07", versao: "0.2.0" }, "2026-10-07", "0.2.1"), { saudar: true, versaoNova: "0.2.1" });
});

test("Return greetings require thirty minutes away or sleep and renewed user activity", async () => {
  const { returnedAfterAbsence } = await server.ssrLoadModule("/src/windows/island/animations/useDailyGreeting.ts");
  const minute = 60_000;
  assert.deepEqual(returnedAfterAbsence(minute, 5_000, false), { ausente: false, voltou: false });
  assert.deepEqual(returnedAfterAbsence(minute, 40 * minute, false), { ausente: true, voltou: false });
  assert.deepEqual(returnedAfterAbsence(minute, 10_000, true), { ausente: false, voltou: true });
  assert.deepEqual(returnedAfterAbsence(8 * 60 * minute, 3_000, false), { ausente: false, voltou: true });
  assert.deepEqual(returnedAfterAbsence(minute, 5 * minute, true), { ausente: true, voltou: false });
});

test("Returning to the PC greets once per day, reports long absences and avoids interrupting work", async () => {
  const { reactAReturn } = await server.ssrLoadModule("/src/windows/island/animations/useDailyGreeting.ts");
  const time = 3_600_000;
  const base = { jaSaudouHoje: false, ausenciaMs: time, naoPerturbe: false, ilhaEmUso: false };
  assert.equal(reactAReturn(base), "saudar");
  assert.equal(reactAReturn({ ...base, naoPerturbe: true }), "nada");
  assert.equal(reactAReturn({ ...base, ilhaEmUso: true }), "esperar");
  assert.equal(reactAReturn({ ...base, jaSaudouHoje: true }), "nada");
  assert.equal(reactAReturn({ ...base, jaSaudouHoje: true, ausenciaMs: 3 * time }), "boasVindas");
});

test("The greeting subtitle describes today’s items", async () => {
  const { T } = await server.ssrLoadModule("/src/i18n/ptBR.ts");
  assert.equal(T.ilha.saudacao.hoje({ tarefas: 3, habitos: 1 }), "Hoje: 3 tarefas e 1 hábito.");
  assert.equal(T.ilha.saudacao.hoje({ tarefas: 1, habitos: 0 }), "Hoje: 1 tarefa.");
  assert.equal(T.ilha.saudacao.hoje({ tarefas: 0, habitos: 0 }), T.ilha.saudacao.equipe);
});

test("Scrolling over tabs advances one tab at a time and stops at the edges", () => {
  const tabs = ["hoje", "conexoes", "chat"];
  assert.equal(tabNeighbor(tabs, "hoje", 1), "conexoes");
  assert.equal(tabNeighbor(tabs, "conexoes", -1), "hoje");
  assert.equal(tabNeighbor(tabs, "chat", 1), "chat");
  assert.equal(tabNeighbor(tabs, "hoje", -1), "hoje");
  assert.equal(tabNeighbor(tabs, "midia", 1), "hoje");
  assert.equal(tabNeighbor([], "hoje", 1), undefined);
});

test("The bar task button opens the correct section without collapsing another Today section", () => {
  useIsland.setState({ estado: "expandida", aba: "hoje", secaoHoje: "agenda" });
  toggleTabBar("hoje", "tarefas");
  assert.equal(useIsland.getState().estado, "expandida");
  assert.equal(useIsland.getState().secaoHoje, "tarefas");
  toggleTabBar("hoje", "tarefas");
  assert.equal(useIsland.getState().estado, "compacta");
});

test("Switching tabs does not collapse an expanded island", () => {
  useIsland.setState({ estado: "expandida", aba: "chat" });
  toggleTabBar("hoje");
  assert.equal(useIsland.getState().estado, "expandida");
  assert.equal(useIsland.getState().aba, "hoje");
});

test("Start uses the state captured before the click steals focus", async () => {
  const requests = [];
  const toggle = createToggleStart(async () => ({ aberto: true }), async (openBefore) => requests.push(openBefore));
  toggle.preparar();
  await toggle.alternar();
  assert.deepEqual(requests, [true]);
});

test("Rapid clicks do not queue Start commands", async () => {
  let finish;
  let requests = 0;
  const toggle = createToggleStart(async () => ({ aberto: false }), async () => {
    requests++;
    await new Promise((resolve) => { finish = resolve; });
  });
  const first = toggle.alternar();
  await new Promise((resolve) => setImmediate(resolve));
  await toggle.alternar();
  assert.equal(requests, 1);
  finish();
  await first;
});

test("Failed Start reads do not invent an open state", async () => {
  const requests = [];
  const toggle = createToggleStart(async () => { throw new Error("indisponivel"); }, async (state) => requests.push(state));
  toggle.preparar();
  await toggle.alternar();
  assert.deepEqual(requests, [undefined]);
});

test("The second click uses actual Windows confirmation without requiring mouse movement", async () => {
  const requests = [];
  const toggle = createToggleStart(async () => ({ aberto: false }), async (openBefore) => {
    requests.push(openBefore);
    return { aberto: !openBefore };
  });
  toggle.preparar();
  await toggle.alternar();
  await toggle.alternar();
  assert.deepEqual(requests, [false, true]);
});

test("The bridge preserves actual Bluetooth state and the previous Start state", async () => {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, corpo: options?.body ? JSON.parse(options.body) : null });
    return Response.json(url.endsWith("bluetooth") ? { aparelhos: { id: "teste", nome: "Fone", ativo: false, conectado: null } } : { aberto: true });
  };
  assert.equal((await system.bluetooth())[0].conectado, null);
  assert.equal((await control.iniciar()).aberto, true);
  await control.alternarIniciar(true);
  assert.deepEqual(requests.at(-1).corpo, { nome: "iniciar", abertoAntes: true });
});

test("Native Bluetooth reads do not confuse driver status with connection state", { skip: process.platform !== "win32" }, async () => {
  const { listBluetooth } = await server.ssrLoadModule("/server/system.ts");
  const result = await listBluetooth();
  assert.ok(Array.isArray(result.aparelhos));
  for (const device of result.aparelhos) {
    assert.equal(typeof device.id, "string");
    assert.ok(device.conectado === null || typeof device.conectado === "boolean");
    assert.equal(device.ativo, device.conectado === true);
  }
});

test("Native Start detection compiles and returns a boolean without opening windows", { skip: process.platform !== "win32" }, async () => {
  const { readStart, stopControl } = await server.ssrLoadModule("/server/quickControls.ts");
  try {
    assert.equal(typeof (await readStart()).aberto, "boolean");
  } finally {
    stopControl();
  }
});
