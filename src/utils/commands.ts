import type { AgentId, CardConfirmation, Recurrence } from "../types";
import { extractRecurrence } from "./calendarItems";
import { T } from "../i18n/ptBR";
import { interpretWhen } from "./language";
import { readValueAtCents, formatMoney } from "./money";
import { normalizeText, urlSafe } from "./basics";
import { formatDateString, todayISO } from "./dates";
import { useRoutine, tasksDay, habitCompleted } from "../state/routine";
import { useFinances, expensesMonth, partUser, EU } from "../state/finances";
import { useStudies, reviewsToToday } from "../state/studies";
import { usePomodoro } from "../state/pomodoro";
import { useConfig } from "../state/settings";
import { useOrganization } from "../state/organization";
import { useCommunication } from "../state/communication";
import { connectionsBridge } from "../bridge/liveConnections";
import { useAgents } from "../state/agents";
import { useInterface } from "../state/interface";
import { sumBy } from "./basics";
import { controlPomodoro, textPomodoro } from "./chatFeatures";
import { noticeFunctionDisabled, commandAvailable, functionCard, functionCommand, functionEnabled } from "./features";

export interface ResultCommand {
  agente: AgentId;
  resposta: string;
  confirmacao?: CardConfirmation;
  ok: boolean;
}

const OWNER: Record<string, AgentId> = {
  tarefa: "organizador",
  pomodoro: "organizador",
  lembrete: "organizador",
  lembrar: "organizador",
  status: "organizador",
  ajuda: "organizador",
  revisar: "tutor",
  link: "tutor",
  gasto: "operador",
  receita: "operador",
  compra: "operador",
  dividir: "operador",
};

export function ownerCommand(text: string): AgentId | null {
  const m = /^\/(\w+)/.exec(text.trim());
  if (!m) return null;
  return OWNER[normalizeText(m[1])] ?? null;
}

function extractMarkers(text: string) {
  const category = /#([\p{L}\d_-]+)/u.exec(text)?.[1];
  const account = /@([\p{L}\d_-]+)/u.exec(text)?.[1];
  const clean = text.replace(/[#@][\p{L}\d_-]+/gu, " ").replace(/\s+/g, " ").trim();
  return { categoria: category, conta: account, limpo: clean };
}

export function findByName<T extends { id: string; nome: string }>(list: T[], nameValue?: string): T | undefined {
  if (!nameValue) return undefined;
  const target = normalizeText(nameValue);
  return list.find((x) => normalizeText(x.nome) === target) ?? list.find((x) => normalizeText(x.nome).startsWith(target));
}

const WORDS_CATEGORY: [string, RegExp][] = [
  ["Mercado", /\b(mercado|supermercado|feira|atacad\w*|hortifruti|sacolao)\b/],
  ["Alimentação", /\b(ifood|lanche|almoco|janta\w*|pizza|restaurante|padaria|cafe|hamburguer\w*|comida|acai|sorvete|delivery)\b/],
  ["Transporte", /\b(uber|99|onibus|metro|gasolina|combustivel|estacionamento|pedagio|taxi|passagem|bilhete)\b/],
  ["Moradia", /\b(aluguel|condominio|luz|energia|agua|internet|gas|iptu)\b/],
  ["Saúde", /\b(farmacia|remedio|medico|consulta|dentista|exame|academia|plano de saude)\b/],
  ["Assinaturas", /\b(netflix|spotify|prime|youtube|disney|hbo|max|assinatura|icloud|chatgpt|claude)\b/],
  ["Educação", /\b(curso|livro|faculdade|escola|mensalidade|apostila|udemy|alura)\b/],
  ["Lazer", /\b(cinema|show|jogo|bar|balada|viagem|ingresso|steam)\b/],
  ["Salário", /\b(salario|pagamento|holerite)\b/],
];

export function categoryPelaDescription<C extends { id: string; nome: string }>(categories: C[], description: string): C | undefined {
  const target = normalizeText(description);
  const pelaWord = categories.find((c) => new RegExp(`\\b${normalizeText(c.nome).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(target));
  if (pelaWord) return pelaWord;
  const rule = WORDS_CATEGORY.find(([, defaultValue]) => defaultValue.test(target));
  return rule ? categories.find((c) => normalizeText(c.nome) === normalizeText(rule[0])) : undefined;
}

export function typeCategoryCard(c: CardConfirmation): "despesa" | "receita" | null {
  if (c.tipo === "gasto" || c.tipo === "dividir") return "despesa";
  if (c.tipo === "receita") return "receita";
  return null;
}

function categoryCard(c: CardConfirmation) {
  const type = typeCategoryCard(c);
  return useFinances.getState().categorias.find((x) => x.id === c.dados.categoriaId && x.tipo === type);
}

export function missingCategory(c: CardConfirmation): boolean {
  if (!typeCategoryCard(c)) return false;
  return !categoryCard(c) && !String(c.dados.novaCategoria ?? "").trim();
}

function resolveCategory(c: CardConfirmation): string | undefined {
  const type = typeCategoryCard(c);
  if (!type) return undefined;
  const existing = categoryCard(c);
  if (existing) return existing.id;
  const newItem = String(c.dados.novaCategoria ?? "").trim().slice(0, 40);
  return newItem ? useFinances.getState().getOrCreateCategory(newItem, type).id : undefined;
}

export function dataCategory<C extends { id: string; nome: string }>(categories: C[], requested: string | undefined, description: string) {
  const fin = useFinances.getState();
  const cat = findByName(categories, requested) ?? categories.find((c) => c.id === fin.categorizar(description)) ?? categoryPelaDescription(categories, description);
  if (cat) return { categoriaId: cat.id, novaCategoria: "" };
  return { categoriaId: "", novaCategoria: requested?.replace(/[_-]+/g, " ").trim().slice(0, 40) ?? "" };
}

function clearDescription(text: string): string {
  return text
    .replace(/^(?:(?:um|uma|uns|umas|o|a|os|as)\s+)+/i, "")
    .replace(/\s+(?:de|do|da|por|no|na|com|pra|para)$/i, "")
    .trim();
}

function prepareEntry(type: "gasto" | "receita", args: string): ResultCommand {
  const fin = useFinances.getState();
  fin.ensureCategories();
  const { categoria: category, conta: account, limpo: clean } = extractMarkers(args);
  const [valueText, ...rest] = clean.split(" ");
  const value = readValueAtCents(valueText ?? "");
  if (value == null || value <= 0) return { agente: "operador", resposta: T.chat.respostas.faltaValor, ok: false };
  const accounts = fin.contas.filter((c) => !c.arquivada);
  if (accounts.length === 0) return { agente: "operador", resposta: T.chat.respostas.semConta, ok: false };
  const when = interpretWhen(rest.join(" "));
  const description = (clearDescription(when.resto) || (type === "gasto" ? T.financas.tipos.despesa : T.financas.tipos.receita)).slice(0, 120);
  const categories = useFinances.getState().categorias.filter((c) => c.tipo === (type === "gasto" ? "despesa" : "receita"));
  const accountSelected = findByName(accounts, account) ?? accounts[0];
  return {
    agente: "operador",
    resposta: type === "gasto" ? T.chat.respostas.gastoConferir : T.chat.respostas.receitaConferir,
    ok: true,
    confirmacao: {
      tipo: type,
      situacao: "pendente",
      dados: {
        valor: value,
        descricao: description,
        ...dataCategory(categories, category, description),
        contaId: accountSelected.id,
        data: when.data ?? todayISO(),
      },
    },
  };
}

function prepareSplit(args: string): ResultCommand {
  const fin = useFinances.getState();
  const parts = /^([\d.,]+)\s+(.*?)\s+com\s+(.+)$/i.exec(args.trim());
  if (!parts) return { agente: "operador", resposta: T.chat.respostas.faltaPessoas, ok: false };
  const value = readValueAtCents(parts[1]);
  if (value == null || value <= 0) return { agente: "operador", resposta: T.chat.respostas.faltaValor, ok: false };
  const names = parts[3].split(/,|\se\s/).map((n) => n.trim()).filter(Boolean).slice(0, 12);
  if (names.length === 0) return { agente: "operador", resposta: T.chat.respostas.faltaPessoas, ok: false };
  const accounts = fin.contas.filter((c) => !c.arquivada);
  return {
    agente: "operador",
    resposta: T.chat.respostas.dividirConferir,
    ok: true,
    confirmacao: {
      tipo: "dividir",
      situacao: "pendente",
      dados: {
        valor: value,
        descricao: parts[2].slice(0, 120),
        pessoas: names,
        ...dataCategory(fin.categorias.filter((c) => c.tipo === "despesa"), undefined, parts[2]),
        contaId: accounts[0]?.id ?? "",
        data: todayISO(),
      },
    },
  };
}

function withoutConnectors(text: string): string {
  return text.replace(/^(?:(?:de|que|para|pra|pro|o|a)\s+)+/i, "").trim();
}

function recurrenceCard(value: unknown): Recurrence {
  return value === "diaria" || value === "semanal" || value === "mensal" ? value : "nenhuma";
}

function describeWithRecurrence(when: string, recurrence: Recurrence): string {
  return recurrence === "nenhuma" ? when : `${when}, ${T.calendario.repeticoes[recurrence].toLowerCase()}`;
}

export function nameCategoryCard(c: CardConfirmation): string {
  const newItem = String(c.dados.novaCategoria ?? "").trim();
  return categoryCard(c)?.nome ?? (newItem ? T.chat.respostas.categoriaNova(newItem) : T.financas.semCategoria);
}

export function linesConfirmation(c: CardConfirmation): [string, string][] {
  const d = c.dados;
  const R = T.chat.rotulos;
  const when = (): [string, string][] => [
    [R.data, d.data ? formatDateString(String(d.data), "EEE, d 'de' MMM") : T.geral.semData],
    ...(d.hora ? ([[R.hora, String(d.hora)]] as [string, string][]) : []),
  ];
  const fin = useFinances.getState();
  switch (c.tipo) {
    case "tarefa":
      return [[R.titulo, String(d.titulo)], ...when()];
    case "lembrete":
    case "evento": {
      const recurrence = recurrenceCard(d.repeticao);
      return [[R.titulo, String(d.titulo)], ...when(), ...(recurrence !== "nenhuma" ? ([[R.repete, T.calendario.repeticoes[recurrence]]] as [string, string][]) : [])];
    }
    case "novoHabito":
      return [[R.habito, String(d.nome)], ...(d.hora ? ([[R.hora, String(d.hora)]] as [string, string][]) : []), ...(Number(d.meta) > 1 ? ([[R.meta, `${d.meta} ${d.unidade ?? ""}`.trim()]] as [string, string][]) : [])];
    case "concluir":
      return [[R.tarefa, String(d.titulo)]];
    case "eventoFeito":
      return [[R.titulo, String(d.titulo)], [R.data, formatDateString(String(d.data), "EEE, d 'de' MMM")]];
    case "habito":
      return [[R.habito, String(d.nome)], ...(Number(d.valor) > 1 ? ([[R.valor, String(d.valor)]] as [string, string][]) : []), [R.data, formatDateString(String(d.data), "d 'de' MMM")]];
    case "compra":
      return [[R.itens, (d.itens as string[]).join(", ")]];
    case "memoria":
      return [[R.fato, String(d.texto)]];
    case "rascunho":
    case "email":
      return [[R.para, String(d.para)], [R.assunto, String(d.assunto)], [R.corpo, String(d.corpo).slice(0, 400)]];
    case "gasto":
    case "receita":
      return [
        [R.valor, formatMoney(Number(d.valor))],
        [R.descricao, String(d.descricao)],
        [R.categoria, nameCategoryCard(c)],
        [R.conta, fin.contas.find((x) => x.id === d.contaId)?.nome ?? ""],
        [R.data, formatDateString(String(d.data), "d 'de' MMM")],
      ];
    default: {
      const people = (d.pessoas as string[]) ?? [];
      return [
        [R.valor, formatMoney(Number(d.valor))],
        [R.descricao, String(d.descricao)],
        [R.pessoas, people.join(", ")],
        [R.parte, formatMoney(Math.ceil(Number(d.valor) / (people.length + 1)))],
        [R.categoria, nameCategoryCard(c)],
      ];
    }
  }
}

export function confirmCommand(c: CardConfirmation): string | Promise<string> {
  const disabled = functionCard(c.tipo);
  if (disabled) return noticeFunctionDisabled(disabled);
  const fin = useFinances.getState();
  const d = c.dados;
  if (c.tipo === "rascunho" || c.tipo === "email") {
    const payload = { para: String(d.para), assunto: String(d.assunto), corpo: String(d.corpo) };
    const send = c.tipo === "email" ? connectionsBridge.enviarEmail(payload) : connectionsBridge.criarRascunho(payload);
    return send.then(
      () => (c.tipo === "email" ? T.chat.respostas.emailEnviado(payload.para) : T.chat.respostas.rascunhoCriado(payload.para)),
      (e: Error) => T.chat.respostas.emailFalhou(e.message),
    );
  }
  if (c.tipo === "evento") {
    const title = String(d.titulo);
    const recurrence = recurrenceCard(d.repeticao);
    useOrganization.getState().createEvent({ titulo: title, data: String(d.data), hora: d.hora ? String(d.hora) : undefined, tipo: "evento", repeticao: recurrence });
    void useAgents.getState().trabalhar("organizador", title, 400);
    return T.chat.respostas.evento(title, describeWithRecurrence(describeWhen(String(d.data), d.hora ? String(d.hora) : undefined), recurrence));
  }
  if (c.tipo === "novoHabito") {
    const nameValue = String(d.nome).trim().slice(0, 60);
    const routine = useRoutine.getState();
    if (routine.habitos.some((h) => !h.arquivado && h.nome.toLowerCase() === nameValue.toLowerCase())) return T.chat.respostas.habitoJaExiste(nameValue);
    const goal = Math.max(1, Math.round(Number(d.meta) || 1));
    routine.createHabit({ nome: nameValue, tipo: goal > 1 ? "quantidade" : "sim_nao", meta: goal, unidade: String(d.unidade ?? "").slice(0, 20), hora: d.hora ? String(d.hora) : undefined });
    void useAgents.getState().trabalhar("organizador", nameValue, 400);
    return T.chat.respostas.habitoCriado(nameValue, d.hora ? String(d.hora) : "");
  }
  if (c.tipo === "eventoFeito") {
    if (!useOrganization.getState().eventos.some((e) => e.id === d.id)) return T.chat.respostas.naoAchei;
    useOrganization.getState().markEventDone(String(d.id), String(d.data), true);
    void useAgents.getState().trabalhar("organizador", String(d.titulo), 300);
    return T.chat.respostas.eventoFeito(String(d.titulo));
  }
  if (c.tipo === "concluir") {
    if (!useRoutine.getState().tarefas.some((t) => t.id === d.id)) return T.chat.respostas.naoAchei;
    useRoutine.getState().changeStatus(String(d.id), "concluida");
    void useAgents.getState().trabalhar("organizador", String(d.titulo), 300);
    return T.chat.respostas.concluida(String(d.titulo));
  }
  if (c.tipo === "habito") {
    if (!useRoutine.getState().habitos.some((h) => h.id === d.id)) return T.chat.respostas.naoAchei;
    useRoutine.getState().registerHabit(String(d.data), String(d.id), Number(d.valor) || 1);
    void useAgents.getState().trabalhar("organizador", String(d.nome), 300);
    return T.chat.respostas.habito(String(d.nome));
  }
  if (c.tipo === "compra") {
    const items = (d.itens as string[]).slice(0, 30);
    const list = fin.listas[0] ?? fin.createList(T.financas.abas.compras, fin.categorias.find((x) => normalizeText(x.nome) === "mercado")?.id);
    fin.addItems(list.id, items.map((nameItem) => ({ nome: nameItem, quantidade: 1, precoEstimado: 0 })));
    void useAgents.getState().trabalhar("operador", T.chat.respostas.compra(items.length, list.nome), 400);
    return T.chat.respostas.compra(items.length, list.nome);
  }
  if (c.tipo === "memoria") {
    useCommunication.getState().remind(String(d.texto), "organizador", "comando");
    return T.chat.respostas.lembrar;
  }
  if (c.tipo === "tarefa") {
    const title = String(d.titulo);
    useRoutine.getState().createTask({ titulo: title, data: d.data ? String(d.data) : undefined, hora: d.hora ? String(d.hora) : undefined });
    void useAgents.getState().trabalhar("organizador", `${T.inicio.novaTarefa}: ${title}`, 500);
    return T.chat.respostas.tarefa(title, describeWhen(d.data ? String(d.data) : undefined, d.hora ? String(d.hora) : undefined));
  }
  if (c.tipo === "lembrete") {
    const title = String(d.titulo);
    const data = String(d.data);
    const recurrence = recurrenceCard(d.repeticao);
    useOrganization.getState().createEvent({ titulo: title, data, hora: d.hora ? String(d.hora) : undefined, tipo: "lembrete", repeticao: recurrence });
    void useAgents.getState().trabalhar("organizador", title, 400);
    return T.chat.respostas.lembrete(title, describeWithRecurrence(describeWhen(data, d.hora ? String(d.hora) : undefined), recurrence));
  }
  if (missingCategory(c)) return T.chat.respostas.faltaCategoria;
  if (c.tipo === "gasto" || c.tipo === "receita") {
    if (!fin.contas.some((x) => x.id === d.contaId)) return T.chat.respostas.semConta;
    fin.recordTransaction({
      tipo: c.tipo === "gasto" ? "despesa" : "receita",
      valor: Number(d.valor),
      descricao: String(d.descricao),
      categoriaId: resolveCategory(c),
      contaId: String(d.contaId),
      data: String(d.data),
    });
    void useAgents.getState().trabalhar("operador", `${c.tipo === "gasto" ? T.financas.tipos.despesa : T.financas.tipos.receita}: ${String(d.descricao)}`, 500);
    return T.chat.confirmado;
  }
  const names = (d.pessoas as string[]) ?? [];
  const ids = names.map((n) => findByName(fin.pessoas, n)?.id ?? useFinances.getState().createPerson(n).id);
  const total = Number(d.valor);
  const participants = [EU, ...ids];
  const base = Math.floor(total / participants.length);
  const rest = total - base * participants.length;
  useFinances.getState().dividir({
    descricao: String(d.descricao),
    total,
    pagadorId: EU,
    partes: participants.map((p, i) => ({ pessoaId: p, valor: base + (i === 0 ? rest : 0) })),
    data: String(d.data),
    categoriaId: resolveCategory(c),
    contaId: d.contaId ? String(d.contaId) : undefined,
  });
  void useAgents.getState().trabalhar("operador", `${T.financas.novaDivisao}: ${String(d.descricao)}`, 500);
  return T.chat.confirmado;
}

function describeWhen(data?: string, time?: string): string {
  return [data ? formatDateString(data, "EEE, d 'de' MMM") : "", time ?? ""].filter(Boolean).join(" ");
}

export function executeCommand(input: string, options: { confirmar?: boolean } = {}): ResultCommand {
  const text = input.trim();
  const m = /^\/(\w+)\s*([\s\S]*)$/.exec(text);
  if (!m) return { agente: "organizador", resposta: T.chat.naoEntendi, ok: false };
  const nameValue = normalizeText(m[1]);
  const args = m[2].trim();
  const agents = useAgents.getState();
  const disabled = functionCommand(nameValue);
  if (disabled) return { agente: "organizador", resposta: noticeFunctionDisabled(disabled), ok: false };

  switch (nameValue) {
    case "ajuda":
      return { agente: "organizador", resposta: T.chat.ajuda.filter((line) => commandAvailable(line)).join("\n"), ok: true };
    case "tarefa": {
      if (!args) return { agente: "organizador", resposta: T.chat.respostas.faltaTitulo, ok: false };
      const { categoria: category, limpo: clean } = extractMarkers(args);
      const when = interpretWhen(clean);
      const title = withoutConnectors(when.resto || clean).slice(0, 200);
      if (!title) return { agente: "organizador", resposta: T.chat.respostas.faltaTitulo, ok: false };
      const subject = findByName(useStudies.getState().materias, category);
      if (options.confirmar)
        return {
          agente: "organizador",
          resposta: T.chat.respostas.tarefaConferir,
          ok: true,
          confirmacao: { tipo: "tarefa", situacao: "pendente", dados: { titulo: title, data: when.data ?? "", hora: when.hora ?? "" } },
        };
      useRoutine.getState().createTask({ titulo: title, data: when.data, hora: when.hora, materiaId: subject?.id, colunaId: subject?.colunas[0]?.id });
      void agents.trabalhar("organizador", `${T.inicio.novaTarefa}: ${title}`, 500);
      const description = [when.data ? formatDateString(when.data, "EEE, d 'de' MMM") : "", when.hora ?? ""].filter(Boolean).join(" ");
      return { agente: "organizador", resposta: T.chat.respostas.tarefa(title, description), ok: true };
    }
    case "gasto":
      return prepareEntry("gasto", args);
    case "receita":
      return prepareEntry("receita", args);
    case "dividir":
      return prepareSplit(args);
    case "compra": {
      const items = args.split(",").map((i) => i.trim()).filter(Boolean).slice(0, 30);
      if (items.length === 0) return { agente: "operador", resposta: T.chat.respostas.faltaTitulo, ok: false };
      const fin = useFinances.getState();
      const list = fin.listas[0] ?? fin.createList(T.financas.abas.compras, fin.categorias.find((c) => normalizeText(c.nome) === "mercado")?.id);
      fin.addItems(list.id, items.map((nameItem) => ({ nome: nameItem, quantidade: 1, precoEstimado: 0 })));
      void agents.trabalhar("operador", T.chat.respostas.compra(items.length, list.nome), 400);
      return { agente: "operador", resposta: T.chat.respostas.compra(items.length, list.nome), ok: true };
    }
    case "pomodoro": {
      const action = normalizeText(args.trim());
      if (action === "status" || action === "tempo") return { agente: "organizador", resposta: textPomodoro(), ok: true };
      if (["pausar", "continuar", "encerrar"].includes(action)) {
        const r = controlPomodoro(action);
        return { agente: "organizador", resposta: r.tipo === "dados" ? r.resumo : r.mensagem, ok: r.tipo === "dados" };
      }
      const { categoria: category, limpo: clean } = extractMarkers(args);
      const minutes = clean ? Number(clean.split(" ")[0]) : useConfig.getState().pomodoro.foco;
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180) return { agente: "organizador", resposta: T.chat.recursos.minutosInvalidos, ok: false };
      const subject = findByName(useStudies.getState().materias, category);
      if (category && !subject) return { agente: "organizador", resposta: T.chat.recursos.materiaInvalida, ok: false };
      const p = usePomodoro.getState();
      if (p.inicioEtapa || p.rodando || p.restanteMs !== null) return { agente: "organizador", resposta: T.chat.recursos.timerAtivo, ok: false };
      p.selectStage("foco");
      p.setLink(subject?.id);
      p.start(minutes);
      void agents.trabalhar("organizador", T.chat.respostas.pomodoro(minutes, subject?.nome ?? ""), 300);
      return { agente: "organizador", resposta: T.chat.respostas.pomodoro(minutes, subject?.nome ?? ""), ok: true };
    }
    case "revisar": {
      const n = reviewsToToday(useStudies.getState());
      if (n > 0) useInterface.getState().navigateTo("estudos", { aba: "revisoes", sessao: "1" });
      return { agente: "tutor", resposta: T.chat.respostas.revisar(n), ok: true };
    }
    case "link": {
      const { categoria: category, limpo: clean } = extractMarkers(args);
      const url = urlSafe(clean.split(" ")[0] ?? "");
      if (!url) return { agente: "tutor", resposta: T.chat.respostas.faltaUrl, ok: false };
      const subject = findByName(useStudies.getState().materias, category);
      useStudies.getState().saveLink({
        url: url.href,
        titulo: url.hostname.replace(/^www\./, ""),
        nota: clean.split(" ").slice(1).join(" "),
        tags: category && !subject ? [category] : [],
        materiaId: subject?.id,
        estado: "para_ler",
      });
      void agents.trabalhar("tutor", T.chat.respostas.link(url.hostname), 400);
      return { agente: "tutor", resposta: T.chat.respostas.link(url.hostname), ok: true };
    }
    case "lembrete": {
      const { repeticao: recurrence, resto: withoutRecurrence } = extractRecurrence(args);
      const when = interpretWhen(withoutRecurrence);
      if (!when.hora && !when.data) return { agente: "organizador", resposta: T.chat.respostas.faltaHora, ok: false };
      const title = withoutConnectors(when.resto).slice(0, 200);
      if (!title) return { agente: "organizador", resposta: T.chat.respostas.faltaTitulo, ok: false };
      const data = when.data ?? todayISO();
      if (options.confirmar)
        return {
          agente: "organizador",
          resposta: T.chat.respostas.lembreteConferir,
          ok: true,
          confirmacao: { tipo: "lembrete", situacao: "pendente", dados: { titulo: title, data, hora: when.hora ?? "", ...(recurrence !== "nenhuma" ? { repeticao: recurrence } : {}) } },
        };
      useOrganization.getState().createEvent({ titulo: title, data, hora: when.hora, tipo: "lembrete", repeticao: recurrence });
      const description = describeWithRecurrence(describeWhen(data, when.hora), recurrence);
      void agents.trabalhar("organizador", T.chat.respostas.lembrete(title, description), 400);
      return { agente: "organizador", resposta: T.chat.respostas.lembrete(title, description), ok: true };
    }
    case "lembrar": {
      if (!args) return { agente: "organizador", resposta: T.chat.respostas.faltaTitulo, ok: false };
      useCommunication.getState().remind(args, "organizador", "comando");
      return { agente: "organizador", resposta: T.chat.respostas.lembrar, ok: true };
    }
    case "status": {
      const today = todayISO();
      const routine = useRoutine.getState();
      const openItems = tasksDay(routine.tarefas, today).filter((t) => t.status !== "concluida" && t.status !== "cancelada").length;
      const pendingRequests = routine.habitos.filter((h) => !h.arquivado && !habitCompleted(h, routine.registros[today]?.[h.id])).length;
      const fin = useFinances.getState();
      const expense = sumBy(expensesMonth(fin, today.slice(0, 7)), (t) => partUser(t, fin.divisoes));
      return {
        agente: "organizador",
        resposta: T.chat.respostas.status({
          ...(functionEnabled("journal") ? { tarefas: openItems, habitos: pendingRequests } : {}),
          ...(functionEnabled("estudos") ? { revisoes: reviewsToToday(useStudies.getState()) } : {}),
          ...(functionEnabled("financas") ? { gasto: formatMoney(expense) } : {}),
        }),
        ok: true,
      };
    }
    default:
      return { agente: "organizador", resposta: T.chat.naoEntendi, ok: false };
  }
}
