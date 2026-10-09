import type { IncomingMessage, ServerResponse } from "node:http";
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, statSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { dataDirectory } from "./ai";
import { ownerConnection, focusWindowProcess } from "./quickControls";
import { PATH_STATUS, previousStatus, pathScript, isStatusNiko, ensureScript, receiveStatus, statusNiko } from "./claudeStatus";

export const HEADER_SECRET = "x-niko-gancho";
const PATH_EVENT = "/ponte/claude/evento";
const LIMIT_BODY = 2 * 1024 * 1024;
const LIMIT_FIELD = 4000;
const LIMIT_RESPONSE_FINAL = 12000;
const WAIT_DECISION_MS = 110_000;
const TIME_HOOK_QUICK = 2;
const TIME_HOOK_DECISION = 120;
const MAXIMUM_HISTORY = 300;
const DEPTH_MAXIMUM = 6;

export const EVENTS_INSTALLED = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "Notification",
  "Stop",
  "StopFailure",
  "SubagentStart",
  "SubagentStop",
  "SessionEnd",
] as const;

const FIELDS_DISCARDED = ["tool_response", "tool_result", "transcript_path", "scratchpad_dir"];
const TOOLS_THAT_DECIDE = new Set<CodingTool>(["claude", "codex", "copilot"]);
const MESSAGE_DENIAL = "Negado pelo usuário no Niko.";

export type CodingTool = "claude" | "copilot" | "codex" | "opencode" | "antigravity" | "kimi" | "gemini" | "amp";

export interface EventClaude {
  id: string;
  recebidoEm: string;
  ferramenta: CodingTool;
  evento: string;
  sessao: string;
  cwd: string;
  dados: Record<string, unknown>;
  pedidoId?: string;
}

interface RuleSuggested {
  toolName: string;
  ruleContent: string;
}

interface Pending {
  res: ServerResponse;
  ferramenta: CodingTool;
  temporizador: NodeJS.Timeout;
  sessao: string;
  sugestoes: RuleSuggested[];
  pergunta: ReturnType<typeof perguntasRequest>;
}

const projectsKnown = new Set<string>();
const LIMIT_RESPONSE = 2000;

interface PerguntaClaude {
  question: string;
  multiSelect: boolean;
  rotulos: string[];
}

export function perguntasRequest(payload: Record<string, unknown>): { entrada: Record<string, unknown>; perguntas: PerguntaClaude[] } | null {
  if (payload.tool_name !== "AskUserQuestion" || !payload.tool_input || typeof payload.tool_input !== "object") return null;
  const input = payload.tool_input as Record<string, unknown>;
  if (!Array.isArray(input.questions) || input.questions.length === 0) return null;
  const perguntas: PerguntaClaude[] = [];
  for (const q of input.questions) {
    const p = q as { question?: unknown; multiSelect?: unknown; options?: unknown };
    if (typeof p?.question !== "string" || !p.question || !Array.isArray(p.options)) return null;
    const labels = p.options.map((o) => (o as { label?: unknown })?.label).filter((l): l is string => typeof l === "string" && l.length > 0);
    if (labels.length === 0) return null;
    perguntas.push({ question: p.question, multiSelect: p.multiSelect === true, rotulos: labels });
  }
  return { entrada: input, perguntas };
}

export function responsesValid(perguntas: PerguntaClaude[], responses: unknown): Record<string, string> {
  if (!Array.isArray(responses) || responses.length !== perguntas.length) throw new Error("respostas_invalidas");
  const output: Record<string, string> = {};
  perguntas.forEach((p, i) => {
    const indices = responses[i];
    if (!Array.isArray(indices) || indices.length === 0 || (!p.multiSelect && indices.length !== 1)) throw new Error("respostas_invalidas");
    if (indices.some((x) => !Number.isInteger(x) || x < 0 || x >= p.rotulos.length) || new Set(indices).size !== indices.length) throw new Error("respostas_invalidas");
    const escolhidas = (indices as number[]).map((x) => p.rotulos[x]);
    if (escolhidas.length > 1 && escolhidas.some((r) => r.includes(","))) throw new Error("respostas_invalidas");
    const text = escolhidas.join(",");
    if (text.length > LIMIT_RESPONSE) throw new Error("respostas_invalidas");
    output[p.question] = text;
  });
  return output;
}

function rulesSuggested(payload: Record<string, unknown>): RuleSuggested[] {
  const list = Array.isArray(payload.permission_suggestions) ? payload.permission_suggestions : [];
  const rules: RuleSuggested[] = [];
  for (const s of list) {
    if (!s || typeof s !== "object") continue;
    const suggestion = s as { type?: unknown; behavior?: unknown; rules?: unknown };
    if (suggestion.type !== "allow" || suggestion.behavior !== "allow" || !Array.isArray(suggestion.rules)) continue;
    for (const r of suggestion.rules) {
      const m = typeof r === "string" ? /^([A-Za-z0-9_.:-]{1,64})\((.{1,300})\)$/.exec(r.trim()) : null;
      if (m && !rules.some((x) => x.toolName === m[1] && x.ruleContent === m[2])) rules.push({ toolName: m[1], ruleContent: m[2] });
    }
  }
  return rules.slice(0, 4);
}

const historyValue: EventClaude[] = [];
const listeners = new Set<ServerResponse>();
const pendingRequests = new Map<string, Pending>();

function directoryClaude() {
  return join(homedir(), ".claude");
}

function pathSettings() {
  return join(directoryClaude(), "settings.json");
}

export function port() {
  return Number(process.env.NIKO_PORTA) || 47831;
}

function urlHook() {
  return `http://127.0.0.1:${port()}${PATH_EVENT}`;
}

let secretAtMemory: string | null = null;

export function secret(): string {
  if (secretAtMemory) return secretAtMemory;
  const file = join(dataDirectory(), "gancho-claude.json");
  try {
    const read = JSON.parse(readFileSync(file, "utf8")) as { segredo?: string };
    if (typeof read.segredo === "string" && read.segredo.length >= 32) return (secretAtMemory = read.segredo);
  } catch {
    mkdirSync(dataDirectory(), { recursive: true });
  }
  const newItem = randomBytes(32).toString("hex");
  writeFileSync(file, JSON.stringify({ segredo: newItem }), "utf8");
  return (secretAtMemory = newItem);
}

export function secretMatches(received: unknown): boolean {
  if (typeof received !== "string") return false;
  const expected = Buffer.from(secret());
  const data = Buffer.from(received);
  return data.length === expected.length && timingSafeEqual(data, expected);
}

function isHookNiko(hook: unknown): boolean {
  if (!hook || typeof hook !== "object") return false;
  const g = hook as { type?: unknown; url?: unknown; headers?: Record<string, unknown> };
  return g.type === "http" && typeof g.url === "string" && g.url.includes(PATH_EVENT) && Boolean(g.headers && HEADER_SECRET in g.headers);
}

type Settings = Record<string, unknown> & { hooks?: Record<string, unknown> };

function readSettings(): { texto: string | null; dados: Settings } {
  const path = pathSettings();
  if (!existsSync(path)) return { texto: null, dados: {} };
  const text = readFileSync(path, "utf8");
  if (!text.trim()) return { texto: text, dados: {} };
  try {
    const payload = JSON.parse(text.replace(/^﻿/, "")) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error();
    const hooks = (payload as Settings).hooks;
    if (hooks !== undefined && (!hooks || typeof hooks !== "object" || Array.isArray(hooks))) throw new Error();
    return { texto: text, dados: payload as Settings };
  } catch {
    throw new Error("settings_invalido");
  }
}

function withoutHooksNiko(payload: Settings): Settings {
  const copy: Settings = JSON.parse(JSON.stringify(payload)) as Settings;
  const hooks = copy.hooks && typeof copy.hooks === "object" && !Array.isArray(copy.hooks) ? (copy.hooks as Record<string, unknown>) : null;
  if (!hooks) return copy;
  for (const [eventValue, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    const remaining = groups
      .map((group) => {
        if (!group || typeof group !== "object") return group;
        const g = group as { hooks?: unknown[] };
        if (!Array.isArray(g.hooks)) return group;
        const filtered = g.hooks.filter((h) => !isHookNiko(h));
        return filtered.length === g.hooks.length ? group : filtered.length ? { ...g, hooks: filtered } : null;
      })
      .filter((g) => g !== null);
    if (remaining.length) hooks[eventValue] = remaining;
    else delete hooks[eventValue];
  }
  if (Object.keys(hooks).length === 0) delete copy.hooks;
  return withoutStatusNiko(copy);
}

function withoutStatusNiko(payload: Settings): Settings {
  if (!isStatusNiko(payload.statusLine)) return payload;
  const previous = previousStatus(payload.statusLine);
  const { statusLine: _niko, ...rest } = payload;
  return previous ? { ...rest, statusLine: previous } : rest;
}

function hasHooksNiko(payload: Settings): Settings {
  const clean = withoutHooksNiko(payload);
  const hooks = (clean.hooks && typeof clean.hooks === "object" && !Array.isArray(clean.hooks) ? clean.hooks : {}) as Record<string, unknown[]>;
  const key = secret();
  for (const eventValue of EVENTS_INSTALLED) {
    const current = Array.isArray(hooks[eventValue]) ? hooks[eventValue] : [];
    hooks[eventValue] = [
      ...current,
      {
        hooks: [
          {
            type: "http",
            url: urlHook(),
            timeout: eventValue === "PermissionRequest" ? TIME_HOOK_DECISION : TIME_HOOK_QUICK,
            headers: { [HEADER_SECRET]: key },
          },
        ],
      },
    ];
  }
  const previous = clean.statusLine && typeof clean.statusLine === "object" ? (clean.statusLine as Record<string, unknown>) : undefined;
  return { ...clean, hooks, statusLine: statusNiko(previous, port(), key) };
}

function hideSecret(text: string) {
  return text.split(secret()).join("••••••••");
}

function statusCurrent(value: unknown) {
  if (!isStatusNiko(value)) return false;
  ensureScript();
  const expected = statusNiko(previousStatus(value), port(), secret()).command;
  return (value as { command: string }).command === expected && existsSync(pathScript());
}

export function isRouteStatus(path: string) {
  return path === PATH_STATUS;
}

export async function receiveStatusClaude(req: IncomingMessage, res: ServerResponse) {
  if (req.headers.origin || !secretMatches(req.headers[HEADER_SECRET])) {
    res.statusCode = 403;
    return res.end();
  }
  await readBodyJson(req).then(receiveStatus).catch(() => undefined);
  respondEmpty(res);
}

export function stateInstallation() {
  const path = pathSettings();
  let payload: Settings = {};
  let invalid = false;
  try {
    payload = readSettings().dados;
  } catch {
    invalid = true;
  }
  const hooks = (payload.hooks ?? {}) as Record<string, unknown>;
  const hooksNiko = Object.values(hooks)
    .flatMap((groups) => (Array.isArray(groups) ? groups : []))
    .flatMap((g) => (Array.isArray((g as { hooks?: unknown[] })?.hooks) ? (g as { hooks: unknown[] }).hooks : []))
    .filter(isHookNiko);
  const current = (h: unknown) => {
    const g = h as { url: string; headers: Record<string, unknown>; timeout?: unknown };
    return g.url === urlHook() && g.headers[HEADER_SECRET] === secret() && (g.timeout === TIME_HOOK_QUICK || g.timeout === TIME_HOOK_DECISION);
  };
  const installed = EVENTS_INSTALLED.filter((eventValue) => {
    const groups = hooks[eventValue];
    return Array.isArray(groups) && groups.some((g) => Array.isArray((g as { hooks?: unknown[] })?.hooks) && (g as { hooks: unknown[] }).hooks.some((h) => isHookNiko(h) && current(h)));
  });
  return {
    caminho: path,
    existe: existsSync(path),
    claudeInstalado: existsSync(directoryClaude()),
    invalido: invalid,
    instalado: installed.length === EVENTS_INSTALLED.length,
    parcial: installed.length > 0 && installed.length < EVENTS_INSTALLED.length,
    eventos: installed,
    desatualizado: hooksNiko.some((h) => !current(h)) || (installed.length > 0 && !statusCurrent(payload.statusLine)),
    conectado: listeners.size > 0,
  };
}

export function previewInstallation(action: "instalar" | "remover") {
  const { texto: text, dados: payload } = readSettings();
  const proposed = action === "instalar" ? hasHooksNiko(payload) : withoutHooksNiko(payload);
  return { caminho: pathSettings(), atual: text === null ? null : hideSecret(text), proposto: hideSecret(`${JSON.stringify(proposed, null, 2)}\n`) };
}

function writeWithCopy(content: Settings) {
  const path = pathSettings();
  mkdirSync(directoryClaude(), { recursive: true });
  let copy: string | null = null;
  if (existsSync(path)) {
    copy = `${path}.niko-${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
    copyFileSync(path, copy);
  }
  const temporary = `${path}.niko-gravando`;
  writeFileSync(temporary, `${JSON.stringify(content, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
  return { caminho: path, copia: copy };
}

export function installHooks(body: Record<string, unknown>) {
  if (body.confirmacao !== "INSTALAR") throw new Error("confirmacao_invalida");
  ensureScript();
  return writeWithCopy(hasHooksNiko(readSettings().dados));
}

export function removeHooks(body: Record<string, unknown>) {
  if (body.confirmacao !== "REMOVER") throw new Error("confirmacao_invalida");
  return writeWithCopy(withoutHooksNiko(readSettings().dados));
}

function trim(value: unknown, limit = LIMIT_FIELD, depth = 0): unknown {
  if (typeof value === "string") return value.length > limit ? `${value.slice(0, limit)}…` : value;
  if ((Array.isArray(value) || (value && typeof value === "object")) && depth >= DEPTH_MAXIMUM) return null;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => trim(v, limit, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 40).map(([k, v]) => [k, trim(v, limit, depth + 1)]));
  return value;
}

export function readBodyJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts: Buffer[] = [];
    req.on("data", (p: Buffer) => {
      size += p.length;
      if (size > LIMIT_BODY) {
        req.destroy();
        reject(new Error("corpo_grande"));
        return;
      }
      parts.push(p);
    });
    req.on("end", () => {
      try {
        const payload = JSON.parse(Buffer.concat(parts).toString("utf8").replace(/^﻿/, "")) as unknown;
        resolve(payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {});
      } catch {
        reject(new Error("json_invalido"));
      }
    });
    req.on("error", reject);
  });
}

const EVENTS_WITH_MODEL = new Set(["SessionStart", "UserPromptSubmit", "Stop", "SubagentStop"]);
const BYTES_END_TRANSCRIPT = 256 * 1024;

/** Lê só o fim do transcript da sessão e devolve o modelo da última resposta do assistente. */
export function modelTranscript(path: string): string | undefined {
  if (!isAbsolute(path) || !path.endsWith(".jsonl") || path.length > 1000) return undefined;
  let descriptor: number | undefined;
  try {
    const size = statSync(path).size;
    const start = Math.max(0, size - BYTES_END_TRANSCRIPT);
    const buffer = Buffer.alloc(size - start);
    descriptor = openSync(path, "r");
    readSync(descriptor, buffer, 0, buffer.length, start);
    const lines = buffer.toString("utf8").split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"model"')) continue;
      try {
        const line = JSON.parse(lines[i]) as { type?: string; message?: { model?: unknown } };
        const model = line.type === "assistant" ? line.message?.model : undefined;
        if (typeof model === "string" && model && !model.startsWith("<")) return model.slice(0, 80);
      } catch {
        // Partial line at the beginning of the read segment.
      }
    }
  } catch {
    return undefined;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return undefined;
}

function broadcast(eventValue: EventClaude) {
  historyValue.push(eventValue);
  if (historyValue.length > MAXIMUM_HISTORY) historyValue.splice(0, historyValue.length - MAXIMUM_HISTORY);
  const line = `${JSON.stringify(eventValue)}\n`;
  for (const listener of listeners) listener.write(line);
}

export function respondEmpty(res: ServerResponse) {
  if (res.writableEnded) return;
  res.statusCode = 200;
  res.setHeader("cache-control", "no-store");
  res.end();
}

export async function receiveEventHook(req: IncomingMessage, res: ServerResponse) {
  if (req.headers.origin || !secretMatches(req.headers[HEADER_SECRET])) {
    res.statusCode = 403;
    return res.end();
  }
  let body: Record<string, unknown>;
  try {
    body = await readBodyJson(req);
  } catch {
    return respondEmpty(res);
  }
  await remindProcess(req, body);
  processEvent(body, "claude", res);
}

const processSession = new Map<string, number>();
const procurando = new Set<string>();
const LIMIT_SESSIONS_WITH_PROCESS = 50;
const WAIT_PELO_PROCESS_MS = 700;
export const searchProcess = { dono: ownerConnection, focar: focusWindowProcess };

/** Identify the process while the hook connection is open so its session terminal can be brought forward. */
export async function remindProcess(req: IncomingMessage, body: Record<string, unknown>) {
  const session = typeof body.session_id === "string" ? body.session_id : "";
  const portClient = req.socket.remotePort;
  if (!session || !portClient || processSession.has(session) || procurando.has(session)) return;
  procurando.add(session);
  const search = searchProcess
    .dono(portClient, port())
    .then((pid) => {
      if (!pid) return;
      processSession.set(session, pid);
      if (processSession.size > LIMIT_SESSIONS_WITH_PROCESS) processSession.delete(processSession.keys().next().value as string);
    })
    .catch(() => undefined)
    .finally(() => procurando.delete(session));
  if (body.hook_event_name === "PermissionRequest") return;
  await Promise.race([search, new Promise((r) => setTimeout(r, WAIT_PELO_PROCESS_MS))]);
}

export async function trazerTerminal(body: Record<string, unknown>) {
  const session = typeof body.sessao === "string" ? body.sessao : "";
  const pid = processSession.get(session);
  if (!pid) throw new Error("sem_processo");
  await searchProcess.focar(pid);
  return { ok: true };
}

export function processEvent(body: Record<string, unknown>, tool: CodingTool, res: ServerResponse, onRespondEmpty: (res: ServerResponse) => void = respondEmpty) {
  const nameValue = typeof body.hook_event_name === "string" ? body.hook_event_name : "";
  const modelCurrent = EVENTS_WITH_MODEL.has(nameValue) && typeof body.transcript_path === "string" ? modelTranscript(body.transcript_path) : undefined;
  for (const field of FIELDS_DISCARDED) delete body[field];
  if (modelCurrent) body.model = modelCurrent;
  const last = typeof body.last_assistant_message === "string" ? body.last_assistant_message.slice(0, LIMIT_RESPONSE_FINAL) : undefined;
  const payload = trim(body) as Record<string, unknown>;
  if (last !== undefined) payload.last_assistant_message = last;
  const eventValue: EventClaude = {
    id: randomUUID(),
    recebidoEm: new Date().toISOString(),
    ferramenta: tool,
    evento: nameValue,
    sessao: typeof body.session_id === "string" ? body.session_id : "",
    cwd: typeof body.cwd === "string" ? body.cwd : "",
    dados: payload,
  };
  if (eventValue.cwd && eventValue.cwd.length < 500) {
    projectsKnown.add(eventValue.cwd);
    if (projectsKnown.size > 50) projectsKnown.delete(projectsKnown.values().next().value as string);
  }
  if (nameValue !== "PermissionRequest" || listeners.size === 0 || !TOOLS_THAT_DECIDE.has(tool)) {
    onRespondEmpty(res);
    broadcast(eventValue);
    return;
  }
  const requestId = randomUUID();
  eventValue.pedidoId = requestId;
  const timer = setTimeout(() => stopRequest(requestId, null, "expirou"), WAIT_DECISION_MS);
  pendingRequests.set(requestId, { res, ferramenta: tool, temporizador: timer, sessao: eventValue.sessao, sugestoes: tool === "claude" ? rulesSuggested(body) : [], pergunta: tool === "claude" ? perguntasRequest(body) : null });
  res.on("close", () => {
    if (pendingRequests.has(requestId)) stopRequest(requestId, null, "cancelado");
  });
  broadcast(eventValue);
}

function decisionPermission(decision: "allow" | "deny", pending: Pending, rule?: RuleSuggested, responses?: Record<string, string>) {
  if (decision === "deny") return { behavior: "deny", message: MESSAGE_DENIAL };
  if (responses && pending.pergunta) return { behavior: "allow", updatedInput: { ...pending.pergunta.entrada, answers: responses } };
  if (rule) return { behavior: "allow", updatedPermissions: [{ type: "allow", toolName: rule.toolName, ruleContent: rule.ruleContent, behavior: "allow", mode: "local", directories: [] }] };
  return { behavior: "allow" };
}

function stopRequest(requestId: string, decision: "allow" | "deny" | null, reason: string, rule?: RuleSuggested, responses?: Record<string, string>) {
  const pending = pendingRequests.get(requestId);
  if (!pending) return false;
  pendingRequests.delete(requestId);
  clearTimeout(pending.temporizador);
  if (!pending.res.writableEnded) {
    if (decision && pending.ferramenta === "copilot") {
      pending.res.statusCode = 200;
      pending.res.setHeader("content-type", "application/json; charset=utf-8");
      pending.res.end(JSON.stringify(decision === "allow" ? { behavior: "allow" } : { behavior: "deny", message: MESSAGE_DENIAL }));
    } else if (decision) {
      const body = { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: decisionPermission(decision, pending, rule, responses) } };
      pending.res.statusCode = 200;
      pending.res.setHeader("content-type", "application/json; charset=utf-8");
      pending.res.end(JSON.stringify(body));
    } else respondEmpty(pending.res);
  }
  broadcast({ id: randomUUID(), recebidoEm: new Date().toISOString(), ferramenta: pending.ferramenta, evento: "NikoPedidoEncerrado", sessao: pending.sessao, cwd: "", dados: { motivo: reason, decisao: decision }, pedidoId: requestId });
  return true;
}

export function decideRequest(body: Record<string, unknown>) {
  const requestId = typeof body.pedidoId === "string" ? body.pedidoId : "";
  const decision = body.decisao === "allow" || body.decisao === "deny" ? body.decisao : body.decisao === "terminal" ? null : undefined;
  if (decision === undefined) throw new Error("decisao_invalida");
  let rule: RuleSuggested | undefined;
  if (body.regra && typeof body.regra === "object") {
    if (decision !== "allow") throw new Error("decisao_invalida");
    const requested = body.regra as Partial<RuleSuggested>;
    rule = pendingRequests.get(requestId)?.sugestoes.find((s) => s.toolName === requested.toolName && s.ruleContent === requested.ruleContent);
    if (!rule) throw new Error("regra_invalida");
  }
  let responses: Record<string, string> | undefined;
  if (body.respostas !== undefined) {
    const pergunta = pendingRequests.get(requestId)?.pergunta;
    if (decision !== "allow" || rule) throw new Error("decisao_invalida");
    if (!pergunta) throw new Error(pendingRequests.has(requestId) ? "respostas_invalidas" : "pedido_expirou");
    responses = responsesValid(pergunta.perguntas, body.respostas);
  } else if (decision === "allow" && pendingRequests.get(requestId)?.pergunta) throw new Error("respostas_invalidas");
  if (!stopRequest(requestId, decision, decision ? "decidido" : "terminal", rule, responses)) throw new Error("pedido_expirou");
  return { ok: true };
}

function pathVsCode(): string | null {
  const candidates = [
    join(process.env.LOCALAPPDATA ?? "", "Programs", "Microsoft VS Code", "Code.exe"),
    join(process.env.ProgramFiles ?? "C:\\Program Files", "Microsoft VS Code", "Code.exe"),
    join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft VS Code", "Code.exe"),
  ];
  for (const directory of (process.env.PATH ?? "").split(";")) {
    if (/microsoft vs code[\\/]bin$/i.test(directory.trim())) candidates.push(join(directory.trim(), "..", "Code.exe"));
  }
  return candidates.find((c) => c && existsSync(c)) ?? null;
}

function openDetached(program: string, args: string[]) {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(program, args, { detached: true, stdio: "ignore", windowsHide: false, env: environment });
  child.on("error", () => undefined);
  child.unref();
}

export function fileProject(cwd: string, file: unknown): string {
  if (typeof file !== "string" || !file || file.length > 1000 || /[\u0000-\u001f]/.test(file)) throw new Error("arquivo_invalido");
  const path = resolve(cwd, file);
  const relativeValue = relative(cwd, path);
  if (!relativeValue || relativeValue.startsWith("..") || isAbsolute(relativeValue) || !existsSync(path) || !statSync(path).isFile()) throw new Error("arquivo_invalido");
  return path;
}

export function openProject(body: Record<string, unknown>) {
  const cwd = typeof body.cwd === "string" ? body.cwd : "";
  if (!projectsKnown.has(cwd) || !isAbsolute(cwd) || !existsSync(cwd) || !statSync(cwd).isDirectory()) throw new Error("projeto_desconhecido");
  if (body.como === "vscode" || body.como === "arquivo") {
    const code = pathVsCode();
    if (!code) throw new Error("vscode_nao_encontrado");
    openDetached(code, body.como === "arquivo" ? [cwd, fileProject(cwd, body.arquivo)] : [cwd]);
  } else if (body.como === "pasta") {
    openDetached("explorer.exe", [cwd]);
  } else throw new Error("acao_invalida");
  return { ok: true };
}

export function listenEvents(req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-accel-buffering", "no");
  const limit = Date.now() - 6 * 3600_000;
  for (const eventValue of historyValue) if (Date.parse(eventValue.recebidoEm) >= limit) res.write(`${JSON.stringify(eventValue)}\n`);

  res.write(`${JSON.stringify({ evento: "NikoConectado", id: randomUUID(), recebidoEm: new Date().toISOString(), ferramenta: "claude", sessao: "", cwd: "", dados: {} })}\n`);
  listeners.add(res);
  const heartbeat = setInterval(() => res.write("\n"), 20_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    listeners.delete(res);
  });
}

export function isRouteHook(path: string) {
  return path === PATH_EVENT;
}
