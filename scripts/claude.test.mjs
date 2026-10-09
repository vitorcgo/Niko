import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer as createServerHttp } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";

const rootTemporary = mkdtempSync(join(tmpdir(), "niko-claude-teste-"));
process.env.USERPROFILE = rootTemporary;
process.env.HOME = rootTemporary;
process.env.APPDATA = join(rootTemporary, "AppData");
process.env.NIKO_PORTA = "47999";
const memoryLocal = new Map();
globalThis.localStorage ??= { getItem: (k) => memoryLocal.get(k) ?? null, setItem: (k, v) => memoryLocal.set(k, String(v)), removeItem: (k) => memoryLocal.delete(k) };

const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
const claude = await vite.ssrLoadModule("/server/claude.ts");
const processesSeen = [];
const focused = [];
claude.searchProcess.dono = async (portClient) => {
  processesSeen.push(portClient);
  return 4242;
};
claude.searchProcess.focar = async (pid) => {
  focused.push(pid);
  return { ok: true };
};
const { useClaudeCode } = await vite.ssrLoadModule("/src/state/claudeCode.ts");
const directoryClaude = join(rootTemporary, ".claude");
const settings = join(directoryClaude, "settings.json");
const readSettings = () => JSON.parse(readFileSync(settings, "utf8"));
const secret = () => JSON.parse(readFileSync(join(process.env.APPDATA, "com.niko.desktop", "gancho-claude.json"), "utf8")).segredo;

let server;
let base;
before(async () => {
  server = createServerHttp((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/ponte/claude/evento") return void claude.receiveEventHook(req, res);
    if (url.pathname === "/ponte/claude/eventos") return void claude.listenEvents(req, res);
    res.statusCode = 404;
    res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
  await vite.close();
  rmSync(rootTemporary, { recursive: true, force: true });
});

test("Installs hooks when settings.json does not exist", () => {
  rmSync(directoryClaude, { recursive: true, force: true });
  const r = claude.installHooks({ confirmacao: "INSTALAR" });
  assert.equal(r.copia, null);
  const payload = readSettings();
  for (const eventValue of claude.EVENTS_INSTALLED) {
    const hook = payload.hooks[eventValue][0].hooks[0];
    assert.equal(hook.type, "http");
    assert.equal(hook.url, "http://127.0.0.1:47999/ponte/claude/evento");
    assert.equal(hook.headers["x-niko-gancho"], secret());
    assert.equal(hook.timeout, eventValue === "PermissionRequest" ? 120 : 2);
  }
  assert.equal(claude.stateInstallation().instalado, true);
});

test("Preserves existing settings, creates a backup and avoids duplicates on reinstall", () => {
  mkdirSync(directoryClaude, { recursive: true });
  const original = { model: "opus", permissions: { allow: ["Bash(npm test)"] }, hooks: { Stop: [{ hooks: [{ type: "command", command: "echo fim" }] }], PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "checar.sh" }] }] } };
  writeFileSync(settings, JSON.stringify(original, null, 2));
  const r1 = claude.installHooks({ confirmacao: "INSTALAR" });
  claude.installHooks({ confirmacao: "INSTALAR" });
  assert.ok(r1.copia && existsSync(r1.copia));
  const payload = readSettings();
  assert.equal(payload.model, "opus");
  assert.deepEqual(payload.permissions, original.permissions);
  assert.equal(payload.hooks.Stop.length, 2);
  assert.equal(payload.hooks.Stop[0].hooks[0].command, "echo fim");
  assert.equal(payload.hooks.PreToolUse[0].matcher, "Bash");
  assert.equal(payload.hooks.PreToolUse.filter((g) => g.hooks.some((h) => h.type === "http")).length, 1);
});

test("Installs the status line with hooks and restores the previous one on removal", () => {
  const beforeValue = readSettings();
  writeFileSync(settings, JSON.stringify({ ...beforeValue, statusLine: { type: "command", command: "minha-status.sh", padding: 2 } }, null, 2));
  claude.installHooks({ confirmacao: "INSTALAR" });
  claude.installHooks({ confirmacao: "INSTALAR" });
  const installed = readSettings();
  assert.match(installed.statusLine.command, /status-claude-niko\.mjs/);
  assert.equal(installed.statusLine.padding, 2);
  assert.equal(claude.stateInstallation().desatualizado, false);
  claude.removeHooks({ confirmacao: "REMOVER" });
  assert.deepEqual(readSettings().statusLine, { type: "command", command: "minha-status.sh", padding: 2 });
  writeFileSync(settings, JSON.stringify(beforeValue, null, 2));
  claude.installHooks({ confirmacao: "INSTALAR" });
  claude.removeHooks({ confirmacao: "REMOVER" });
  assert.equal(readSettings().statusLine, undefined);
  claude.installHooks({ confirmacao: "INSTALAR" });
});

test("Removal only deletes Niko entries", () => {
  claude.removeHooks({ confirmacao: "REMOVER" });
  const payload = readSettings();
  assert.equal(payload.model, "opus");
  assert.deepEqual(Object.keys(payload.hooks).sort(), ["PreToolUse", "Stop"]);
  assert.equal(payload.hooks.Stop[0].hooks[0].command, "echo fim");
  assert.equal(claude.stateInstallation().instalado, false);
  assert.ok(readdirSync(directoryClaude).some((n) => n.endsWith(".bak")));
});

test("Rejects invalid settings.json without changing the file", () => {
  writeFileSync(settings, "{ isso não é json");
  assert.throws(() => claude.installHooks({ confirmacao: "INSTALAR" }), /settings_invalido/);
  assert.equal(readFileSync(settings, "utf8"), "{ isso não é json");
  assert.equal(claude.stateInstallation().invalido, true);
  rmSync(settings);
});

test("Requires explicit confirmation", () => {
  assert.throws(() => claude.installHooks({}), /confirmacao_invalida/);
  assert.throws(() => claude.removeHooks({ confirmacao: "sim" }), /confirmacao_invalida/);
});

test("Previews hide the secret", () => {
  const p = claude.previewInstallation("instalar");
  assert.ok(!p.proposto.includes(secret()));
  assert.ok(p.proposto.includes("••••••••"));
});

const send = (body, headers = {}) => fetch(`${base}/ponte/claude/evento`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

test("Rejects events with an incorrect secret", async () => {
  assert.equal((await send({ hook_event_name: "Stop" })).status, 403);
  assert.equal((await send({ hook_event_name: "Stop" }, { "x-niko-gancho": "errado" })).status, 403);
});

test("Permission requests return empty immediately when the island is not listening", async () => {
  const r = await send({ hook_event_name: "PermissionRequest", session_id: "s1", tool_name: "Bash", tool_input: { command: "ls" } }, { "x-niko-gancho": secret() });
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "");
});

test("Allow returns the documented decision when the island is listening", async () => {
  const control = new AbortController();
  const flow = await fetch(`${base}/ponte/claude/eventos`, { signal: control.signal });
  const reader = flow.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const nextRequest = async () => {
    for (;;) {
      const lines = buffer.split("\n");
      for (const l of lines) {
        if (!l.trim()) continue;
        const e = JSON.parse(l);
        if (e.evento === "PermissionRequest" && e.pedidoId && e.sessao === "s2") return e;
      }
      const { value } = await reader.read();
      buffer += decoder.decode(value, { stream: true });
    }
  };
  const response = send({ hook_event_name: "PermissionRequest", session_id: "s2", cwd: "C:\\projetos\\niko", tool_name: "Bash", tool_input: { command: "npm test" } }, { "x-niko-gancho": secret() });
  const request = await nextRequest();
  assert.equal(request.dados.tool_input.command, "npm test");
  claude.decideRequest({ pedidoId: request.pedidoId, decisao: "allow" });
  const r = await response;
  assert.deepEqual(await r.json(), { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } });
  assert.throws(() => claude.decideRequest({ pedidoId: request.pedidoId, decisao: "deny" }), /pedido_expirou/);
  control.abort();
});

test("Discards oversized fields and truncates long text", async () => {
  const r = await send({ hook_event_name: "PreToolUse", session_id: "s3", tool_name: "Read", tool_input: { file_path: "a.ts" }, tool_response: "x".repeat(50000), transcript_path: "C:\\segredo.jsonl", extra: "y".repeat(9000) }, { "x-niko-gancho": secret() });
  assert.equal(r.status, 200);
  const control = new AbortController();
  const flow = await fetch(`${base}/ponte/claude/eventos`, { signal: control.signal });
  const reader = flow.body.getReader();
  let text = "";
  while (!text.includes("NikoConectado")) text += new TextDecoder().decode((await reader.read()).value);
  control.abort();
  const eventValue = text.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.sessao === "s3");
  assert.equal(eventValue.dados.tool_response, undefined);
  assert.equal(eventValue.dados.transcript_path, undefined);
  assert.ok(eventValue.dados.extra.length < 4100);
});

test("Truncates excessively nested objects instead of retaining them in memory", async () => {
  let background = { valor: "fim" };
  for (let i = 0; i < 30; i++) background = { dentro: background };
  const r = await send({ hook_event_name: "PreToolUse", session_id: "s-fundo", tool_name: "Read", tool_input: { file_path: "a.ts", fundo: background } }, { "x-niko-gancho": secret() });
  assert.equal(r.status, 200);
  const control = new AbortController();
  const flow = await fetch(`${base}/ponte/claude/eventos`, { signal: control.signal });
  const reader = flow.body.getReader();
  let text = "";
  while (!text.includes("NikoConectado")) text += new TextDecoder().decode((await reader.read()).value);
  control.abort();
  const eventValue = text.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.sessao === "s-fundo");
  assert.equal(eventValue.dados.tool_input.file_path, "a.ts");
  assert.ok(!JSON.stringify(eventValue.dados).includes("fim"));
});

test("Rejects unexpected hook formats without deleting them", () => {
  mkdirSync(directoryClaude, { recursive: true });
  writeFileSync(settings, JSON.stringify({ hooks: ["algo"] }));
  assert.throws(() => claude.installHooks({ confirmacao: "INSTALAR" }), /settings_invalido/);
  assert.deepEqual(readSettings(), { hooks: ["algo"] });
  writeFileSync(settings, "{}");
});

test("Detects an outdated connection when secrets do not match", () => {
  claude.installHooks({ confirmacao: "INSTALAR" });
  const payload = readSettings();
  payload.hooks.Stop[0].hooks[0].headers["x-niko-gancho"] = "outro";
  writeFileSync(settings, JSON.stringify(payload));
  const state = claude.stateInstallation();
  assert.equal(state.desatualizado, true);
  assert.equal(state.instalado, false);
  claude.installHooks({ confirmacao: "INSTALAR" });
  assert.equal(claude.stateInstallation().desatualizado, false);
  assert.ok(!readdirSync(directoryClaude).some((n) => n.endsWith(".niko-gravando")));
});

test("Returning control to the terminal sends an empty response so Claude Code can prompt there", async () => {
  const control = new AbortController();
  const flow = await fetch(`${base}/ponte/claude/eventos`, { signal: control.signal });
  const reader = flow.body.getReader();
  let buffer = "";
  const response = send({ hook_event_name: "PermissionRequest", session_id: "s4", tool_name: "Bash", tool_input: { command: "npm run build" } }, { "x-niko-gancho": secret() });
  let request;
  while (!request) {
    buffer += new TextDecoder().decode((await reader.read()).value);
    request = buffer.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.sessao === "s4" && e.pedidoId);
  }
  claude.decideRequest({ pedidoId: request.pedidoId, decisao: "terminal" });
  const r = await response;
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "");
  assert.throws(() => claude.decideRequest({ pedidoId: "x", decisao: "talvez" }), /decisao_invalida/);
  control.abort();
});

test("Always allow only accepts the rule suggested by Claude Code", async () => {
  const control = new AbortController();
  const flow = await fetch(`${base}/ponte/claude/eventos`, { signal: control.signal });
  const reader = flow.body.getReader();
  let buffer = "";
  const suggestions = [{ type: "allow", rules: ["Bash(npm *)"], toolName: "Bash", behavior: "allow" }];
  const response = send({ hook_event_name: "PermissionRequest", session_id: "s6", tool_name: "Bash", tool_input: { command: "npm test" }, permission_suggestions: suggestions }, { "x-niko-gancho": secret() });
  let request;
  while (!request) {
    buffer += new TextDecoder().decode((await reader.read()).value);
    request = buffer.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.sessao === "s6" && e.pedidoId);
  }
  assert.throws(() => claude.decideRequest({ pedidoId: request.pedidoId, decisao: "allow", regra: { toolName: "Bash", ruleContent: "*" } }), /regra_invalida/);
  assert.throws(() => claude.decideRequest({ pedidoId: request.pedidoId, decisao: "deny", regra: { toolName: "Bash", ruleContent: "npm *" } }), /decisao_invalida/);
  claude.decideRequest({ pedidoId: request.pedidoId, decisao: "allow", regra: { toolName: "Bash", ruleContent: "npm *" } });
  assert.deepEqual(await (await response).json(), {
    hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow", updatedPermissions: [{ type: "allow", toolName: "Bash", ruleContent: "npm *", behavior: "allow", mode: "local", directories: [] }] } },
  });
  control.abort();
});

test("Claude questions accept only the offered options through the island", async () => {
  const control = new AbortController();
  const flow = await fetch(`${base}/ponte/claude/eventos`, { signal: control.signal });
  const reader = flow.body.getReader();
  let buffer = "";
  const input = {
    questions: [
      { question: "Qual banco?", header: "Banco", multiSelect: false, options: [{ label: "SQLite", description: "Local" }, { label: "Postgres", description: "Servidor" }] },
      { question: "Quais testes?", header: "Testes", multiSelect: true, options: [{ label: "Unidade" }, { label: "Integração" }] },
    ],
  };
  const response = send({ hook_event_name: "PermissionRequest", session_id: "s7", tool_name: "AskUserQuestion", tool_input: input }, { "x-niko-gancho": secret() });
  let request;
  while (!request) {
    buffer += new TextDecoder().decode((await reader.read()).value);
    request = buffer.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.sessao === "s7" && e.pedidoId);
  }
  const id = request.pedidoId;
  assert.throws(() => claude.decideRequest({ pedidoId: id, decisao: "allow" }), /respostas_invalidas/);
  assert.throws(() => claude.decideRequest({ pedidoId: id, decisao: "allow", respostas: [[5], [0]] }), /respostas_invalidas/);
  assert.throws(() => claude.decideRequest({ pedidoId: id, decisao: "allow", respostas: [[0, 1], [0]] }), /respostas_invalidas/);
  assert.throws(() => claude.decideRequest({ pedidoId: id, decisao: "allow", respostas: [[0]] }), /respostas_invalidas/);
  assert.throws(() => claude.decideRequest({ pedidoId: id, decisao: "allow", respostas: [[0], [0, 0]] }), /respostas_invalidas/);
  assert.throws(() => claude.decideRequest({ pedidoId: id, decisao: "allow", respostas: [[0], [1.5]] }), /respostas_invalidas/);
  assert.throws(() => claude.decideRequest({ pedidoId: id, decisao: "deny", respostas: [[0], [0]] }), /decisao_invalida/);
  claude.decideRequest({ pedidoId: id, decisao: "allow", respostas: [[1], [0, 1]] });
  assert.deepEqual(await (await response).json(), {
    hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow", updatedInput: { ...input, answers: { "Qual banco?": "Postgres", "Quais testes?": "Unidade,Integração" } } } },
  });
  control.abort();
});

test("Answers are accepted only for question requests", async () => {
  const control = new AbortController();
  const flow = await fetch(`${base}/ponte/claude/eventos`, { signal: control.signal });
  const reader = flow.body.getReader();
  let buffer = "";
  const response = send({ hook_event_name: "PermissionRequest", session_id: "s8", tool_name: "Bash", tool_input: { command: "ls" } }, { "x-niko-gancho": secret() });
  let request;
  while (!request) {
    buffer += new TextDecoder().decode((await reader.read()).value);
    request = buffer.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.sessao === "s8" && e.pedidoId);
  }
  assert.throws(() => claude.decideRequest({ pedidoId: request.pedidoId, decisao: "allow", respostas: [[0]] }), /respostas_invalidas/);
  claude.decideRequest({ pedidoId: request.pedidoId, decisao: "terminal" });
  await response;
  control.abort();
});

test("Options with commas in their labels do not produce ambiguous answers", () => {
  const perguntas = [{ question: "Q", multiSelect: true, rotulos: ["Sim, agora", "Não"] }];
  assert.throws(() => claude.responsesValid(perguntas, [[0, 1]]), /respostas_invalidas/);
  assert.deepEqual(claude.responsesValid(perguntas, [[0]]), { Q: "Sim, agora" });
});

test("The island reads AskUserQuestion prompts", async () => {
  const { perguntasInput } = await vite.ssrLoadModule("/src/state/claudeCode.ts");
  assert.deepEqual(perguntasInput("AskUserQuestion", { questions: [{ question: "Qual?", header: "H", multiSelect: true, options: [{ label: "A", description: "d" }, { label: "" }] }] }), [{ pergunta: "Qual?", titulo: "H", varias: true, opcoes: [{ rotulo: "A", descricao: "d" }] }]);
  assert.equal(perguntasInput("Bash", { questions: [] }), undefined);
  assert.equal(perguntasInput("AskUserQuestion", { questions: [{ question: "Sem opções", options: [] }] }), undefined);
});

test("Records each session process once and brings its terminal forward", async () => {
  const beforeValue = processesSeen.length;
  await send({ hook_event_name: "SessionStart", session_id: "terminal-1", cwd: "C:\\p" }, { "x-niko-gancho": secret() });
  await send({ hook_event_name: "UserPromptSubmit", session_id: "terminal-1", cwd: "C:\\p" }, { "x-niko-gancho": secret() });
  assert.equal(processesSeen.length, beforeValue + 1);
  assert.deepEqual(await claude.trazerTerminal({ sessao: "terminal-1" }), { ok: true });
  assert.equal(focused.at(-1), 4242);
  await assert.rejects(claude.trazerTerminal({ sessao: "nunca-vista" }), /sem_processo/);
});

test("Opening a diff file requires an existing file inside the project", () => {
  const directory = mkdtempSync(join(tmpdir(), "niko-arquivo-"));
  try {
    mkdirSync(join(directory, "src"));
    writeFileSync(join(directory, "src", "a.ts"), "x");
    assert.equal(claude.fileProject(directory, join(directory, "src", "a.ts")), join(directory, "src", "a.ts"));
    assert.equal(claude.fileProject(directory, join("src", "a.ts")), join(directory, "src", "a.ts"));
    for (const invalidValue of [join(directory, "src", "nao.ts"), join(directory, "src"), join(directory, "..", "fora.ts"), "C:\\Windows\\win.ini", "", 5, "a\nb"]) {
      assert.throws(() => claude.fileProject(directory, invalidValue), /arquivo_invalido/, String(invalidValue));
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Opening a project rejects directories not received from a session", () => {
  assert.throws(() => claude.openProject({ cwd: "C:\\Windows", como: "pasta" }), /projeto_desconhecido/);
  assert.throws(() => claude.openProject({ cwd: rootTemporary, como: "pasta" }), /projeto_desconhecido/);
});

test("Opening a project rejects relative paths even when received from a session", async () => {
  const r = await send({ hook_event_name: "SessionStart", session_id: "s-relativo", cwd: "." }, { "x-niko-gancho": secret() });
  assert.equal(r.status, 200);
  assert.throws(() => claude.openProject({ cwd: ".", como: "pasta" }), /projeto_desconhecido/);
});

test("Diffs mark removed and added lines", async () => {
  const { linesDiff, changeTool, countChanges } = await vite.ssrLoadModule("/src/utils/diff.ts");
  const lines = linesDiff("a\nb\nc", "a\nB\nc\nd");
  assert.deepEqual(lines.map((l) => `${l.tipo}:${l.texto}`), ["igual:a", "menos:b", "mais:B", "igual:c", "mais:d"]);
  const change = changeTool("Edit", { file_path: "C:\\p\\a.ts", old_string: "x", new_string: "y\nz" });
  assert.deepEqual(countChanges(change), { mais: 2, menos: 1 });
  assert.equal(changeTool("Write", { file_path: "b.ts", content: "1\n2" }).novo, true);
  assert.equal(changeTool("Bash", { command: "ls" }), undefined);
});

test("Repeated events after reconnection do not duplicate activity", () => {
  const eventValue = { id: "evento-unico", recebidoEm: new Date().toISOString(), evento: "PreToolUse", sessao: "s5", cwd: "C:\\projetos\\app", dados: { tool_name: "Bash", tool_input: { command: "npm test" } } };
  useClaudeCode.getState().apply(eventValue);
  useClaudeCode.getState().apply(eventValue);
  const session = useClaudeCode.getState().sessoes.s5;
  assert.equal(session.passos.length, 1);
  assert.equal(session.ferramentasUsadas, 1);
  assert.equal(session.projeto, "app");
});

test("Ended sessions disappear from the island and closed tabs do not reopen for old events", () => {
  const { apply, close: closeValue } = useClaudeCode.getState();
  const beforeValue = new Date(Date.now() - 60_000).toISOString();
  apply({ id: "s7-inicio", recebidoEm: beforeValue, evento: "SessionStart", sessao: "s7", cwd: "C:\\projetos\\app", dados: {} });
  apply({ id: "s8-inicio", recebidoEm: beforeValue, evento: "SessionStart", sessao: "s8", cwd: "C:\\projetos\\app", dados: {} });
  assert.ok(useClaudeCode.getState().sessoes.s7);
  apply({ id: "s7-fim", recebidoEm: beforeValue, evento: "SessionEnd", sessao: "s7", cwd: "C:\\projetos\\app", dados: { reason: "clear" } });
  assert.equal(useClaudeCode.getState().sessoes.s7, undefined);
  assert.ok(!useClaudeCode.getState().ordem.includes("s7"));
  closeValue("s8");
  apply({ id: "s8-antigo", recebidoEm: beforeValue, evento: "PreToolUse", sessao: "s8", cwd: "C:\\projetos\\app", dados: { tool_name: "Read", tool_input: { file_path: "a.ts" } } });
  assert.equal(useClaudeCode.getState().sessoes.s8, undefined);
  apply({ id: "s8-novo", recebidoEm: new Date(Date.now() + 1000).toISOString(), evento: "UserPromptSubmit", sessao: "s8", cwd: "C:\\projetos\\app", dados: { prompt: "continua" } });
  assert.ok(useClaudeCode.getState().sessoes.s8);
});

test("Requests leaving the island without a decision record their reason in the activity", () => {
  const now = new Date().toISOString();
  const { apply } = useClaudeCode.getState();
  apply({ id: "pedido-1", recebidoEm: now, evento: "PermissionRequest", sessao: "s6", cwd: "C:\\projetos\\app", pedidoId: "p-6", dados: { tool_name: "Bash", tool_input: { command: "npm test" } } });
  assert.equal(useClaudeCode.getState().pedidos.filter((p) => p.pedidoId === "p-6").length, 1);
  apply({ id: "fim-1", recebidoEm: now, evento: "NikoPedidoEncerrado", sessao: "s6", cwd: "", pedidoId: "p-6", dados: { motivo: "expirou", decisao: null } });
  const state = useClaudeCode.getState();
  assert.equal(state.pedidos.filter((p) => p.pedidoId === "p-6").length, 0);
  assert.equal(state.sessoes.s6.estado, "trabalhando");
  assert.match(state.sessoes.s6.passos.at(-1).rotulo, /110 segundos/);
  apply({ id: "pedido-2", recebidoEm: now, evento: "PermissionRequest", sessao: "s6", cwd: "C:\\projetos\\app", pedidoId: "p-7", dados: { tool_name: "Bash", tool_input: { command: "ls" } } });
  const stepsBefore = useClaudeCode.getState().sessoes.s6.passos.length;
  apply({ id: "fim-2", recebidoEm: now, evento: "NikoPedidoEncerrado", sessao: "s6", cwd: "", pedidoId: "p-7", dados: { motivo: "decidido", decisao: "allow" } });
  assert.equal(useClaudeCode.getState().sessoes.s6.passos.length, stepsBefore);
});

test("Reads the latest assistant model from the end of the transcript", () => {
  const path = join(rootTemporary, "sessao.jsonl");
  const lines = [
    { type: "assistant", message: { model: "claude-sonnet-4-5-20250929" } },
    { type: "user", message: { content: "troca o modelo" } },
    { type: "assistant", message: { model: "<synthetic>" } },
    { type: "assistant", message: { model: "claude-opus-4-7" } },
    { type: "system", content: "fim" },
  ];
  writeFileSync(path, `${"x".repeat(300 * 1024)}\n${lines.map((l) => JSON.stringify(l)).join("\n")}\n`);
  assert.equal(claude.modelTranscript(path), "claude-opus-4-7");
  assert.equal(claude.modelTranscript("relativo.jsonl"), undefined);
  assert.equal(claude.modelTranscript(join(rootTemporary, "nao-existe.jsonl")), undefined);
  assert.equal(claude.modelTranscript(join(rootTemporary, "settings.txt")), undefined);
});

test("Displays a readable model name", async () => {
  const { nameModel } = await vite.ssrLoadModule("/src/state/claudeCode.ts");
  assert.equal(nameModel("claude-opus-4-7[1m]"), "Opus 4.7");
  assert.equal(nameModel("claude-sonnet-4-5-20250929"), "Sonnet 4.5");
  assert.equal(nameModel("claude-opus-4-20250514"), "Opus 4");
  assert.equal(nameModel("claude-3-5-haiku-20241022"), "Haiku 3.5");
  assert.equal(nameModel("gpt-5-codex"), "gpt-5-codex");
});
