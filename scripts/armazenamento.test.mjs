import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const promessaControlada = () => {
  let resolver;
  const promessa = new Promise((resolve) => { resolver = resolve; });
  return { promessa, resolver };
};

test("salvamento serial preserva edição nova, aguarda envio e informa falha recuperável", async () => {
  const anteriores = Object.fromEntries(["window", "document", "localStorage", "fetch", "BroadcastChannel", "CustomEvent"].map((k) => [k, globalThis[k]]));
  const temporizadores = new Map();
  let proximo = 0;
  const eventos = [];
  const ouvintes = new Map();
  const confirmacoes = [];
  const registros = new Map();
  let rejeitarConfirmacao = false;
  globalThis.__nikoTeste = {
    listen: async (nome, fn) => { registros.set(nome, (registros.get(nome) ?? 0) + 1); ouvintes.set(nome, fn); return () => ouvintes.delete(nome); },
    invoke: async (nome, args) => {
      if (nome !== "confirmar_saida") throw new Error(`comando inesperado ${nome}`);
      confirmacoes.push(args);
      if (rejeitarConfirmacao) throw new Error("native indisponível");
    },
  };
  globalThis.window = {
    location: { search: "" },
    __TAURI_INTERNALS__: {},
    setTimeout: (fn) => { const id = ++proximo; temporizadores.set(id, fn); return id; },
    clearTimeout: (id) => temporizadores.delete(id),
    addEventListener() {},
    dispatchEvent: (evento) => eventos.push(evento.type),
  };
  globalThis.document = { body: { inert: false }, addEventListener() {} };
  globalThis.localStorage = { getItem: () => null };
  globalThis.BroadcastChannel = undefined;
  globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
  const envios = [];
  let chamadasZerar = 0;
  let erroZerar = false;
  globalThis.fetch = async (_url, opcoes = {}) => {
    if (_url === "/ponte/dados/zerar") {
      chamadasZerar++;
      if (erroZerar) throw new Error("rede indisponível");
      return new Response("erro", { status: 500 });
    }
    if (opcoes.method !== "POST") return Response.json({ dados: {} });
    const controle = promessaControlada();
    envios.push({ itens: JSON.parse(opcoes.body).itens, ...controle });
    return controle.promessa;
  };
  const vite = await createServer({ configFile: false, ssr: { noExternal: ["@tauri-apps/api"] }, plugins: [{
    name: "tauri-isolado", enforce: "pre",
    resolveId(id) { if (["@tauri-apps/api/event", "@tauri-apps/api/core"].includes(id)) return "\0" + id; },
    load(id) {
      if (id === "\0@tauri-apps/api/event") return "export const listen = (...args) => globalThis.__nikoTeste.listen(...args); export const emit = async () => {};";
      if (id === "\0@tauri-apps/api/core") return "export const invoke = (...args) => globalThis.__nikoTeste.invoke(...args);";
    },
  }], server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
  try {
    const armazenamento = await vite.ssrLoadModule("/src/ponte/armazenamento.ts");
    assert.equal(await armazenamento.iniciarArmazenamento(), "banco");
    assert.equal(await armazenamento.iniciarArmazenamento(), "banco");
    assert.equal(registros.get("niko://saindo"), 1);
    assert.equal(registros.get("niko://saida-cancelada"), 1);
    armazenamento.gravarChave("niko:teste", "antigo");
    const primeiro = armazenamento.salvarAgora();
    assert.equal(envios.length, 1);
    let vooTerminou = false;
    const voo = armazenamento.salvarAgora().then((ok) => { vooTerminou = true; return ok; });
    await Promise.resolve();
    assert.equal(vooTerminou, false, "fila vazia ainda aguarda envio em voo");
    armazenamento.gravarChave("niko:teste", "novo");
    let terminou = false;
    const segundo = armazenamento.salvarAgora().then((ok) => { terminou = true; return ok; });
    await Promise.resolve();
    assert.equal(envios.length, 1, "não inicia POST concorrente");
    assert.equal(terminou, false, "aguarda POST em voo");
    envios[0].resolver(Response.json({}));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(envios.length, 2);
    assert.deepEqual(envios[1].itens, { "niko:teste": "novo" });
    assert.equal(terminou, false);
    envios[1].resolver(Response.json({}));
    assert.equal(await primeiro, true);
    assert.equal(await segundo, true);
    assert.equal(await voo, true);

    armazenamento.gravarChave("niko:teste", "falha");
    const falha = armazenamento.salvarAgora();
    armazenamento.gravarChave("niko:teste", "mais recente");
    envios[2].resolver(new Response("erro", { status: 500 }));
    assert.equal(await falha, false);
    assert.ok(eventos.includes("niko:armazenamento-falhou"));
    const repeticao = armazenamento.salvarAgora();
    assert.deepEqual(envios[3].itens, { "niko:teste": "mais recente" }, "falha antiga não substitui edição nova");
    envios[3].resolver(Response.json({}));
    assert.equal(await repeticao, true);
    assert.equal(await armazenamento.salvarAgora(), true);
    assert.equal(envios.length, 4, "fila vazia não gera POST");

    armazenamento.gravarChave("niko:teste", "antes-da-saida");
    const saida = ouvintes.get("niko://saindo")({ payload: 41 });
    assert.equal(document.body.inert, true);
    assert.equal(confirmacoes.length, 0, "não confirma saída antes do POST");
    armazenamento.gravarChave("niko:teste", "servico-durante-envio");
    assert.equal(armazenamento.lerChave("niko:teste"), "servico-durante-envio");
    assert.deepEqual(confirmacoes, [{ tentativa: 41, salvo: false }], "edição durante flush cancela tentativa");
    assert.equal(document.body.inert, false);
    envios[4].resolver(Response.json({}));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(envios[5].itens, { "niko:teste": "servico-durante-envio" });
    envios[5].resolver(Response.json({}));
    await saida;
    assert.equal(confirmacoes.length, 1, "tentativa cancelada não emite ACK true tardio");

    armazenamento.gravarChave("niko:teste", "antes-do-ack");
    const saidaAck = ouvintes.get("niko://saindo")({ payload: 42 });
    envios[6].resolver(Response.json({}));
    await saidaAck;
    assert.deepEqual(confirmacoes[1], { tentativa: 42, salvo: true });
    assert.equal(document.body.inert, true);
    armazenamento.gravarChave("niko:teste", "apos-ack");
    assert.deepEqual(confirmacoes[2], { tentativa: 42, salvo: false }, "edição após ACK revoga mesma tentativa");
    assert.equal(document.body.inert, false);
    const aposAck = armazenamento.salvarAgora();
    assert.deepEqual(envios[7].itens, { "niko:teste": "apos-ack" });
    envios[7].resolver(Response.json({}));
    assert.equal(await aposAck, true);
    await ouvintes.get("niko://saida-cancelada")();
    assert.equal(document.body.inert, false, "cancelamento/timeout nativo libera interação");
    armazenamento.gravarChave("niko:teste", "apos-cancelar");
    const falhaSaida = ouvintes.get("niko://saindo")({ payload: 43 });
    envios[8].resolver(new Response("erro", { status: 500 }));
    await falhaSaida;
    assert.deepEqual(confirmacoes[3], { tentativa: 43, salvo: false });
    await ouvintes.get("niko://saida-cancelada")();
    rejeitarConfirmacao = true;
    const falhaNativa = ouvintes.get("niko://saindo")({ payload: 44 });
    envios[9].resolver(Response.json({}));
    await falhaNativa;
    assert.equal(document.body.inert, false, "falha invoke libera interação");
    armazenamento.gravarChave("niko:teste", "apos-falha-nativa");
    assert.equal(armazenamento.lerChave("niko:teste"), "apos-falha-nativa");

    const envioAntesZerar = armazenamento.salvarAgora();
    const zerar = assert.rejects(armazenamento.zerarTudo(false), /http_500/);
    await Promise.resolve();
    assert.equal(chamadasZerar, 0, "zerar aguarda gravação em voo");
    envios[10].resolver(Response.json({}));
    assert.equal(await envioAntesZerar, true);
    await zerar;
    assert.equal(chamadasZerar, 1);
    armazenamento.gravarChave("niko:teste", "apos-erro-zerar");
    assert.equal(armazenamento.lerChave("niko:teste"), "apos-erro-zerar", "erro HTTP destrava edição");
    erroZerar = true;
    const falhaRede = assert.rejects(armazenamento.zerarTudo(false), /rede indisponível/);
    envios[11].resolver(Response.json({}));
    await falhaRede;
    armazenamento.gravarChave("niko:teste", "apos-erro-rede");
    assert.equal(armazenamento.lerChave("niko:teste"), "apos-erro-rede", "erro de rede destrava edição");
  } finally {
    await vite.close();
    delete globalThis.__nikoTeste;
    for (const [k, valor] of Object.entries(anteriores)) {
      if (valor === undefined) delete globalThis[k];
      else globalThis[k] = valor;
    }
  }
});
