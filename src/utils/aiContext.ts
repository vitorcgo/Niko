import { useRoutine, tasksDay, habitCompleted } from "../state/routine";
import { useStudies, reviewsToToday } from "../state/studies";
import { useFinances, expensesMonth, partUser } from "../state/finances";
import { useCommunication } from "../state/communication";
import { useConfig } from "../state/settings";
import { usePomodoro } from "../state/pomodoro";
import { AGENTS, useAgents } from "../state/agents";
import { todayISO, formatDateString, dayMoment } from "./dates";
import { formatMoney } from "./money";
import { sumBy } from "./basics";
import { T } from "../i18n/ptBR";
import type { AgentId } from "../types";
import { functionCommand, functionEnabled, ruleFunctionsToAi } from "./features";

function commandsSuggested(): string {
  return ["tarefa", "gasto", "lembrete", "compra"]
    .filter((c) => !functionCommand(c))
    .map((c) => `/${c}`)
    .join(", ");
}

export function summaryByAgent(): Record<AgentId, string> {
  const today = todayISO();
  const routine = useRoutine.getState();
  const studies = useStudies.getState();
  const fin = useFinances.getState();
  const tasks = tasksDay(routine.tarefas, today).filter((t) => t.status !== "concluida" && t.status !== "cancelada");
  const habits = routine.habitos.filter((h) => !h.arquivado && !habitCompleted(h, routine.registros[today]?.[h.id]));
  const reviews = reviewsToToday(studies);
  const exam = studies.datas.filter((d) => !d.concluida && d.data >= today).sort((a, b) => a.data.localeCompare(b.data))[0];
  const expense = sumBy(expensesMonth(fin, today.slice(0, 7)), (t) => partUser(t, fin.divisoes));
  const alerts = useAgents.getState().alertas;
  const failure = alerts.find((a) => a.agenteId === "operador");
  const failureConnection = alerts.find((a) => a.agenteId === "java" && a.servico);
  const areasCode = studies.areas.filter((a) => a.tipo === "programacao").map((a) => a.id);
  const subjectCode = studies.materias.find((m) => areasCode.includes(m.areaId));
  const github = useCommunication.getState().conexoes.find((c) => c.id === "github" && c.ligada && c.resumo);
  const hasTasks = functionEnabled("journal");
  const hasStudies = functionEnabled("estudos");
  const hasFinances = functionEnabled("financas");
  return {
    organizador: hasTasks && (tasks.length || habits.length) ? `${T.falas.organizador.bomDia(tasks.length)} ${habits.length ? T.falas.organizador.habitos(habits.length) : ""}`.trim() : T.falas.organizador.livre,
    tutor: !hasStudies ? T.falas.tutor.semFuncao : reviews ? T.falas.tutor.revisoes(reviews) : exam ? T.falas.tutor.prova(exam.titulo, formatDateString(exam.data, "d 'de' MMM")) : T.falas.tutor.livre,
    operador: failure ? failure.texto : !hasFinances ? T.falas.operador.semFuncao : expense ? T.falas.operador.gasto(formatMoney(expense)) : T.falas.operador.livre,
    java: failureConnection ? failureConnection.texto : github ? github.resumo : hasStudies && subjectCode ? T.falas.java.estudo(subjectCode.nome) : T.falas.java.livre,
  };
}

export function contextToAi(): string {
  const cfg = useConfig.getState();
  const today = todayISO();
  const routine = useRoutine.getState();
  const studies = useStudies.getState();
  const fin = useFinances.getState();
  const tasks = tasksDay(routine.tarefas, today).map((t) => `- [${T.status[t.status]}] ${t.titulo}${t.hora ? ` ${t.hora}` : ""}`).slice(0, 20);
  const exams = studies.datas.filter((d) => !d.concluida && d.data >= today).slice(0, 5).map((d) => `- ${d.titulo} em ${d.data}`);
  const memory = useCommunication.getState().memoria.slice(-20).map((m) => `- ${m.texto}`);
  const pomodoros = usePomodoro.getState().sessoes.filter((s) => dayMoment(s.inicio) === today && s.etapa === "foco").length;
  const hasStudies = functionEnabled("estudos");
  const lines = [
    `Hoje é ${formatDateString(today, "EEEE, d 'de' MMMM 'de' yyyy")}. Usuário: ${cfg.nome || "sem nome"}.`,
    ...(functionEnabled("journal") ? [`Tarefas de hoje:\n${tasks.join("\n") || "- nenhuma"}`] : []),
    hasStudies ? `Revisões pendentes hoje: ${reviewsToToday(studies)}. Pomodoros hoje: ${pomodoros}.` : `Pomodoros hoje: ${pomodoros}.`,
    ...(hasStudies ? [`Próximas datas de estudo:\n${exams.join("\n") || "- nenhuma"}`] : []),
    `Fatos que o usuário pediu para lembrar:\n${memory.join("\n") || "- nenhum"}`,
  ];
  if (!cfg.nuncaFinanceiro && functionEnabled("financas")) {
    const expense = sumBy(expensesMonth(fin, today.slice(0, 7)), (t) => partUser(t, fin.divisoes));
    lines.push(`Gasto do mês até agora: ${formatMoney(expense)}.`);
  }
  return lines.join("\n\n");
}

export function promptAgent(agent: AgentId, analysisOnly = false): string {
  const { nomes: names, cargos: roles } = useConfig.getState().agentes;
  if (analysisOnly) return [T.chat.anexos.analiseSistema, ...T.chat.confianca.regras].join("\n");
  const colleagues = AGENTS.filter((a) => a !== agent).map((a) => `- ${names[a]}, ${roles[a]}: ${T.agentes.areas[a]}`).join("\n");
  return [
    `Você é ${names[agent]}, ${roles[agent]} no Niko, um app pessoal do usuário para rotina, estudos, finanças e projetos. Sua área: ${T.agentes.areas[agent]}.`,
    `Responda somente como ${names[agent]}. Não escreva nomes seguidos de dois pontos no início da resposta, não encene outros agentes e não atribua suas respostas a um colega. O Niko identifica o autor na interface.`,
    ...T.chat.confianca.regras,
    `Colegas do time:\n${colleagues}`,
    "Regras:",
    "- Responda sempre em português do Brasil, curto e direto. Nunca use travessão nem emoji.",
    "- Você responde sozinho. Ajude no que foi pedido; se o assunto for bem de outro colega, ajude mesmo assim e diga em uma frase quem cuida disso.",
    "- Seu acesso é limitado às ferramentas disponíveis e às permissões do usuário. Antes de falar de dados pessoais, consulte com ler_* ou consultar_banco. A leitura financeira pode estar bloqueada; conexões exigem configuração. Não diga que tem acesso irrestrito ao banco ou ao computador.",
    "- Para perguntas sobre o computador (memória, processador, disco, bateria, Wi-Fi, Bluetooth, programas e janelas abertas), use ler_computador.",
    "- Para criar, concluir, lançar, marcar ou guardar algo, chame a ferramenta certa. Ela mostra um cartão e o usuário confirma. Diga que deixou pronto para confirmar, nunca que já salvou.",
    "- Pode chamar várias ferramentas na mesma resposta quando o pedido tiver várias coisas.",
    `- Hoje é ${todayISO()}. Converta datas como amanhã ou sexta para AAAA-MM-DD e horas para HH:MM.`,
    `- Se as ferramentas não estiverem disponíveis, sugira o comando exato (${commandsSuggested()}) para o usuário clicar.`,
    ...(ruleFunctionsToAi() ? [ruleFunctionsToAi() as string] : []),
    ...(agent === "java" ? ["- Em programação, explique com exemplos curtos em blocos de código com a linguagem indicada."] : []),
    "",
    "Contexto atual:",
    contextToAi(),
  ].join("\n");
}
