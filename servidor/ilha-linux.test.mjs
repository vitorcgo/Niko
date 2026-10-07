import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";

test("ilha Linux dimensiona a janela, preserva tarefas e mantém serviços locais e consulta mídia Linux", async () => {
  // A mesma lista libera o clique e mantém Música entre as abas navegáveis.
  const ilha = readFileSync(new URL("../src/janelas/ilha/Ilha.tsx", import.meta.url), "utf8");
  const abasLinux = JSON.parse(ilha.match(/const ABAS_LOCAIS: AbaIlha\[\] = (\[[^;]+\]);/)[1]);
  assert.ok(abasLinux.includes("midia"));
  const anteriores = Object.fromEntries(["window", "document", "localStorage", "BroadcastChannel", "fetch"].map((k) => [k, globalThis[k]]));
  const pasta = mkdtempSync(join(tmpdir(), "niko-ilha-hooks-"));
  const react = join(pasta, "react.mjs");
  // Executa o ciclo dos efeitos com relógio controlado; não simula GTK ou a interface.
  writeFileSync(react, `
    export const efeitos = [];
    export const useEffect = fn => efeitos.push(fn);
    export const useCallback = fn => fn;
    export const useDebugValue = () => {};
    export const useSyncExternalStore = (_, ler) => ler();
    export const useState = valor => [typeof valor === 'function' ? valor() : valor, () => {}];
    export default { useSyncExternalStore, useCallback, useDebugValue };
  `);
  const comandos = [];
  const pedidos = [];
  const intervalos = new Map();
  const ouvintes = new Map();
  const locais = new Map();
  let numero = 0;
  globalThis.BroadcastChannel = undefined;
  globalThis.localStorage = { getItem: k => locais.get(k) ?? null, setItem: (k, v) => locais.set(k, v) };
  globalThis.window = {
    __NIKO_PLATAFORMA__: "linux",
    __TAURI_INTERNALS__: { metadata: { currentWindow: { label: "ilha" } }, invoke: async (nome, args) => comandos.push({ nome, args }) },
    location: { search: "" },
    setTimeout: () => ++numero, clearTimeout: () => {},
    setInterval: (fn, ms) => { const id = ++numero; intervalos.set(id, { fn, ms }); return id; },
    clearInterval: id => intervalos.delete(id),
  };
  globalThis.document = { hidden: false, addEventListener: (nome, fn) => ouvintes.set(nome, fn), removeEventListener: nome => ouvintes.delete(nome) };
  globalThis.fetch = async url => {
    pedidos.push(url);
    if (url === "/ponte/midia") return Response.json({ sessao: false });
    if (url === "/ponte/consumo") return Response.json({ ferramentas: [], sessao: null });
    throw new Error(`consulta não autorizada: ${url}`);
  };
  const vite = await createServer({ configFile: false, resolve: { alias: { react } }, ssr: { noExternal: ["zustand"] }, server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
  try {
    const desktop = await vite.ssrLoadModule("/src/desktop/desktop.ts");
    assert.equal(desktop.LINUX, true);
    await desktop.dimensionarIlha(692, 266);
    await desktop.informarAreaInterativa([{ x: 0, y: 0, w: 660, h: 250 }]);
    assert.deepEqual(comandos, [{ nome: "dimensionar_ilha", args: { largura: 692, altura: 266 } }]);
    const { lerConsumo } = await vite.ssrLoadModule("/src/ponte/ponteLocal.ts");
    assert.deepEqual(await lerConsumo(), { ferramentas: [], sessao: null });
    const { useServicos } = await vite.ssrLoadModule("/src/servicos/servicos.ts");
    const { efeitos } = await vite.ssrLoadModule(react);
    const { useRotina } = await vite.ssrLoadModule("/src/estado/rotina.ts");
    const { useConfig } = await vite.ssrLoadModule("/src/estado/configuracoes.ts");
    const { usePomodoro } = await vite.ssrLoadModule("/src/estado/pomodoro.ts");
    const { useOrganizacao } = await vite.ssrLoadModule("/src/estado/organizacao.ts");
    useConfig.setState({ conquistasAtivas: false, consumo: { ...useConfig.getState().consumo, lerPlanos: true } });
    const tarefa = useRotina.getState().criarTarefa({ titulo: "Estudar derivadas" });
    const antes = usePomodoro.getState().sessoes.length;
    usePomodoro.setState({ rodando: true, terminaEm: Date.now() - 1000 });
    useServicos();
    const limpar = efeitos.splice(0).map(fn => fn()).filter(Boolean);
    assert.ok(useRotina.getState().tarefas.some(t => t.id === tarefa.id));
    assert.equal(usePomodoro.getState().sessoes.length, antes + 1);
    for (const { fn } of intervalos.values()) fn();
    assert.equal(usePomodoro.getState().sessoes.length, antes + 1);
    assert.deepEqual([...intervalos.values()].map(i => i.ms).sort((a, b) => a - b), [1000, 2500, 20000, 300000]);
    document.hidden = true;
    ouvintes.get("visibilitychange")();
    assert.deepEqual([...intervalos.values()].map(i => i.ms), [5000, 20000]);
    const devido = new Date(Date.now() - 60000);
    useOrganizacao.setState({ eventos: [{ id: "lembrete-teste", titulo: "Teste oculto", tipo: "lembrete", data: devido.toLocaleDateString("sv-SE"), hora: devido.toTimeString().slice(0, 5), repeticao: "nenhuma" }] });
    intervalos.values().find(i => i.ms === 20000).fn();
    const disparo = useOrganizacao.getState().eventos[0].ultimoDisparo;
    assert.ok(disparo, "lembrete dispara mesmo com ilha oculta");
    document.hidden = false;
    ouvintes.get("visibilitychange")();
    assert.equal(intervalos.size, 4);
    assert.equal(useOrganizacao.getState().eventos[0].ultimoDisparo, disparo);
    limpar.forEach(fn => fn());
    assert.equal(intervalos.size, 0);
    assert.equal(ouvintes.size, 0);
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(pedidos.length > 0);
    assert.ok(pedidos.every(url => url === "/ponte/midia" || url === "/ponte/consumo"));
  } finally {
    await vite.close();
    rmSync(pasta, { recursive: true, force: true });
    for (const [k, v] of Object.entries(anteriores)) globalThis[k] = v;
  }
});
