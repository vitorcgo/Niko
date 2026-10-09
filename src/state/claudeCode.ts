import { create } from "zustand";
import type { EventClaude, CodingTool, RuleSuggested } from "../bridge/claudeCode";
import { changeTool, type ChangeFile } from "../utils/diff";
import { T } from "../i18n/ptBR";

export type StateSession = keyof typeof T.ilha.claude.estados;

export interface StepClaude {
  id: string;
  tipo: "pedido" | "ferramenta" | "falha" | "subagente" | "aviso" | "fim" | "erro";
  ferramenta?: string;
  rotulo: string;
  detalhe?: string;
  hora: string;
  alteracao?: ChangeFile;
}

export interface SessionClaude {
  id: string;
  ferramenta: CodingTool;
  projeto: string;
  cwd: string;
  estado: StateSession;
  passos: StepClaude[];
  pedido?: string;
  resposta?: string;
  erro?: string;
  modo?: string;
  modelo?: string;
  ferramentasUsadas: number;
  iniciadaEm: string;
  atualizadaEm: string;
}

export interface RequestPermission {
  pedidoId: string;
  ferramentaDeCodigo: CodingTool;
  sessao: string;
  projeto: string;
  ferramenta: string;
  alvo: string;
  entrada: string;
  recebidoEm: string;
  alteracao?: ChangeFile;
  sugestoes: RuleSuggested[];
  perguntas?: PerguntaClaude[];
}

export interface PerguntaClaude {
  pergunta: string;
  titulo: string;
  varias: boolean;
  opcoes: { rotulo: string; descricao: string }[];
}

export function perguntasInput(tool: string, input: Record<string, unknown>): PerguntaClaude[] | undefined {
  if (tool !== "AskUserQuestion" || !Array.isArray(input.questions)) return undefined;
  const perguntas: PerguntaClaude[] = [];
  for (const q of input.questions) {
    const p = (q ?? {}) as Record<string, unknown>;
    const options = (Array.isArray(p.options) ? p.options : [])
      .map((o) => (o ?? {}) as Record<string, unknown>)
      .filter((o) => text(o.label))
      .map((o) => ({ rotulo: text(o.label), descricao: text(o.description) }));
    if (!text(p.question) || options.length === 0) return undefined;
    perguntas.push({ pergunta: text(p.question), titulo: text(p.header), varias: p.multiSelect === true, opcoes: options });
  }
  return perguntas.length ? perguntas : undefined;
}

const MAXIMUM_STEPS = 80;

export type ReasonShutdown = keyof typeof T.ilha.claude.pedidoEncerrado;
const MAXIMUM_SESSIONS = 8;
const FIELDS_TARGET = ["command", "file_path", "path", "url", "query", "pattern", "prompt", "description"] as const;

/** Format "claude-opus-4-7[1m]" as "Opus 4.7" and "claude-3-5-sonnet-20241022" as "Sonnet 3.5"; preserve other names. */
export function nameModel(id: string): string {
  const clean = id.trim().replace(/\[.*\]$/, "").replace(/-\d{8}$/, "");
  const newItem = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?$/i.exec(clean);
  const previous = /^claude-(\d+)(?:-(\d{1,2}))?-([a-z]+)$/i.exec(clean);
  const family = newItem?.[1] ?? previous?.[3];
  const version = newItem ? [newItem[2], newItem[3]] : previous ? [previous[1], previous[2]] : null;
  if (!family || !version) return clean;
  return `${family[0].toUpperCase()}${family.slice(1).toLowerCase()} ${version.filter(Boolean).join(".")}`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function nameProject(cwd: string, fallback = "Claude Code"): string {
  const clean = cwd.replace(/[\\/]+$/, "");
  const i = Math.max(clean.lastIndexOf("\\"), clean.lastIndexOf("/"));
  return (i >= 0 ? clean.slice(i + 1) : clean) || fallback;
}

export function labelTool(tool: string): string {
  return T.ilha.claude.ferramentas[tool] ?? tool;
}

export function targetTool(input: Record<string, unknown>): string {
  for (const field of FIELDS_TARGET) {
    const v = input[field];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function shortenPath(value: string): string {
  if (!/[\\/]/.test(value) || /\s/.test(value.trim())) return value;
  const parts = value.split(/[\\/]+/).filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : value;
}

function suggestionsEvent(d: Record<string, unknown>): RuleSuggested[] {
  const list = Array.isArray(d.permission_suggestions) ? d.permission_suggestions : [];
  const rules: RuleSuggested[] = [];
  for (const s of list) {
    const suggestion = (s ?? {}) as { type?: unknown; behavior?: unknown; rules?: unknown };
    if (suggestion.type !== "allow" || suggestion.behavior !== "allow" || !Array.isArray(suggestion.rules)) continue;
    for (const r of suggestion.rules) {
      const m = typeof r === "string" ? /^([A-Za-z0-9_.:-]{1,64})\((.{1,300})\)$/.exec(r.trim()) : null;
      if (m && !rules.some((x) => x.toolName === m[1] && x.ruleContent === m[2])) rules.push({ toolName: m[1], ruleContent: m[2] });
    }
  }
  return rules.slice(0, 4);
}

function formatInput(input: Record<string, unknown>): string {
  const command = text(input.command);
  if (command) return command;
  const path = text(input.file_path) || text(input.path);
  const content = text(input.new_string) || text(input.content);
  if (path && content) return `${path}\n\n${content.slice(0, 1200)}`;
  return targetTool(input) || JSON.stringify(input, null, 2).slice(0, 1500);
}

interface StateClaude {
  sessoes: Record<string, SessionClaude>;
  ordem: string[];
  pedidos: RequestPermission[];
  conectado: boolean;
  focada: string | null;
  apply: (e: EventClaude) => void;
  setConnected: (enabled: boolean) => void;
  focus: (id: string) => void;
  close: (id: string) => void;
  removeRequest: (requestId: string) => void;
}

const MAXIMUM_SEEN = 2000;
const eventsApplied = new Set<string>();

function alreadyFoiApplied(id: string): boolean {
  if (eventsApplied.has(id)) return true;
  eventsApplied.add(id);
  if (eventsApplied.size > MAXIMUM_SEEN) eventsApplied.delete(eventsApplied.values().next().value as string);
  return false;
}

const KEY_CLOSED = "niko:claude-sessoes-fechadas";
const MAXIMUM_CLOSED = 60;

function readClosed(): Record<string, number> {
  try {
    const payload = JSON.parse(localStorage.getItem(KEY_CLOSED) ?? "{}") as unknown;
    return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeClosed(closedSessions: Record<string, number>) {
  const recentItems = Object.entries(closedSessions).sort((a, b) => b[1] - a[1]).slice(0, MAXIMUM_CLOSED);
  try {
    localStorage.setItem(KEY_CLOSED, JSON.stringify(Object.fromEntries(recentItems)));
  } catch {
    return;
  }
}

function sessionFoiClosedBefore(e: EventClaude): boolean {
  const closedSessions = readClosed();
  const closedAt = closedSessions[e.sessao];
  if (closedAt === undefined) return false;
  if (Date.parse(e.recebidoEm) <= closedAt) return true;
  delete closedSessions[e.sessao];
  writeClosed(closedSessions);
  return false;
}

function withoutASession(s: { sessoes: Record<string, SessionClaude>; ordem: string[]; focada: string | null; pedidos: RequestPermission[] }, id: string) {
  const sessions = { ...s.sessoes };
  delete sessions[id];
  const order = s.ordem.filter((x) => x !== id);
  return { sessoes: sessions, ordem: order, focada: s.focada === id ? order[0] ?? null : s.focada, pedidos: s.pedidos.filter((p) => p.sessao !== id) };
}

function newStep(e: EventClaude, type: StepClaude["tipo"], label: string, detail?: string, tool?: string): StepClaude {
  return { id: e.id, tipo: type, rotulo: label, detalhe: detail, ferramenta: tool, hora: e.recebidoEm };
}

export const useClaudeCode = create<StateClaude>((set, get) => ({
  sessoes: {},
  ordem: [],
  pedidos: [],
  conectado: false,
  focada: null,

  setConnected: (connected) => set({ conectado: connected }),
  focus: (id) => set({ focada: id }),
  removeRequest: (requestId) => set((s) => ({ pedidos: s.pedidos.filter((p) => p.pedidoId !== requestId) })),
  close: (id) => {
    writeClosed({ ...readClosed(), [id]: Date.now() });
    set((s) => withoutASession(s, id));
  },

  apply: (e) => {
    if (e.evento === "NikoConectado" || alreadyFoiApplied(e.id)) return;
    if (e.evento === "NikoPedidoEncerrado") {
      if (e.pedidoId) get().removeRequest(e.pedidoId);
      const reason = text(e.dados.motivo);
      const notice = Object.hasOwn(T.ilha.claude.pedidoEncerrado, reason) ? T.ilha.claude.pedidoEncerrado[reason as ReasonShutdown] : null;
      set((s) => {
        const session = s.sessoes[e.sessao];
        if (!session) return {};
        const steps = notice ? [...session.passos, newStep(e, "aviso", notice)].slice(-MAXIMUM_STEPS) : session.passos;
        const stillWaiting = s.pedidos.some((p) => p.sessao === e.sessao);
        const state = session.estado === "aprovacao" && !stillWaiting ? "trabalhando" : session.estado;
        return { sessoes: { ...s.sessoes, [e.sessao]: { ...session, passos: steps, estado: state } } };
      });
      return;
    }
    if (!e.sessao || sessionFoiClosedBefore(e)) return;
    if (e.evento === "SessionEnd") {
      set((s) => (s.sessoes[e.sessao] ? withoutASession(s, e.sessao) : {}));
      return;
    }
    set((s) => {
      const d = e.dados;
      const previous = s.sessoes[e.sessao];
      const nameFallback = T.ilha.claude.nomes[e.ferramenta ?? "claude"] ?? "Claude Code";
      const base: SessionClaude = previous ?? {
        id: e.sessao,
        ferramenta: e.ferramenta ?? "claude",
        projeto: nameProject(e.cwd, nameFallback),
        cwd: e.cwd,
        estado: "ociosa",
        passos: [],
        ferramentasUsadas: 0,
        iniciadaEm: e.recebidoEm,
        atualizadaEm: e.recebidoEm,
      };
      const session: SessionClaude = { ...base, cwd: e.cwd || base.cwd, projeto: e.cwd ? nameProject(e.cwd, nameFallback) : base.projeto, atualizadaEm: e.recebidoEm, modo: text(d.permission_mode) || base.modo, modelo: text(d.model) || base.modelo };
      const steps = [...session.passos];
      let requests = s.pedidos;
      switch (e.evento) {
        case "SessionStart":
          if (!previous) session.estado = "ociosa";
          break;
        case "NikoPensando":
          session.estado = "pensando";
          break;
        case "UserPromptSubmit": {
          const request = text(d.prompt_text) || text(d.prompt);
          session.estado = "pensando";
          session.pedido = request;
          session.resposta = undefined;
          session.erro = undefined;
          steps.push(newStep(e, "pedido", T.ilha.claude.pedido, request.slice(0, 400)));
          break;
        }
        case "PreToolUse": {
          const tool = text(d.tool_name) || "Tool";
          const input = (d.tool_input ?? {}) as Record<string, unknown>;
          session.estado = "trabalhando";
          session.ferramentasUsadas += 1;
          const step = newStep(e, "ferramenta", labelTool(tool), shortenPath(targetTool(input)).slice(0, 300), tool);
          step.alteracao = changeTool(tool, input);
          steps.push(step);
          break;
        }
        case "PostToolUseFailure": {
          const tool = text(d.tool_name) || "Tool";
          steps.push(newStep(e, "falha", `${T.ilha.claude.falhaFerramenta}: ${labelTool(tool)}`, text(d.error).slice(0, 300), tool));
          break;
        }
        case "PermissionRequest": {
          if (!e.pedidoId) break;
          const tool = text(d.tool_name) || "Tool";
          const input = (d.tool_input ?? {}) as Record<string, unknown>;
          session.estado = "aprovacao";
          requests = [...requests.filter((p) => p.pedidoId !== e.pedidoId), { pedidoId: e.pedidoId, ferramentaDeCodigo: session.ferramenta, sessao: e.sessao, projeto: session.projeto, ferramenta: tool, alvo: targetTool(input), entrada: formatInput(input), recebidoEm: e.recebidoEm, alteracao: changeTool(tool, input), sugestoes: suggestionsEvent(d), perguntas: session.ferramenta === "claude" ? perguntasInput(tool, input) : undefined }];
          break;
        }
        case "Notification": {
          const type = text(d.notification_type);
          const message = text(d.message);
          if (/rate limit|limite de uso|usage limit/i.test(message)) {
            session.estado = "limite";
            steps.push(newStep(e, "aviso", message.slice(0, 200)));
          } else if (["idle_prompt", "agent_needs_input", "elicitation_dialog", "elicitation_url_dialog"].includes(type)) {
            session.estado = "esperando";
            if (message) steps.push(newStep(e, "aviso", message.slice(0, 200)));
          }
          break;
        }
        case "Stop":
          session.estado = "terminou";
          session.resposta = text(d.last_assistant_message) || session.resposta;
          steps.push(newStep(e, "fim", T.ilha.claude.estados.terminou));
          break;
        case "StopFailure":
          session.estado = "erro";
          session.erro = text(d.error_message) || text(d.error_type);
          steps.push(newStep(e, "erro", T.ilha.claude.estados.erro, session.erro.slice(0, 300)));
          break;
        case "SubagentStart":
          steps.push(newStep(e, "subagente", T.ilha.claude.subagenteComecou(text(d.agent_type) || "")));
          break;
        case "SubagentStop":
          steps.push(newStep(e, "subagente", T.ilha.claude.subagenteTerminou(text(d.agent_type) || "")));
          break;
        default:
          return {};
      }
      session.passos = steps.slice(-MAXIMUM_STEPS);
      const order = [e.sessao, ...s.ordem.filter((x) => x !== e.sessao)].slice(0, MAXIMUM_SESSIONS);
      const sessions = Object.fromEntries(order.map((id) => [id, id === e.sessao ? session : s.sessoes[id]]).filter(([, v]) => v)) as Record<string, SessionClaude>;
      return { sessoes: sessions, ordem: order, pedidos: requests, focada: s.focada && sessions[s.focada] ? s.focada : e.sessao };
    });
  },
}));

export function sessionActive(s: StateClaude): SessionClaude | undefined {
  return s.ordem.map((id) => s.sessoes[id]).find((x) => x && (x.estado === "trabalhando" || x.estado === "pensando" || x.estado === "aprovacao"));
}
