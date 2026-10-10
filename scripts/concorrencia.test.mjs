import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync, constants } from "node:fs";
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile, readdir, stat, open } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { join, parse, basename } from "node:path";
import { tmpdir } from "node:os";
import vm from "node:vm";
import { arquivosDeTeste, validarArquivosDeTeste } from "./testar.mjs";

const estabilizar = () => new Promise((resolver) => setImmediate(resolver));
const lerCodigo = (caminho) => stripTypeScriptTypes(readFileSync(caminho, "utf8"));

function relogioSimulado() {
  let agora = 0;
  let id = 0;
  const tarefas = new Map();
  return {
    setTimeout(fn, ms) { const chave = ++id; tarefas.set(chave, { fn, em: agora + ms }); return chave; },
    clearTimeout(chave) { tarefas.delete(chave); },
    avancar(ms) {
      agora += ms;
      for (const [chave, tarefa] of [...tarefas]) {
        if (tarefa.em > agora) continue;
        tarefas.delete(chave);
        tarefa.fn();
      }
    },
    tarefas,
  };
}

function processoSimulado() {
  const filhos = [];
  const relogio = relogioSimulado();
  const contexto = vm.createContext({
    ...relogio,
    process: { platform: "win32" },
    garantirScript: () => "simulado.ps1",
    createInterface: ({ input }) => input,
    spawn: () => {
      const p = new EventEmitter();
      p.stdin = new EventEmitter();
      p.stdout = new EventEmitter();
      p.pedidos = [];
      p.stdin.write = (linha) => { p.pedidos.push(JSON.parse(linha)); return true; };
      p.kill = () => { p.encerrado = true; };
      filhos.push(p);
      return p;
    },
  });
  const codigo = lerCodigo("servidor/processoPowerShell.ts").replace(/^import .*;\r?\n/gm, "").replace("export function", "function");
  vm.runInContext(`${codigo}\nglobalThis.criar = criarProcessoPowerShell;`, contexto);
  return { filhos, relogio, ponte: contexto.criar("teste", "", "processo_encerrado") };
}

test("saída e erro do PowerShell antigo não cancelam o processo novo", async () => {
  const { ponte, filhos, relogio } = processoSimulado();
  const primeira = ponte.pedir({ acao: "listar" }, 10).catch((e) => e.message);
  relogio.avancar(10);
  assert.equal(await primeira, "tempo_esgotado");
  const segunda = ponte.pedir({ acao: "listar" });
  filhos[0].emit("exit", 1);
  filhos[0].emit("error", new Error("erro antigo"));
  filhos[1].stdout.emit("line", JSON.stringify({ id: filhos[1].pedidos[0].id, ok: true }));
  assert.equal((await segunda).ok, true);
  assert.equal(filhos[1].encerrado, undefined);
  assert.equal(relogio.tarefas.size, 0);
  ponte.encerrar();
});

test("encerrar o PowerShell rejeita pedidos imediatamente, mesmo sem evento exit", async () => {
  const { ponte, filhos, relogio } = processoSimulado();
  const a = ponte.pedir({}).catch((e) => e.message);
  const b = ponte.pedir({}).catch((e) => e.message);
  ponte.encerrar();
  assert.equal(await a, "processo_encerrado");
  assert.equal(await b, "processo_encerrado");
  assert.equal(filhos[0].encerrado, true);
  assert.equal(relogio.tarefas.size, 0);
});

test("falha na entrada do PowerShell encerra somente seus pedidos e permite reiniciar", async () => {
  const { ponte, filhos } = processoSimulado();
  const a = ponte.pedir({}).catch((e) => e.message);
  filhos[0].stdin.emit("error", new Error("entrada fechada"));
  assert.equal(await a, "processo_encerrado");
  const b = ponte.pedir({});
  filhos[0].emit("exit", 1);
  filhos[1].stdout.emit("line", JSON.stringify({ id: filhos[1].pedidos[0].id, ok: true }));
  assert.equal((await b).ok, true);
  ponte.encerrar();
});

function consultasSimuladas(nome) {
  const relogio = relogioSimulado();
  const pedidos = [];
  let estado;
  let limpar;
  const contexto = vm.createContext({
    ...relogio, AbortController, NATIVO: true,
    FRENTE_LIVRE: { cobre: false, telaCheia: false, maximizada: false, frente: "area_de_trabalho" },
    useState(inicial) {
      if (estado === undefined) estado = inicial;
      return [inicial, (valor) => { estado = typeof valor === "function" ? valor(estado) : valor; }];
    },
    useEffect(fn) { limpar = fn(); },
    invocar: () => new Promise((resolver) => pedidos.push({ resolver })),
    fetch: (_url, opcoes) => new Promise((resolver) => pedidos.push({ resolver, sinal: opcoes.signal })),
  });
  const periodica = lerCodigo("src/desktop/consultaPeriodica.ts").replace("export function", "function");
  const desktop = lerCodigo("src/desktop/desktop.ts");
  const inicio = desktop.indexOf(`export function ${nome}(`);
  const resto = desktop.slice(inicio);
  const fim = resto.indexOf("\nexport ", 1);
  const funcao = (fim === -1 ? resto : resto.slice(0, fim)).replace("export function", "function");
  vm.runInContext(`${periodica}\n${funcao}\nglobalThis.usar = ${nome};`, contexto);
  contexto.usar(true);
  return { pedidos, relogio, limpar: () => limpar(), estado: () => estado };
}

test("estado de tela cheia não acumula consultas nem aceita resultado após desmontar", async () => {
  const c = consultasSimuladas("usarEstadoDaFrente");
  c.relogio.avancar(2400);
  assert.equal(c.pedidos.length, 1);
  c.pedidos[0].resolver({ cobre: true, telaCheia: true, maximizada: false, frente: "app" });
  await estabilizar();
  assert.equal(c.estado().telaCheia, true);
  c.relogio.avancar(800);
  assert.equal(c.pedidos.length, 2);
  c.limpar();
  c.pedidos[1].resolver({ cobre: false });
  await estabilizar();
  assert.equal(c.estado().telaCheia, true);
  assert.equal(c.relogio.tarefas.size, 0);
});

test("falha na consulta da frente preserva o último estado confirmado", async () => {
  const c = consultasSimuladas("usarEstadoDaFrente");
  c.pedidos[0].resolver({ cobre: true, telaCheia: true, frente: "app" });
  await estabilizar();
  c.relogio.avancar(800);
  c.pedidos[1].resolver(null);
  await estabilizar();
  assert.equal(c.estado().telaCheia, true);
  c.limpar();
});

test("apps abertos não acumulam consultas e abortam ao desmontar", async () => {
  const c = consultasSimuladas("usarAppsAbertos");
  c.relogio.avancar(6000);
  assert.equal(c.pedidos.length, 1);
  c.limpar();
  assert.equal(c.pedidos[0].sinal.aborted, true);
  c.pedidos[0].resolver(Response.json({ janelas: [{ id: "velha" }] }));
  await estabilizar();
  assert.equal(c.estado().length, 0);
  assert.equal(c.relogio.tarefas.size, 0);
});

test("consulta expirada não atualiza a interface nem acumula uma invocação nativa travada", async () => {
  const c = consultasSimuladas("usarEstadoDaFrente");
  c.relogio.avancar(30000);
  assert.equal(c.pedidos.length, 1);
  c.pedidos[0].resolver({ cobre: true, telaCheia: true, frente: "app" });
  await estabilizar();
  assert.equal(c.estado().telaCheia, false);
  c.relogio.avancar(800);
  assert.equal(c.pedidos.length, 2);
  c.limpar();
  c.pedidos[1].resolver(null);
});

function carregarCopia() {
  const codigo = lerCodigo("servidor/arquivos.ts");
  const inicio = codigo.indexOf("export async function copiarSemSubstituir(");
  const fim = codigo.indexOf("\nfunction abrirNoWindows", inicio);
  const contexto = vm.createContext({ copyFile, constants, join, parse });
  vm.runInContext(`${codigo.slice(inicio, fim).replace("export async function", "async function")}\nglobalThis.copiar = copiarSemSubstituir;`, contexto);
  return contexto.copiar;
}

test("downloads simultâneos usam nomes diferentes sem substituir arquivos", async () => {
  const pasta = await mkdtemp(join(tmpdir(), "niko-copias-"));
  try {
    const origem = join(pasta, "origem.txt");
    const destino = join(pasta, "destino");
    await mkdir(destino);
    await writeFile(origem, "novo");
    await writeFile(join(destino, "arquivo.txt"), "original");
    const copiar = carregarCopia();
    const [a, b] = await Promise.all([copiar(origem, destino, "arquivo.txt"), copiar(origem, destino, "arquivo.txt")]);
    assert.notEqual(a, b);
    assert.equal(await readFile(join(destino, "arquivo.txt"), "utf8"), "original");
    assert.equal(await readFile(a, "utf8"), "novo");
    assert.equal(await readFile(b, "utf8"), "novo");
    await assert.rejects(copiar(join(pasta, "ausente"), destino, "erro.txt"), /ENOENT/);
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
});

test("histórico inalterado reutiliza métricas e mudança de arquivo invalida o cache", async () => {
  const pasta = await mkdtemp(join(tmpdir(), "niko-historico-"));
  try {
    const projetos = join(pasta, ".claude", "projects");
    await mkdir(projetos, { recursive: true });
    const arquivo = join(projetos, "sessao.jsonl");
    const mensagem = (id, entrada) => JSON.stringify({ timestamp: "2026-10-10T12:00:00Z", message: { id, usage: { input_tokens: entrada, output_tokens: 2 } } });
    await writeFile(arquivo, mensagem("a", 10));
    let aberturas = 0;
    const contexto = vm.createContext({
      readdir, stat, join, basename, homedir: () => pasta, Buffer,
      open: (...args) => { aberturas++; return open(...args); },
    });
    const codigo = lerCodigo("servidor/consumo.ts");
    const inicio = codigo.indexOf("async function arquivoMaisRecente(");
    const fim = codigo.indexOf("\nexport function usoOficial", inicio);
    vm.runInContext(`${codigo.slice(inicio, fim)}\nglobalThis.ler = lerSessaoAtual;`, contexto);
    const primeiro = await contexto.ler();
    primeiro.entrada = 999;
    assert.equal((await contexto.ler()).entrada, 10);
    assert.equal(aberturas, 1);
    await writeFile(arquivo, `${mensagem("a", 10)}\n${mensagem("b", 20)}`);
    assert.equal((await contexto.ler()).entrada, 30);
    assert.equal(aberturas, 2);
    await rm(arquivo);
    assert.equal(await contexto.ler(), null);
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
});

test("modelo do transcript reutiliza leitura, invalida mudanças e limita o cache", () => {
  const arquivos = new Map();
  let leituras = 0;
  const contexto = vm.createContext({
    isAbsolute: () => true, Buffer,
    statSync: (caminho) => {
      const texto = arquivos.get(caminho);
      if (texto === undefined) throw new Error("ENOENT");
      return { size: Buffer.byteLength(texto), mtimeMs: 1 };
    },
    openSync: (caminho) => { leituras++; return caminho; },
    readSync: (caminho, buffer, _offset, tamanho, inicio) => Buffer.from(arquivos.get(caminho)).copy(buffer, 0, inicio, inicio + tamanho),
    closeSync: () => undefined,
  });
  const codigo = lerCodigo("servidor/claude.ts");
  const inicio = codigo.indexOf("const BYTES_DO_FIM_DO_TRANSCRIPT");
  const fim = codigo.indexOf("\nfunction transmitir", inicio);
  vm.runInContext(`${codigo.slice(inicio, fim).replace("export function", "function")}\nglobalThis.ler = modeloDoTranscript; globalThis.quantidade = () => modelosDosTranscripts.size;`, contexto);
  const mensagem = (modelo) => JSON.stringify({ type: "assistant", message: { model: modelo } });
  arquivos.set("sessao.jsonl", mensagem("modelo-a"));
  assert.equal(contexto.ler("sessao.jsonl"), "modelo-a");
  assert.equal(contexto.ler("sessao.jsonl"), "modelo-a");
  assert.equal(leituras, 1);
  arquivos.set("sessao.jsonl", mensagem("modelo-diferente"));
  assert.equal(contexto.ler("sessao.jsonl"), "modelo-diferente");
  assert.equal(leituras, 2);
  arquivos.delete("sessao.jsonl");
  assert.equal(contexto.ler("sessao.jsonl"), undefined);
  assert.equal(contexto.quantidade(), 0);
  for (let i = 0; i < 80; i++) {
    arquivos.set(`${i}.jsonl`, mensagem("modelo"));
    contexto.ler(`${i}.jsonl`);
  }
  assert.equal(contexto.quantidade(), 64);
});

test("manifesto de testes exige todos os arquivos presentes no repositório", () => {
  assert.deepEqual(validarArquivosDeTeste(process.cwd()), arquivosDeTeste);
});

test("manifesto não permite sucesso silencioso quando falta um arquivo obrigatório", async () => {
  const pasta = await mkdtemp(join(tmpdir(), "niko-testes-"));
  try {
    assert.throws(() => validarArquivosDeTeste(pasta), /Arquivos de teste ausentes.*concorrencia/);
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
});
