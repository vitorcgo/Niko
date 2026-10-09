import type { SessaoClaude, PassoClaude } from "../../estado/claudeCode";
import type { Activity, AgentStatus, AgentInfo, OfficeSnapshot } from "./motor/shared/types";
import { hash32 } from "./motor/shared/hash";
import { agruparSessoesDoEscritorio, nomeDoPersonagem } from "./sessoesDoEscritorio";
import { nomeDaFerramenta, COR_DA_FERRAMENTA } from "../../janelas/ilha/claude/ferramentas";
import { T } from "../../textos/textos";
import { mascararSegredos } from "./detalhesDaSessao";

export function estadoDoPersonagem(estado: SessaoClaude["estado"]): AgentStatus {
  if (estado === "trabalhando" || estado === "pensando") return "working";
  if (estado === "aprovacao" || estado === "esperando" || estado === "limite" || estado === "erro") return "waiting";
  return "idle";
}

function atividade(p: PassoClaude): Activity {
  const ferramentas: Record<string, Activity["kind"]> = { Read: "read", Edit: "edit", Write: "write", Bash: "run", Grep: "search", Glob: "search" };
  return { id: p.id, kind: p.tipo === "erro" || p.tipo === "falha" ? "error" : p.tipo === "fim" ? "done" : ferramentas[p.ferramenta ?? ""] ?? "other", icon: "", text: mascararSegredos(p.rotulo).slice(0, 120), at: Date.parse(p.hora), tool: p.ferramenta, durationMs: p.duracaoMs, error: p.resultado === "falhou" };
}

/** Somente dados já recebidos pelo Niko. Não lê arquivos, inventa subagentes ou consulta contas. */
export function snapshotDoEscritorio(sessoes: SessaoClaude[], nomes: Record<string, string> = {}, demonstracao = false, agora = Date.now()): OfficeSnapshot {
  const salas = agruparSessoesDoEscritorio(sessoes);
  const ferramentas = [...new Set(sessoes.map((s) => s.ferramenta))];
  return {
    rev: agora, serverTime: agora,
    rooms: salas.map((s, slot) => ({ id: s.id, name: s.projeto, path: s.sessoes[0].cwd, slot, seed: hash32(s.id), createdAt: agora })),
    agents: salas.flatMap((sala) => sala.sessoes.flatMap((s) => {
      const recent = s.passos.filter((p) => Number.isFinite(Date.parse(p.hora))).slice(-30).map(atividade);
      const principal: AgentInfo = {
        id: s.id, kind: "main" as const, ...(s.ferramenta === "codex" ? { provider: "codex" as const } : {}),
        roomId: sala.id, name: nomes[s.id] || nomeDoPersonagem(s.id), look: hash32(s.id) % 2 ? "m" as const : "f" as const,
        role: nomeDaFerramenta(s.ferramenta), title: s.pedido ? mascararSegredos(s.pedido) : undefined, sessionId: s.id, account: s.ferramenta,
        status: estadoDoPersonagem(s.estado), waitingFor: T.ilha.claude.estados[s.estado], recent, activity: recent.at(-1), tasks: (s.tarefas ?? []).map((t) => ({ id: t.id, title: t.titulo, status: t.estado })),
        startedAt: Number.isFinite(Date.parse(s.iniciadaEm)) ? Date.parse(s.iniciadaEm) : agora,
        lastEventAt: Number.isFinite(Date.parse(s.atualizadaEm)) ? Date.parse(s.atualizadaEm) : agora,
        statusSince: Number.isFinite(Date.parse(s.atualizadaEm)) ? Date.parse(s.atualizadaEm) : agora,
        stats: { toolCalls: s.ferramentasUsadas, tokensIn: s.metricas?.entrada ?? 0, tokensOut: s.metricas?.saida ?? 0, costUSD: s.metricas?.custoUSD, subagents: s.subagentes?.length ?? 0 }, seed: hash32(s.id), model: s.modelo,
      };
      return [principal, ...(s.subagentes ?? []).map((sub): AgentInfo => {
        const id = `${s.id}:sub:${sub.id}`;
        const passos = s.passos.filter((p) => p.subagenteId === sub.id);
        const recentes = passos.slice(-30).map(atividade);
        return { ...principal, id, parentId: s.id, kind: "sub", name: nomeDoPersonagem(id), role: sub.tipo, title: undefined, seed: hash32(id), look: hash32(id) % 2 ? "m" : "f", status: sub.estado === "terminou" ? "done" : "working", waitingFor: undefined, recent: recentes, activity: recentes.at(-1), tasks: [], startedAt: Date.parse(sub.iniciadaEm), lastEventAt: Date.parse(sub.atualizadaEm), statusSince: Date.parse(sub.atualizadaEm), stats: { toolCalls: passos.filter((p) => p.tipo === "ferramenta").length, tokensIn: 0, tokensOut: 0, subagents: 0 } };
      })];
    })),
    accounts: ferramentas.map((f) => ({ id: f, name: nomeDaFerramenta(f), short: nomeDaFerramenta(f).slice(0, 1), color: COR_DA_FERRAMENTA[f], configDir: "", sessions: sessoes.filter((s) => s.ferramenta === f).length, usageStatus: "disabled" as const, ...(f === "codex" ? { provider: "codex" as const } : {}) })),
    meta: { demo: demonstracao, sources: [], startedAt: agora, version: "niko", messages: false, terminal: false },
  };
}
