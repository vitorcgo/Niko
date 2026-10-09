import { useRoutine } from "../state/routine";
import { useStudies } from "../state/studies";
import { usePomodoro } from "../state/pomodoro";
import { useFinances } from "../state/finances";
import { useOrganization } from "../state/organization";
import { useCommunication } from "../state/communication";
import { useAgents } from "../state/agents";
import { useAchievements } from "../state/achievements";
import { readKey, writeKey } from "../bridge/storage";

const KEY = "niko:limpeza-exemplos";

const TASKS = new Set([
  "Revisar lista de limites", "Pagar conta de luz", "Estudar derivadas", "Treino na academia", "Ler capítulo 4 do livro de Rust",
  "Relatório de Física", "Projeto CLI em Rust", "Vocabulário unidade 5", "Listening podcast", "Marcar dentista",
]);
const HABITS: Record<string, [string, number, string]> = {
  "Beber água": ["quantidade", 8, "copos"],
  Ler: ["sim_nao", 1, ""],
  "Exercício": ["sim_nao", 1, ""],
  Meditar: ["quantidade", 10, "min"],
};
const AREAS: Record<string, string> = { Faculdade: "#3b6fe0", "Programação": "#2f9e6b", Idiomas: "#d9922b" };
const SUBJECTS = new Set(["Cálculo I", "Física I", "Rust", "Inglês B2"]);
const ACCOUNTS: Record<string, number> = { Nubank: 320000, "Poupança": 850000, Carteira: 12000, "Cartão Nubank": 0 };
const BUDGETS: Record<string, number> = { "Alimentação": 80000, Mercado: 90000, Transporte: 30000, Lazer: 25000 };
const GOALS = new Set(["Ler 12 livros no ano", "Estudar 60 horas de Cálculo", "Exercício 3 vezes por semana", "Juntar para a viagem"]);
const VIEWS = new Set(["Morar sozinho", "Fluência em inglês"]);
const EVENTS = new Set(["Reunião do grupo de estudo", "Tomar remédio", "Aniversário da Ana"]);
const EVENTS_CONNECTION = new Set(["Vercel: deploy pronto", "Stripe: pagamento recebido", "GitHub: Actions falhou"]);
const ACTIVITIES = new Set(["Agendei 3 revisões de Cálculo", "Vercel: deploy pronto", "Resumo da manhã pronto"]);
const JOURNAL = "<p>Dia produtivo. Terminei a lista de limites e consegui treinar.</p>";

function dayExample(d: { humor?: string; sono?: number; agua?: number; diario: string; nota: string; manha: string; tarde: string; noite: string }): boolean {
  if (d.agua != null || !d.humor || d.sono == null) return false;
  if (d.sono < 5.5 || d.sono > 8.5 || (d.sono * 2) % 1 !== 0) return false;
  return (
    (d.diario === "" || d.diario === JOURNAL) &&
    (d.nota === "" || d.nota === "Levar carregador amanhã.") &&
    (d.manha === "" || d.manha === "Faculdade") &&
    (d.tarde === "" || d.tarde === "Estudos e projeto") &&
    (d.noite === "" || d.noite === "Academia")
  );
}

export function clearExamples(): boolean {
  if (readKey(KEY)) return false;
  writeKey(KEY, new Date().toISOString());

  const studies = useStudies.getState();
  const areasDemo = new Set(studies.areas.filter((a) => AREAS[a.nome] === a.cor).map((a) => a.id));
  const subjectsDemo = new Set(studies.materias.filter((m) => areasDemo.has(m.areaId) && SUBJECTS.has(m.nome)).map((m) => m.id));
  const fin = useFinances.getState();
  const accountsDemo = new Set(fin.contas.filter((c) => ACCOUNTS[c.nome] === c.saldoInicial && (c.nome !== "Cartão Nubank" || c.limite === 500000)).map((c) => c.id));
  const hasExample = subjectsDemo.size > 0 || accountsDemo.size >= 3 || useRoutine.getState().tarefas.some((t) => TASKS.has(t.titulo));
  if (!hasExample) return false;

  const routine = useRoutine.getState();
  const habitsDemo = new Set(routine.habitos.filter((h) => { const x = HABITS[h.nome]; return x && x[0] === h.tipo && x[1] === h.meta && x[2] === h.unidade; }).map((h) => h.id));
  const records = Object.fromEntries(
    Object.entries(routine.registros)
      .map(([day, values]) => [day, Object.fromEntries(Object.entries(values).filter(([id]) => !habitsDemo.has(id)))] as const)
      .filter(([, values]) => Object.keys(values).length > 0),
  );
  routine.replace({
    tarefas: routine.tarefas.filter((t) => !TASKS.has(t.titulo) && !(/^Tarefa \d+$/.test(t.titulo) && t.status === "concluida") && !(t.materiaId && subjectsDemo.has(t.materiaId))),
    habitos: routine.habitos.filter((h) => !habitsDemo.has(h.id)),
    registros: records,
    dias: Object.fromEntries(Object.entries(routine.dias).filter(([, d]) => !dayExample(d))),
  });

  const pagesDemo = new Set(studies.paginas.filter((p) => subjectsDemo.has(p.materiaId)).map((p) => p.id));
  const cards = studies.cartoes.filter((c) => !subjectsDemo.has(c.materiaId));
  studies.replace({
    areas: studies.areas.filter((a) => !areasDemo.has(a.id) || studies.materias.some((m) => m.areaId === a.id && !subjectsDemo.has(m.id))),
    materias: studies.materias.filter((m) => !subjectsDemo.has(m.id)),
    paginas: studies.paginas.filter((p) => !pagesDemo.has(p.id)),
    datas: studies.datas.filter((d) => !subjectsDemo.has(d.materiaId)),
    cartoes: cards,
    revisoesConteudo: studies.revisoesConteudo.filter((r) => !pagesDemo.has(r.paginaId)),
    links: studies.links.filter((l) => !(l.materiaId && subjectsDemo.has(l.materiaId))),
    registroRevisoes: cards.length === 0 ? [] : studies.registroRevisoes,
  });

  usePomodoro.getState().replace(usePomodoro.getState().sessoes.filter((s) => !(s.materiaId && subjectsDemo.has(s.materiaId))));

  const peopleDemo = new Set(fin.pessoas.filter((p) => p.nome === "Ana" || p.nome === "Bruno").map((p) => p.id));
  const splitsDemo = new Set(fin.divisoes.filter((d) => d.descricao === "Pizza sexta" && d.total === 12000).map((d) => d.id));
  fin.replace({
    contas: fin.contas.filter((c) => !accountsDemo.has(c.id)),
    transacoes: fin.transacoes.filter((t) => !accountsDemo.has(t.contaId) && !(t.contaDestinoId && accountsDemo.has(t.contaDestinoId))),
    categorias: fin.categorias.map((c) => (BUDGETS[c.nome] === c.orcamento ? { ...c, orcamento: 0 } : c)),
    recorrentes: fin.recorrentes.filter((r) => !accountsDemo.has(r.contaId)),
    metasEconomia: fin.metasEconomia.filter((m) => !(m.nome === "Viagem de férias" && m.alvo === 600000)),
    pessoas: fin.pessoas.filter((p) => !peopleDemo.has(p.id) || fin.divisoes.some((d) => !splitsDemo.has(d.id) && d.partes.some((x) => x.pessoaId === p.id))),
    divisoes: fin.divisoes.filter((d) => !splitsDemo.has(d.id)),
    listas: fin.listas.filter((l) => !(l.nome === "Mercado" && l.itens.length <= 3 && l.itens.every((i) => ["Leite", "Pão de forma", "Café"].includes(i.nome)))),
    precos: Object.fromEntries(Object.entries(fin.precos).filter(([k]) => k !== "leite")),
    regras: fin.regras.filter((r) => !(r.contem === "IFOOD" || r.contem === "Uber")),
  });

  const org = useOrganization.getState();
  org.replace({
    metas: org.metas.filter((m) => !GOALS.has(m.nome)),
    visao: org.visao.filter((v) => !VIEWS.has(v.titulo)),
    eventos: org.eventos.filter((e) => !EVENTS.has(e.titulo)),
  });

  const communication = useCommunication.getState();
  communication.replace({
    eventosConexao: communication.eventosConexao.filter((e) => !EVENTS_CONNECTION.has(e.texto)),
    memoria: communication.memoria.filter((m) => m.texto !== "Recebo salário no dia 5"),
    usoIa: communication.usoIa.filter((u) => !["claude-sonnet-5-5", "claude-haiku-4-5", "modelo-local"].includes(u.modelo)),
  });

  useAgents.setState((s) => ({ atividades: s.atividades.filter((a) => !ACTIVITIES.has(a.texto)) }));
  useAchievements.getState().replace([]);
  return true;
}

const KEY_SIMULATIONS = "niko:limpeza-simulacoes";
const NAMES = ["Stripe", "GitHub", "Vercel", "Resend", "Notion", "Cal.com", "n8n"];
const EVENTS_SIMULATED = ["pagamento recebido", "PR aprovado", "deploy pronto", "e-mails entregues", "página atualizada", "novo agendamento", "execução concluída", "cobrança falhou", "Actions falhou", "deploy falhou", "e-mail devolvido", "sem acesso a uma página", "agendamento cancelado", "execução com erro"];
const STRINGS_SIMULATED = new Set(NAMES.flatMap((n) => EVENTS_SIMULATED.map((e) => `${n}: ${e}`)));

function sessionExample(s: { inicio: string; minutos: number; materiaId?: string }, subjects: Set<string>): boolean {
  if (s.minutos !== 25 || !s.materiaId || subjects.has(s.materiaId)) return false;
  const d = new Date(s.inicio);
  return d.getMinutes() === 0 && d.getSeconds() === 0 && [9, 11, 13, 15, 17].includes(d.getHours());
}

export function clearSimulations(): boolean {
  if (readKey(KEY_SIMULATIONS)) return false;
  writeKey(KEY_SIMULATIONS, new Date().toISOString());
  let changed = false;
  const communication = useCommunication.getState();
  const events = communication.eventosConexao.filter((e) => !STRINGS_SIMULATED.has(e.texto));
  if (events.length !== communication.eventosConexao.length) changed = true;
  communication.replace({
    eventosConexao: events,
    conexoes: communication.conexoes.map((c) => (c.chaveSalva ? c : { ...c, resumo: "", ultimaAtualizacao: undefined, status: "sem_chave", ligada: false })),
  });
  const agents = useAgents.getState();
  const activities = agents.atividades.filter((a) => !STRINGS_SIMULATED.has(a.texto));
  const alerts = agents.alertas.filter((a) => !STRINGS_SIMULATED.has(a.texto));
  if (activities.length !== agents.atividades.length || alerts.length !== agents.alertas.length) changed = true;
  useAgents.setState({ atividades: activities, alertas: alerts });
  const subjects = new Set(useStudies.getState().materias.map((m) => m.id));
  const sessions = usePomodoro.getState().sessoes;
  const real = sessions.filter((s) => !sessionExample(s, subjects));
  if (real.length !== sessions.length) {
    usePomodoro.getState().replace(real);
    changed = true;
  }
  const studies = useStudies.getState();
  if (studies.cartoes.length === 0 && studies.registroRevisoes.length > 0) {
    studies.replace({ registroRevisoes: [] });
    changed = true;
  }
  return changed;
}