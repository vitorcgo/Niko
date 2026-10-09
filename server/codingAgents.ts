import type { IncomingMessage, ServerResponse } from "node:http";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  HEADER_SECRET, stateInstallation, installHooks, remindProcess, readBodyJson, port, processEvent, removeHooks, secret, secretMatches, type CodingTool,
} from "./claude";

const PREFIX_ROUTE = "/ponte/agentes/evento/";
const TIME_REQUEST_S = 115;
const TIME_HOOK_DECISION_S = 120;
const TIME_HOOK_QUICK_S = 10;
const TIME_HOOK_FINAL_S = 3;
const TIME_TO_CONNECT_S = 1;
const TIME_CURL_QUICK_S = 3;
const START_BLOCK_TOML = "# niko:inicio (gerado pelo Niko, remova pelo Niko)";
const END_BLOCK_TOML = "# niko:fim";

export const TOOLS_CODE: CodingTool[] = ["claude", "codex", "copilot", "opencode", "antigravity", "kimi", "gemini", "amp"];
const TOOLS_WITH_RESPONSE_JSON = new Set<CodingTool>(["copilot", "antigravity", "gemini"]);
const MS_PER_SECOND = 1000;

type BodyType = Record<string, unknown>;

function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function object(v: unknown): BodyType {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as BodyType) : {};
}

function home(...parts: string[]) {
  return join(homedir(), ...parts);
}

function urlEvent(tool: CodingTool, eventValue: string) {
  return `http://127.0.0.1:${port()}${PREFIX_ROUTE}${tool}?evento=${encodeURIComponent(eventValue)}`;
}

export function commandHook(tool: CodingTool, eventValue: string, key: string, decide = false) {
  const time = decide ? TIME_REQUEST_S : TIME_CURL_QUICK_S;
  return `curl.exe -s --connect-timeout ${TIME_TO_CONNECT_S} -m ${time} -X POST -H "content-type: application/json" -H "${HEADER_SECRET}: ${key}" --data-binary "@-" "${urlEvent(tool, eventValue)}"`;
}

const EVENTS_COPILOT: Record<string, string> = {
  sessionStart: "SessionStart",
  sessionEnd: "SessionEnd",
  userPromptSubmitted: "UserPromptSubmit",
  preToolUse: "PreToolUse",
  postToolUseFailure: "PostToolUseFailure",
  agentStop: "Stop",
  errorOccurred: "StopFailure",
  notification: "Notification",
  permissionRequest: "PermissionRequest",
  subagentStart: "SubagentStart",
  subagentStop: "SubagentStop",
};

const EVENTS_CODEX = ["SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "Stop", "Interrupt", "SubagentStart", "SubagentStop"];
const EVENTS_KIMI = ["SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "Notification", "Stop", "Interrupt"];
const EVENTS_ANTIGRAVITY = ["PreInvocation", "PreToolUse", "Stop"];

const EVENTS_GEMINI: Record<string, string> = {
  SessionStart: "SessionStart",
  SessionEnd: "SessionEnd",
  BeforeAgent: "UserPromptSubmit",
  AfterAgent: "Stop",
  BeforeTool: "PreToolUse",
  Notification: "Notification",
};

const TOOLS_GEMINI: Record<string, string> = { replace: "Edit", write_file: "Write", run_shell_command: "Bash", read_file: "Read", glob: "Glob", search_file_content: "Grep", web_fetch: "WebFetch", google_web_search: "WebSearch" };

function typeNotice(type: string): string {
  return /permission|approv|input|idle|elicitation/i.test(type) ? "agent_needs_input" : type;
}

function args(v: unknown): BodyType {
  if (typeof v === "string") {
    try {
      return object(JSON.parse(v));
    } catch {
      return { command: v };
    }
  }
  return object(v);
}

/** Convert each tool event to the Claude Code hook format used by the island. */
export function normalizeEvent(tool: CodingTool, eventRoute: string, body: BodyType): BodyType | null {
  if (tool === "copilot") {
    const nameValue = EVENTS_COPILOT[eventRoute];
    if (!nameValue || (eventRoute === "errorOccurred" && body.recoverable === true)) return null;
    const error = object(body.error);
    return {
      hook_event_name: nameValue,
      session_id: text(body.sessionId),
      cwd: text(body.cwd),
      prompt: text(body.prompt) || text(body.initialPrompt),
      tool_name: text(body.toolName),
      tool_input: args(body.toolArgs ?? body.toolInput),
      error_message: text(error.message),
      notification_type: typeNotice(text(body.notification_type)),
      message: text(body.message),
    };
  }
  if (tool === "codex" || tool === "kimi") {
    const nameValue = text(body.hook_event_name) || eventRoute;
    if (nameValue === "Interrupt") return { ...body, hook_event_name: "Stop" };
    if (tool === "kimi" && nameValue === "PermissionRequest") return { ...body, hook_event_name: "Notification", notification_type: "agent_needs_input", message: "" };
    if (nameValue === "Notification") return { ...body, hook_event_name: nameValue, notification_type: typeNotice(text(body.notification_type)) };
    if (nameValue === "TurnStarted") return null;
    return { ...body, hook_event_name: nameValue };
  }
  if (tool === "antigravity") {
    const directories = Array.isArray(body.workspacePaths) ? body.workspacePaths : [];
    const base = { session_id: text(body.conversationId), cwd: text(directories[0]), model: text(body.modelName) };
    if (eventRoute === "PreInvocation") return { ...base, hook_event_name: "NikoPensando" };
    if (eventRoute === "Stop") return { ...base, hook_event_name: "Stop" };
    if (eventRoute === "PreToolUse") {
      const call = object(body.toolCall);
      return { ...base, hook_event_name: "PreToolUse", tool_name: text(call.name) || text(call.toolName) || text(call.tool), tool_input: args(call.args ?? call.arguments ?? call.input) };
    }
    return null;
  }
  if (tool === "gemini") {
    const nameValue = EVENTS_GEMINI[text(body.hook_event_name) || eventRoute];
    if (!nameValue) return null;
    const base = { hook_event_name: nameValue, session_id: text(body.session_id), cwd: text(body.cwd) };
    if (nameValue === "UserPromptSubmit") return { ...base, prompt: text(body.prompt) };
    if (nameValue === "Stop") return { ...base, last_assistant_message: text(body.prompt_response) };
    if (nameValue === "PreToolUse") {
      const original = text(body.tool_name);
      return { ...base, tool_name: TOOLS_GEMINI[original] ?? original, tool_input: args(body.tool_input) };
    }
    if (nameValue === "Notification") return { ...base, notification_type: text(body.notification_type) === "ToolPermission" ? "agent_needs_input" : text(body.notification_type), message: text(body.message) };
    return base;
  }
  if (tool === "opencode" || tool === "amp") return text(body.hook_event_name) ? body : null;
  return null;
}

function respondJsonEmpty(res: ServerResponse) {
  if (res.writableEnded) return;
  res.statusCode = 200;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end("{}");
}

function respondNothing(res: ServerResponse) {
  if (res.writableEnded) return;
  res.statusCode = 200;
  res.setHeader("cache-control", "no-store");
  res.end();
}

export function isRouteAgent(path: string) {
  return path.startsWith(PREFIX_ROUTE);
}

export async function receiveEventAgent(req: IncomingMessage, res: ServerResponse, url: URL) {
  const tool = url.pathname.slice(PREFIX_ROUTE.length) as CodingTool;
  if (req.headers.origin || !secretMatches(req.headers[HEADER_SECRET]) || tool === "claude" || !TOOLS_CODE.includes(tool)) {
    res.statusCode = 403;
    return res.end();
  }
  const empty = TOOLS_WITH_RESPONSE_JSON.has(tool) ? respondJsonEmpty : respondNothing;
  let body: BodyType;
  try {
    body = await readBodyJson(req);
  } catch {
    return empty(res);
  }
  const normalized = normalizeEvent(tool, url.searchParams.get("evento") ?? "", body);
  if (!normalized) return empty(res);
  await remindProcess(req, normalized);
  processEvent(normalized, tool, res, empty);
}

interface Installer {
  arquivo: () => string;
  detectado: () => boolean;
  propor: (current: string | null, key: string) => string | null;
  retirar: (current: string) => string | null;
}

function hook(tool: CodingTool, eventValue: string, key: string, decide = false) {
  return { type: "command", command: commandHook(tool, eventValue, key, decide), timeout: decide ? TIME_HOOK_DECISION_S : eventValue === "SessionEnd" || eventValue === "Interrupt" ? TIME_HOOK_FINAL_S : TIME_HOOK_QUICK_S };
}

function isNiko(value: unknown, tool: CodingTool) {
  return JSON.stringify(value ?? null).includes(`${PREFIX_ROUTE}${tool}`);
}

function readJson(textCurrent: string | null): BodyType {
  if (!textCurrent || !textCurrent.trim()) return {};
  let payload: unknown;
  try {
    payload = JSON.parse(textCurrent.replace(/^﻿/, ""));
  } catch {
    throw new Error("configuracao_invalida");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("configuracao_invalida");
  const hooks = (payload as BodyType).hooks;
  if (hooks !== undefined && (!hooks || typeof hooks !== "object" || Array.isArray(hooks))) throw new Error("configuracao_invalida");
  return payload as BodyType;
}

function withoutGroupsNiko(hooks: BodyType, tool: CodingTool): BodyType {
  const clean: BodyType = {};
  for (const [eventValue, groups] of Object.entries(hooks)) {
    const remaining = Array.isArray(groups) ? groups.filter((g) => !isNiko(g, tool)) : groups;
    if (!Array.isArray(remaining) || remaining.length) clean[eventValue] = remaining;
  }
  return clean;
}

const INSTALLERS: Record<Exclude<CodingTool, "claude">, Installer> = {
  copilot: {
    arquivo: () => home(".copilot", "hooks", "niko.json"),
    detectado: () => existsSync(home(".copilot")),
    propor: (_current, key) => {
      const hooks = Object.fromEntries(
        Object.keys(EVENTS_COPILOT).map((eventValue) => {
          const decide = eventValue === "permissionRequest";
          const command = commandHook("copilot", eventValue, key, decide);
          return [eventValue, [{ type: "command", bash: `${command} || true`, powershell: `${command}; exit 0`, timeoutSec: decide ? TIME_HOOK_DECISION_S : TIME_HOOK_QUICK_S }]];
        }),
      );
      return `${JSON.stringify({ version: 1, hooks }, null, 2)}\n`;
    },
    retirar: () => null,
  },
  codex: {
    arquivo: () => home(".codex", "hooks.json"),
    detectado: () => existsSync(home(".codex")),
    propor: (current, key) => {
      const payload = readJson(current);
      const hooks = withoutGroupsNiko(object(payload.hooks), "codex");
      for (const eventValue of EVENTS_CODEX) {
        const groups = Array.isArray(hooks[eventValue]) ? (hooks[eventValue] as unknown[]) : [];
        hooks[eventValue] = [...groups, { hooks: [hook("codex", eventValue, key, eventValue === "PermissionRequest")] }];
      }
      return `${JSON.stringify({ ...payload, hooks }, null, 2)}\n`;
    },
    retirar: (current) => {
      const payload = readJson(current);
      const hooks = withoutGroupsNiko(object(payload.hooks), "codex");
      const rest = { ...payload, hooks };
      if (Object.keys(hooks).length === 0) delete (rest as BodyType).hooks;
      return `${JSON.stringify(rest, null, 2)}\n`;
    },
  },
  antigravity: {
    arquivo: () => home(".gemini", "config", "hooks.json"),
    detectado: () => existsSync(home(".gemini", "antigravity")) || existsSync(home(".gemini", "config")),
    propor: (current, key) => {
      const payload = readJson(current);
      const niko: BodyType = { enabled: true };
      for (const eventValue of EVENTS_ANTIGRAVITY) {
        niko[eventValue] = [{ ...(eventValue === "PreToolUse" ? { matcher: "*" } : {}), hooks: [hook("antigravity", eventValue, key)] }];
      }
      return `${JSON.stringify({ ...payload, niko }, null, 2)}\n`;
    },
    retirar: (current) => {
      const payload = readJson(current);
      delete payload.niko;
      return `${JSON.stringify(payload, null, 2)}\n`;
    },
  },
  gemini: {
    arquivo: () => home(".gemini", "settings.json"),
    detectado: () => existsSync(home(".gemini", "settings.json")) || existsSync(home(".gemini", "oauth_creds.json")),
    propor: (current, key) => {
      const payload = readJson(current);
      const hooks = withoutGroupsNiko(object(payload.hooks), "gemini");
      for (const eventValue of Object.keys(EVENTS_GEMINI)) {
        const groups = Array.isArray(hooks[eventValue]) ? (hooks[eventValue] as unknown[]) : [];
        const seconds = eventValue === "SessionEnd" ? TIME_HOOK_FINAL_S : TIME_HOOK_QUICK_S;
        const hookNiko = { name: "niko", type: "command", command: commandHook("gemini", eventValue, key), timeout: seconds * MS_PER_SECOND };
        hooks[eventValue] = [...groups, { ...(eventValue === "BeforeTool" ? { matcher: "*" } : {}), hooks: [hookNiko] }];
      }
      return `${JSON.stringify({ ...payload, hooks }, null, 2)}\n`;
    },
    retirar: (current) => {
      const payload = readJson(current);
      const hooks = withoutGroupsNiko(object(payload.hooks), "gemini");
      const rest = { ...payload, hooks };
      if (Object.keys(hooks).length === 0) delete (rest as BodyType).hooks;
      return `${JSON.stringify(rest, null, 2)}\n`;
    },
  },
  kimi: {
    arquivo: () => home(".kimi-code", "config.toml"),
    detectado: () => existsSync(home(".kimi-code")),
    propor: (current, key) => {
      const base = withoutBlockToml(current ?? "").replace(/\s*$/, "");
      if (/^\s*hooks\s*=/m.test(base)) throw new Error("hooks_em_linha");
      const inputs = EVENTS_KIMI.map((eventValue) => {
        const g = hook("kimi", eventValue, key);
        return `[[hooks]]\nevent = "${eventValue}"\ncommand = '${g.command}'\ntimeout = ${g.timeout}`;
      });
      return `${base ? `${base}\n\n` : ""}${START_BLOCK_TOML}\n${inputs.join("\n\n")}\n${END_BLOCK_TOML}\n`;
    },
    retirar: (current) => `${withoutBlockToml(current).replace(/\s*$/, "")}\n`,
  },
  amp: {
    arquivo: () => home(".config", "amp", "plugins", "niko.ts"),
    detectado: () => existsSync(home(".config", "amp")),
    propor: (_current, key) => pluginAmp(key),
    retirar: () => null,
  },
  opencode: {
    arquivo: () => home(".config", "opencode", "plugins", "niko.js"),
    detectado: () => existsSync(home(".config", "opencode")),
    propor: (_current, key) => pluginOpencode(key),
    retirar: () => null,
  },
};

export function proposeConfiguration(id: Exclude<CodingTool, "claude">, current: string | null, key: string) {
  return INSTALLERS[id].propor(current, key);
}

export function removeConfiguration(id: Exclude<CodingTool, "claude">, current: string) {
  return INSTALLERS[id].retirar(current);
}

function withoutBlockToml(textCurrent: string) {
  const start = textCurrent.indexOf(START_BLOCK_TOML);
  if (start < 0) return textCurrent;
  const end = textCurrent.indexOf(END_BLOCK_TOML, start);
  return textCurrent.slice(0, start) + (end < 0 ? "" : textCurrent.slice(end + END_BLOCK_TOML.length));
}

export function pluginOpencode(key: string) {
  const url = `http://127.0.0.1:${port()}${PREFIX_ROUTE}opencode`;
  return `// Generated by Niko: sends OpenCode events to the island. Remove through Niko.
const NIKO_URL = ${JSON.stringify(url)};
const KEY = ${JSON.stringify(key)};

function send(body) {
  fetch(NIKO_URL, {
    method: "POST",
    headers: { "content-type": "application/json", ${JSON.stringify(HEADER_SECRET)}: KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
}

export const NikoPlugin = async ({ directory }) => ({
  event: async ({ event }) => {
    const p = event.properties ?? {};
    const session = p.sessionID ?? p.info?.id ?? "";
    const base = { session_id: session, cwd: directory };
    if (event.type === "session.created") send({ ...base, hook_event_name: "SessionStart" });
    else if (event.type === "session.idle") send({ ...base, hook_event_name: "Stop" });
    else if (event.type === "session.error") send({ ...base, hook_event_name: "StopFailure", error_message: String(p.error?.data?.message ?? p.error?.name ?? "") });
    else if (event.type === "session.deleted") send({ ...base, hook_event_name: "SessionEnd" });
    else if (event.type === "permission.asked" || event.type === "permission.updated") send({ ...base, hook_event_name: "Notification", notification_type: "agent_needs_input", message: "" });
    else if (event.type === "permission.replied") send({ ...base, hook_event_name: "NikoPensando" });
  },
  "chat.message": async (input, output) => {
    const parts = Array.isArray(output?.parts) ? output.parts : [];
    send({ session_id: input.sessionID, cwd: directory, hook_event_name: "UserPromptSubmit", prompt: parts.filter((x) => x.type === "text").map((x) => x.text).join("\\n").slice(0, 2000) });
  },
  "tool.execute.before": async (input, output) => {
    send({ session_id: input.sessionID, cwd: directory, hook_event_name: "PreToolUse", tool_name: input.tool, tool_input: output?.args ?? {} });
  },
});
`;
}

export function pluginAmp(key: string) {
  const url = `http://127.0.0.1:${port()}${PREFIX_ROUTE}amp`;
  return `// Gerado pelo Niko: manda os eventos do Amp para a ilha, só para acompanhar. Remova pelo Niko.
const URL_DO_NIKO = ${JSON.stringify(url)};
const CHAVE = ${JSON.stringify(key)};

function enviar(corpo) {
  fetch(URL_DO_NIKO, {
    method: "POST",
    headers: { "content-type": "application/json", ${JSON.stringify(HEADER_SECRET)}: CHAVE },
    body: JSON.stringify({ cwd: process.cwd(), ...corpo }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
}

export default function (amp) {
  amp.on("session.start", (e) => enviar({ session_id: e.thread?.id ?? "", hook_event_name: "SessionStart" }));
  amp.on("agent.start", (e) => enviar({ session_id: e.thread?.id ?? "", hook_event_name: "UserPromptSubmit", prompt: String(e.message ?? "").slice(0, 2000) }));
  amp.on("agent.end", (e) => enviar({ session_id: e.thread?.id ?? "", hook_event_name: e.status === "error" ? "StopFailure" : "Stop" }));
  amp.on("tool.call", (e) => {
    enviar({ session_id: e.thread?.id ?? "", hook_event_name: "PreToolUse", tool_name: e.tool, tool_input: e.input ?? {} });
    return { action: "allow" };
  });
}
`;
}

function readText(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function writeWithCopy(path: string, content: string | null) {
  mkdirSync(dirname(path), { recursive: true });
  let copy: string | null = null;
  if (existsSync(path)) {
    copy = `${path}.niko-${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
    copyFileSync(path, copy);
  }
  if (content === null) {
    rmSync(path, { force: true });
    return { caminho: path, copia: copy };
  }
  const temporary = `${path}.niko-gravando`;
  writeFileSync(temporary, content, "utf8");
  renameSync(temporary, path);
  return { caminho: path, copia: copy };
}

export interface StateTool {
  id: CodingTool;
  caminho: string;
  detectado: boolean;
  instalado: boolean;
  desatualizado: boolean;
  invalido: boolean;
}

function state(id: CodingTool): StateTool {
  if (id === "claude") {
    const e = stateInstallation();
    return { id, caminho: e.caminho, detectado: e.claudeInstalado, instalado: e.instalado, desatualizado: e.desatualizado || e.parcial, invalido: e.invalido };
  }
  const installer = INSTALLERS[id];
  const path = installer.arquivo();
  const content = readText(path) ?? "";
  const hasNiko = content.includes(`${PREFIX_ROUTE}${id}`);
  const usaCurl = !["opencode", "amp"].includes(id);
  const current = hasNiko && content.includes(secret()) && content.includes(`127.0.0.1:${port()}`) && (!usaCurl || content.includes("--connect-timeout"));
  let invalid = false;
  if (content && path.endsWith(".json")) {
    try {
      readJson(content);
    } catch {
      invalid = true;
    }
  }
  return { id, caminho: path, detectado: installer.detectado(), instalado: current, desatualizado: hasNiko && !current, invalido: invalid };
}

export function stateAgents() {
  return { ferramentas: TOOLS_CODE.map(state) };
}

export function installAgent(id: string, body: BodyType) {
  if (!TOOLS_CODE.includes(id as CodingTool)) throw new Error("ferramenta_desconhecida");
  if (id === "claude") return installHooks(body);
  if (body.confirmacao !== "INSTALAR") throw new Error("confirmacao_invalida");
  const installer = INSTALLERS[id as Exclude<CodingTool, "claude">];
  const path = installer.arquivo();
  return writeWithCopy(path, installer.propor(readText(path), secret()));
}

export function removeAgent(id: string, body: BodyType) {
  if (!TOOLS_CODE.includes(id as CodingTool)) throw new Error("ferramenta_desconhecida");
  if (id === "claude") return removeHooks(body);
  if (body.confirmacao !== "REMOVER") throw new Error("confirmacao_invalida");
  const installer = INSTALLERS[id as Exclude<CodingTool, "claude">];
  const path = installer.arquivo();
  const current = readText(path);
  if (current === null) return { caminho: path, copia: null };
  return writeWithCopy(path, installer.retirar(current));
}
