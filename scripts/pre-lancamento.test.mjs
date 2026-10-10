import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { Unzip, UnzipInflate, zipSync, strToU8, strFromU8 } from "fflate";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";

const estabilizar = () => new Promise((r) => setImmediate(r));

function armazenamentoIsolado(nativo = false) {
  const memoria = new Map();
  const timers = new Map();
  let proximo = 0;
  const janela = Object.assign(new EventTarget(), {
    location: { search: "" },
    setTimeout: (fn) => { const id = ++proximo; timers.set(id, fn); return id; },
    clearTimeout: (id) => timers.delete(id),
  });
  if (nativo) janela.__TAURI_INTERNALS__ = {};
  const ouvintes = new Map();
  const comandos = [];
  const eventos = { listen: async (nome, fn) => { ouvintes.set(nome, fn); return () => ouvintes.delete(nome); } };
  const contexto = vm.createContext({
    window: janela, document: Object.assign(new EventTarget(), { body: { inert: false } }), URLSearchParams, AbortController, AbortSignal, CustomEvent, TextEncoder,
    eventos, nativo: { invoke: async (nome, dados) => { comandos.push({ nome, dados }); } },
    BroadcastChannel: undefined, createJSONStorage: (fn) => fn(), objeto: (v) => v !== null && typeof v === "object" && !Array.isArray(v),
    localStorage: { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, v), removeItem: (k) => memoria.delete(k) },
    fetch: async () => ({ ok: true, json: async () => ({ dados: {} }) }),
  });
  const codigo = stripTypeScriptTypes(readFileSync("src/ponte/armazenamento.ts", "utf8")).replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "")
    .replaceAll('await import("@tauri-apps/api/event")', "globalThis.eventos").replaceAll('await import("@tauri-apps/api/core")', "globalThis.nativo");
  vm.runInContext(`${codigo}\nglobalThis.api = { iniciarArmazenamento, salvarAgora, gravarChave, lerChave, zerarTudo, aoPrepararSaida };`, contexto);
  return { api: contexto.api, contexto, janela, timers, ouvintes, comandos, eventos };
}

test("saída nativa aguarda a ação pendente antes de travar escrita e confirmar gravação", async () => {
  const a = armazenamentoIsolado(true);
  await a.api.iniciarArmazenamento();
  let concluir;
  a.api.aoPrepararSaida(() => new Promise((r) => { concluir = r; }));
  const gravados = [];
  a.contexto.fetch = async (_url, opcoes) => { gravados.push(JSON.parse(opcoes.body)); return { ok: true }; };
  const saindo = a.ouvintes.get("niko://saindo")({ payload: { tentativa: 4 } });
  assert.equal(a.contexto.document.body.inert, true);
  assert.equal(a.comandos.filter((c) => c.nome === "confirmar_salvamento").length, 0);
  a.api.gravarChave("niko:resultado", "ação concluída");
  concluir();
  await saindo;
  assert.equal(gravados[0].itens["niko:resultado"], "ação concluída");
  assert.equal(a.comandos.at(-1).dados.sucesso, true);
  assert.equal(a.comandos.at(-1).dados.tentativa, 4);
  a.api.gravarChave("niko:resultado", "não deve sobrescrever");
  assert.equal(a.api.lerChave("niko:resultado"), "ação concluída");
});

test("saída cancelada libera a interface e não volta a bloquear por resposta atrasada", async () => {
  const a = armazenamentoIsolado(true);
  await a.api.iniciarArmazenamento();
  let concluir;
  a.api.aoPrepararSaida(() => new Promise((r) => { concluir = r; }));
  const saindo = a.ouvintes.get("niko://saindo")({ payload: { tentativa: 5 } });
  a.ouvintes.get("niko://salvar-falhou")();
  concluir();
  await saindo;
  assert.equal(a.contexto.document.body.inert, false);
  a.api.gravarChave("niko:novo", "permitido");
  assert.equal(a.api.lerChave("niko:novo"), "permitido");
  assert.equal(a.comandos.filter((c) => c.nome === "confirmar_salvamento").length, 0);
});

test("falha parcial nos ouvintes nativos desfaz inscrições antes de repetir inicialização", async () => {
  const a = armazenamentoIsolado(true);
  const original = a.eventos.listen;
  a.eventos.listen = async (nome, fn) => {
    if (nome === "niko://saindo") throw new Error("falha parcial");
    return original(nome, fn);
  };
  assert.equal(await a.api.iniciarArmazenamento(), "local");
  assert.equal(a.ouvintes.size, 0);
  a.eventos.listen = original;
  assert.equal(await a.api.iniciarArmazenamento(), "banco");
  assert.equal(a.ouvintes.size, 3);
  await a.api.iniciarArmazenamento();
  assert.equal(a.ouvintes.size, 3);
});

test("salvar rejeita a falha e mantém alterações para uma tentativa posterior", async () => {
  const a = armazenamentoIsolado();
  await a.api.iniciarArmazenamento();
  a.api.gravarChave("niko:teste", "novo");
  a.contexto.fetch = async () => { throw new Error("offline"); };
  await assert.rejects(a.api.salvarAgora());
  assert.equal(a.api.lerChave("niko:teste"), "novo");
  let recebido;
  a.contexto.fetch = async (_url, opcoes) => { recebido = JSON.parse(opcoes.body); return { ok: true }; };
  await a.api.salvarAgora();
  assert.equal(recebido.itens["niko:teste"], "novo");
});

function moduloIsolado(caminho, globais, nomes) {
  const codigo = stripTypeScriptTypes(readFileSync(caminho, "utf8")).replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
  const contexto = vm.createContext(globais);
  vm.runInContext(`${codigo}\nglobalThis.api = { ${nomes.join(", ")} };`, contexto);
  return contexto.api;
}

const office = moduloIsolado("src/utilitarios/officeLimitado.ts", { Unzip, UnzipInflate }, ["descompactarOffice"]);

test("Office extrai somente o XML necessário para cada formato", () => {
  for (const [ext, nome] of [["docx", "word/document.xml"], ["pptx", "ppt/slides/slide1.xml"], ["xlsx", "xl/worksheets/sheet1.xml"], ["odt", "content.xml"]]) {
    const zip = zipSync({ [nome]: strToU8("<texto>Olá</texto>"), "assets/ignorado.xml": strToU8("ignorado"), "assets/imagem.bin": new Uint8Array(100000) });
    const partes = office.descompactarOffice(zip, ext);
    assert.deepEqual(Object.keys(partes), [nome]);
    assert.equal(strFromU8(partes[nome]), "<texto>Olá</texto>");
  }
});

test("Office recusa XML expandido acima do limite mesmo com metadados falsos", () => {
  const zip = zipSync({ "word/document.xml": new Uint8Array(5 * 1024 * 1024) });
  assert.throws(() => office.descompactarOffice(zip, "docx"), /office_grande/);
  const adulterado = zip.slice();
  new DataView(adulterado.buffer).setUint32(22, 1, true);
  assert.throws(() => office.descompactarOffice(adulterado, "docx"), /office_grande/);
});

test("Office limita a quantidade de entradas e o total expandido", () => {
  const muitas = Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [`assets/${i}`, new Uint8Array()]));
  assert.throws(() => office.descompactarOffice(zipSync(muitas), "docx"), /office_grande/);
  const grandes = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`ppt/slides/slide${i + 1}.xml`, new Uint8Array(4 * 1024 * 1024)]));
  assert.throws(() => office.descompactarOffice(zipSync(grandes), "pptx"), /office_grande/);
});

test("Office recusa arquivo comprimido muito grande antes de descompactar", () => {
  assert.throws(() => office.descompactarOffice(new Uint8Array(32 * 1024 * 1024 + 1), "docx"), /arquivo_grande/);
});

function bancoIsolado(pasta) {
  return moduloIsolado("servidor/banco.ts", { ...fs, DatabaseSync, join, pastaDados: () => pasta, process }, ["lerTudo", "gravar", "reservarConfirmacao", "backupManual", "zerarBanco", "fecharBanco"]);
}

test("confirmações persistentes impedem repetição entre conexões e reinícios", () => {
  const pasta = fs.mkdtempSync(join(tmpdir(), "niko-banco-teste-"));
  const a = bancoIsolado(pasta), b = bancoIsolado(pasta);
  try {
    assert.equal(a.reservarConfirmacao("conversa:mensagem:0", true).reservada, true);
    assert.equal(b.reservarConfirmacao("conversa:mensagem:0", false).reservada, false);
    assert.equal(b.reservarConfirmacao("conversa:mensagem:0", false).situacao, "confirmado");
    a.fecharBanco();
    assert.equal(a.reservarConfirmacao("conversa:mensagem:0", true).reservada, false);
    assert.equal(a.reservarConfirmacao("conversa:mensagem:0", true, "teste").reservada, true);
    assert.throws(() => a.reservarConfirmacao("../../fora", true), /confirmacao_invalida/);
  } finally { a.fecharBanco(); b.fecharBanco(); fs.rmSync(pasta, { recursive: true, force: true }); }
});

test("migração preserva dados do WAL no backup anterior e cria o esquema novo", () => {
  const pasta = fs.mkdtempSync(join(tmpdir(), "niko-migracao-teste-"));
  const antigo = new DatabaseSync(join(pasta, "niko.db"));
  antigo.exec("PRAGMA journal_mode=WAL; CREATE TABLE meta(chave TEXT PRIMARY KEY, valor TEXT NOT NULL); INSERT INTO meta VALUES('versao', '1'); CREATE TABLE dados(chave TEXT PRIMARY KEY, valor TEXT NOT NULL, atualizado INTEGER NOT NULL); INSERT INTO dados VALUES('niko:teste', 'preservado', 1);");
  const a = bancoIsolado(pasta);
  try {
    assert.equal(a.lerTudo()["niko:teste"], "preservado");
    assert.equal(a.reservarConfirmacao("nova", true).reservada, true);
    const arquivos = fs.readdirSync(join(pasta, "backups"));
    assert.equal(arquivos.length, 1);
    const backup = new DatabaseSync(join(pasta, "backups", arquivos[0]), { readOnly: true });
    try {
      assert.equal(backup.prepare("SELECT valor FROM dados WHERE chave='niko:teste'").get().valor, "preservado");
      assert.equal(backup.prepare("SELECT valor FROM meta WHERE chave='versao'").get().valor, "1");
    } finally { backup.close(); }
  } finally { a.fecharBanco(); antigo.close(); fs.rmSync(pasta, { recursive: true, force: true }); }
});

test("backup diário e manual respeitam o banco selecionado", () => {
  const pasta = fs.mkdtempSync(join(tmpdir(), "niko-backup-teste-"));
  const a = bancoIsolado(pasta);
  try {
    a.gravar({ "niko:teste": "primeiro" }, "qa");
    const quantidade = fs.readdirSync(join(pasta, "backups")).length;
    a.gravar({ "niko:teste": "segundo" }, "qa");
    assert.equal(fs.readdirSync(join(pasta, "backups")).length, quantidade);
    a.backupManual("qa");
    assert.ok(fs.readdirSync(join(pasta, "backups")).every((nome) => nome.startsWith("niko-qa--")));
    assert.equal(a.lerTudo("qa")["niko:teste"], "segundo");
  } finally { a.fecharBanco(); fs.rmSync(pasta, { recursive: true, force: true }); }
});

test("script temporário é revalidado e reparado depois de adulteração", () => {
  const pasta = fs.mkdtempSync(join(tmpdir(), "niko-script-teste-"));
  const a = moduloIsolado("servidor/scriptsTemporarios.ts", { ...fs, createHash, randomBytes, join, tmpdir: () => pasta, process }, ["garantirScript"]);
  try {
    const caminho = a.garantirScript("niko-teste", "conteudo esperado");
    fs.writeFileSync(caminho, "adulterado");
    assert.equal(a.garantirScript("niko-teste", "conteudo esperado"), caminho);
    assert.equal(fs.readFileSync(caminho, "utf8"), "conteudo esperado");
    assert.throws(() => a.garantirScript("../../fora", "nada"), /script_invalido/);
    fs.unlinkSync(caminho);
    fs.mkdirSync(caminho);
    assert.throws(() => a.garantirScript("niko-teste", "conteudo esperado"), /script_invalido/);
  } finally { fs.rmSync(pasta, { recursive: true, force: true }); }
});

test("CSP do HTML deriva da política nativa com permissões para PDF, mídia e workers", () => {
  const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  const politica = config.app.security.csp;
  for (const trecho of ["worker-src 'self' blob:", "'wasm-unsafe-eval'", "object-src 'none'", "media-src 'self' data: blob:", "frame-src 'self' blob:"]) assert.ok(politica.includes(trecho), trecho);
  const vite = readFileSync("vite.config.ts", "utf8");
  assert.match(vite, /JSON\.parse\(readFileSync\(new URL\("\.\/src-tauri\/tauri\.conf\.json"/);
  assert.doesNotMatch(politica, /'unsafe-eval'/);
});

test("consulta de credenciais nativas tem prazo e não instala ponte sem token válido", async () => {
  const timers = new Map();
  let proximo = 0;
  const janela = {
    __TAURI_INTERNALS__: { metadata: { currentWindow: { label: "sistema" } } },
    location: { hostname: "tauri.localhost" },
    fetch: async () => ({ ok: true }),
    setTimeout: (fn) => { const id = ++proximo; timers.set(id, fn); return id; },
    clearTimeout: (id) => timers.delete(id),
  };
  const contexto = vm.createContext({ window: janela, Headers, document: { querySelector: () => null }, nativo: { invoke: () => new Promise(() => {}) } });
  const codigo = stripTypeScriptTypes(readFileSync("src/desktop/desktop.ts", "utf8")).replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "").replaceAll('await import("@tauri-apps/api/core")', "globalThis.nativo");
  vm.runInContext(`${codigo}\nglobalThis.api = { prepararPonte };`, contexto);
  const original = janela.fetch;
  const pendente = contexto.api.prepararPonte();
  const rejeitou = assert.rejects(pendente, /ponte_indisponivel/);
  await estabilizar();
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  await rejeitou;
  assert.equal(timers.size, 0);
  assert.equal(janela.fetch, original);
  contexto.nativo.invoke = async (nome) => nome === "porta_ponte" ? 47831 : null;
  await assert.rejects(contexto.api.prepararPonte(), /ponte_indisponivel/);
  assert.equal(janela.fetch, original);
});

test("visibilidade do documento atualiza o snapshot e remove seu ouvinte", () => {
  const documento = Object.assign(new EventTarget(), { hidden: false });
  let parar;
  let mudou = 0;
  const api = moduloIsolado("src/personagens/visibilidade.ts", {
    document: documento,
    useSyncExternalStore: (ouvir, ler) => { parar = ouvir(() => { mudou++; }); return ler(); },
  }, ["usarVisibilidadeDocumento"]);
  assert.equal(api.usarVisibilidadeDocumento(), true);
  documento.hidden = true;
  documento.dispatchEvent(new Event("visibilitychange"));
  assert.equal(mudou, 1);
  parar();
  documento.dispatchEvent(new Event("visibilitychange"));
  assert.equal(mudou, 1);
  assert.equal(api.usarVisibilidadeDocumento(), false);
  parar();
});

test("flush concorrente espera e envia alterações novas na ordem", async () => {
  const a = armazenamentoIsolado();
  await a.api.iniciarArmazenamento();
  const pedidos = [];
  a.contexto.fetch = (_url, opcoes) => new Promise((r) => pedidos.push({ dados: JSON.parse(opcoes.body), resolver: r }));
  a.api.gravarChave("niko:teste", "primeiro");
  const primeiro = a.api.salvarAgora();
  await estabilizar();
  a.api.gravarChave("niko:teste", "segundo");
  let terminou = false;
  const segundo = a.api.salvarAgora().then(() => { terminou = true; });
  await estabilizar();
  assert.equal(terminou, false);
  assert.equal(pedidos.length, 1);
  pedidos[0].resolver({ ok: true });
  await estabilizar();
  assert.equal(pedidos.length, 2);
  assert.equal(pedidos[1].dados.itens["niko:teste"], "segundo");
  pedidos[1].resolver({ ok: true });
  await Promise.all([primeiro, segundo]);
});

test("reset com erro de transporte preserva pendências e libera novas escritas", async () => {
  const a = armazenamentoIsolado();
  await a.api.iniciarArmazenamento();
  a.api.gravarChave("niko:antes", "preservado");
  a.contexto.fetch = async () => { throw new Error("offline"); };
  await assert.rejects(a.api.zerarTudo(false));
  a.api.gravarChave("niko:depois", "novo");
  assert.equal(a.api.lerChave("niko:depois"), "novo");
  let dados;
  a.contexto.fetch = async (_url, opcoes) => { dados = JSON.parse(opcoes.body); return { ok: true }; };
  await a.api.salvarAgora();
  assert.equal(dados.itens["niko:antes"], "preservado");
  assert.equal(dados.itens["niko:depois"], "novo");
});
