import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer as criarServidorHttp } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";

const raizTemporaria = mkdtempSync(join(tmpdir(), "niko-claude-teste-"));
process.env.USERPROFILE = raizTemporaria;
process.env.HOME = raizTemporaria;
process.env.APPDATA = join(raizTemporaria, "AppData");
process.env.NIKO_PORTA = "47999";
const memoriaLocal = new Map();
globalThis.localStorage ??= { getItem: (k) => memoriaLocal.get(k) ?? null, setItem: (k, v) => memoriaLocal.set(k, String(v)), removeItem: (k) => memoriaLocal.delete(k) };

const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
const claude = await vite.ssrLoadModule("/servidor/claude.ts");
const processosVistos = [];
const focados = [];
claude.buscaDeProcesso.dono = async (portaCliente) => {
  processosVistos.push(portaCliente);
  return 4242;
};
claude.buscaDeProcesso.focar = async (pid) => {
  focados.push(pid);
  return { ok: true };
};
const { useClaudeCode } = await vite.ssrLoadModule("/src/estado/claudeCode.ts");
const { indicadorDePermissoes } = await vite.ssrLoadModule("/src/janelas/ilha/claude/indicadorDePermissoes.ts");

test("modo sem confirmação recente fica identificado como último modo conhecido", () => {
  const agora = Date.now();
  const data = new Date(agora).toISOString();
  const base = { sessao: "modo-teste", cwd: "", ferramenta: "claude", recebidoEm: data };
  const aplicar = useClaudeCode.getState().aplicar;
  aplicar({ ...base, id: "modo-1", evento: "SessionStart", dados: { permission_mode: "default" } });
  assert.equal(indicadorDePermissoes(useClaudeCode.getState().sessoes[base.sessao], agora).texto, "Modo: Manual");
  aplicar({ ...base, id: "modo-2", evento: "PreToolUse", dados: { tool_name: "Read" } });
  assert.equal(indicadorDePermissoes(useClaudeCode.getState().sessoes[base.sessao], agora).texto, "Último modo: Manual");
  aplicar({ ...base, id: "modo-3", evento: "PreToolUse", dados: { tool_name: "Read", permission_mode: "auto" } });
  assert.equal(indicadorDePermissoes(useClaudeCode.getState().sessoes[base.sessao], agora).texto, "Modo: Automático");
  assert.equal(indicadorDePermissoes(useClaudeCode.getState().sessoes[base.sessao], agora + 90000).texto, "Último modo: Automático");
});

test("reiniciar sessão sem modo não reaproveita permissão antiga", () => {
  const recebidoEm = new Date().toISOString();
  const base = { sessao: "modo-reinicio", cwd: "", ferramenta: "claude", recebidoEm };
  useClaudeCode.getState().aplicar({ ...base, id: "modo-reinicio-1", evento: "SessionStart", dados: { permission_mode: "auto" } });
  useClaudeCode.getState().aplicar({ ...base, id: "modo-reinicio-2", evento: "SessionStart", dados: {} });
  assert.equal(indicadorDePermissoes(useClaudeCode.getState().sessoes[base.sessao], Date.now()).texto, "Modo não informado");
});

test("evento antigo não sobrescreve modo mais recente", () => {
  const agora = Date.now();
  const base = { sessao: "modo-atrasado", cwd: "", ferramenta: "claude", evento: "PreToolUse" };
  useClaudeCode.getState().aplicar({ ...base, id: "modo-atrasado-1", recebidoEm: new Date(agora).toISOString(), dados: { permission_mode: "auto", tool_name: "Read" } });
  useClaudeCode.getState().aplicar({ ...base, id: "modo-atrasado-2", recebidoEm: new Date(agora - 1000).toISOString(), dados: { permission_mode: "default", tool_name: "Read" } });
  assert.equal(useClaudeCode.getState().sessoes[base.sessao].modo, "auto");
});

test("modo desconhecido ou data inválida não inventa confirmação", () => {
  assert.equal(indicadorDePermissoes({ modo: "inventado" }, Date.now()).texto, "Modo não informado");
  assert.equal(indicadorDePermissoes({ modo: "auto", modoAtualizadoEm: "inválida", modoConfirmado: true }, Date.now()).texto, "Último modo: Automático");
});
const pastaClaude = join(raizTemporaria, ".claude");
const settings = join(pastaClaude, "settings.json");
const lerSettings = () => JSON.parse(readFileSync(settings, "utf8"));
const segredo = () => JSON.parse(readFileSync(join(process.env.APPDATA, "com.niko.desktop", "gancho-claude.json"), "utf8")).segredo;

let servidor;
let base;
before(async () => {
  servidor = criarServidorHttp((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/ponte/claude/evento") return void claude.receberEventoDoGancho(req, res);
    if (url.pathname === "/ponte/claude/status") return void claude.receberStatusDoClaude(req, res);
    if (url.pathname === "/ponte/claude/eventos") return void claude.ouvirEventos(req, res);
    res.statusCode = 404;
    res.end();
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(async () => {
  servidor.closeAllConnections?.();
  await new Promise((r) => servidor.close(r));
  await vite.close();
  rmSync(raizTemporaria, { recursive: true, force: true });
});

test("instala os ganchos num settings.json que ainda não existe", () => {
  rmSync(pastaClaude, { recursive: true, force: true });
  const r = claude.instalarGanchos({ confirmacao: "INSTALAR" });
  assert.equal(r.copia, null);
  const dados = lerSettings();
  for (const evento of claude.EVENTOS_INSTALADOS) {
    const gancho = dados.hooks[evento][0].hooks[0];
    assert.equal(gancho.type, "http");
    assert.equal(gancho.url, "http://127.0.0.1:47999/ponte/claude/evento");
    assert.equal(gancho.headers["x-niko-gancho"], segredo());
    assert.equal(gancho.timeout, evento === "PermissionRequest" ? 120 : 2);
  }
  assert.equal(claude.estadoDaInstalacao().instalado, true);
});

test("preserva o que já existia, faz cópia e não duplica ao reinstalar", () => {
  mkdirSync(pastaClaude, { recursive: true });
  const original = { model: "opus", permissions: { allow: ["Bash(npm test)"] }, hooks: { Stop: [{ hooks: [{ type: "command", command: "echo fim" }] }], PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "checar.sh" }] }] } };
  writeFileSync(settings, JSON.stringify(original, null, 2));
  const r1 = claude.instalarGanchos({ confirmacao: "INSTALAR" });
  claude.instalarGanchos({ confirmacao: "INSTALAR" });
  assert.ok(r1.copia && existsSync(r1.copia));
  const dados = lerSettings();
  assert.equal(dados.model, "opus");
  assert.deepEqual(dados.permissions, original.permissions);
  assert.equal(dados.hooks.Stop.length, 2);
  assert.equal(dados.hooks.Stop[0].hooks[0].command, "echo fim");
  assert.equal(dados.hooks.PreToolUse[0].matcher, "Bash");
  assert.equal(dados.hooks.PreToolUse.filter((g) => g.hooks.some((h) => h.type === "http")).length, 1);
});

test("status line: entra junto com os ganchos, guarda a antiga e devolve ela ao remover", () => {
  const antes = lerSettings();
  writeFileSync(settings, JSON.stringify({ ...antes, statusLine: { type: "command", command: "minha-status.sh", padding: 2 } }, null, 2));
  claude.instalarGanchos({ confirmacao: "INSTALAR" });
  claude.instalarGanchos({ confirmacao: "INSTALAR" });
  const instalado = lerSettings();
  assert.match(instalado.statusLine.command, /status-claude-niko\.mjs/);
  assert.equal(instalado.statusLine.padding, 2);
  assert.equal(claude.estadoDaInstalacao().desatualizado, false);
  claude.removerGanchos({ confirmacao: "REMOVER" });
  assert.deepEqual(lerSettings().statusLine, { type: "command", command: "minha-status.sh", padding: 2 });
  writeFileSync(settings, JSON.stringify(antes, null, 2));
  claude.instalarGanchos({ confirmacao: "INSTALAR" });
  claude.removerGanchos({ confirmacao: "REMOVER" });
  assert.equal(lerSettings().statusLine, undefined);
  claude.instalarGanchos({ confirmacao: "INSTALAR" });
});

test("remover tira só as entradas do Niko", () => {
  claude.removerGanchos({ confirmacao: "REMOVER" });
  const dados = lerSettings();
  assert.equal(dados.model, "opus");
  assert.deepEqual(Object.keys(dados.hooks).sort(), ["PreToolUse", "Stop"]);
  assert.equal(dados.hooks.Stop[0].hooks[0].command, "echo fim");
  assert.equal(claude.estadoDaInstalacao().instalado, false);
  assert.ok(readdirSync(pastaClaude).some((n) => n.endsWith(".bak")));
});

test("recusa mexer num settings.json inválido e não altera o arquivo", () => {
  writeFileSync(settings, "{ isso não é json");
  assert.throws(() => claude.instalarGanchos({ confirmacao: "INSTALAR" }), /settings_invalido/);
  assert.equal(readFileSync(settings, "utf8"), "{ isso não é json");
  assert.equal(claude.estadoDaInstalacao().invalido, true);
  rmSync(settings);
});

test("exige confirmação explícita", () => {
  assert.throws(() => claude.instalarGanchos({}), /confirmacao_invalida/);
  assert.throws(() => claude.removerGanchos({ confirmacao: "sim" }), /confirmacao_invalida/);
});

test("a prévia esconde o segredo", () => {
  const p = claude.previaDaInstalacao("instalar");
  assert.ok(!p.proposto.includes(segredo()));
  assert.ok(p.proposto.includes("••••••••"));
});

const enviar = (corpo, cabecalhos = {}) => fetch(`${base}/ponte/claude/evento`, { method: "POST", headers: { "content-type": "application/json", ...cabecalhos }, body: JSON.stringify(corpo) });

test("rejeita evento sem o segredo certo", async () => {
  assert.equal((await enviar({ hook_event_name: "Stop" })).status, 403);
  assert.equal((await enviar({ hook_event_name: "Stop" }, { "x-niko-gancho": "errado" })).status, 403);
});

test("sem a ilha ouvindo, o pedido de permissão volta vazio na hora", async () => {
  const r = await enviar({ hook_event_name: "PermissionRequest", session_id: "s1", tool_name: "Bash", tool_input: { command: "ls" } }, { "x-niko-gancho": segredo() });
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "");
});

test("status exige segredo e ausência de Origin, transmite apenas métricas da sessão correta", async () => {
  const dados = { session_id: "status-segura", context_window: { total_input_tokens: 42 }, cost: { total_cost_usd: 0.1 }, prompt: "privado", cwd: "C:/Privado", transcript_path: "C:/privado.jsonl" };
  const enviarStatus = (headers) => fetch(`${base}/ponte/claude/status`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(dados) });
  assert.equal((await enviarStatus({})).status, 403);
  assert.equal((await enviarStatus({ "x-niko-gancho": segredo(), origin: "http://malicioso" })).status, 403);
  assert.equal((await enviarStatus({ "x-niko-gancho": segredo() })).status, 200);
  const controle = new AbortController();
  try {
    const fluxo = await fetch(`${base}/ponte/claude/eventos`, { signal: controle.signal });
    const leitor = fluxo.body.getReader(); let texto = "";
    while (!texto.includes("NikoConectado")) texto += new TextDecoder().decode((await leitor.read()).value);
    const evento = texto.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.evento === "NikoMetadadosSessao" && e.sessao === dados.session_id);
    assert.equal(evento.dados.metricas.entrada, 42); assert.equal(evento.cwd, "");
    assert.doesNotMatch(JSON.stringify(evento), /privado|Privado|transcript_path|prompt/);
  } finally { controle.abort(); }
});

test("com a ilha ouvindo, Permitir devolve a decisão no formato documentado", async () => {
  const controle = new AbortController();
  const fluxo = await fetch(`${base}/ponte/claude/eventos`, { signal: controle.signal });
  const leitor = fluxo.body.getReader();
  const decodificador = new TextDecoder();
  let buffer = "";
  const proximoPedido = async () => {
    for (;;) {
      const linhas = buffer.split("\n");
      for (const l of linhas) {
        if (!l.trim()) continue;
        const e = JSON.parse(l);
        if (e.evento === "PermissionRequest" && e.pedidoId && e.sessao === "s2") return e;
      }
      const { value } = await leitor.read();
      buffer += decodificador.decode(value, { stream: true });
    }
  };
  const resposta = enviar({ hook_event_name: "PermissionRequest", session_id: "s2", cwd: "C:\\projetos\\niko", tool_name: "Bash", tool_input: { command: "npm test" } }, { "x-niko-gancho": segredo() });
  const pedido = await proximoPedido();
  assert.equal(pedido.dados.tool_input.command, "npm test");
  claude.decidirPedido({ pedidoId: pedido.pedidoId, decisao: "allow" });
  const r = await resposta;
  assert.deepEqual(await r.json(), { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } });
  assert.throws(() => claude.decidirPedido({ pedidoId: pedido.pedidoId, decisao: "deny" }), /pedido_expirou/);
  controle.abort();
});

test("descarta campos enormes e recorta textos longos", async () => {
  const r = await enviar({ hook_event_name: "PreToolUse", session_id: "s3", tool_name: "Read", tool_input: { file_path: "a.ts" }, tool_response: "x".repeat(50000), transcript_path: "C:\\segredo.jsonl", agent_transcript_path: "C:\\segredo-sub.jsonl", extra: "y".repeat(9000) }, { "x-niko-gancho": segredo() });
  assert.equal(r.status, 200);
  const controle = new AbortController();
  const fluxo = await fetch(`${base}/ponte/claude/eventos`, { signal: controle.signal });
  const leitor = fluxo.body.getReader();
  let texto = "";
  while (!texto.includes("NikoConectado")) texto += new TextDecoder().decode((await leitor.read()).value);
  controle.abort();
  const evento = texto.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.sessao === "s3");
  assert.equal(evento.dados.tool_response, undefined);
  assert.equal(evento.dados.transcript_path, undefined);
  assert.equal(evento.dados.agent_transcript_path, undefined);
  assert.ok(evento.dados.extra.length < 4100);
});

test("corta objetos aninhados fundo demais em vez de guardar tudo na memória", async () => {
  let fundo = { valor: "fim" };
  for (let i = 0; i < 30; i++) fundo = { dentro: fundo };
  const r = await enviar({ hook_event_name: "PreToolUse", session_id: "s-fundo", tool_name: "Read", tool_input: { file_path: "a.ts", fundo } }, { "x-niko-gancho": segredo() });
  assert.equal(r.status, 200);
  const controle = new AbortController();
  const fluxo = await fetch(`${base}/ponte/claude/eventos`, { signal: controle.signal });
  const leitor = fluxo.body.getReader();
  let texto = "";
  while (!texto.includes("NikoConectado")) texto += new TextDecoder().decode((await leitor.read()).value);
  controle.abort();
  const evento = texto.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.sessao === "s-fundo");
  assert.equal(evento.dados.tool_input.file_path, "a.ts");
  assert.ok(!JSON.stringify(evento.dados).includes("fim"));
});

test("recusa hooks com formato inesperado em vez de apagar", () => {
  mkdirSync(pastaClaude, { recursive: true });
  writeFileSync(settings, JSON.stringify({ hooks: ["algo"] }));
  assert.throws(() => claude.instalarGanchos({ confirmacao: "INSTALAR" }), /settings_invalido/);
  assert.deepEqual(lerSettings(), { hooks: ["algo"] });
  writeFileSync(settings, "{}");
});

test("detecta conexão desatualizada quando o segredo não bate", () => {
  claude.instalarGanchos({ confirmacao: "INSTALAR" });
  const dados = lerSettings();
  dados.hooks.Stop[0].hooks[0].headers["x-niko-gancho"] = "outro";
  writeFileSync(settings, JSON.stringify(dados));
  const estado = claude.estadoDaInstalacao();
  assert.equal(estado.desatualizado, true);
  assert.equal(estado.instalado, false);
  claude.instalarGanchos({ confirmacao: "INSTALAR" });
  assert.equal(claude.estadoDaInstalacao().desatualizado, false);
  assert.ok(!readdirSync(pastaClaude).some((n) => n.endsWith(".niko-gravando")));
});

test("devolver ao terminal responde vazio para o Claude Code perguntar lá", async () => {
  const controle = new AbortController();
  const fluxo = await fetch(`${base}/ponte/claude/eventos`, { signal: controle.signal });
  const leitor = fluxo.body.getReader();
  let buffer = "";
  const resposta = enviar({ hook_event_name: "PermissionRequest", session_id: "s4", tool_name: "Bash", tool_input: { command: "npm run build" } }, { "x-niko-gancho": segredo() });
  let pedido;
  while (!pedido) {
    buffer += new TextDecoder().decode((await leitor.read()).value);
    pedido = buffer.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.sessao === "s4" && e.pedidoId);
  }
  claude.decidirPedido({ pedidoId: pedido.pedidoId, decisao: "terminal" });
  const r = await resposta;
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "");
  assert.throws(() => claude.decidirPedido({ pedidoId: "x", decisao: "talvez" }), /decisao_invalida/);
  controle.abort();
});

test("sempre permitir só aceita a regra sugerida pelo Claude Code", async () => {
  const controle = new AbortController();
  const fluxo = await fetch(`${base}/ponte/claude/eventos`, { signal: controle.signal });
  const leitor = fluxo.body.getReader();
  let buffer = "";
  const sugestoes = [{ type: "allow", rules: ["Bash(npm *)"], toolName: "Bash", behavior: "allow" }];
  const resposta = enviar({ hook_event_name: "PermissionRequest", session_id: "s6", tool_name: "Bash", tool_input: { command: "npm test" }, permission_suggestions: sugestoes }, { "x-niko-gancho": segredo() });
  let pedido;
  while (!pedido) {
    buffer += new TextDecoder().decode((await leitor.read()).value);
    pedido = buffer.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.sessao === "s6" && e.pedidoId);
  }
  assert.throws(() => claude.decidirPedido({ pedidoId: pedido.pedidoId, decisao: "allow", regra: { toolName: "Bash", ruleContent: "*" } }), /regra_invalida/);
  assert.throws(() => claude.decidirPedido({ pedidoId: pedido.pedidoId, decisao: "deny", regra: { toolName: "Bash", ruleContent: "npm *" } }), /decisao_invalida/);
  claude.decidirPedido({ pedidoId: pedido.pedidoId, decisao: "allow", regra: { toolName: "Bash", ruleContent: "npm *" } });
  assert.deepEqual(await (await resposta).json(), {
    hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow", updatedPermissions: [{ type: "allow", toolName: "Bash", ruleContent: "npm *", behavior: "allow", mode: "local", directories: [] }] } },
  });
  controle.abort();
});

test("pergunta do Claude responde pela ilha só com as opções que ele ofereceu", async () => {
  const controle = new AbortController();
  const fluxo = await fetch(`${base}/ponte/claude/eventos`, { signal: controle.signal });
  const leitor = fluxo.body.getReader();
  let buffer = "";
  const entrada = {
    questions: [
      { question: "Qual banco?", header: "Banco", multiSelect: false, options: [{ label: "SQLite", description: "Local" }, { label: "Postgres", description: "Servidor" }] },
      { question: "Quais testes?", header: "Testes", multiSelect: true, options: [{ label: "Unidade" }, { label: "Integração" }] },
    ],
  };
  const resposta = enviar({ hook_event_name: "PermissionRequest", session_id: "s7", tool_name: "AskUserQuestion", tool_input: entrada }, { "x-niko-gancho": segredo() });
  let pedido;
  while (!pedido) {
    buffer += new TextDecoder().decode((await leitor.read()).value);
    pedido = buffer.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.sessao === "s7" && e.pedidoId);
  }
  const id = pedido.pedidoId;
  assert.throws(() => claude.decidirPedido({ pedidoId: id, decisao: "allow" }), /respostas_invalidas/);
  assert.throws(() => claude.decidirPedido({ pedidoId: id, decisao: "allow", respostas: [[5], [0]] }), /respostas_invalidas/);
  assert.throws(() => claude.decidirPedido({ pedidoId: id, decisao: "allow", respostas: [[0, 1], [0]] }), /respostas_invalidas/);
  assert.throws(() => claude.decidirPedido({ pedidoId: id, decisao: "allow", respostas: [[0]] }), /respostas_invalidas/);
  assert.throws(() => claude.decidirPedido({ pedidoId: id, decisao: "allow", respostas: [[0], [0, 0]] }), /respostas_invalidas/);
  assert.throws(() => claude.decidirPedido({ pedidoId: id, decisao: "allow", respostas: [[0], [1.5]] }), /respostas_invalidas/);
  assert.throws(() => claude.decidirPedido({ pedidoId: id, decisao: "deny", respostas: [[0], [0]] }), /decisao_invalida/);
  claude.decidirPedido({ pedidoId: id, decisao: "allow", respostas: [[1], [0, 1]] });
  assert.deepEqual(await (await resposta).json(), {
    hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow", updatedInput: { ...entrada, answers: { "Qual banco?": "Postgres", "Quais testes?": "Unidade,Integração" } } } },
  });
  controle.abort();
});

test("respostas só valem em pedidos que são perguntas", async () => {
  const controle = new AbortController();
  const fluxo = await fetch(`${base}/ponte/claude/eventos`, { signal: controle.signal });
  const leitor = fluxo.body.getReader();
  let buffer = "";
  const resposta = enviar({ hook_event_name: "PermissionRequest", session_id: "s8", tool_name: "Bash", tool_input: { command: "ls" } }, { "x-niko-gancho": segredo() });
  let pedido;
  while (!pedido) {
    buffer += new TextDecoder().decode((await leitor.read()).value);
    pedido = buffer.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.sessao === "s8" && e.pedidoId);
  }
  assert.throws(() => claude.decidirPedido({ pedidoId: pedido.pedidoId, decisao: "allow", respostas: [[0]] }), /respostas_invalidas/);
  claude.decidirPedido({ pedidoId: pedido.pedidoId, decisao: "terminal" });
  await resposta;
  controle.abort();
});

test("várias opções com vírgula no rótulo não viram resposta ambígua", () => {
  const perguntas = [{ question: "Q", multiSelect: true, rotulos: ["Sim, agora", "Não"] }];
  assert.throws(() => claude.respostasValidas(perguntas, [[0, 1]]), /respostas_invalidas/);
  assert.deepEqual(claude.respostasValidas(perguntas, [[0]]), { Q: "Sim, agora" });
});

test("a ilha lê as perguntas do AskUserQuestion", async () => {
  const { perguntasDaEntrada } = await vite.ssrLoadModule("/src/estado/claudeCode.ts");
  assert.deepEqual(perguntasDaEntrada("AskUserQuestion", { questions: [{ question: "Qual?", header: "H", multiSelect: true, options: [{ label: "A", description: "d" }, { label: "" }] }] }), [{ pergunta: "Qual?", titulo: "H", varias: true, opcoes: [{ rotulo: "A", descricao: "d" }] }]);
  assert.equal(perguntasDaEntrada("Bash", { questions: [] }), undefined);
  assert.equal(perguntasDaEntrada("AskUserQuestion", { questions: [{ question: "Sem opções", options: [] }] }), undefined);
});

test("lembra o processo de cada sessão uma vez só e traz o terminal dela", async () => {
  const antes = processosVistos.length;
  await enviar({ hook_event_name: "SessionStart", session_id: "terminal-1", cwd: "C:\\p" }, { "x-niko-gancho": segredo() });
  await enviar({ hook_event_name: "UserPromptSubmit", session_id: "terminal-1", cwd: "C:\\p" }, { "x-niko-gancho": segredo() });
  assert.equal(processosVistos.length, antes + 1);
  assert.deepEqual(await claude.trazerTerminal({ sessao: "terminal-1" }), { ok: true });
  assert.equal(focados.at(-1), 4242);
  await assert.rejects(claude.trazerTerminal({ sessao: "nunca-vista" }), /sem_processo/);
});

test("abrir arquivo do diff só aceita arquivo que existe dentro do projeto", () => {
  const pasta = mkdtempSync(join(tmpdir(), "niko-arquivo-"));
  try {
    mkdirSync(join(pasta, "src"));
    writeFileSync(join(pasta, "src", "a.ts"), "x");
    assert.equal(claude.arquivoDoProjeto(pasta, join(pasta, "src", "a.ts")), join(pasta, "src", "a.ts"));
    assert.equal(claude.arquivoDoProjeto(pasta, "src\\a.ts"), join(pasta, "src", "a.ts"));
    for (const ruim of [join(pasta, "src", "nao.ts"), join(pasta, "src"), join(pasta, "..", "fora.ts"), "C:\\Windows\\win.ini", "", 5, "a\nb"]) {
      assert.throws(() => claude.arquivoDoProjeto(pasta, ruim), /arquivo_invalido/, String(ruim));
    }
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("abrir projeto recusa pastas que não vieram de uma sessão", () => {
  assert.throws(() => claude.abrirProjeto({ cwd: "C:\\Windows", como: "pasta" }), /projeto_desconhecido/);
  assert.throws(() => claude.abrirProjeto({ cwd: raizTemporaria, como: "pasta" }), /projeto_desconhecido/);
});

test("abrir projeto recusa caminho relativo mesmo vindo de uma sessão", async () => {
  const r = await enviar({ hook_event_name: "SessionStart", session_id: "s-relativo", cwd: "." }, { "x-niko-gancho": segredo() });
  assert.equal(r.status, 200);
  assert.throws(() => claude.abrirProjeto({ cwd: ".", como: "pasta" }), /projeto_desconhecido/);
});

test("diff marca linhas removidas e adicionadas", async () => {
  const { linhasDoDiff, alteracaoDaFerramenta, contarMudancas } = await vite.ssrLoadModule("/src/utilitarios/diff.ts");
  const linhas = linhasDoDiff("a\nb\nc", "a\nB\nc\nd");
  assert.deepEqual(linhas.map((l) => `${l.tipo}:${l.texto}`), ["igual:a", "menos:b", "mais:B", "igual:c", "mais:d"]);
  const alteracao = alteracaoDaFerramenta("Edit", { file_path: "C:\\p\\a.ts", old_string: "x", new_string: "y\nz" });
  assert.deepEqual(contarMudancas(alteracao), { mais: 2, menos: 1 });
  assert.equal(alteracaoDaFerramenta("Write", { file_path: "b.ts", content: "1\n2" }).novo, true);
  assert.equal(alteracaoDaFerramenta("Bash", { command: "ls" }), undefined);
});

test("evento repetido numa reconexão não duplica a atividade", () => {
  const evento = { id: "evento-unico", recebidoEm: new Date().toISOString(), evento: "PreToolUse", sessao: "s5", cwd: "C:\\projetos\\app", dados: { tool_name: "Bash", tool_input: { command: "npm test" } } };
  useClaudeCode.getState().aplicar(evento);
  useClaudeCode.getState().aplicar(evento);
  const sessao = useClaudeCode.getState().sessoes.s5;
  assert.equal(sessao.passos.length, 1);
  assert.equal(sessao.ferramentasUsadas, 1);
  assert.equal(sessao.projeto, "app");
});

test("sessão encerrada some da ilha e aba fechada não volta com eventos antigos", () => {
  const { aplicar, fechar } = useClaudeCode.getState();
  const antes = new Date(Date.now() - 60_000).toISOString();
  aplicar({ id: "s7-inicio", recebidoEm: antes, evento: "SessionStart", sessao: "s7", cwd: "C:\\projetos\\app", dados: {} });
  aplicar({ id: "s8-inicio", recebidoEm: antes, evento: "SessionStart", sessao: "s8", cwd: "C:\\projetos\\app", dados: {} });
  assert.ok(useClaudeCode.getState().sessoes.s7);
  aplicar({ id: "s7-fim", recebidoEm: antes, evento: "SessionEnd", sessao: "s7", cwd: "C:\\projetos\\app", dados: { reason: "clear" } });
  assert.equal(useClaudeCode.getState().sessoes.s7, undefined);
  assert.ok(!useClaudeCode.getState().ordem.includes("s7"));
  fechar("s8");
  aplicar({ id: "s8-antigo", recebidoEm: antes, evento: "PreToolUse", sessao: "s8", cwd: "C:\\projetos\\app", dados: { tool_name: "Read", tool_input: { file_path: "a.ts" } } });
  assert.equal(useClaudeCode.getState().sessoes.s8, undefined);
  aplicar({ id: "s8-novo", recebidoEm: new Date(Date.now() + 1000).toISOString(), evento: "UserPromptSubmit", sessao: "s8", cwd: "C:\\projetos\\app", dados: { prompt: "continua" } });
  assert.ok(useClaudeCode.getState().sessoes.s8);
});

test("pedido que sai da ilha sem decisão deixa o motivo na atividade", () => {
  const agora = new Date().toISOString();
  const { aplicar } = useClaudeCode.getState();
  aplicar({ id: "pedido-1", recebidoEm: agora, evento: "PermissionRequest", sessao: "s6", cwd: "C:\\projetos\\app", pedidoId: "p-6", dados: { tool_name: "Bash", tool_input: { command: "npm test" } } });
  assert.equal(useClaudeCode.getState().pedidos.filter((p) => p.pedidoId === "p-6").length, 1);
  aplicar({ id: "fim-1", recebidoEm: agora, evento: "NikoPedidoEncerrado", sessao: "s6", cwd: "", pedidoId: "p-6", dados: { motivo: "expirou", decisao: null } });
  const estado = useClaudeCode.getState();
  assert.equal(estado.pedidos.filter((p) => p.pedidoId === "p-6").length, 0);
  assert.equal(estado.sessoes.s6.estado, "trabalhando");
  assert.match(estado.sessoes.s6.passos.at(-1).rotulo, /110 segundos/);
  aplicar({ id: "pedido-2", recebidoEm: agora, evento: "PermissionRequest", sessao: "s6", cwd: "C:\\projetos\\app", pedidoId: "p-7", dados: { tool_name: "Bash", tool_input: { command: "ls" } } });
  const passosAntes = useClaudeCode.getState().sessoes.s6.passos.length;
  aplicar({ id: "fim-2", recebidoEm: agora, evento: "NikoPedidoEncerrado", sessao: "s6", cwd: "", pedidoId: "p-7", dados: { motivo: "decidido", decisao: "allow" } });
  assert.equal(useClaudeCode.getState().sessoes.s6.passos.length, passosAntes);
});

test("lê o modelo da última resposta no fim do transcript", () => {
  const caminho = join(raizTemporaria, "sessao.jsonl");
  const linhas = [
    { type: "assistant", message: { model: "claude-sonnet-4-5-20250929" } },
    { type: "user", message: { content: "troca o modelo" } },
    { type: "assistant", message: { model: "<synthetic>" } },
    { type: "assistant", message: { model: "claude-opus-4-7" } },
    { type: "system", content: "fim" },
  ];
  writeFileSync(caminho, `${"x".repeat(300 * 1024)}\n${linhas.map((l) => JSON.stringify(l)).join("\n")}\n`);
  assert.equal(claude.modeloDoTranscript(caminho), "claude-opus-4-7");
  assert.equal(claude.modeloDoTranscript("relativo.jsonl"), undefined);
  assert.equal(claude.modeloDoTranscript(join(raizTemporaria, "nao-existe.jsonl")), undefined);
  assert.equal(claude.modeloDoTranscript(join(raizTemporaria, "settings.txt")), undefined);
});

test("mostra o modelo com nome legível", async () => {
  const { nomeDoModelo } = await vite.ssrLoadModule("/src/estado/claudeCode.ts");
  assert.equal(nomeDoModelo("claude-opus-4-7[1m]"), "Opus 4.7");
  assert.equal(nomeDoModelo("claude-sonnet-4-5-20250929"), "Sonnet 4.5");
  assert.equal(nomeDoModelo("claude-opus-4-20250514"), "Opus 4");
  assert.equal(nomeDoModelo("claude-3-5-haiku-20241022"), "Haiku 3.5");
  assert.equal(nomeDoModelo("gpt-5-codex"), "gpt-5-codex");
});

test("reconexão informa sessões atuais mesmo se o encerramento saiu dos 300 eventos", async () => {
  const resVazia = { writableEnded: true };
  claude.processarEvento({ hook_event_name: "SessionStart", session_id: "reconexao-encerrada", cwd: "C:/Projeto" }, "claude", resVazia);
  claude.processarEvento({ hook_event_name: "SessionEnd", session_id: "reconexao-encerrada", cwd: "C:/Projeto" }, "claude", resVazia);
  for (let i = 0; i < 301; i++) claude.processarEvento({ hook_event_name: "PreToolUse", session_id: "reconexao-viva", cwd: "C:/Projeto", tool_name: "Read" }, "claude", resVazia);
  const controle = new AbortController();
  try {
    const fluxo = await fetch(`${base}/ponte/claude/eventos`, { signal: controle.signal });
    const leitor = fluxo.body.getReader(); let texto = "";
    while (!texto.includes("NikoConectado")) texto += new TextDecoder().decode((await leitor.read()).value);
    const eventos = texto.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    assert.ok(!eventos.some((e) => e.evento === 'SessionEnd' && e.sessao === 'reconexao-encerrada'));
    const atual = eventos.find((e) => e.evento === 'NikoSessoesAtuais');
    assert.ok(atual.dados.sessoes.includes('reconexao-viva'));
    assert.ok(!atual.dados.sessoes.includes('reconexao-encerrada'));
    assert.deepEqual(atual.dados.pedidos, []);
  } finally { controle.abort(); }
});

test("reconexão recupera Stop perdido sem expor conteúdo nem inventar atividade", async () => {
  const anterior = useClaudeCode.getState();
  const resVazia = { writableEnded: true };
  const sessao = "reconexao-resposta-concluida";
  useClaudeCode.getState().aplicar({ id: "reconexao-resposta-inicial", evento: "PreToolUse", recebidoEm: new Date(Date.now() - 60000).toISOString(), sessao, cwd: "C:/CAMINHO_PRIVADO_TESTE", dados: { tool_name: "Read" } });
  claude.processarEvento({ hook_event_name: "PreToolUse", session_id: sessao }, "claude", resVazia);
  claude.processarEvento({ hook_event_name: "Stop", session_id: sessao, last_assistant_message: "RESPOSTA_PRIVADA_TESTE" }, "claude", resVazia);
  const transicoes = [
    ["NikoPensando", {}, "pensando"],
    ["UserPromptSubmit", {}, "pensando"],
    ["PreToolUse", {}, "trabalhando"],
    ["StopFailure", {}, "erro"],
    ["Notification", { notification_type: "elicitation_url_dialog" }, "esperando"],
    ["Notification", { message: "usage limit" }, "limite"],
  ];
  transicoes.forEach(([evento, dados], i) => claude.processarEvento({ hook_event_name: evento, session_id: `reconexao-estado-${i}`, ...dados }, "opencode", resVazia));
  for (let i = 0; i < 301; i++) claude.processarEvento({ hook_event_name: "PreToolUse", session_id: "reconexao-outra-sessao", tool_name: "Read" }, "claude", resVazia);
  const controle = new AbortController();
  try {
    const fluxo = await fetch(`${base}/ponte/claude/eventos`, { signal: controle.signal });
    const leitor = fluxo.body.getReader(); let texto = "";
    while (!texto.includes("NikoConectado")) texto += new TextDecoder().decode((await leitor.read()).value);
    const eventos = texto.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    assert.ok(!eventos.some((e) => e.evento === "Stop" && e.sessao === sessao));
    const snapshot = eventos.find((e) => e.evento === "NikoSessoesAtuais");
    assert.equal(snapshot.dados.estados.find((s) => s.sessao === sessao).estado, "terminou");
    transicoes.forEach(([, , estado], i) => assert.equal(snapshot.dados.estados.find((s) => s.sessao === `reconexao-estado-${i}`).estado, estado));
    assert.doesNotMatch(JSON.stringify(snapshot), /RESPOSTA_PRIVADA_TESTE|CAMINHO_PRIVADO_TESTE|tool_input|last_assistant_message/);
    eventos.forEach((e) => useClaudeCode.getState().aplicar(e));
    const atual = useClaudeCode.getState().sessoes[sessao];
    assert.equal(atual.estado, "terminou"); assert.equal(atual.ferramentasUsadas, 1); assert.equal(atual.passos.length, 1);
  } finally { controle.abort(); useClaudeCode.setState(anterior); }
});
