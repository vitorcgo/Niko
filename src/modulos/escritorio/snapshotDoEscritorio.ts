import type { SessaoClaude, PassoClaude } from "../../estado/claudeCode";
import type { Activity, AgentStatus, AgentInfo, OfficeSnapshot } from "./motor/shared/types";
import { hash32 } from "./motor/shared/hash";
import { agruparSessoesDoEscritorio, nomeDoPersonagem } from "./sessoesDoEscritorio";
import { nomeDaFerramenta, COR_DA_FERRAMENTA } from "../../janelas/ilha/claude/ferramentas";
import { T } from "../../textos/textos";
import { mascararSegredos } from "./detalhesDaSessao";
import { IDS_DA_EQUIPE, SALA_DA_EQUIPE } from "./equipeDoEscritorio";

export function estadoDoPersonagem(estado: SessaoClaude["estado"]): AgentStatus {
  if (estado === "trabalhando" || estado === "pensando") return "working";
  if (estado === "aprovacao" || estado === "esperando" || estado === "limite" || estado === "erro") return "waiting";
  return "idle";
}

function atividade(p: PassoClaude): Activity {
  const ferramentas: Record<string, Activity["kind"]> = { Read: "read", Edit: "edit", Write: "write", Bash: "run", Grep: "search", Glob: "search" };
  return { id: p.id, kind: p.tipo === "erro" || p.tipo === "falha" ? "error" : p.tipo === "fim" ? "done" : ferramentas[p.ferramenta ?? ""] ?? "other", icon: "", text: mascararSegredos(p.rotulo).slice(0, 120), at: Date.parse(p.hora), tool: p.ferramenta, durationMs: p.duracaoMs, error: p.resultado === "falhou" };
}

function membroLivre(id: string, nomes: Record<string, string>, desde: number): AgentInfo {
  return {
    id, kind: "main", roomId: SALA_DA_EQUIPE, name: nomes[id] || nomeDoPersonagem(id), look: hash32(id) % 2 ? "m" : "f",
    role: T.escritorio.ias.equipe.livre, account: "", sessionId: "", status: "idle", recent: [], tasks: [], startedAt: desde, lastEventAt: desde, statusSince: desde,
    stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 }, seed: hash32(id),
  };
}

/** Somente dados já recebidos pelo Niko. Não lê arquivos, inventa subagentes ou consulta contas. A equipe ociosa só passeia até uma sessão de verdade chegar. */
export function snapshotDoEscritorio(sessoes: SessaoClaude[], nomes: Record<string, string> = {}, demonstracao = false, agora = Date.now(), equipe: ReadonlyMap<string, string> = new Map(), desdeDaEquipe = agora): OfficeSnapshot {
  const salas = agruparSessoesDoEscritorio(sessoes);
  const ferramentas = [...new Set(sessoes.map((s) => s.ferramenta))];
  const ocupados = new Set(equipe.values());
  return {
    rev: agora, serverTime: agora,
    rooms: [
      { id: SALA_DA_EQUIPE, name: T.escritorio.ias.equipe.sala, path: "", slot: -1, seed: hash32(SALA_DA_EQUIPE), createdAt: desdeDaEquipe },
      ...salas.map((s, slot) => ({ id: s.id, name: s.projeto, path: s.sessoes[0].cwd, slot, seed: hash32(s.id), createdAt: agora })),
    ],
    agents: [...IDS_DA_EQUIPE.filter((id) => !ocupados.has(id)).map((id) => membroLivre(id, nomes, desdeDaEquipe)), ...salas.flatMap((sala) => sala.sessoes.flatMap((s) => {
      const recent = s.passos.filter((p) => Number.isFinite(Date.parse(p.hora))).slice(-30).map(atividade);
      const visual = equipe.get(s.id) ?? s.id;
      const principal: AgentInfo = {
        id: visual, kind: "main" as const, ...(s.ferramenta === "codex" ? { provider: "codex" as const } : {}),
        roomId: sala.id, name: nomes[s.id] || nomes[visual] || nomeDoPersonagem(visual), look: hash32(visual) % 2 ? "m" as const : "f" as const,
        role: nomeDaFerramenta(s.ferramenta), title: s.pedido ? mascararSegredos(s.pedido) : undefined, sessionId: s.id, account: s.ferramenta,
        status: estadoDoPersonagem(s.estado), waitingFor: T.ilha.claude.estados[s.estado], recent, activity: recent.at(-1), tasks: (s.tarefas ?? []).map((t) => ({ id: t.id, title: t.titulo, status: t.estado })),
        startedAt: Number.isFinite(Date.parse(s.iniciadaEm)) ? Date.parse(s.iniciadaEm) : agora,
        lastEventAt: Number.isFinite(Date.parse(s.atualizadaEm)) ? Date.parse(s.atualizadaEm) : agora,
        statusSince: Number.isFinite(Date.parse(s.atualizadaEm)) ? Date.parse(s.atualizadaEm) : agora,
        stats: { toolCalls: s.ferramentasUsadas, tokensIn: s.metricas?.entrada ?? 0, tokensOut: s.metricas?.saida ?? 0, costUSD: s.metricas?.custoUSD, subagents: s.subagentes?.length ?? 0 }, seed: hash32(visual), model: s.modelo,
      };
      return [principal, ...(s.subagentes ?? []).map((sub): AgentInfo => {
        const id = `${s.id}:sub:${sub.id}`;
        const passos = s.passos.filter((p) => p.subagenteId === sub.id);
        const recentes = passos.slice(-30).map(atividade);
        return { ...principal, id, parentId: visual, kind: "sub", name: nomeDoPersonagem(id), role: sub.tipo, title: undefined, seed: hash32(id), look: hash32(id) % 2 ? "m" : "f", status: sub.estado === "terminou" ? "done" : "working", waitingFor: undefined, recent: recentes, activity: recentes.at(-1), tasks: [], startedAt: Date.parse(sub.iniciadaEm), lastEventAt: Date.parse(sub.atualizadaEm), statusSince: Date.parse(sub.atualizadaEm), stats: { toolCalls: passos.filter((p) => p.tipo === "ferramenta").length, tokensIn: 0, tokensOut: 0, subagents: 0 } };
      })];
    }))],
    accounts: ferramentas.map((f) => ({ id: f, name: nomeDaFerramenta(f), short: nomeDaFerramenta(f).slice(0, 1), color: COR_DA_FERRAMENTA[f], configDir: "", sessions: sessoes.filter((s) => s.ferramenta === f).length, usageStatus: "disabled" as const, ...(f === "codex" ? { provider: "codex" as const } : {}) })),
    meta: { demo: demonstracao, sources: [], startedAt: agora, version: "niko", messages: false, terminal: false },
  };
}
