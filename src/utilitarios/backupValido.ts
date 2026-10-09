import { exigir, objeto, validarEvento, validarPaiPagina, validarTransacao } from "./validacoes";
import { dataValida, horaValida } from "./datas";
import type { Conta, Categoria, Evento, Pagina, Transacao } from "../tipos";
import { CONFIG_PADRAO } from "../estado/configuracoes";
import { validarFormatoConfiguracoes } from "./configuracoesValidas";
import { configuracaoEscritorioValida } from "../modulos/escritorio/configuracaoDoEscritorio";
import { corteDasAnalisesValido, registrosValidos } from "../modulos/escritorio/dadosDoEscritorio";

type Regra = string | { [campo: string]: Regra } | [Regra];
const id = "s!";
const transacao: Regra = { id, tipo: "receita|despesa|transferencia", valor: "i", descricao: "s!", contaId: id, contaDestinoId: "?s!", categoriaId: "?s!", data: "d", criadaEm: "t", parcela: { numero: "i", total: "i" } };
const evento: Regra = { id, titulo: "s!", data: "d", hora: "?h", tipo: "evento|lembrete", repeticao: "nenhuma|diaria|semanal|mensal", excecoes: ["d"], feitos: ["d"] };
const tarefa: Regra = { id, titulo: "s", descricao: "s", status: "a_fazer|em_andamento|concluida|reagendada|cancelada|em_aguardo", prioridade: "baixa|media|alta", checklist: [{ id, texto: "s", feito: "b" }], criadaEm: "t", ordem: "n", data: "?d", hora: "?h" };
const esquemas: Record<string, Record<string, Regra>> = {
  "escritorio-ias": { config: { ciclo: "auto|day|night", estilo: "niko|original", seguir: "b", esconderDetalhes: "b", guardarAnalises: "b", nomes: {}, salas: {} }, ignorarAte: "?n", registros: [{ id, sessao: id, projeto: id, nome: "s", ferramenta: "claude|codex|copilot|antigravity|kimi|amp|gemini|opencode", em: "n", estado: "?trabalho|espera|ocioso|erro", acao: "b", falha: "b", pedido: "b" }] },
  rotina: { tarefas: [tarefa], habitos: [{ id, nome: "s!", tipo: "sim_nao|quantidade", meta: "n", unidade: "s", arquivado: "b", hora: "?h" }], registros: {}, dias: {}, diasAbertos: ["d"] },
  estudos: {
    areas: [{ id, nome: "s!", tipo: "faculdade|idiomas|programacao|concurso|cursos", cor: "s" }],
    materias: [{ id, areaId: id, nome: "s!", colunas: [{ id, nome: "s", conclui: "b" }], semestre: "?s" }],
    paginas: [{ id, materiaId: id, paiId: "?s!", titulo: "s", conteudo: "s", atualizadaEm: "t", estudadaEm: "?d" }],
    datas: [{ id, materiaId: id, titulo: "s!", tipo: "prova|entrega|apresentacao|inscricao|outro", data: "d", concluida: "b" }],
    cartoes: [{ id, materiaId: id, frente: "s", verso: "s", vencimento: "t", estabilidade: "n", dificuldade: "n", diasDecorridos: "n", diasAgendados: "n", repeticoes: "i", lapsos: "i", estado: "i", aprendizado: "i" }],
    revisoesConteudo: [{ id, paginaId: id, data: "d", feita: "b" }],
    links: [{ id, url: "s", titulo: "s", nota: "s", tags: ["s"], materiaId: "?s!", estado: "para_ler|lido|referencia", criadoEm: "t" }],
    registroRevisoes: [{ data: "d", quantidade: "i" }],
  },
  financas: {
    contas: [{ id, nome: "s!", tipo: "corrente|poupanca|carteira|cartao|investimento", saldoInicial: "i", cor: "s", arquivada: "b" }],
    categorias: [{ id, nome: "s!", cor: "s", orcamento: "i", tipo: "receita|despesa" }],
    transacoes: [transacao], recorrentes: [{ id, descricao: "s!", valor: "i", contaId: id, dia: "i", frequencia: "mensal|anual", ativa: "b", geradoAte: "?d" }],
    assinaturasIgnoradas: ["s"], metasEconomia: [{ id, nome: "s", alvo: "i", guardado: "i", prazo: "?d" }], pessoas: [{ id, nome: "s!" }],
    divisoes: [{ id, descricao: "s", total: "i", pagadorId: id, partes: [{ pessoaId: id, valor: "i" }], data: "d" }],
    acertos: [{ id, pessoaId: id, valor: "i", data: "d" }], listas: [{ id, nome: "s", itens: [{ id, nome: "s", quantidade: "n", precoEstimado: "i", marcado: "b" }] }],
    precos: {}, regras: [{ id, contem: "s", categoriaId: id }],
  },
  organizacao: {
    pilares: [{ id, nome: "s", nota: "n" }], metas: [{ id, nome: "s", pilarId: id, tipo: "habito|estudo|financeira|tarefas|manual", alvo: "n", atual: "n", periodo: "trimestre|ano", prazo: "?d", historico: [{ data: "d", valor: "n" }] }],
    visao: [{ id, titulo: "s", descricao: "s", estado: "em_andamento|planejada|concluida", prazo: "?d" }], eventos: [evento],
  },
  comunicacao: {
    conversas: [{ id, titulo: "s", agenteId: id, criadaEm: "t", atualizadaEm: "t", mensagens: [{ id, autor: "usuario|agente", agenteId: id, texto: "s", criadaEm: "t" }] }],
    memoria: [{ id, texto: "s", agenteId: id, origem: "comando|manual", data: "t" }], conexoes: [{ id, ligada: "b", chaveSalva: "b", intervalo: "n", status: "conectado|sem_chave|erro|pausado|sem_internet", resumo: "s", fixadaNaIlha: "b" }],
    eventosConexao: [{ id, servico: id, texto: "s", tipo: "sucesso|falha|info", data: "t" }], usoIa: [{ id, data: "t", provedor: "s", modelo: "s", agenteId: id, entrada: "n", saida: "n" }],
  },
  pomodoro: { etapa: "foco|pausa_curta|pausa_longa", rodando: "b", terminaEm: "?z", restanteMs: "?z", duracaoMs: "n", inicioEtapa: "?u", ciclo: "i", materiaId: "?s!", tarefaId: "?s!", sessoes: [{ id, etapa: "foco|pausa_curta|pausa_longa", inicio: "t", minutos: "n", situacao: "concluida|interrompida" }] },
  conquistas: { alcancadas: [{ codigo: id, nivel: "n", data: "t" }] },
  agentes: { atividades: [{ id, agenteId: id, texto: "s", data: "t" }], alertas: [{ id, agenteId: id, texto: "s", criadoEm: "t" }] },
};

function conferir(valor: unknown, regra: Regra) {
  if (typeof regra === "string") {
    if (regra.startsWith("?")) {
      if (valor === undefined) return;
      regra = regra.slice(1);
    }
    if (regra === "s" || regra === "s!") exigir(typeof valor === "string" && (regra === "s" || valor.trim().length > 0));
    else if (regra === "z") exigir(valor === null || (typeof valor === "number" && Number.isFinite(valor)));
    else if (regra === "u") exigir(valor === null || (typeof valor === "string" && Number.isFinite(Date.parse(valor))));
    else if (regra === "n" || regra === "i") exigir(typeof valor === "number" && (regra === "i" ? Number.isSafeInteger(valor) : Number.isFinite(valor)));
    else if (regra === "b") exigir(typeof valor === "boolean");
    else if (regra === "d") exigir(typeof valor === "string" && dataValida(valor));
    else if (regra === "h") exigir(typeof valor === "string" && horaValida(valor));
    else if (regra === "t") exigir(typeof valor === "string" && Number.isFinite(Date.parse(valor)));
    else exigir(typeof valor === "string" && regra.split("|").includes(valor));
  } else if (Array.isArray(regra)) {
    exigir(Array.isArray(valor));
    const ids = new Set<string>();
    for (const item of valor) {
      conferir(item, regra[0]);
      if (objeto(item) && typeof item.id === "string") {
        exigir(!ids.has(item.id));
        ids.add(item.id);
      }
    }
  } else {
    exigir(objeto(valor));
    for (const [campo, teste] of Object.entries(regra)) {
      if ((campo === "parcela" || campo === "excecoes" || campo === "feitos") && valor[campo] === undefined) continue;
      conferir(valor[campo], teste);
    }
  }
}

export function validarEstadoSalvo(nome: string, bruto: unknown): asserts bruto is { state: Record<string, unknown>; version?: number } {
  exigir(objeto(bruto) && objeto(bruto.state));
  exigir(bruto.version === undefined || (Number.isInteger(bruto.version) && Number(bruto.version) >= 0 && Number(bruto.version) <= (nome === "configuracoes" ? 10 : nome === "agentes" ? 1 : 0)));
  const estado = bruto.state;
  if (nome === "configuracoes") {
    validarFormatoConfiguracoes(estado, CONFIG_PADRAO);
    for (const campo of ["ilha", "dock", "assistive", "pomodoro", "agua", "sons", "agentes", "consumo", "ia"]) if (campo in estado) exigir(objeto(estado[campo]));
    if (objeto(estado.agentes)) for (const campo of ["nomes", "cargos"]) if (campo in estado.agentes) {
      const itens = estado.agentes[campo];
      exigir(objeto(itens) && Object.values(itens).every((v) => typeof v === "string"));
    }
    if (objeto(estado.ilha) && "ordemAbas" in estado.ilha) conferir(estado.ilha.ordemAbas, ["s"]);
    if ("barraLateral" in estado) conferir(estado.barraLateral, [{ rota: "s", visivel: "b" }]);
    return;
  }
  const esquema = esquemas[nome];
  exigir(Object.hasOwn(esquemas, nome) && esquema);
  for (const [campo, regra] of Object.entries(esquema)) if (campo in estado) conferir(estado[campo], regra);
  exigir(Object.keys(estado).some((k) => Object.hasOwn(esquema, k)));
  if (nome === "rotina") {
    if (objeto(estado.registros)) for (const [dia, registros] of Object.entries(estado.registros)) {
      conferir(dia, "d");
      exigir(objeto(registros));
      for (const valor of Object.values(registros)) conferir(valor, "n");
    }
    if (objeto(estado.dias)) for (const [dia, journal] of Object.entries(estado.dias)) {
      conferir(dia, "d");
      conferir(journal, { diario: "s", nota: "s", manha: "s", tarde: "s", noite: "s", sono: "?n", agua: "?n", humor: "?otimo|bom|neutro|dificil" });
    }
  }
  if (nome === "financas") {
    const contas = (estado.contas ?? []) as Conta[];
    const categorias = (estado.categorias ?? []) as Categoria[];
    for (const t of (estado.transacoes ?? []) as Transacao[]) validarTransacao(t, contas, categorias);
    if (objeto(estado.precos)) for (const lista of Object.values(estado.precos)) conferir(lista, [{ preco: "i", data: "d" }]);
  }
  if (nome === "organizacao") for (const e of (estado.eventos ?? []) as Evento[]) validarEvento(e);
  if (nome === "estudos") {
    const areas = new Set(((estado.areas ?? []) as { id: string }[]).map((a) => a.id));
    const materias = (estado.materias ?? []) as { id: string; areaId: string }[];
    const idsMaterias = new Set(materias.map((m) => m.id));
    materias.forEach((m) => exigir(areas.has(m.areaId)));
    const paginas = (estado.paginas ?? []) as Pagina[];
    paginas.forEach((p) => { exigir(idsMaterias.has(p.materiaId)); validarPaiPagina(p, paginas); });
    for (const campo of ["datas", "cartoes"]) for (const item of (estado[campo] ?? []) as { materiaId: string }[]) exigir(idsMaterias.has(item.materiaId));
  }
}

export function validarBackup(bruto: unknown): Record<string, string> {
  exigir(objeto(bruto) && bruto.tipo === "niko-backup" && bruto.versao === 1 && objeto(bruto.dados));
  const dados: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(bruto.dados)) {
    if (!/^niko:[a-z0-9_-]{1,60}$/.test(chave)) continue;
    const nome = chave.slice(5);
    if (nome !== "configuracoes" && !Object.hasOwn(esquemas, nome)) continue;
    exigir(typeof valor === "string");
    const salvo: unknown = JSON.parse(valor);
    validarEstadoSalvo(nome, salvo);
    const permitidos = nome === "configuracoes" ? CONFIG_PADRAO : esquemas[nome];
    const ignorarAte = corteDasAnalisesValido(salvo.state.ignorarAte);
    const estado = nome === "escritorio-ias" ? { config: configuracaoEscritorioValida(salvo.state.config), registros: registrosValidos(salvo.state.registros).filter((r) => r.em > ignorarAte), ignorarAte } : Object.fromEntries(Object.entries(salvo.state).filter(([k]) => Object.hasOwn(permitidos, k)));
    dados[chave] = JSON.stringify({ state: estado, ...(salvo.version !== undefined ? { version: salvo.version } : {}) });
  }
  exigir(Object.keys(dados).length > 0);
  return dados;
}
