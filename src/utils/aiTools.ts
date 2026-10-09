import type { AgentId, CardConfirmation, Route, ServiceId } from "../types";
import { connectionsBridge } from "../bridge/liveConnections";
import type { ToolAi } from "../bridge/localBridge";
import { useRoutine, tasksDay, habitCompleted } from "../state/routine";
import { useOrganization } from "../state/organization";
import { occurrences } from "./calendarItems";
import { useStudies, reviewsToToday } from "../state/studies";
import { useFinances, expensesMonth, incomeMonth, expenseByCategory, partUser, balanceAccount } from "../state/finances";
import { useCommunication } from "../state/communication";
import { useConfig } from "../state/settings";
import { usePomodoro } from "../state/pomodoro";
import { useInterface } from "../state/interface";
import { useAgents } from "../state/agents";
import { system } from "../bridge/localBridge";
import { todayISO, dayMoment, toISO } from "./dates";
import { sumBy, normalizeText } from "./basics";
import { findByName, dataCategory } from "./commands";
import { T } from "../i18n/ptBR";
import { readPomodoro, controlPomodoro, generateReportWeekly, textPomodoro, textReportWeekly } from "./chatFeatures";
import { listFiles, readContent } from "../bridge/files";
import { extractText, messageRead } from "./fileReader";
import { FUNCTIONS, PARTS, areaDatabaseEnabled, noticeFunctionDisabled, toolEnabled, functionEnabled, routeEnabled } from "./features";

type Arguments = Record<string, unknown>;

const ERRORS = T.chat.ferramentas.erros;

export type ResultTool =
  | { tipo: "dados"; conteudo: unknown; resumo?: string; textoVerificado?: string }
  | { tipo: "confirmar"; cartao: CardConfirmation; agente: AgentId }
  | { tipo: "erro"; mensagem: string };

interface ToolNiko {
  definicao: ToolAi;
  executar: (args: Arguments) => ResultTool;
  assincrona?: (args: Arguments) => Promise<ResultTool>;
}

const DATA = { type: "string", description: "Data no formato AAAA-MM-DD" };
const TIME = { type: "string", description: "Hora no formato HH:MM, 24 horas" };
const RECURRENCE = { type: "string", enum: ["nenhuma", "diaria", "semanal", "mensal"], description: "diaria para todo dia, semanal para toda semana, mensal para todo mês. Padrão: nenhuma" };

function recurrenceValid(value: unknown): { repeticao?: string } {
  return value === "diaria" || value === "semanal" || value === "mensal" ? { repeticao: value } : {};
}
const SCREENS: Route[] = ["inicio", "chat", "escritorio", "conexoes", "journal", "estudos", "financas", "metas", "calendario", "atualizacao", "ia", "consumo", "conquistas", "configuracoes"];

function text(value: unknown, limit = 200): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function isValidDate(value: unknown): string | undefined {
  const v = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T12:00:00`).getTime()) ? v : undefined;
}

function isValidTime(value: unknown): string | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text(value, 5));
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return undefined;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function real(cents: number): number {
  return Math.round(cents) / 100;
}

function sumDays(base: string, days: number): string {
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

function withoutHtml(html: string, limit = 1500): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim().slice(0, limit);
}

type RecordType = Record<string, unknown>;

interface AreaDatabase {
  data?: string;
  financeira?: boolean;
  ler: () => RecordType[];
}

function nameValue(list: { id: string; nome: string }[], id?: string): string | null {
  return id ? list.find((x) => x.id === id)?.nome ?? null : null;
}

const AREAS_DATABASE: Record<string, AreaDatabase> = {
  tarefas: { data: "data", ler: () => useRoutine.getState().tarefas.map((t) => ({ id: t.id, titulo: t.titulo, descricao: t.descricao, status: t.status, data: t.data ?? null, hora: t.hora ?? null, prioridade: t.prioridade, materia: nameValue(useStudies.getState().materias, t.materiaId), checklist: t.checklist.map((c) => c.texto), concluida_em: t.concluidaEm ?? null })) },
  habitos: { ler: () => useRoutine.getState().habitos.map((h) => ({ id: h.id, nome: h.nome, tipo: h.tipo, meta: h.meta, unidade: h.unidade, arquivado: h.arquivado })) },
  registros_habitos: {
    data: "data",
    ler: () => {
      const r = useRoutine.getState();
      return Object.entries(r.registros).flatMap(([data, values]) => Object.entries(values).map(([id, value]) => ({ data, habito: nameValue(r.habitos, id) ?? id, valor: value })));
    },
  },
  journal: {
    data: "data",
    ler: () => Object.entries(useRoutine.getState().dias).map(([data, d]) => ({ data, humor: d.humor ?? null, sono_horas: d.sono ?? null, agua_ml: d.agua ?? null, diario: withoutHtml(d.diario ?? ""), manha: withoutHtml(d.manha ?? "", 400), tarde: withoutHtml(d.tarde ?? "", 400), noite: withoutHtml(d.noite ?? "", 400) })),
  },
  eventos: { data: "data", ler: () => useOrganization.getState().eventos.map((e) => ({ titulo: e.titulo, data: e.data, hora: e.hora ?? null, tipo: e.tipo, repete: e.repeticao, feito_em: e.feitos ?? [] })) },
  metas: { data: "prazo", ler: () => { const o = useOrganization.getState(); return o.metas.map((m) => ({ nome: m.nome, pilar: nameValue(o.pilares, m.pilarId), tipo: m.tipo, atual: m.atual, alvo: m.alvo, prazo: m.prazo ?? null, periodo: m.periodo })); } },
  pilares: { ler: () => useOrganization.getState().pilares.map((p) => ({ nome: p.nome, nota: p.nota })) },
  visao: { data: "prazo", ler: () => useOrganization.getState().visao.map((v) => ({ titulo: v.titulo, descricao: v.descricao, estado: v.estado, prazo: v.prazo ?? null })) },
  areas_estudo: { ler: () => useStudies.getState().areas.map((a) => ({ nome: a.nome, tipo: a.tipo })) },
  materias: { ler: () => { const e = useStudies.getState(); return e.materias.map((m) => ({ nome: m.nome, area: nameValue(e.areas, m.areaId), semestre: m.semestre ?? null, paginas: e.paginas.filter((p) => p.materiaId === m.id).length, cartoes: e.cartoes.filter((c) => c.materiaId === m.id).length })); } },
  paginas: { data: "atualizada", ler: () => { const e = useStudies.getState(); return e.paginas.map((p) => ({ titulo: p.titulo, materia: nameValue(e.materias, p.materiaId), atualizada: dayMoment(p.atualizadaEm), estudada: (p.estudadaEm ? dayMoment(p.estudadaEm) : null), conteudo: withoutHtml(p.conteudo) })); } },
  cartoes: { data: "vencimento", ler: () => { const e = useStudies.getState(); return e.cartoes.map((c) => ({ materia: nameValue(e.materias, c.materiaId), frente: c.frente, verso: c.verso, vencimento: dayMoment(c.vencimento), repeticoes: c.repeticoes, lapsos: c.lapsos })); } },
  datas_estudo: { data: "data", ler: () => { const e = useStudies.getState(); return e.datas.map((d) => ({ titulo: d.titulo, tipo: d.tipo, data: d.data, materia: nameValue(e.materias, d.materiaId), concluida: d.concluida })); } },
  links: { data: "criado", ler: () => { const e = useStudies.getState(); return e.links.map((l) => ({ titulo: l.titulo, url: l.url, nota: l.nota, tags: l.tags, estado: l.estado, materia: nameValue(e.materias, l.materiaId), criado: dayMoment(l.criadoEm) })); } },
  contas: { financeira: true, ler: () => { const f = useFinances.getState(); return f.contas.map((c) => ({ nome: c.nome, tipo: c.tipo, saldo: real(balanceAccount(f, c.id)), limite: c.limite != null ? real(c.limite) : null, arquivada: c.arquivada })); } },
  transacoes: { data: "data", financeira: true, ler: () => { const f = useFinances.getState(); return f.transacoes.map((t) => ({ data: t.data, tipo: t.tipo, valor: real(t.valor), descricao: t.descricao, categoria: nameValue(f.categorias, t.categoriaId), conta: nameValue(f.contas, t.contaId), parcela: t.parcela ? `${t.parcela.numero}/${t.parcela.total}` : null })); } },
  categorias: { financeira: true, ler: () => useFinances.getState().categorias.map((c) => ({ nome: c.nome, tipo: c.tipo, orcamento: real(c.orcamento) })) },
  recorrentes: { financeira: true, ler: () => { const f = useFinances.getState(); return f.recorrentes.map((r) => ({ descricao: r.descricao, valor: real(r.valor), dia: r.dia, frequencia: r.frequencia, ativa: r.ativa, categoria: nameValue(f.categorias, r.categoriaId), conta: nameValue(f.contas, r.contaId) })); } },
  metas_economia: { data: "prazo", financeira: true, ler: () => useFinances.getState().metasEconomia.map((m) => ({ nome: m.nome, guardado: real(m.guardado), alvo: real(m.alvo), prazo: m.prazo ?? null })) },
  divisoes: { data: "data", financeira: true, ler: () => { const f = useFinances.getState(); return f.divisoes.map((d) => ({ data: d.data, descricao: d.descricao, total: real(d.total), pagador: d.pagadorId === "eu" ? "usuário" : nameValue(f.pessoas, d.pagadorId), partes: d.partes.map((p) => ({ pessoa: p.pessoaId === "eu" ? "usuário" : nameValue(f.pessoas, p.pessoaId), valor: real(p.valor) })) })); } },
  listas_compras: { ler: () => useFinances.getState().listas.map((l) => ({ nome: l.nome, itens: l.itens.map((i) => ({ nome: i.nome, quantidade: i.quantidade, marcado: i.marcado })) })) },
  pomodoros: { data: "data", ler: () => { const e = useStudies.getState(); return usePomodoro.getState().sessoes.map((s) => ({ data: dayMoment(s.inicio), inicio: s.inicio, etapa: s.etapa, minutos: s.minutos, situacao: s.situacao, materia: nameValue(e.materias, s.materiaId) })); } },
  memoria: { data: "data", ler: () => useCommunication.getState().memoria.map((m) => ({ texto: m.texto, data: dayMoment(m.data) })) },
  conversas: { data: "data", ler: () => useCommunication.getState().conversas.map((c) => ({ titulo: c.titulo, data: dayMoment(c.atualizadaEm), mensagens: c.mensagens.length })) },
  conexoes: { ler: () => useCommunication.getState().conexoes.map((x) => ({ servico: x.id, ligada: x.ligada, status: x.status, resumo: x.resumo })) },
  eventos_conexao: { data: "data", ler: () => useCommunication.getState().eventosConexao.map((e) => ({ servico: e.servico, tipo: e.tipo, texto: e.texto, data: dayMoment(e.data) })) },
  uso_ia: { data: "data", ler: () => useCommunication.getState().usoIa.map((u) => ({ data: u.data, provedor: u.provedor, modelo: u.modelo, agente: u.agenteId, entrada: u.entrada, saida: u.saida })) },
};

const LIMIT_READ_AI = 20000;

function subjectsPeloName(nameValue: string) {
  const e = useStudies.getState();
  const target = normalizeText(nameValue);
  if (!target) return e.materias;
  const exact = e.materias.filter((m) => normalizeText(m.nome) === target);
  return exact.length ? exact : e.materias.filter((m) => normalizeText(m.nome).includes(target) || target.includes(normalizeText(m.nome)));
}

async function listFilesSubjects(a: Arguments): Promise<ResultTool> {
  const subjects = subjectsPeloName(text(a.materia, 80));
  if (subjects.length === 0) return { tipo: "erro", mensagem: T.chat.recursos.materiaNaoEncontrada };
  const list = await Promise.all(
    subjects.slice(0, 30).map(async (m) => ({
      materia: m.nome,
      arquivos: (await listFiles(m.id).catch(() => [])).slice(0, 60).map((x) => ({ id: x.id, nome: x.nome, tipo: x.extensao, tamanho_kb: Math.round(x.tamanho / 1024), enviado_em: dayMoment(x.criadoEm) })),
    })),
  );
  return { tipo: "dados", conteudo: list.filter((m) => m.arquivos.length > 0 || subjects.length === 1) };
}

async function readFileSubject(a: Arguments): Promise<ResultTool> {
  const request = normalizeText(text(a.arquivo, 200));
  if (!request) return { tipo: "erro", mensagem: T.chat.recursos.arquivoNaoEncontrado };
  for (const m of subjectsPeloName(text(a.materia, 80))) {
    const files = await listFiles(m.id).catch(() => []);
    const found = files.find((x) => x.id === text(a.arquivo, 80)) ?? files.find((x) => normalizeText(x.nome) === request) ?? files.find((x) => normalizeText(x.nome).includes(request));
    if (!found) continue;
    try {
      const extracted = await extractText(await readContent(m.id, found.id), found.nome);
      return {
        tipo: "dados",
        conteudo: { materia: m.nome, arquivo: found.nome, origem: extracted.origem, paginas: extracted.paginas ?? null, recortado: extracted.texto.length > LIMIT_READ_AI, texto: extracted.texto.slice(0, LIMIT_READ_AI) },
      };
    } catch (e) {
      return { tipo: "erro", mensagem: messageRead(e, found.nome) ?? T.estudos.arquivos.leitura.leitura(found.nome) };
    }
  }
  return { tipo: "erro", mensagem: T.chat.recursos.arquivoNaoEncontrado };
}

const SERVICES_AI: ServiceId[] = ["stripe", "github", "vercel", "gmail", "agenda", "supabase", "cloudflare", "resend", "notion", "calcom", "n8n"];

function cardEmail(type: "rascunho" | "email", a: Arguments): ResultTool {
  if (!useCommunication.getState().conexoes.find((x) => x.id === "gmail")?.chaveSalva) return { tipo: "erro", mensagem: ERRORS.gmailDesconectado };
  const to = text(a.para, 200);
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(to)) return { tipo: "erro", mensagem: ERRORS.emailInvalido };
  return { tipo: "confirmar", agente: "organizador", cartao: { tipo: type, situacao: "pendente", dados: { para: to, assunto: text(a.assunto, 300), corpo: text(a.corpo, 8000) } } };
}

const TOOLS: ToolNiko[] = [
  {
    definicao: { nome: "ler_pomodoro", descricao: T.chat.recursos.pomodoroDescricao, parametros: { type: "object", properties: {} } },
    executar: () => ({ tipo: "dados", conteudo: readPomodoro(), textoVerificado: textPomodoro() }),
  },
  {
    definicao: { nome: "controlar_pomodoro", descricao: T.chat.recursos.controleDescricao, parametros: { type: "object", properties: { acao: { type: "string", enum: ["pausar", "continuar", "encerrar"] } }, required: ["acao"] } },
    executar: (a) => controlPomodoro(text(a.acao, 20)),
  },
  {
    definicao: { nome: "listar_capacidades", descricao: T.chat.recursos.capacidadesDescricao, parametros: { type: "object", properties: {} } },
    executar: () => ({ tipo: "dados", conteudo: { ferramentas: definitionsTools(), limites: T.chat.recursos.capacidadesLimites, modelo: T.chat.recursos.capacidadesModelo }, textoVerificado: textCapabilitiesSummary() }),
  },
  {
    definicao: { nome: "ler_relatorio_semanal", descricao: T.chat.recursos.relatorioDescricao, parametros: { type: "object", properties: {} } },
    executar: () => {
      const report = generateReportWeekly();
      return { tipo: "dados", conteudo: report, textoVerificado: textReportWeekly(report) };
    },
  },
  {
    definicao: {
      nome: "consultar_banco",
      descricao: `Lê qualquer parte do banco de dados do Niko. Áreas: ${Object.keys(AREAS_DATABASE).join(", ")}. Filtre por texto (busca) e por período (de, ate) quando fizer sentido. Valores em reais. Use para perguntas que as outras ferramentas ler_* não cobrem, como histórico, diário, anotações, cartões, links, transações antigas e sessões de foco.`,
      parametros: {
        type: "object",
        properties: {
          area: { type: "string", enum: Object.keys(AREAS_DATABASE) },
          busca: { type: "string", description: "Texto para filtrar, sem diferenciar acentos" },
          de: DATA,
          ate: DATA,
          limite: { type: "number", minimum: 1, maximum: 200 },
          contar: { type: "boolean", description: "Só devolve a quantidade de registros" },
        },
        required: ["area"],
      },
    },
    executar: (a) => {
      const nameArea = text(a.area, 40);
      const area = AREAS_DATABASE[nameArea];
      if (!area) return { tipo: "erro", mensagem: ERRORS.areaDesconhecida(areasAvailable().join(", ")) };
      const functionArea = FUNCTIONS.find((f) => PARTS[f].areasDoBanco.includes(nameArea) && !functionEnabled(f));
      if (functionArea) return { tipo: "erro", mensagem: noticeFunctionDisabled(functionArea) };
      if (area.financeira && useConfig.getState().nuncaFinanceiro) return { tipo: "erro", mensagem: T.chat.ferramentas.financeiroBloqueado };
      const search = normalizeText(text(a.busca, 80));
      const from = isValidDate(a.de);
      const until = isValidDate(a.ate);
      let list = area.ler();
      if (search) list = list.filter((r) => normalizeText(JSON.stringify(r)).includes(search));
      if (area.data && (from || until)) {
        const field = area.data;
        list = list.filter((r) => {
          const v = typeof r[field] === "string" ? String(r[field]).slice(0, 10) : "";
          return v && (!from || v >= from) && (!until || v <= until);
        });
      }
      if (area.data) list.sort((x, y) => String(y[area.data!] ?? "").localeCompare(String(x[area.data!] ?? "")));
      const total = list.length;
      if (a.contar) return { tipo: "dados", conteudo: { total } };
      const limit = Math.max(1, Math.min(200, Math.round(Number(a.limite) || 50)));
      return { tipo: "dados", conteudo: { total, mostrando: Math.min(total, limit), registros: list.slice(0, limit) } };
    },
  },
  {
    definicao: {
      nome: "ler_computador",
      descricao: "Informações do computador do usuário: sistema, processador, memória, discos, bateria, rede Wi-Fi, Bluetooth, tempo ligado e os programas que mais usam memória e processador agora.",
      parametros: { type: "object", properties: {} },
    },
    assincrona: async () => {
      const r = await system.computador();
      return { tipo: "dados", conteudo: r };
    },
    executar: () => ({ tipo: "erro", mensagem: "assíncrona" }),
  },
  {
    definicao: {
      nome: "ler_tarefas",
      descricao: "Lista as tarefas de um dia (padrão: hoje) com id, título, status e hora. Inclui atrasadas quando o dia é hoje.",
      parametros: { type: "object", properties: { data: DATA, incluir_concluidas: { type: "boolean" } } },
    },
    executar: (a) => {
      const today = todayISO();
      const day = isValidDate(a.data) ?? today;
      const tasks = useRoutine.getState().tarefas;
      const dailyItems = tasksDay(tasks, day);
      const overdue = day === today ? tasks.filter((t) => t.data && t.data < today && t.status !== "concluida" && t.status !== "cancelada") : [];
      const list = [...dailyItems, ...overdue.filter((t) => !dailyItems.includes(t))].filter((t) => a.incluir_concluidas || (t.status !== "concluida" && t.status !== "cancelada"));
      return { tipo: "dados", conteudo: list.slice(0, 40).map((t) => ({ id: t.id, titulo: t.titulo, status: t.status, data: t.data ?? null, hora: t.hora ?? null, prioridade: t.prioridade })) };
    },
  },
  {
    definicao: {
      nome: "ler_agenda",
      descricao: "Lista eventos, lembretes e tarefas com data entre duas datas (padrão: hoje até 7 dias).",
      parametros: { type: "object", properties: { inicio: DATA, fim: DATA } },
    },
    executar: (a) => {
      const start = isValidDate(a.inicio) ?? todayISO();
      const end = isValidDate(a.fim) ?? sumDays(start, 7);
      const events = useOrganization.getState().eventos.filter((e) => e.repeticao !== "nenhuma" || (e.data >= start && e.data <= end));
      const tasks = useRoutine.getState().tarefas.filter((t) => t.data && t.data >= start && t.data <= end && t.status !== "cancelada");
      return {
        tipo: "dados",
        conteudo: {
          eventos: events.slice(0, 40).map((e) => ({ titulo: e.titulo, data: e.data, hora: e.hora ?? null, tipo: e.tipo, repete: e.repeticao, feito_em: e.feitos ?? [] })),
          tarefas: tasks.slice(0, 40).map((t) => ({ id: t.id, titulo: t.titulo, data: t.data, hora: t.hora ?? null, status: t.status })),
        },
      };
    },
  },
  {
    definicao: {
      nome: "ler_financas",
      descricao: "Resumo financeiro de um mês (padrão: atual): saldo das contas, entradas, saídas, gasto por categoria com orçamento e últimos lançamentos. Valores em reais.",
      parametros: { type: "object", properties: { mes: { type: "string", description: "Mês no formato AAAA-MM" } } },
    },
    executar: (a) => {
      if (useConfig.getState().nuncaFinanceiro) return { tipo: "erro", mensagem: T.chat.ferramentas.financeiroBloqueado };
      const fin = useFinances.getState();
      const month = /^\d{4}-\d{2}$/.test(text(a.mes, 7)) ? text(a.mes, 7) : todayISO().slice(0, 7);
      const byCategory = expenseByCategory(fin, month);
      return {
        tipo: "dados",
        conteudo: {
          mes: month,
          contas: fin.contas.filter((c) => !c.arquivada).map((c) => ({ nome: c.nome, tipo: c.tipo, saldo: real(balanceAccount(fin, c.id)) })),
          entradas: real(sumBy(incomeMonth(fin, month), (t) => t.valor)),
          saidas: real(sumBy(expensesMonth(fin, month), (t) => partUser(t, fin.divisoes))),
          categorias: fin.categorias
            .filter((c) => c.tipo === "despesa" && (byCategory.get(c.id) || c.orcamento))
            .map((c) => ({ nome: c.nome, gasto: real(byCategory.get(c.id) ?? 0), orcamento: real(c.orcamento) })),
          categorias_disponiveis: {
            despesa: fin.categorias.filter((c) => c.tipo === "despesa").map((c) => c.nome),
            receita: fin.categorias.filter((c) => c.tipo === "receita").map((c) => c.nome),
          },
          ultimos: [...fin.transacoes].filter((t) => t.data.startsWith(month)).sort((x, y) => y.data.localeCompare(x.data)).slice(0, 12).map((t) => ({ data: t.data, tipo: t.tipo, valor: real(t.valor), descricao: t.descricao })),
          metas_economia: fin.metasEconomia.map((m) => ({ nome: m.nome, guardado: real(m.guardado), alvo: real(m.alvo), prazo: m.prazo ?? null })),
        },
      };
    },
  },
  {
    definicao: {
      nome: "ler_estudos",
      descricao: "Matérias, revisões pendentes hoje e próximas provas e entregas.",
      parametros: { type: "object", properties: {} },
    },
    executar: () => {
      const e = useStudies.getState();
      const today = todayISO();
      return {
        tipo: "dados",
        conteudo: {
          materias: e.materias.map((m) => ({ nome: m.nome, area: e.areas.find((x) => x.id === m.areaId)?.nome ?? "" })),
          revisoes_hoje: reviewsToToday(e),
          proximas_datas: e.datas.filter((d) => !d.concluida && d.data >= today).sort((x, y) => x.data.localeCompare(y.data)).slice(0, 10).map((d) => ({ titulo: d.titulo, tipo: d.tipo, data: d.data, materia: e.materias.find((m) => m.id === d.materiaId)?.nome ?? "" })),
        },
      };
    },
  },
  {
    definicao: {
      nome: "listar_arquivos",
      descricao: T.chat.recursos.listarArquivosDescricao,
      parametros: { type: "object", properties: { materia: { type: "string", description: T.chat.recursos.parametroMateria } } },
    },
    executar: () => ({ tipo: "erro", mensagem: T.chat.recursos.soAssincrona }),
    assincrona: listFilesSubjects,
  },
  {
    definicao: {
      nome: "ler_arquivo",
      descricao: T.chat.recursos.lerArquivoDescricao,
      parametros: { type: "object", properties: { materia: { type: "string", description: T.chat.recursos.parametroMateria }, arquivo: { type: "string", description: T.chat.recursos.parametroArquivo } }, required: ["arquivo"] },
    },
    executar: () => ({ tipo: "erro", mensagem: T.chat.recursos.soAssincrona }),
    assincrona: readFileSubject,
  },
  {
    definicao: {
      nome: "ler_habitos",
      descricao: "Hábitos ativos com id, meta e se já foram cumpridos no dia (padrão: hoje).",
      parametros: { type: "object", properties: { data: DATA } },
    },
    executar: (a) => {
      const r = useRoutine.getState();
      const day = isValidDate(a.data) ?? todayISO();
      return {
        tipo: "dados",
        conteudo: r.habitos.filter((h) => !h.arquivado).map((h) => ({ id: h.id, nome: h.nome, tipo: h.tipo, meta: h.meta, unidade: h.unidade, feito: r.registros[day]?.[h.id] ?? 0, cumprido: habitCompleted(h, r.registros[day]?.[h.id]) })),
      };
    },
  },
  {
    definicao: {
      nome: "ler_metas",
      descricao: "Metas do usuário com progresso atual, alvo e prazo.",
      parametros: { type: "object", properties: {} },
    },
    executar: () => {
      const o = useOrganization.getState();
      return { tipo: "dados", conteudo: o.metas.map((m) => ({ nome: m.nome, pilar: o.pilares.find((p) => p.id === m.pilarId)?.nome ?? "", atual: m.atual, alvo: m.alvo, prazo: m.prazo ?? null, periodo: m.periodo })) };
    },
  },
  {
    definicao: {
      nome: "ler_conexoes",
      descricao: "Estado das conexões (Stripe, GitHub, Vercel, n8n e outras) e os últimos eventos.",
      parametros: { type: "object", properties: {} },
    },
    executar: () => {
      const c = useCommunication.getState();
      return {
        tipo: "dados",
        conteudo: {
          conexoes: c.conexoes.map((x) => ({ servico: x.id, ligada: x.ligada, status: x.status, resumo: x.resumo, atualizada: x.ultimaAtualizacao ?? null })),
          eventos: c.eventosConexao.slice(0, 15).map((e) => ({ servico: e.servico, tipo: e.tipo, texto: e.texto, data: e.data })),
        },
      };
    },
  },
  {
    definicao: {
      nome: "ler_conexao",
      descricao: "Dados reais e detalhados de uma conexão ligada: Stripe (cobranças, saldo), GitHub (PRs, issues, Actions), Vercel (deploys), Gmail (não lidos, importantes), Google Agenda (eventos de hoje e dos próximos 7 dias), Supabase (projetos, usuários, storage, logs), Cloudflare (domínios, DNS, Pages, Workers, métricas), Resend, Notion, Cal.com e n8n.",
      parametros: { type: "object", properties: { servico: { type: "string", enum: SERVICES_AI } }, required: ["servico"] },
    },
    assincrona: async (a) => {
      const service = SERVICES_AI.find((s) => s === a.servico);
      if (!service) return { tipo: "erro", mensagem: ERRORS.servicoDesconhecido };
      const c = useCommunication.getState().conexoes.find((x) => x.id === service);
      if (!c?.chaveSalva) return { tipo: "erro", mensagem: ERRORS.servicoDesconectado(service) };
      try {
        const payload = await connectionsBridge.ler(service);
        return { tipo: "dados", conteudo: payload };
      } catch (e) {
        return { tipo: "erro", mensagem: (e as Error).message };
      }
    },
    executar: () => ({ tipo: "erro", mensagem: "assíncrona" }),
  },
  {
    definicao: {
      nome: "buscar_emails",
      descricao: "Busca e-mails no Gmail do usuário com a sintaxe de busca do Gmail (ex.: from:ana is:unread, subject:fatura, newer_than:7d).",
      parametros: { type: "object", properties: { busca: { type: "string" } }, required: ["busca"] },
    },
    assincrona: async (a) => {
      if (!useCommunication.getState().conexoes.find((x) => x.id === "gmail")?.chaveSalva) return { tipo: "erro", mensagem: ERRORS.gmailDesconectado };
      try {
        return { tipo: "dados", conteudo: await connectionsBridge.buscarEmails(text(a.busca, 300)) };
      } catch (e) {
        return { tipo: "erro", mensagem: (e as Error).message };
      }
    },
    executar: () => ({ tipo: "erro", mensagem: "assíncrona" }),
  },
  {
    definicao: {
      nome: "criar_rascunho_email",
      descricao: "Prepara um rascunho no Gmail. O usuário confirma antes de salvar.",
      parametros: { type: "object", properties: { para: { type: "string" }, assunto: { type: "string" }, corpo: { type: "string" } }, required: ["para", "assunto", "corpo"] },
    },
    executar: (a) => cardEmail("rascunho", a),
  },
  {
    definicao: {
      nome: "enviar_email",
      descricao: "Prepara o envio de um e-mail pelo Gmail. Sempre mostra um cartão e só envia quando o usuário confirma.",
      parametros: { type: "object", properties: { para: { type: "string" }, assunto: { type: "string" }, corpo: { type: "string" } }, required: ["para", "assunto", "corpo"] },
    },
    executar: (a) => cardEmail("email", a),
  },  {
    definicao: {
      nome: "abrir_tela",
      descricao: "Abre uma tela do Niko para o usuário.",
      parametros: { type: "object", properties: { tela: { type: "string", enum: SCREENS } }, required: ["tela"] },
    },
    executar: (a) => {
      const screenValue = SCREENS.find((t) => t === a.tela && routeEnabled(t));
      if (!screenValue) return { tipo: "erro", mensagem: ERRORS.telaDesconhecida };
      useInterface.getState().navigateTo(screenValue);
      return { tipo: "dados", conteudo: { aberta: screenValue }, resumo: T.chat.ferramentas.abriu(T.rotas[screenValue]) };
    },
  },
  {
    definicao: {
      nome: "iniciar_pomodoro",
      descricao: "Começa um foco (pomodoro) agora. Use só quando o usuário pedir para focar ou estudar agora.",
      parametros: { type: "object", properties: { minutos: { type: "number", minimum: 1, maximum: 180 }, materia: { type: "string" } } },
    },
    executar: (a) => {
      const minutes = a.minutos === undefined ? useConfig.getState().pomodoro.foco : Number(a.minutos);
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180) return { tipo: "erro", mensagem: T.chat.recursos.minutosInvalidos };
      const subject = findByName(useStudies.getState().materias, text(a.materia, 80) || undefined);
      if (text(a.materia) && !subject) return { tipo: "erro", mensagem: T.chat.recursos.materiaInvalida };
      const p = usePomodoro.getState();
      if (p.inicioEtapa || p.rodando || p.restanteMs !== null) return { tipo: "erro", mensagem: T.chat.recursos.timerAtivo };
      p.selectStage("foco");
      p.setLink(subject?.id);
      p.start(minutes);
      void useAgents.getState().trabalhar("organizador", T.chat.respostas.pomodoro(minutes, subject?.nome ?? ""), 300);
      return { tipo: "dados", conteudo: { iniciado: true, minutos: minutes }, resumo: T.chat.respostas.pomodoro(minutes, subject?.nome ?? "") };
    },
  },
  {
    definicao: {
      nome: "criar_tarefa",
      descricao: "Prepara uma tarefa. O usuário confirma antes de salvar.",
      parametros: { type: "object", properties: { titulo: { type: "string" }, data: DATA, hora: TIME }, required: ["titulo"] },
    },
    executar: (a) => {
      const title = text(a.titulo);
      if (!title) return { tipo: "erro", mensagem: ERRORS.semTitulo };
      return { tipo: "confirmar", agente: "organizador", cartao: { tipo: "tarefa", situacao: "pendente", dados: { titulo: title, data: isValidDate(a.data) ?? "", hora: isValidTime(a.hora) ?? "" } } };
    },
  },
  {
    definicao: {
      nome: "concluir_tarefa",
      descricao: "Prepara a conclusão de uma tarefa pelo id (pegue o id com ler_tarefas). O usuário confirma.",
      parametros: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
    executar: (a) => {
      const task = useRoutine.getState().tarefas.find((t) => t.id === a.id);
      if (!task) return { tipo: "erro", mensagem: ERRORS.tarefaNaoEncontrada };
      return { tipo: "confirmar", agente: "organizador", cartao: { tipo: "concluir", situacao: "pendente", dados: { id: task.id, titulo: task.titulo } } };
    },
  },
  {
    definicao: {
      nome: "criar_lembrete",
      descricao: "Prepara um lembrete com data e hora, que pode se repetir. O usuário confirma.",
      parametros: { type: "object", properties: { titulo: { type: "string" }, data: DATA, hora: TIME, repeticao: RECURRENCE }, required: ["titulo", "data"] },
    },
    executar: (a) => {
      const title = text(a.titulo);
      const data = isValidDate(a.data);
      if (!title || !data) return { tipo: "erro", mensagem: ERRORS.semTituloOuData };
      return { tipo: "confirmar", agente: "organizador", cartao: { tipo: "lembrete", situacao: "pendente", dados: { titulo: title, data, hora: isValidTime(a.hora) ?? "", ...recurrenceValid(a.repeticao) } } };
    },
  },
  {
    definicao: {
      nome: "criar_evento",
      descricao: "Prepara um evento no calendário, que pode se repetir (ex.: bater o ponto todo dia às 12:00 vira repeticao diaria, data de hoje, hora 12:00). O usuário confirma.",
      parametros: { type: "object", properties: { titulo: { type: "string" }, data: DATA, hora: TIME, repeticao: RECURRENCE }, required: ["titulo", "data"] },
    },
    executar: (a) => {
      const title = text(a.titulo);
      const data = isValidDate(a.data);
      if (!title || !data) return { tipo: "erro", mensagem: ERRORS.semTituloOuData };
      return { tipo: "confirmar", agente: "organizador", cartao: { tipo: "evento", situacao: "pendente", dados: { titulo: title, data, hora: isValidTime(a.hora) ?? "", ...recurrenceValid(a.repeticao) } } };
    },
  },
  {
    definicao: {
      nome: "concluir_evento",
      descricao: "Prepara marcar um evento do calendário como feito num dia (ex.: a reunião de hoje já aconteceu). Use o título do evento, como aparece em ler_agenda. Data padrão: hoje. O usuário confirma.",
      parametros: { type: "object", properties: { titulo: { type: "string" }, data: DATA }, required: ["titulo"] },
    },
    executar: (a) => {
      const data = isValidDate(a.data) ?? todayISO();
      const dailyItems = useOrganization.getState().eventos.filter((e) => occurrences(e, data, data).length > 0);
      const eventValue = findByName(dailyItems.map((e) => ({ ...e, nome: e.titulo })), text(a.titulo, 120));
      if (!eventValue) return { tipo: "erro", mensagem: ERRORS.eventoNaoEncontrado };
      return { tipo: "confirmar", agente: "organizador", cartao: { tipo: "eventoFeito", situacao: "pendente", dados: { id: eventValue.id, titulo: eventValue.titulo, data } } };
    },
  },
  {
    definicao: {
      nome: "criar_habito",
      descricao: "Prepara um hábito novo para marcar como feito todo dia no Journal. Use quando a pessoa quer acompanhar algo diário com check (ex.: beber água, bater o ponto). Hora opcional: avisa nesse horário se ainda não foi feito. Meta acima de 1 vira hábito de quantidade. O usuário confirma.",
      parametros: { type: "object", properties: { nome: { type: "string" }, hora: TIME, meta: { type: "integer", minimum: 1, maximum: 1000 }, unidade: { type: "string" } }, required: ["nome"] },
    },
    executar: (a) => {
      const nameValue = text(a.nome, 60);
      if (!nameValue) return { tipo: "erro", mensagem: ERRORS.semTitulo };
      const goal = Math.min(1000, Math.max(1, Math.round(Number(a.meta) || 1)));
      return { tipo: "confirmar", agente: "organizador", cartao: { tipo: "novoHabito", situacao: "pendente", dados: { nome: nameValue, hora: isValidTime(a.hora) ?? "", meta: goal, unidade: text(a.unidade, 20) } } };
    },
  },
  {
    definicao: {
      nome: "lancar_transacao",
      descricao:
        "Prepara um gasto ou uma receita. Valor em reais. O usuário confirma antes de salvar. Todo lançamento precisa de categoria: use o nome exato de uma categoria existente (veja categorias_disponiveis em ler_financas). Se o usuário não disse a categoria e ela não é óbvia pela descrição, NÃO chame ainda: pergunte em qual categoria vai, sugerindo as existentes ou a criação de uma nova. Um nome que ainda não existe vira uma categoria nova quando o usuário confirmar.",
      parametros: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["despesa", "receita"] },
          valor: { type: "number", minimum: 0.01 },
          descricao: { type: "string" },
          categoria: { type: "string", description: "Nome da categoria existente, ou o nome da nova categoria que o usuário pediu" },
          conta: { type: "string" },
          data: DATA,
        },
        required: ["tipo", "valor", "descricao", "categoria"],
      },
    },
    executar: (a) => {
      const fin = useFinances.getState();
      fin.ensureCategories();
      const value = Math.round(Number(a.valor) * 100);
      if (!Number.isFinite(value) || value <= 0) return { tipo: "erro", mensagem: ERRORS.valorInvalido };
      const accounts = fin.contas.filter((c) => !c.arquivada);
      if (accounts.length === 0) return { tipo: "erro", mensagem: T.chat.respostas.semConta };
      const type = a.tipo === "receita" ? "receita" : "gasto";
      const description = text(a.descricao, 120) || (type === "gasto" ? T.financas.tipos.despesa : T.financas.tipos.receita);
      const categories = useFinances.getState().categorias.filter((c) => c.tipo === (type === "gasto" ? "despesa" : "receita"));
      const account = findByName(accounts, text(a.conta, 60) || undefined) ?? accounts[0];
      return { tipo: "confirmar", agente: "operador", cartao: { tipo: type, situacao: "pendente", dados: { valor: value, descricao: description, ...dataCategory(categories, text(a.categoria, 60) || undefined, description), contaId: account.id, data: isValidDate(a.data) ?? todayISO() } } };
    },
  },
  {
    definicao: {
      nome: "marcar_habito",
      descricao: "Prepara o registro de um hábito feito (pegue o id com ler_habitos). O usuário confirma.",
      parametros: { type: "object", properties: { id: { type: "string" }, valor: { type: "number" }, data: DATA }, required: ["id"] },
    },
    executar: (a) => {
      const r = useRoutine.getState();
      const habit = r.habitos.find((h) => h.id === a.id) ?? findByName(r.habitos.filter((h) => !h.arquivado), text(a.id, 60));
      if (!habit) return { tipo: "erro", mensagem: ERRORS.habitoNaoEncontrado };
      const data = isValidDate(a.data) ?? todayISO();
      const value = habit.tipo === "sim_nao" ? 1 : Math.max(1, Math.round(Number(a.valor) || habit.meta));
      return { tipo: "confirmar", agente: "organizador", cartao: { tipo: "habito", situacao: "pendente", dados: { id: habit.id, nome: habit.nome, valor: value, data } } };
    },
  },
  {
    definicao: {
      nome: "adicionar_compras",
      descricao: "Prepara itens para a lista de compras. O usuário confirma.",
      parametros: { type: "object", properties: { itens: { type: "array", items: { type: "string" } } }, required: ["itens"] },
    },
    executar: (a) => {
      const items = (Array.isArray(a.itens) ? a.itens : []).map((i) => text(i, 80)).filter(Boolean).slice(0, 30);
      if (items.length === 0) return { tipo: "erro", mensagem: ERRORS.semItens };
      return { tipo: "confirmar", agente: "operador", cartao: { tipo: "compra", situacao: "pendente", dados: { itens: items } } };
    },
  },
  {
    definicao: {
      nome: "lembrar_fato",
      descricao: "Prepara um fato para a memória do time (algo que o usuário quer que vocês lembrem). O usuário confirma.",
      parametros: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] },
    },
    executar: (a) => {
      const fact = text(a.texto, 300);
      if (!fact) return { tipo: "erro", mensagem: ERRORS.semTexto };
      return { tipo: "confirmar", agente: "organizador", cartao: { tipo: "memoria", situacao: "pendente", dados: { texto: fact } } };
    },
  },
];

function areasAvailable(): string[] {
  return Object.keys(AREAS_DATABASE).filter((a) => areaDatabaseEnabled(a));
}

function definitionCurrent(f: ToolAi): ToolAi {
  if (f.nome === "abrir_tela") {
    const parameters = f.parametros as { properties: Record<string, unknown> };
    return { ...f, parametros: { ...parameters, properties: { ...parameters.properties, tela: { type: "string", enum: SCREENS.filter((t) => routeEnabled(t)) } } } };
  }
  if (f.nome !== "consultar_banco") return f;
  const areas = areasAvailable();
  const parameters = f.parametros as { properties: Record<string, unknown> };
  return {
    ...f,
    descricao: f.descricao.replace(Object.keys(AREAS_DATABASE).join(", "), areas.join(", ")),
    parametros: { ...parameters, properties: { ...parameters.properties, area: { type: "string", enum: areas } } },
  };
}

export function definitionsTools(): ToolAi[] {
  const financialBlocked = useConfig.getState().nuncaFinanceiro;
  const gmailConnected = useCommunication.getState().conexoes.some((c) => c.id === "gmail" && c.chaveSalva);
  return TOOLS.map((f) => definitionCurrent(f.definicao)).filter((f) => {
    if (financialBlocked && f.nome === "ler_financas") return false;
    if (!gmailConnected && ["buscar_emails", "criar_rascunho_email", "enviar_email"].includes(f.nome)) return false;
    if (!toolEnabled(f.nome)) return false;
    return true;
  });
}

export function textCapabilities(): string {
  const S = T.chat.recursos;
  const tools = definitionsTools().map((f) => `- ${f.nome}: ${f.descricao}`);
  return [S.capacidadesIntroducao, tools.join("\n"), S.capacidadesModelo, S.capacidadesLimites, ...(useConfig.getState().nuncaFinanceiro ? [S.capacidadesPrivacidade] : []), S.capacidadesComandos].join("\n\n");
}

export function textCapabilitiesSummary(): string {
  const R = T.chat.recursos.resumoCapacidades;
  const names = new Set(definitionsTools().map((f) => f.nome));
  const queries = [
    ["ler_tarefas", "tarefas"], ["ler_agenda", "agenda"], ["ler_habitos", "habitos"], ["ler_metas", "metas"], ["ler_estudos", "estudos"], ["ler_pomodoro", "pomodoro"],
    ["ler_financas", "financas"], ["ler_conexoes", "conexoes"], ["buscar_emails", "emails"], ["ler_computador", "computador"],
  ].filter(([f]) => names.has(f)).map(([, c]) => R.consultas[c]);
  const actions = [
    ["criar_tarefa", "tarefa"], ["criar_evento", "agenda"], ["lancar_transacao", "financas"], ["marcar_habito", "habito"], ["adicionar_compras", "compras"], ["criar_rascunho_email", "email"], ["iniciar_pomodoro", "foco"],
  ].filter(([f]) => names.has(f)).map(([, c]) => R.acoes[c]);
  const list = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} e ${items.at(-1)}` : items.join(""));
  return [
    R.titulo,
    R.consultar(list(queries)),
    R.fazer(list(actions)),
    ...(names.has("ler_arquivo") ? [R.arquivos] : []),
    R.semIa,
    [R.limites, ...(useConfig.getState().nuncaFinanceiro ? [R.financeiroBloqueado] : [])].join(" "),
  ].join("\n\n");
}

export async function executeTool(nameValue: string, args: Arguments): Promise<ResultTool> {
  const tool = TOOLS.find((f) => f.definicao.nome === normalizeText(nameValue));
  if (!tool) return { tipo: "erro", mensagem: ERRORS.ferramentaDesconhecida(nameValue) };
  const disabled = FUNCTIONS.find((f) => PARTS[f].ferramentasIa.includes(tool.definicao.nome) && !functionEnabled(f));
  if (disabled) return { tipo: "erro", mensagem: noticeFunctionDisabled(disabled) };
  try {
    if (tool.assincrona) return await tool.assincrona(args ?? {});
    return tool.executar(args ?? {});
  } catch (e) {
    return { tipo: "erro", mensagem: (e as Error).message };
  }
}
