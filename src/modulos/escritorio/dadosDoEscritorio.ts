import type { EventoClaude, FerramentaDeCodigo } from "../../ponte/claudeCode";
import { FERRAMENTAS_DE_CODIGO } from "../../ponte/claudeCode";
import { hash32 } from "./motor/shared/hash";

export type EstadoObservado = "trabalho" | "espera" | "ocioso" | "erro";
export interface RegistroEscritorio {
  id: string; sessao: string; projeto: string; nome: string; ferramenta: FerramentaDeCodigo;
  em: number; estado?: EstadoObservado; acao: boolean; falha: boolean; pedido: boolean;
}
export const LIMITE_REGISTROS_ESCRITORIO = 5000;
const INTERVALO_MAXIMO = 5 * 60_000;
const ESTADOS: Record<string, EstadoObservado> = {
  SessionStart: "ocioso", UserPromptSubmit: "trabalho", NikoPensando: "trabalho", PreToolUse: "trabalho",
  PermissionRequest: "espera", NikoPedidoEncerrado: "trabalho", Stop: "ocioso", SessionEnd: "ocioso", StopFailure: "erro",
};
export function registroDoEscritorio(e: EventoClaude): RegistroEscritorio | null {
  const em = Date.parse(e.recebidoEm);
  if (!e.id || !e.sessao || !Number.isFinite(em) || !FERRAMENTAS_DE_CODIGO.includes(e.ferramenta ?? "claude")) return null;
  let estado = ESTADOS[e.evento];
  if (e.evento === "Notification" && ["idle_prompt", "agent_needs_input", "elicitation_dialog"].includes(String(e.dados.notification_type))) estado = "espera";
  if (!estado && !["PostToolUse", "PostToolUseFailure", "SubagentStart", "SubagentStop"].includes(e.evento)) return null;
  const caminho = e.cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  return {
    id: e.id.slice(0, 160), sessao: String(hash32(`${e.ferramenta ?? "claude"}:${e.sessao}`)),
    projeto: String(hash32(caminho.toLocaleLowerCase("pt-BR") || e.sessao)), nome: caminho.split("/").at(-1)?.slice(0, 80) || "",
    ferramenta: e.ferramenta ?? "claude", em, estado, acao: e.evento === "PreToolUse",
    falha: e.evento === "PostToolUseFailure" || e.evento === "StopFailure", pedido: e.evento === "PermissionRequest",
  };
}
export function registrosValidos(bruto: unknown, agora = Date.now()): RegistroEscritorio[] {
  if (!Array.isArray(bruto)) return [];
  const ids = new Set<string>();
  return bruto.filter((r): r is RegistroEscritorio => {
    if (!r || typeof r !== "object" || typeof r.id !== "string" || !r.id || r.id.length > 160 || ids.has(r.id) ||
      typeof r.sessao !== "string" || typeof r.projeto !== "string" || !/^\d{1,10}$/.test(r.sessao) || !/^\d{1,10}$/.test(r.projeto) || typeof r.nome !== "string" || r.nome.length > 80 ||
      !FERRAMENTAS_DE_CODIGO.includes(r.ferramenta) || !Number.isFinite(r.em) || r.em < agora - 30 * 86400_000 || r.em > agora + 60_000 ||
      (r.estado !== undefined && !["trabalho", "espera", "ocioso", "erro"].includes(r.estado)) ||
      [r.acao, r.falha, r.pedido].some((v) => typeof v !== "boolean")) return false;
    ids.add(r.id); return true;
  }).sort((a, b) => a.em - b.em).slice(-LIMITE_REGISTROS_ESCRITORIO).map((r) => ({
    id: r.id, sessao: r.sessao, projeto: r.projeto, nome: r.nome, ferramenta: r.ferramenta,
    em: r.em, estado: r.estado, acao: r.acao, falha: r.falha, pedido: r.pedido,
  }));
}
export function corteDasAnalisesValido(valor: unknown, agora = Date.now()): number {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= 0 && valor <= agora ? valor : 0;
}
export function diaDoEscritorio(em: number) {
  const d = new Date(em);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function analiseDoEscritorio(registros: RegistroEscritorio[], dia: string, ferramenta: FerramentaDeCodigo | "todas" = "todas") {
  const horas = Array.from({ length: 24 }, (_, hora) => ({ hora, trabalho: 0, espera: 0, ocioso: 0, erro: 0, acoes: 0 }));
  const estados = { trabalho: 0, espera: 0, ocioso: 0, erro: 0 };
  const projetos = new Map<string, { id: string; nome: string; trabalho: number; espera: number; acoes: number; falhas: number }>();
  const ferramentas = new Map<FerramentaDeCodigo, { id: FerramentaDeCodigo; trabalho: number; espera: number; acoes: number; falhas: number }>();
  const anteriores = new Map<string, RegistroEscritorio>();
  const sessoes = new Set<string>();
  const esperas: { projeto: string; ferramenta: FerramentaDeCodigo; em: number; ms: number }[] = [];
  let acoes = 0; let falhas = 0; let pedidos = 0;
  for (const r of [...registros].sort((a, b) => a.em - b.em)) {
    if (ferramenta !== "todas" && r.ferramenta !== ferramenta) continue;
    const p = projetos.get(r.projeto) ?? { id: r.projeto, nome: r.nome, trabalho: 0, espera: 0, acoes: 0, falhas: 0 };
    const f = ferramentas.get(r.ferramenta) ?? { id: r.ferramenta, trabalho: 0, espera: 0, acoes: 0, falhas: 0 };
    const anterior = anteriores.get(r.sessao);
    if (anterior?.estado) {
      const projetoAnterior = anterior.projeto === r.projeto ? p : projetos.get(anterior.projeto)!;
      let inicio = anterior.em;
      const fim = Math.min(r.em, inicio + INTERVALO_MAXIMO);
      while (inicio < fim) {
        const proximaHora = new Date(inicio); proximaHora.setMinutes(60, 0, 0);
        const ate = Math.min(fim, Math.max(inicio + 1, proximaHora.getTime()));
        if (diaDoEscritorio(inicio) === dia) {
          const ms = ate - inicio;
          horas[new Date(inicio).getHours()][anterior.estado] += ms; estados[anterior.estado] += ms;
          if (anterior.estado === "trabalho" || anterior.estado === "espera") { projetoAnterior[anterior.estado] += ms; f[anterior.estado] += ms; }
          sessoes.add(r.sessao);
          if (anterior.estado === "espera") esperas.push({ projeto: projetoAnterior.nome, ferramenta: r.ferramenta, em: inicio, ms });
        }
        inicio = ate;
      }
    }
    if (diaDoEscritorio(r.em) === dia) {
      sessoes.add(r.sessao); acoes += +r.acao; falhas += +r.falha; pedidos += +r.pedido;
      p.acoes += +r.acao; p.falhas += +r.falha; f.acoes += +r.acao; f.falhas += +r.falha;
      horas[new Date(r.em).getHours()].acoes += +r.acao;
    }
    projetos.set(r.projeto, p); ferramentas.set(r.ferramenta, f);
    anteriores.set(r.sessao, { ...r, estado: r.estado ?? anterior?.estado });
  }
  return { horas, estados, acoes, falhas, pedidos, sessoes: sessoes.size,
    projetos: [...projetos.values()].filter((p) => p.acoes || p.falhas || p.trabalho || p.espera).sort((a, b) => b.espera - a.espera || b.trabalho - a.trabalho),
    ferramentas: [...ferramentas.values()].filter((p) => p.acoes || p.falhas || p.trabalho || p.espera),
    esperas: esperas.sort((a, b) => b.ms - a.ms).slice(0, 5) };
}
