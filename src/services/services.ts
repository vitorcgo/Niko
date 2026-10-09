import { useEffect } from "react";
import { useConfig, type CategoryNotice } from "../state/settings";
import { usePomodoro } from "../state/pomodoro";
import { useAgents } from "../state/agents";
import { noticeEnabled, useIsland } from "../state/island";
import { useMedia } from "../state/media";
import { useInterface } from "../state/interface";
import { clearExamples, clearSimulations } from "../data/clearExamples";
import { useOrganization } from "../state/organization";
import { useFinances, expenseByCategory, balancesWithPeople } from "../state/finances";
import { useCommunication, SERVICES } from "../state/communication";
import { useRoutine, habitCompleted } from "../state/routine";
import { useStudies } from "../state/studies";
import { useAchievements, ACHIEVEMENTS } from "../state/achievements";
import { playSound } from "../bridge/sounds";
import { useWindowPreferences } from "./useWindowPreferences";
import { todayISO, toISO, describeDistance } from "../utils/dates";
import { minutesStudyByDay, sequenceDays, sequenceHabit } from "../utils/statistics";
import { connectionsBridge, summary, getOccurrences, type DataGithub } from "../bridge/liveConnections";
import { storeCommits } from "../utils/statistics";
import { markIfNew } from "../bridge/storage";
import { readUsage } from "../bridge/localBridge";
import { labelWindow } from "../utils/usage";
import { T } from "../i18n/ptBR";
import type { EventType, Habit, ServiceId } from "../types";
import { addDays, addMonths, addWeeks } from "date-fns";
import { achievementEnabled, functionEnabled } from "../utils/features";

function notificationsEnabled(title: string, body: string, category?: CategoryNotice) {
  if (useConfig.getState().naoPerturbe || !noticeEnabled(category)) return;
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) new Notification(title, { body: body });
  } catch {
    return;
  }
}

export function eventTriggersAt(e: EventType, now: Date): string | null {
  if (e.tipo !== "lembrete" || !e.hora) return null;
  let data = new Date(`${e.data}T${e.hora}:00`);
  if (e.repeticao !== "nenhuma") {
    const next = (d: Date) => (e.repeticao === "diaria" ? addDays(d, 1) : e.repeticao === "semanal" ? addWeeks(d, 1) : addMonths(d, 1));
    let protection = 0;
    while (data < new Date(now.getTime() - 86400000) && protection < 2000) {
      data = next(data);
      protection++;
    }
    const skip = new Set(e.excecoes ?? []);
    while (skip.has(toISO(data)) && data <= now && protection < 2100) {
      data = next(data);
      protection++;
    }
  }
  if (data > now) return null;
  if ((e.feitos ?? []).includes(toISO(data))) return null;
  if (now.getTime() - data.getTime() > 6 * 3600000) return null;
  const key = data.toISOString();
  if (e.ultimoDisparo && e.ultimoDisparo >= key) return null;
  return key;
}

function checkPomodoro() {
  const p = usePomodoro.getState();
  if (!p.rodando || !p.terminaEm) return;
  const missing = p.terminaEm - Date.now();
  if (missing > 0 && missing <= 10000 && !document.hidden && useConfig.getState().pomodoro.tique) void playSound("tick", "pomodoro");
  if (missing > 0) return;
  const delayMs = Date.now() - p.terminaEm;
  const statusValue = delayMs > 120000 ? "interrompida" : "concluida";
  const stage = p.completeStage(statusValue);
  const text = stage === "foco" ? T.pomodoro.fimFoco : T.pomodoro.fimPausa;
  void playSound("finish", "pomodoro");
  useIsland.getState().revelar({ texto: text, tipo: "sucesso", agente: "organizador", aba: "foco" }, 4500, "alta");
  useAgents.getState().register("organizador", text);
  notificationsEnabled(T.app.nome, text);
}

function checkReminders() {
  if (!functionEnabled("calendario")) return;
  const now = new Date();
  const org = useOrganization.getState();
  for (const e of org.eventos) {
    const trigger = eventTriggersAt(e, now);
    if (!trigger) continue;
    org.updateEvent(e.id, { ultimoDisparo: trigger });
    const text = T.calendario.lembreteDisparado(e.titulo);
    useAgents.getState().alertar("organizador", text, "calendario", "wink", undefined, true);
    notificationsEnabled(T.app.nome, text, "lembretes");
  }
}

function checkDates() {
  if (!functionEnabled("estudos")) return;
  const today = todayISO();
  const base = new Date(`${today}T00:00:00`).getTime();
  for (const d of useStudies.getState().datas) {
    if (d.concluida || d.data < today) continue;
    const missing = Math.round((new Date(`${d.data}T00:00:00`).getTime() - base) / 86400000);
    const level = [0, 1, 3, 7].find((n) => missing <= n);
    if (level === undefined || !markIfNew(`data-${d.id}-${level}`)) continue;
    const text = T.falas.tutor.prova(`${T.estudos.tiposData[d.tipo]}: ${d.titulo}`, describeDistance(d.data));
    useAgents.getState().alertar("tutor", text, "estudos", "question");
    notificationsEnabled(T.app.nome, text, "estudos");
  }
}

async function checkLimitsPlans() {
  if (!useConfig.getState().consumo.lerPlanos || document.hidden) return;
  try {
    const payload = await readUsage();
    for (const f of payload.ferramentas) {
      if (f.situacao !== "ok") continue;
      for (const j of f.janelas) {
        if (j.usado < 80) continue;
        const level = j.usado >= 100 ? 100 : 80;
        const restart = j.reiniciaEm ? Math.round(new Date(j.reiniciaEm).getTime() / 3600000) : todayISO();
        if (!markIfNew(`limite-${f.id}-${j.id}-${restart}-${level}`)) continue;
        const text = T.consumo.alertaLimite(f.nome, labelWindow(j.rotulo), Math.round(j.usado));
        if (useAgents.getState().alertas.some((a) => a.texto === text)) continue;
        useAgents.getState().alertar("operador", text, "consumo", "rate");
      }
    }
  } catch {
    return;
  }
}

function checkBudget() {
  if (!functionEnabled("financas")) return;
  const fin = useFinances.getState();
  const month = todayISO().slice(0, 7);
  const expenses = expenseByCategory(fin, month);
  for (const c of fin.categorias) {
    if (c.tipo !== "despesa" || c.orcamento <= 0) continue;
    const expense = expenses.get(c.id) ?? 0;
    const level = expense >= c.orcamento ? "100" : expense >= c.orcamento * 0.8 ? "80" : null;
    if (!level) continue;
    if (!markIfNew(`orcamento-${month}-${c.id}-${level}`)) continue;
    const already = useAgents.getState().alertas.some((a) => a.texto === T.financas.estourou(c.nome) || a.texto === T.financas.perto(c.nome));
    if (already && level === "80") continue;
    useAgents.getState().alertar("operador", level === "100" ? T.financas.estourou(c.nome) : T.financas.perto(c.nome), "financas", level === "100" ? "annoyed" : "question");
  }
}

function checkAchievements() {
  if (!useConfig.getState().conquistasAtivas) return;
  const register = useAchievements.getState().register;
  const routine = useRoutine.getState();
  const studies = useStudies.getState();
  const pomodoro = usePomodoro.getState();
  const fin = useFinances.getState();
  const org = useOrganization.getState();
  const reached: { codigo: string; nivel: number }[] = [];
  const levelBy = (code: string, value: number) => {
    const def = ACHIEVEMENTS.find((c) => c.codigo === code);
    if (!def) return;
    if (!achievementEnabled(code)) return;
    const level = [...def.niveis].reverse().find((n) => value >= n);
    if (level && register(code, level)) reached.push({ codigo: code, nivel: level });
  };

  levelBy("primeira_semana", sequenceDays(new Set(routine.diasAbertos)));
  levelBy("sequencia_habito", Math.max(0, ...routine.habitos.filter((h) => !h.arquivado).map((h) => sequenceHabit(h, routine.registros))));
  levelBy("foco", pomodoro.sessoes.filter((s) => s.etapa === "foco" && s.situacao === "concluida").length);
  levelBy("revisor", studies.registroRevisoes.reduce((a, r) => a + r.quantidade, 0));
  levelBy("maratona", minutesStudyByDay(pomodoro.sessoes).get(todayISO()) ?? 0);
  levelBy("prova_vencida", studies.datas.filter((d) => d.tipo === "prova" && d.concluida).length);
  levelBy("meta_economia", fin.metasEconomia.filter((m) => m.alvo > 0 && m.guardado >= m.alvo).length);
  const balances = balancesWithPeople(fin);
  if (fin.divisoes.length > 0 && [...balances.values()].every((v) => v === 0)) levelBy("sem_pendencias", 1);
  levelBy("meta_vida", org.metas.filter((m) => m.tipo === "manual" && m.alvo > 0 && m.atual >= m.alvo).length);
  const monthPast = toISO(addMonths(new Date(), -1)).slice(0, 7);
  const hasBudget = fin.categorias.filter((c) => c.tipo === "despesa" && c.orcamento > 0);
  if (hasBudget.length > 0 && fin.transacoes.some((t) => t.data.startsWith(monthPast))) {
    const expenses = expenseByCategory(fin, monthPast);
    if (hasBudget.every((c) => (expenses.get(c.id) ?? 0) <= c.orcamento)) levelBy("orcamento_em_dia", 1);
  }

  for (const a of reached) {
    const def = ACHIEVEMENTS.find((c) => c.codigo === a.codigo);
    if (!def) continue;
    const nameValue = T.conquistas.itens[a.codigo]?.nome ?? a.codigo;
    if (noticeEnabled("conquistas")) void playSound("proud", "personagens");
    useIsland.getState().revelar({ texto: T.conquistas.comemoracao(nameValue), tipo: "sucesso", agente: def.agente, categoria: "conquistas" }, 4200);
    useAgents.getState().register(def.agente, T.conquistas.comemoracao(nameValue));
  }
}

export function habitsTime(habits: Habit[], recordsToday: Record<string, number> | undefined, now: Date): Habit[] {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return habits.filter((h) => {
    if (h.arquivado || !h.hora || habitCompleted(h, recordsToday?.[h.id])) return false;
    const [hh, mm] = h.hora.split(":").map(Number);
    const delay = minutes - (hh * 60 + mm);
    return delay >= 0 && delay <= 6 * 60;
  });
}

function notifyHabitsTime() {
  if (!functionEnabled("journal")) return;
  const today = todayISO();
  const routine = useRoutine.getState();
  for (const h of habitsTime(routine.habitos, routine.registros[today], new Date())) {
    if (!markIfNew(`habito-hora-${h.id}-${today}`)) continue;
    const text = T.journal.habitoNaHora(h.nome);
    useAgents.getState().alertar("organizador", text, "journal", "wink", undefined, true);
    notificationsEnabled(T.app.nome, text, "habitos");
  }
}

function remindHabits() {
  if (!functionEnabled("journal")) return;
  const now = new Date();
  if (now.getHours() < 21) return;
  const today = todayISO();
  const routine = useRoutine.getState();
  const pendingRequests = routine.habitos.filter((h) => !h.arquivado && !habitCompleted(h, routine.registros[today]?.[h.id]));
  if (pendingRequests.length === 0 || !markIfNew(`habitos-${today}`)) return;
  useAgents.getState().alertar("organizador", T.falas.organizador.habitos(pendingRequests.length), "journal", "question");
}

async function adjustConnections() {
  try {
    const state = await connectionsBridge.estado();
    const communication = useCommunication.getState();
    for (const c of communication.conexoes) {
      const real = state[c.id]?.temChave ?? false;
      if (c.chaveSalva && !real) communication.updateConnection(c.id, { chaveSalva: false, ligada: false, status: "sem_chave", resumo: "" });
      if (!c.chaveSalva && real) communication.updateConnection(c.id, { chaveSalva: true, ligada: true, status: "conectado" });
    }
  } catch {
    const communication = useCommunication.getState();
    for (const c of communication.conexoes) if (c.chaveSalva) communication.updateConnection(c.id, { status: "sem_internet" });
  }
}

const nextRead = new Map<ServiceId, number>();
const READ_WITH_CI_RUNNING_MS = 60_000;
const atRead = new Set<ServiceId>();
const views = new Map<ServiceId, Set<string>>();

export async function updateConnectionNow(id: ServiceId, force = true) {
  if (atRead.has(id)) return;
  atRead.add(id);
  const communication = useCommunication.getState();
  try {
    const payload = await connectionsBridge.ler(id, force);
    communication.updateConnection(id, { ultimaAtualizacao: new Date().toISOString(), resumo: summary(id, payload), status: "conectado" });
    if (id === "github") {
      const g = payload as DataGithub;
      storeCommits(g.commitsPorDia ?? {});
      if (g.actions.some((a) => a.status === "rodando") || g.prs.some((p) => p.ci === "rodando")) {
        nextRead.set(id, Math.min(nextRead.get(id) ?? Infinity, Date.now() + READ_WITH_CI_RUNNING_MS));
      }
    }
    const occurrences = getOccurrences(id, payload);
    const known = views.get(id);
    if (!known) {
      views.set(id, new Set(occurrences.map((o) => o.chave)));
      return;
    }
    for (const o of [...occurrences].reverse()) {
      if (known.has(o.chave)) continue;
      known.add(o.chave);
      communication.registerEventConnection({ servico: id, texto: o.texto, tipo: o.tipo });
      if (o.tipo === "falha") useAgents.getState().alertar("java", o.texto, "conexoes", "error", id);
      else {
        useAgents.getState().register("java", o.texto);
        useIsland.getState().revelar({ texto: o.texto, tipo: "sucesso", marca: id, aba: "conexoes" }, 3800, "normal");
      }
    }
  } catch (e) {
    const message = (e as Error).message;
    communication.updateConnection(id, { status: /sem_chave/.test(message) ? "sem_chave" : /fetch|rede|ENOTFOUND|timeout/i.test(message) ? "sem_internet" : "erro", ultimaAtualizacao: new Date().toISOString() });
  } finally {
    atRead.delete(id);
  }
}

function readConnections() {
  if (useConfig.getState().pausarConexoes) return;
  const communication = useCommunication.getState();
  const now = Date.now();
  for (const id of SERVICES) {
    const c = communication.conexoes.find((x) => x.id === id);
    if (!c || !c.ligada || !c.chaveSalva) continue;
    const next = nextRead.get(id) ?? 0;
    if (now < next) continue;
    nextRead.set(id, now + Math.max(30, c.intervalo) * 1000);
    void updateConnectionNow(id, false);
  }
}
export function useServices() {
  const inatividade = useConfig((s) => s.agentes.inatividadeMin);

  useWindowPreferences();

  useEffect(() => {
    const limpouExamples = clearExamples();
    const limpouSimulations = clearSimulations();
    if (limpouExamples || limpouSimulations) useInterface.getState().notify(T.configuracoes.exemplosRemovidos);
    void adjustConnections();
    useRoutine.getState().markOpening();
    useFinances.getState().ensureCategories();
    useOrganization.getState().ensurePillars();
    const studies = useStudies.getState();
    const pagesExisting = new Set(studies.paginas.map((p) => p.id));
    if (studies.revisoesConteudo.some((r) => !pagesExisting.has(r.paginaId))) useStudies.setState({ revisoesConteudo: studies.revisoesConteudo.filter((r) => pagesExisting.has(r.paginaId)) });
    const generated = useFinances.getState().generateRecurring();
    if (generated > 0 && functionEnabled("financas")) useAgents.getState().register("operador", T.financas.abas.recorrentes);
    checkPomodoro();
    checkAchievements();
  }, []);

  useEffect(() => {
    let quick: number | undefined;
    let lento: number | undefined;
    let plans: number | undefined;
    let media: number | undefined;
    const start = () => {
      stopValue();
      plans = window.setInterval(() => void checkLimitsPlans(), 5 * 60000);
      void useMedia.getState().synchronize();
      media = window.setInterval(() => void useMedia.getState().synchronize(), 2500);
      void checkLimitsPlans();
      checkDates();
      quick = window.setInterval(() => {
        checkPomodoro();
        readConnections();
      }, 1000);
      lento = window.setInterval(() => {
        checkReminders();
        notifyHabitsTime();
        checkBudget();
        checkAchievements();
        remindHabits();
        checkDates();
        useAgents.getState().checkSleep(inatividade);
        useRoutine.getState().markOpening();
        useFinances.getState().generateRecurring();
      }, 20000);
      checkReminders();
      notifyHabitsTime();
      checkBudget();
    };
    const stopValue = () => {
      window.clearInterval(quick);
      window.clearInterval(lento);
      window.clearInterval(plans);
      window.clearInterval(media);
    };
    const onChangeVisibilidade = () => {
      if (document.hidden) {
        stopValue();
        quick = window.setInterval(checkPomodoro, 5000);
      } else start();
    };
    start();
    document.addEventListener("visibilitychange", onChangeVisibilidade);
    return () => {
      stopValue();
      document.removeEventListener("visibilitychange", onChangeVisibilidade);
    };
  }, [inatividade]);
}
