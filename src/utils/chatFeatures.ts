import { usePomodoro, remainingCurrent, formatClock } from "../state/pomodoro";
import { useRoutine } from "../state/routine";
import { useStudies } from "../state/studies";
import { normalizeText } from "./basics";
import { todayISO, toISO, dayMoment, isValidDate, formatDateString } from "./dates";
import { T } from "../i18n/ptBR";
import { functionEnabled } from "./features";

export type ActionAttachment = keyof typeof T.chat.anexos.acoes;
export type RequestLocal = "pausar" | "continuar" | "encerrar" | "timer" | "capacidades" | "relatorio";

export function detectRequestLocal(request: string, contextPomodoro = false): RequestLocal | null {
  const n = normalizeText(request).replace(/[?!.,]+$/g, "").replace(/^(?:por favor[, ]+|obrigad[oa][, ]+|opa[, ]+)/, "").replace(/^agora\s+/, "").trim();
  if (/^(?:\/capacidades|(?:o que|quais coisas) (?:voce|voces|o niko) (?:consegue[m]?|pode[m]?) fazer|(?:mostre|mostra|liste|lista) (?:as |suas )?capacidades)$/.test(n)) return "capacidades";
  if (/^(?:\/relatorio|(?:faca |faz |gere |gera |mostre |mostra )?(?:um |o |meu )?relatorio semanal)$/.test(n)) return "relatorio";
  if (/^(?:\/pomodoro (?:status|tempo)|quanto tempo (?:falta|resta)(?: (?:no|do|para o) (?:pomodoro|foco|timer))?|(?:qual|como esta) (?:o )?(?:tempo|estado) (?:do|de) (?:pomodoro|foco|timer))$/.test(n)) return "timer";
  for (const [action, verbs] of [["pausar", "pausa|pause|pausar"], ["continuar", "continua|continue|continuar|retoma|retome|retomar"], ["encerrar", "para|pare|parar|encerra|encerre|encerrar|cancela|cancele|cancelar"]] as const) {
    if (new RegExp(`^(?:/pomodoro ${action}|(?:${verbs}) (?:o |esse |este |meu )?(?:pomodoro|foco|timer)(?: (?:ai|por favor))?)$`).test(n)) return action;
    if (contextPomodoro && new RegExp(`^(?:${verbs}) (?:isso|ele)$`).test(n)) return action;
  }
  return null;
}

export function readPomodoro() {
  const p = usePomodoro.getState();
  const remaining = remainingCurrent(p, Date.now());
  const active = Boolean(p.inicioEtapa);
  const statusValue: keyof typeof T.chat.recursos.estadoTimer = !active ? "inativo" : remaining <= 0 ? "finalizado" : p.rodando ? "rodando" : "pausado";
  return { situacao: statusValue, etapa: p.etapa, restante_segundos: active ? Math.ceil(remaining / 1000) : 0, relogio: formatClock(active ? remaining : 0), materia: useStudies.getState().materias.find((m) => m.id === p.materiaId)?.nome ?? null, consultado_em: new Date().toISOString() };
}

export function textPomodoro() {
  const p = readPomodoro();
  return T.chat.recursos.timerEstado(T.chat.recursos.estadoTimer[p.situacao], T.pomodoro.etapas[p.etapa], p.relogio);
}

export function controlPomodoro(action: string): { tipo: "erro"; mensagem: string } | { tipo: "dados"; conteudo: ReturnType<typeof readPomodoro>; resumo: string } {
  const p = usePomodoro.getState();
  const state = readPomodoro();
  const S = T.chat.recursos;
  if (!["pausar", "continuar", "encerrar"].includes(action)) return { tipo: "erro", mensagem: S.acaoInvalida };
  if (state.situacao === "inativo") return { tipo: "erro", mensagem: S.semTimer };
  if (action !== "encerrar" && state.situacao === "finalizado") return { tipo: "erro", mensagem: S.timerExpirado };
  if (action === "pausar") {
    if (!p.rodando) return { tipo: "erro", mensagem: S.jaPausado };
    p.pausar();
  } else if (action === "continuar") {
    if (p.rodando) return { tipo: "erro", mensagem: S.jaRodando };
    p.resume();
  } else p.stop();
  const current = readPomodoro();
  return { tipo: "dados", conteudo: current, resumo: action === "encerrar" ? S.timerEncerrado : action === "pausar" ? S.timerPausado(current.relogio) : S.timerContinuado(current.relogio) };
}

export function generateReportWeekly(end = todayISO()) {
  if (!isValidDate(end)) throw new Error(T.chat.recursos.periodoInvalido);
  const startData = new Date(`${end}T12:00:00`);
  startData.setDate(startData.getDate() - 6);
  const start = toISO(startData);
  const inside = (day: string) => day >= start && day <= end;
  const daySafe = (moment?: string) => moment && Number.isFinite(new Date(moment).getTime()) ? dayMoment(moment) : "";
  const r = useRoutine.getState();
  const completed = r.tarefas.filter((t) => t.status === "concluida" && inside(daySafe(t.concluidaEm)));
  const sessions = usePomodoro.getState().sessoes.filter((s) => s.etapa === "foco" && inside(daySafe(s.inicio)) && Number.isFinite(s.minutos) && s.minutos >= 0);
  const complete = sessions.filter((s) => s.situacao === "concluida");
  const interrupted = sessions.filter((s) => s.situacao === "interrompida");
  const days = Object.entries(r.dias).filter(([day]) => inside(day));
  const sleep = days.flatMap(([, d]) => typeof d.sono === "number" && Number.isFinite(d.sono) && d.sono >= 0 && d.sono <= 24 ? [d.sono] : []);
  const water = days.flatMap(([, d]) => typeof d.agua === "number" && Number.isFinite(d.agua) && d.agua >= 0 ? [d.agua] : []);
  const records = Object.entries(r.registros).filter(([day]) => inside(day));
  let habitsRecords = 0;
  let habitsCompleted = 0;
  for (const [, values] of records) for (const [id, value] of Object.entries(values)) {
    const habit = r.habitos.find((h) => h.id === id);
    if (!habit || !Number.isFinite(value) || value < 0) continue;
    habitsRecords++;
    if (value >= (habit.tipo === "sim_nao" ? 1 : habit.meta)) habitsCompleted++;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  const media = (list: number[]) => list.length ? round(list.reduce((a, b) => a + b, 0) / list.length) : null;
  const daysWithRecord = new Set([...days.map(([day]) => day), ...records.filter(([, v]) => Object.keys(v).length).map(([day]) => day), ...completed.map((t) => daySafe(t.concluidaEm)), ...sessions.map((s) => daySafe(s.inicio))]);
  return { inicio: start, fim: end, tarefas_concluidas: completed.length, habitos_registros: habitsRecords, habitos_cumpridos: habitsCompleted, foco_sessoes_concluidas: complete.length, foco_concluido_minutos: round(complete.reduce((a, s) => a + s.minutos, 0)), foco_interrompido_minutos: round(interrupted.reduce((a, s) => a + s.minutos, 0)), sono_media_horas: media(sleep), sono_dias: sleep.length, agua_media_ml: media(water), agua_dias: water.length, dias_com_registro: daysWithRecord.size };
}

export function textReportWeekly(r = generateReportWeekly()) {
  const S = T.chat.recursos;
  const hasJournal = functionEnabled("journal");
  return [
    S.relatorioTitulo(formatDateString(r.inicio, "dd/MM/yyyy"), formatDateString(r.fim, "dd/MM/yyyy")),
    ...(r.dias_com_registro === 0 ? [S.relatorioVazio] : []),
    ...(hasJournal ? [S.relatorioTarefas(r.tarefas_concluidas), S.relatorioHabitos(r.habitos_registros, r.habitos_cumpridos)] : []),
    S.relatorioFoco(r.foco_sessoes_concluidas, r.foco_concluido_minutos, r.foco_interrompido_minutos),
    ...(hasJournal ? [r.sono_media_horas === null ? S.relatorioSemSono : S.relatorioSono(r.sono_media_horas, r.sono_dias), r.agua_media_ml === null ? S.relatorioSemAgua : S.relatorioAgua(r.agua_media_ml, r.agua_dias)] : []),
    S.relatorioFonte,
  ].join("\n\n");
}

export function mountRequestAttachment(action: string, attachments: { nome: string; texto?: string }[]) {
  if (!Object.hasOwn(T.chat.anexos.pedidos, action)) throw new Error(T.chat.anexos.acaoInvalida);
  const strings = attachments.filter((a) => a.texto?.trim());
  if (!strings.length) throw new Error(T.chat.anexos.semTextoAnalisavel);
  let available = 45000;
  const parts = strings.map((a) => {
    const original = a.texto ?? "";
    const excerpt = original.slice(0, Math.max(0, available));
    available -= excerpt.length;
    return `${a.nome}\n${excerpt}${excerpt.length < original.length ? `\n${T.chat.anexos.recorte}` : ""}`;
  });
  return [T.chat.anexos.pedidos[action as ActionAttachment], T.chat.anexos.delimitador, ...parts].join("\n\n");
}

export function assertsExecution(text: string) {
  return /(?:^|[.!?\n]\s*)(?:\*\*)?(?:eu |ja )?(?:criei|salvei|enviei|exclui|apaguei|adicionei|marquei|conclui|iniciei|pausei|retomei|encerrei|atualizei|pesquisei|executei|abri)\b|\b(?:pomodoro|timer|foco|tarefa|email|e-mail|evento|lembrete)\s+(?:foi\s+)?(?:iniciado|iniciada|pausado|retomado|encerrado|criada|salva|enviado|enviada|concluida)\b/.test(normalizeText(text));
}

export function removePrefixAgent(text: string, names: string[]) {
  const escaped = names.filter(Boolean).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!escaped.length) return text;
  return text.replace(new RegExp(`^\\s*(?:\\*\\*)?(?:${escaped.join("|")})(?:\\*\\*)?\\s*:(?:\\*\\*)?\\s*`, "i"), "");
}
