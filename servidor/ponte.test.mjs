import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as criarVite } from "vite";

test("janela Linux encaminha fetch à ponte com token nativo", async () => {
  const janelaAnterior = globalThis.window;
  const documentoAnterior = globalThis.document;
  const chamadas = [];
  globalThis.window = {
    location: { hostname: "localhost", protocol: "tauri:" },
    __TAURI_INTERNALS__: { invoke: async (comando) => comando === "token_ponte" ? "token-teste" : 47831 },
    fetch: async (url, opcoes) => { chamadas.push({ url, opcoes }); return Response.json({}); },
  };
  globalThis.document = { querySelector: () => null };
  const vite = await criarVite({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
  try {
    const { prepararPonte } = await vite.ssrLoadModule("/src/desktop/desktop.ts");
    await prepararPonte();
    await window.fetch("/ponte/dados", { headers: { "x-niko": "1" } });
    assert.equal(chamadas[0].url, "http://127.0.0.1:47831/ponte/dados");
    assert.equal(chamadas[0].opcoes.headers.get("x-niko-token"), "token-teste");
    assert.equal(chamadas[0].opcoes.headers.get("x-niko"), "1");
  } finally {
    await vite.close();
    globalThis.window = janelaAnterior;
    globalThis.document = documentoAnterior;
  }
});

test("ponte autentica a janela nativa e mantém SQLite após reiniciar", { timeout: 30000 }, async () => {
  const pasta = mkdtempSync(join(tmpdir(), "niko-persistencia-"));
  const reserva = createServer();
  reserva.listen(0, "127.0.0.1");
  await once(reserva, "listening");
  const porta = reserva.address().port;
  await new Promise((resolve) => reserva.close(resolve));
  const env = { ...process.env, XDG_DATA_HOME: pasta, NIKO_PORTA: String(porta), NIKO_TOKEN: "token-isolado-do-teste", NIKO_PAI: "" };
  if (process.platform === "linux") delete env.APPDATA;
  else env.APPDATA = pasta;
  const script = fileURLToPath(new URL("../src-tauri/recursos/ponte.mjs", import.meta.url));
  let filho;
  async function iniciar() {
    const runtime = fileURLToPath(new URL(`../src-tauri/recursos/${process.platform === "win32" ? "node.exe" : "node"}`, import.meta.url));
    filho = spawn(runtime, [script], { env, stdio: ["ignore", "ignore", "pipe"] });
    await new Promise((resolve, reject) => {
      let log = "";
      const limite = setTimeout(() => reject(new Error(`ponte não iniciou: ${log}`)), 10000);
      filho.once("error", (erro) => { clearTimeout(limite); reject(erro); });
      filho.once("exit", (codigo) => { clearTimeout(limite); reject(new Error(`ponte encerrou ${codigo}: ${log}`)); });
      filho.stderr.on("data", (dados) => {
        log += dados;
        if (log.includes("ponte ouvindo")) { clearTimeout(limite); resolve(); }
      });
    });
  }
  async function parar(sinal = "SIGTERM") {
    if (filho && filho.exitCode === null && filho.signalCode === null) {
      const fim = once(filho, "exit");
      filho.kill(sinal);
      await fim;
    }
  }
  const pedir = (origem, opcoes = {}, token = env.NIKO_TOKEN) => fetch(`http://127.0.0.1:${porta}/ponte/dados`, {
    ...opcoes, headers: { origin: origem, "x-niko": "1", "x-niko-token": token, "content-type": "application/json" },
  });
  try {
    await iniciar();
    assert.equal((await pedir("tauri://localhost", {}, "errado")).status, 403);
    assert.equal((await pedir("tauri://localhost", {}, "")).status, 403);
    assert.equal((await fetch(`http://127.0.0.1:${porta}/ponte/dados`, {
      headers: { origin: "tauri://localhost", "x-niko-token": env.NIKO_TOKEN },
    })).status, 403);
    for (const origem of ["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"]) {
      const resposta = await pedir(origem);
      assert.equal(resposta.status, 200);
      assert.equal(resposta.headers.get("access-control-allow-origin"), origem);
    }
    const preflight = await pedir("tauri://localhost", { method: "OPTIONS" });
    assert.equal(preflight.status, 204);
    assert.ok(preflight.headers.get("access-control-allow-headers").includes("x-niko-token"));
    const item = { "niko:teste-persistencia": JSON.stringify({ tarefa: "persistiu" }) };
    assert.equal((await pedir("tauri://localhost", { method: "POST", body: JSON.stringify({ itens: item }) })).status, 200);
    await parar("SIGKILL");
    assert.ok(existsSync(join(pasta, "com.niko.desktop", "niko.db")));
    await iniciar();
    assert.deepEqual((await (await pedir("tauri://localhost")).json()).dados, item);
    assert.equal((await pedir("https://origem-invalida.example")).status, 403);
  } finally {
    await parar();
    rmSync(pasta, { recursive: true, force: true });
  }
});
