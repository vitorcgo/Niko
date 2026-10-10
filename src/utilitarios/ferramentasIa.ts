import type { AgenteId, CartaoConfirmacao, Rota, ServicoId } from "../tipos";
import { conexoesPonte } from "../ponte/conexoesReais";
import { conexaoEmTestes } from "./disponibilidadeConexoes";
import type { FerramentaIa } from "../ponte/ponteLocal";
import { useRotina, tarefasDoDia, habitoCumprido } from "../estado/rotina";
import { useOrganizacao } from "../estado/organizacao";
import { ocorrencias } from "./itensDoCalendario";
import { useEstudos, revisoesParaHoje } from "../estado/estudos";
import { useFinancas, gastosDoMes, receitasDoMes, gastoPorCategoria, parteDoUsuario, saldoDaConta, moedaDaConta, valorEmReais } from "../estado/financas";
import { useComunicacao } from "../estado/comunicacao";
import { useConfig } from "../estado/configuracoes";
import { usePomodoro } from "../estado/pomodoro";
import { useInterface } from "../estado/interface";
import { useAgentes } from "../estado/agentes";
import { sistema } from "../ponte/ponteLocal";
import { hojeISO, diaDoMomento, paraISO } from "./datas";
import { somar, normalizarTexto } from "./basicos";
import { acharPorNome, dadosDeCategoria } from "./comandos";
import { T } from "../textos/textos";
import { lerPomodoro, controlarPomodoro, gerarRelatorioSemanal, textoPomodoro, textoRelatorioSemanal } from "./recursosChat";
import { listarArquivos, lerConteudo } from "../ponte/arquivos";
import { extrairTexto, mensagemDeLeitura } from "./leitorDeArquivos";
import { FUNCOES, PARTES, areaDoBancoLigada, avisoDeFuncaoDesligada, ferramentaLigada, funcaoLigada, rotaLigada } from "./funcoes";

type Argumentos = Record<string, unknown>;

const ERROS = T.chat.ferramentas.erros;

export type ResultadoFerramenta =
  | { tipo: "dados"; conteudo: unknown; resumo?: string; textoVerificado?: string }
  | { tipo: "confirmar"; cartao: CartaoConfirmacao; agente: AgenteId }
  | { tipo: "erro"; mensagem: string };

interface FerramentaNiko {
  definicao: FerramentaIa;
  executar: (args: Argumentos) => ResultadoFerramenta;
  assincrona?: (args: Argumentos) => Promise<ResultadoFerramenta>;
}

const DATA = { type: "string", description: "Data no formato AAAA-MM-DD" };
const HORA = { type: "string", description: "Hora no formato HH:MM, 24 horas" };
const REPETICAO = { type: "string", enum: ["nenhuma", "diaria", "semanal", "mensal"], description: "diaria para todo dia, semanal para toda semana, mensal para todo mês. Padrão: nenhuma" };

function repeticaoValida(valor: unknown): { repeticao?: string } {
  return valor === "diaria" || valor === "semanal" || valor === "mensal" ? { repeticao: valor } : {};
}
const TELAS: Rota[] = ["inicio", "chat", "escritorio", "conexoes", "journal", "estudos", "financas", "metas", "calendario", "atualizacao", "ia", "consumo", "conquistas", "configuracoes"];

function texto(valor: unknown, limite = 200): string {
  return typeof valor === "string" ? valor.trim().slice(0, limite) : "";
}

function dataValida(valor: unknown): string | undefined {
  const v = texto(valor, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T12:00:00`).getTime()) ? v : undefined;
}

function horaValida(valor: unknown): string | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(texto(valor, 5));
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return undefined;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function reais(centavos: number): number {
  return Math.round(centavos) / 100;
}

function somaDias(base: string, dias: number): string {
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return paraISO(d);
}

function semHtml(html: string, limite = 1500): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim().slice(0, limite);
}

type Registro = Record<string, unknown>;

interface AreaBanco {
  data?: string;
  financeira?: boolean;
  ler: () => Registro[];
}

function nomeDe(lista: { id: string; nome: string }[], id?: string): string | null {
  return id ? lista.find((x) => x.id === id)?.nome ?? null : null;
}

const AREAS_BANCO: Record<string, AreaBanco> = {
  tarefas: { data: "data", ler: () => useRotina.getState().tarefas.map((t) => ({ id: t.id, titulo: t.titulo, descricao: t.descricao, status: t.status, data: t.data ?? null, hora: t.hora ?? null, prioridade: t.prioridade, materia: nomeDe(useEstudos.getState().materias, t.materiaId), checklist: t.checklist.map((c) => c.texto), concluida_em: t.concluidaEm ?? null })) },
  habitos: { ler: () => useRotina.getState().habitos.map((h) => ({ id: h.id, nome: h.nome, tipo: h.tipo, meta: h.meta, unidade: h.unidade, arquivado: h.arquivado })) },
  registros_habitos: {
    data: "data",
    ler: () => {
      const r = useRotina.getState();
      return Object.entries(r.registros).flatMap(([data, valores]) => Object.entries(valores).map(([id, valor]) => ({ data, habito: nomeDe(r.habitos, id) ?? id, valor })));
    },
  },
  journal: {
    data: "data",
    ler: () => Object.entries(useRotina.getState().dias).map(([data, d]) => ({ data, humor: d.humor ?? null, sono_horas: d.sono ?? null, agua_ml: d.agua ?? null, diario: semHtml(d.diario ?? ""), manha: semHtml(d.manha ?? "", 400), tarde: semHtml(d.tarde ?? "", 400), noite: semHtml(d.noite ?? "", 400) })),
  },
  eventos: { data: "data", ler: () => useOrganizacao.getState().eventos.map((e) => ({ titulo: e.titulo, data: e.data, hora: e.hora ?? null, tipo: e.tipo, repete: e.repeticao, feito_em: e.feitos ?? [] })) },
  metas: { data: "prazo", ler: () => { const o = useOrganizacao.getState(); return o.metas.map((m) => ({ nome: m.nome, pilar: nomeDe(o.pilares, m.pilarId), tipo: m.tipo, atual: m.atual, alvo: m.alvo, prazo: m.prazo ?? null, periodo: m.periodo })); } },
  pilares: { ler: () => useOrganizacao.getState().pilares.map((p) => ({ nome: p.nome, nota: p.nota })) },
  visao: { data: "prazo", ler: () => useOrganizacao.getState().visao.map((v) => ({ titulo: v.titulo, descricao: v.descricao, estado: v.estado, prazo: v.prazo ?? null })) },
  areas_estudo: { ler: () => useEstudos.getState().areas.map((a) => ({ nome: a.nome, tipo: a.tipo })) },
  materias: { ler: () => { const e = useEstudos.getState(); return e.materias.map((m) => ({ nome: m.nome, area: nomeDe(e.areas, m.areaId), semestre: m.semestre ?? null, paginas: e.paginas.filter((p) => p.materiaId === m.id).length, cartoes: e.cartoes.filter((c) => c.materiaId === m.id).length })); } },
  paginas: { data: "atualizada", ler: () => { const e = useEstudos.getState(); return e.paginas.map((p) => ({ titulo: p.titulo, materia: nomeDe(e.materias, p.materiaId), atualizada: diaDoMomento(p.atualizadaEm), estudada: (p.estudadaEm ? diaDoMomento(p.estudadaEm) : null), conteudo: semHtml(p.conteudo) })); } },
  cartoes: { data: "vencimento", ler: () => { const e = useEstudos.getState(); return e.cartoes.map((c) => ({ materia: nomeDe(e.materias, c.materiaId), frente: c.frente, verso: c.verso, vencimento: diaDoMomento(c.vencimento), repeticoes: c.repeticoes, lapsos: c.lapsos })); } },
  datas_estudo: { data: "data", ler: () => { const e = useEstudos.getState(); return e.datas.map((d) => ({ titulo: d.titulo, tipo: d.tipo, data: d.data, materia: nomeDe(e.materias, d.materiaId), concluida: d.concluida })); } },
  links: { data: "criado", ler: () => { const e = useEstudos.getState(); return e.links.map((l) => ({ titulo: l.titulo, url: l.url, nota: l.nota, tags: l.tags, estado: l.estado, materia: nomeDe(e.materias, l.materiaId), criado: diaDoMomento(l.criadoEm) })); } },
  contas: { financeira: true, ler: () => { const f = useFinancas.getState(); return f.contas.map((c) => ({ nome: c.nome, tipo: c.tipo, moeda: moedaDaConta(f.contas, c.id), saldo: reais(saldoDaConta(f, c.id)), limite: c.limite != null ? reais(c.limite) : null, arquivada: c.arquivada })); } },
  transacoes: { data: "data", financeira: true, ler: () => { const f = useFinancas.getState(); return f.transacoes.map((t) => ({ data: t.data, tipo: t.tipo, valor: reais(t.valor), moeda: moedaDaConta(f.contas, t.contaId), descricao: t.descricao, categoria: nomeDe(f.categorias, t.categoriaId), conta: nomeDe(f.contas, t.contaId), parcela: t.parcela ? `${t.parcela.numero}/${t.parcela.total}` : null })); } },
  categorias: { financeira: true, ler: () => useFinancas.getState().categorias.map((c) => ({ nome: c.nome, tipo: c.tipo, orcamento: reais(c.orcamento) })) },
  recorrentes: { financeira: true, ler: () => { const f = useFinancas.getState(); return f.recorrentes.map((r) => ({ descricao: r.descricao, valor: reais(r.valor), dia: r.dia, frequencia: r.frequencia, ativa: r.ativa, categoria: nomeDe(f.categorias, r.categoriaId), conta: nomeDe(f.contas, r.contaId) })); } },
  metas_economia: { data: "prazo", financeira: true, ler: () => useFinancas.getState().metasEconomia.map((m) => ({ nome: m.nome, guardado: reais(m.guardado), alvo: reais(m.alvo), prazo: m.prazo ?? null })) },
  divisoes: { data: "data", financeira: true, ler: () => { const f = useFinancas.getState(); return f.divisoes.map((d) => ({ data: d.data, descricao: d.descricao, total: reais(d.total), pagador: d.pagadorId === "eu" ? "usuário" : nomeDe(f.pessoas, d.pagadorId), partes: d.partes.map((p) => ({ pessoa: p.pessoaId === "eu" ? "usuário" : nomeDe(f.pessoas, p.pessoaId), valor: reais(p.valor) })) })); } },
  listas_compras: { ler: () => useFinancas.getState().listas.map((l) => ({ nome: l.nome, itens: l.itens.map((i) => ({ nome: i.nome, quantidade: i.quantidade, marcado: i.marcado })) })) },
  pomodoros: { data: "data", ler: () => { const e = useEstudos.getState(); return usePomodoro.getState().sessoes.map((s) => ({ data: diaDoMomento(s.inicio), inicio: s.inicio, etapa: s.etapa, minutos: s.minutos, situacao: s.situacao, materia: nomeDe(e.materias, s.materiaId) })); } },
  memoria: { data: "data", ler: () => useComunicacao.getState().memoria.map((m) => ({ texto: m.texto, data: diaDoMomento(m.data) })) },
  conversas: { data: "data", ler: () => useComunicacao.getState().conversas.map((c) => ({ titulo: c.titulo, data: diaDoMomento(c.atualizadaEm), mensagens: c.mensagens.length })) },
  conexoes: { ler: () => useComunicacao.getState().conexoes.map((x) => ({ servico: x.id, ligada: x.ligada, status: x.status, resumo: x.resumo })) },
  eventos_conexao: { data: "data", ler: () => useComunicacao.getState().eventosConexao.map((e) => ({ servico: e.servico, tipo: e.tipo, texto: e.texto, data: diaDoMomento(e.data) })) },
  uso_ia: { data: "data", ler: () => useComunicacao.getState().usoIa.map((u) => ({ data: u.data, provedor: u.provedor, modelo: u.modelo, agente: u.agenteId, entrada: u.entrada, saida: u.saida })) },
};

const LIMITE_LEITURA_IA = 20000;

function materiasPeloNome(nome: string) {
  const e = useEstudos.getState();
  const alvo = normalizarTexto(nome);
  if (!alvo) return e.materias;
  const exatas = e.materias.filter((m) => normalizarTexto(m.nome) === alvo);
  return exatas.length ? exatas : e.materias.filter((m) => normalizarTexto(m.nome).includes(alvo) || alvo.includes(normalizarTexto(m.nome)));
}

async function listarArquivosDasMaterias(a: Argumentos): Promise<ResultadoFerramenta> {
  const materias = materiasPeloNome(texto(a.materia, 80));
  if (materias.length === 0) return { tipo: "erro", mensagem: T.chat.recursos.materiaNaoEncontrada };
  const lista = await Promise.all(
    materias.slice(0, 30).map(async (m) => ({
      materia: m.nome,
      arquivos: (await listarArquivos(m.id).catch(() => [])).slice(0, 60).map((x) => ({ id: x.id, nome: x.nome, tipo: x.extensao, tamanho_kb: Math.round(x.tamanho / 1024), enviado_em: diaDoMomento(x.criadoEm) })),
    })),
  );
  return { tipo: "dados", conteudo: lista.filter((m) => m.arquivos.length > 0 || materias.length === 1) };
}

async function lerArquivoDaMateria(a: Argumentos): Promise<ResultadoFerramenta> {
  const pedido = normalizarTexto(texto(a.arquivo, 200));
  if (!pedido) return { tipo: "erro", mensagem: T.chat.recursos.arquivoNaoEncontrado };
  for (const m of materiasPeloNome(texto(a.materia, 80))) {
    const arquivos = await listarArquivos(m.id).catch(() => []);
    const achado = arquivos.find((x) => x.id === texto(a.arquivo, 80)) ?? arquivos.find((x) => normalizarTexto(x.nome) === pedido) ?? arquivos.find((x) => normalizarTexto(x.nome).includes(pedido));
    if (!achado) continue;
    try {
      const extraido = await extrairTexto(await lerConteudo(m.id, achado.id), achado.nome);
      return {
        tipo: "dados",
        conteudo: { materia: m.nome, arquivo: achado.nome, origem: extraido.origem, paginas: extraido.paginas ?? null, recortado: extraido.texto.length > LIMITE_LEITURA_IA, texto: extraido.texto.slice(0, LIMITE_LEITURA_IA) },
      };
    } catch (e) {
      return { tipo: "erro", mensagem: mensagemDeLeitura(e, achado.nome) ?? T.estudos.arquivos.leitura.leitura(achado.nome) };
    }
  }
  return { tipo: "erro", mensagem: T.chat.recursos.arquivoNaoEncontrado };
}

const SERVICOS_IA: ServicoId[] = (["stripe", "github", "vercel", "google", "supabase", "cloudflare", "resend", "notion", "calcom", "n8n"] as ServicoId[]).filter((id) => !conexaoEmTestes(id));

function cartaoEmail(tipo: "rascunho" | "email", a: Argumentos): ResultadoFerramenta {
  if (conexaoEmTestes("google")) return { tipo: "erro", mensagem: T.conexoes.emTestesDica };
  if (!useComunicacao.getState().conexoes.find((x) => x.id === "google")?.chaveSalva) return { tipo: "erro", mensagem: ERROS.gmailDesconectado };
  const para = texto(a.para, 200);
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(para)) return { tipo: "erro", mensagem: ERROS.emailInvalido };
  return { tipo: "confirmar", agente: "organizador", cartao: { tipo, situacao: "pendente", dados: { para, assunto: texto(a.assunto, 300), corpo: texto(a.corpo, 8000) } } };
}

const FERRAMENTAS: FerramentaNiko[] = [
  {
    definicao: { nome: "ler_pomodoro", descricao: T.chat.recursos.pomodoroDescricao, parametros: { type: "object", properties: {} } },
    executar: () => ({ tipo: "dados", conteudo: lerPomodoro(), textoVerificado: textoPomodoro() }),
  },
  {
    definicao: { nome: "controlar_pomodoro", descricao: T.chat.recursos.controleDescricao, parametros: { type: "object", properties: { acao: { type: "string", enum: ["pausar", "continuar", "encerrar"] } }, required: ["acao"] } },
    executar: (a) => controlarPomodoro(texto(a.acao, 20)),
  },
  {
    definicao: { nome: "listar_capacidades", descricao: T.chat.recursos.capacidadesDescricao, parametros: { type: "object", properties: {} } },
    executar: () => ({ tipo: "dados", conteudo: { ferramentas: definicoesFerramentas(), limites: T.chat.recursos.capacidadesLimites, modelo: T.chat.recursos.capacidadesModelo }, textoVerificado: textoCapacidadesResumido() }),
  },
  {
    definicao: { nome: "ler_relatorio_semanal", descricao: T.chat.recursos.relatorioDescricao, parametros: { type: "object", properties: {} } },
    executar: () => {
      const relatorio = gerarRelatorioSemanal();
      return { tipo: "dados", conteudo: relatorio, textoVerificado: textoRelatorioSemanal(relatorio) };
    },
  },
  {
    definicao: {
      nome: "consultar_banco",
      descricao: `Lê qualquer parte do banco de dados do Niko. Áreas: ${Object.keys(AREAS_BANCO).join(", ")}. Filtre por texto (busca) e por período (de, ate) quando fizer sentido. Valores em reais. Use para perguntas que as outras ferramentas ler_* não cobrem, como histórico, diário, anotações, cartões, links, transações antigas e sessões de foco.`,
      parametros: {
        type: "object",
        properties: {
          area: { type: "string", enum: Object.keys(AREAS_BANCO) },
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
      const nomeArea = texto(a.area, 40);
      const area = AREAS_BANCO[nomeArea];
      if (!area) return { tipo: "erro", mensagem: ERROS.areaDesconhecida(areasDisponiveis().join(", ")) };
      const funcaoDaArea = FUNCOES.find((f) => PARTES[f].areasDoBanco.includes(nomeArea) && !funcaoLigada(f));
      if (funcaoDaArea) return { tipo: "erro", mensagem: avisoDeFuncaoDesligada(funcaoDaArea) };
      if (area.financeira && useConfig.getState().nuncaFinanceiro) return { tipo: "erro", mensagem: T.chat.ferramentas.financeiroBloqueado };
      const busca = normalizarTexto(texto(a.busca, 80));
      const de = dataValida(a.de);
      const ate = dataValida(a.ate);
      let lista = area.ler();
      if (busca) lista = lista.filter((r) => normalizarTexto(JSON.stringify(r)).includes(busca));
      if (area.data && (de || ate)) {
        const campo = area.data;
        lista = lista.filter((r) => {
          const v = typeof r[campo] === "string" ? String(r[campo]).slice(0, 10) : "";
          return v && (!de || v >= de) && (!ate || v <= ate);
        });
      }
      if (area.data) lista.sort((x, y) => String(y[area.data!] ?? "").localeCompare(String(x[area.data!] ?? "")));
      const total = lista.length;
      if (a.contar) return { tipo: "dados", conteudo: { total } };
      const limite = Math.max(1, Math.min(200, Math.round(Number(a.limite) || 50)));
      return { tipo: "dados", conteudo: { total, mostrando: Math.min(total, limite), registros: lista.slice(0, limite) } };
    },
  },
  {
    definicao: {
      nome: "ler_computador",
      descricao: "Informações do computador do usuário: sistema, processador, memória, discos, bateria, rede Wi-Fi, Bluetooth, tempo ligado e os programas que mais usam memória e processador agora.",
      parametros: { type: "object", properties: {} },
    },
    assincrona: async () => {
      const r = await sistema.computador();
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
      const hoje = hojeISO();
      const dia = dataValida(a.data) ?? hoje;
      const tarefas = useRotina.getState().tarefas;
      const doDia = tarefasDoDia(tarefas, dia);
      const atrasadas = dia === hoje ? tarefas.filter((t) => t.data && t.data < hoje && t.status !== "concluida" && t.status !== "cancelada") : [];
      const lista = [...doDia, ...atrasadas.filter((t) => !doDia.includes(t))].filter((t) => a.incluir_concluidas || (t.status !== "concluida" && t.status !== "cancelada"));
      return { tipo: "dados", conteudo: lista.slice(0, 40).map((t) => ({ id: t.id, titulo: t.titulo, status: t.status, data: t.data ?? null, hora: t.hora ?? null, prioridade: t.prioridade })) };
    },
  },
  {
    definicao: {
      nome: "ler_agenda",
      descricao: "Lista eventos, lembretes e tarefas com data entre duas datas (padrão: hoje até 7 dias).",
      parametros: { type: "object", properties: { inicio: DATA, fim: DATA } },
    },
    executar: (a) => {
      const inicio = dataValida(a.inicio) ?? hojeISO();
      const fim = dataValida(a.fim) ?? somaDias(inicio, 7);
      const eventos = useOrganizacao.getState().eventos.filter((e) => e.repeticao !== "nenhuma" || (e.data >= inicio && e.data <= fim));
      const tarefas = useRotina.getState().tarefas.filter((t) => t.data && t.data >= inicio && t.data <= fim && t.status !== "cancelada");
      return {
        tipo: "dados",
        conteudo: {
          eventos: eventos.slice(0, 40).map((e) => ({ titulo: e.titulo, data: e.data, hora: e.hora ?? null, tipo: e.tipo, repete: e.repeticao, feito_em: e.feitos ?? [] })),
          tarefas: tarefas.slice(0, 40).map((t) => ({ id: t.id, titulo: t.titulo, data: t.data, hora: t.hora ?? null, status: t.status })),
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
      const fin = useFinancas.getState();
      const mes = /^\d{4}-\d{2}$/.test(texto(a.mes, 7)) ? texto(a.mes, 7) : hojeISO().slice(0, 7);
      const porCategoria = gastoPorCategoria(fin, mes);
      return {
        tipo: "dados",
        conteudo: {
          mes,
          contas: fin.contas.filter((c) => !c.arquivada).map((c) => ({ nome: c.nome, tipo: c.tipo, moeda: moedaDaConta(fin.contas, c.id), saldo: reais(saldoDaConta(fin, c.id)) })),
          entradas: reais(somar(receitasDoMes(fin, mes), (t) => valorEmReais(t, fin))),
          saidas: reais(somar(gastosDoMes(fin, mes), (t) => valorEmReais(t, fin, parteDoUsuario(t, fin.divisoes)))),
          categorias: fin.categorias
            .filter((c) => c.tipo === "despesa" && (porCategoria.get(c.id) || c.orcamento))
            .map((c) => ({ nome: c.nome, gasto: reais(porCategoria.get(c.id) ?? 0), orcamento: reais(c.orcamento) })),
          categorias_disponiveis: {
            despesa: fin.categorias.filter((c) => c.tipo === "despesa").map((c) => c.nome),
            receita: fin.categorias.filter((c) => c.tipo === "receita").map((c) => c.nome),
          },
          ultimos: [...fin.transacoes].filter((t) => t.data.startsWith(mes)).sort((x, y) => y.data.localeCompare(x.data)).slice(0, 12).map((t) => ({ data: t.data, tipo: t.tipo, valor: reais(t.valor), descricao: t.descricao })),
          metas_economia: fin.metasEconomia.map((m) => ({ nome: m.nome, guardado: reais(m.guardado), alvo: reais(m.alvo), prazo: m.prazo ?? null })),
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
      const e = useEstudos.getState();
      const hoje = hojeISO();
      return {
        tipo: "dados",
        conteudo: {
          materias: e.materias.map((m) => ({ nome: m.nome, area: e.areas.find((x) => x.id === m.areaId)?.nome ?? "" })),
          revisoes_hoje: revisoesParaHoje(e),
          proximas_datas: e.datas.filter((d) => !d.concluida && d.data >= hoje).sort((x, y) => x.data.localeCompare(y.data)).slice(0, 10).map((d) => ({ titulo: d.titulo, tipo: d.tipo, data: d.data, materia: e.materias.find((m) => m.id === d.materiaId)?.nome ?? "" })),
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
    assincrona: listarArquivosDasMaterias,
  },
  {
    definicao: {
      nome: "ler_arquivo",
      descricao: T.chat.recursos.lerArquivoDescricao,
      parametros: { type: "object", properties: { materia: { type: "string", description: T.chat.recursos.parametroMateria }, arquivo: { type: "string", description: T.chat.recursos.parametroArquivo } }, required: ["arquivo"] },
    },
    executar: () => ({ tipo: "erro", mensagem: T.chat.recursos.soAssincrona }),
    assincrona: lerArquivoDaMateria,
  },
  {
    definicao: {
      nome: "ler_habitos",
      descricao: "Hábitos ativos com id, meta e se já foram cumpridos no dia (padrão: hoje).",
      parametros: { type: "object", properties: { data: DATA } },
    },
    executar: (a) => {
      const r = useRotina.getState();
      const dia = dataValida(a.data) ?? hojeISO();
      return {
        tipo: "dados",
        conteudo: r.habitos.filter((h) => !h.arquivado).map((h) => ({ id: h.id, nome: h.nome, tipo: h.tipo, meta: h.meta, unidade: h.unidade, feito: r.registros[dia]?.[h.id] ?? 0, cumprido: habitoCumprido(h, r.registros[dia]?.[h.id]) })),
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
      const o = useOrganizacao.getState();
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
      const c = useComunicacao.getState();
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
      parametros: { type: "object", properties: { servico: { type: "string", enum: SERVICOS_IA } }, required: ["servico"] },
    },
    assincrona: async (a) => {
      const servico = SERVICOS_IA.find((s) => s === a.servico);
      if (!servico) return { tipo: "erro", mensagem: ERROS.servicoDesconhecido };
      const c = useComunicacao.getState().conexoes.find((x) => x.id === servico);
      if (!c?.chaveSalva) return { tipo: "erro", mensagem: ERROS.servicoDesconectado(servico) };
      try {
        const dados = await conexoesPonte.ler(servico);
        return { tipo: "dados", conteudo: dados };
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
      if (!useComunicacao.getState().conexoes.find((x) => x.id === "google")?.chaveSalva) return { tipo: "erro", mensagem: ERROS.gmailDesconectado };
      try {
        return { tipo: "dados", conteudo: await conexoesPonte.buscarEmails(texto(a.busca, 300)) };
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
    executar: (a) => cartaoEmail("rascunho", a),
  },
  {
    definicao: {
      nome: "enviar_email",
      descricao: "Prepara o envio de um e-mail pelo Gmail. Sempre mostra um cartão e só envia quando o usuário confirma.",
      parametros: { type: "object", properties: { para: { type: "string" }, assunto: { type: "string" }, corpo: { type: "string" } }, required: ["para", "assunto", "corpo"] },
    },
    executar: (a) => cartaoEmail("email", a),
  },  {
    definicao: {
      nome: "abrir_tela",
      descricao: "Abre uma tela do Niko para o usuário.",
      parametros: { type: "object", properties: { tela: { type: "string", enum: TELAS } }, required: ["tela"] },
    },
    executar: (a) => {
      const tela = TELAS.find((t) => t === a.tela && rotaLigada(t));
      if (!tela) return { tipo: "erro", mensagem: ERROS.telaDesconhecida };
      useInterface.getState().irPara(tela);
      return { tipo: "dados", conteudo: { aberta: tela }, resumo: T.chat.ferramentas.abriu(T.rotas[tela]) };
    },
  },
  {
    definicao: {
      nome: "iniciar_pomodoro",
      descricao: "Começa um foco (pomodoro) agora. Use só quando o usuário pedir para focar ou estudar agora.",
      parametros: { type: "object", properties: { minutos: { type: "number", minimum: 1, maximum: 180 }, materia: { type: "string" } } },
    },
    executar: (a) => {
      const minutos = a.minutos === undefined ? useConfig.getState().pomodoro.foco : Number(a.minutos);
      if (!Number.isFinite(minutos) || minutos < 1 || minutos > 180) return { tipo: "erro", mensagem: T.chat.recursos.minutosInvalidos };
      const materia = acharPorNome(useEstudos.getState().materias, texto(a.materia, 80) || undefined);
      if (texto(a.materia) && !materia) return { tipo: "erro", mensagem: T.chat.recursos.materiaInvalida };
      const p = usePomodoro.getState();
      if (p.inicioEtapa || p.rodando || p.restanteMs !== null) return { tipo: "erro", mensagem: T.chat.recursos.timerAtivo };
      p.escolherEtapa("foco");
      p.definirVinculo(materia?.id);
      p.iniciar(minutos);
      void useAgentes.getState().trabalhar("organizador", T.chat.respostas.pomodoro(minutos, materia?.nome ?? ""), 300);
      return { tipo: "dados", conteudo: { iniciado: true, minutos }, resumo: T.chat.respostas.pomodoro(minutos, materia?.nome ?? "") };
    },
  },
  {
    definicao: {
      nome: "criar_tarefa",
      descricao: "Prepara uma tarefa. O usuário confirma antes de salvar.",
      parametros: { type: "object", properties: { titulo: { type: "string" }, data: DATA, hora: HORA }, required: ["titulo"] },
    },
    executar: (a) => {
      const titulo = texto(a.titulo);
      if (!titulo) return { tipo: "erro", mensagem: ERROS.semTitulo };
      return { tipo: "confirmar", agente: "organizador", cartao: { tipo: "tarefa", situacao: "pendente", dados: { titulo, data: dataValida(a.data) ?? "", hora: horaValida(a.hora) ?? "" } } };
    },
  },
  {
    definicao: {
      nome: "concluir_tarefa",
      descricao: "Prepara a conclusão de uma tarefa pelo id (pegue o id com ler_tarefas). O usuário confirma.",
      parametros: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
    executar: (a) => {
      const tarefa = useRotina.getState().tarefas.find((t) => t.id === a.id);
      if (!tarefa) return { tipo: "erro", mensagem: ERROS.tarefaNaoEncontrada };
      return { tipo: "confirmar", agente: "organizador", cartao: { tipo: "concluir", situacao: "pendente", dados: { id: tarefa.id, titulo: tarefa.titulo } } };
    },
  },
  {
    definicao: {
      nome: "criar_lembrete",
      descricao: "Prepara um lembrete com data e hora, que pode se repetir. O usuário confirma.",
      parametros: { type: "object", properties: { titulo: { type: "string" }, data: DATA, hora: HORA, repeticao: REPETICAO }, required: ["titulo", "data"] },
    },
    executar: (a) => {
      const titulo = texto(a.titulo);
      const data = dataValida(a.data);
      if (!titulo || !data) return { tipo: "erro", mensagem: ERROS.semTituloOuData };
      return { tipo: "confirmar", agente: "organizador", cartao: { tipo: "lembrete", situacao: "pendente", dados: { titulo, data, hora: horaValida(a.hora) ?? "", ...repeticaoValida(a.repeticao) } } };
    },
  },
  {
    definicao: {
      nome: "criar_evento",
      descricao: "Prepara um evento no calendário, que pode se repetir (ex.: bater o ponto todo dia às 12:00 vira repeticao diaria, data de hoje, hora 12:00). O usuário confirma.",
      parametros: { type: "object", properties: { titulo: { type: "string" }, data: DATA, hora: HORA, repeticao: REPETICAO }, required: ["titulo", "data"] },
    },
    executar: (a) => {
      const titulo = texto(a.titulo);
      const data = dataValida(a.data);
      if (!titulo || !data) return { tipo: "erro", mensagem: ERROS.semTituloOuData };
      return { tipo: "confirmar", agente: "organizador", cartao: { tipo: "evento", situacao: "pendente", dados: { titulo, data, hora: horaValida(a.hora) ?? "", ...repeticaoValida(a.repeticao) } } };
    },
  },
  {
    definicao: {
      nome: "concluir_evento",
      descricao: "Prepara marcar um evento do calendário como feito num dia (ex.: a reunião de hoje já aconteceu). Use o título do evento, como aparece em ler_agenda. Data padrão: hoje. O usuário confirma.",
      parametros: { type: "object", properties: { titulo: { type: "string" }, data: DATA }, required: ["titulo"] },
    },
    executar: (a) => {
      const data = dataValida(a.data) ?? hojeISO();
      const doDia = useOrganizacao.getState().eventos.filter((e) => ocorrencias(e, data, data).length > 0);
      const evento = acharPorNome(doDia.map((e) => ({ ...e, nome: e.titulo })), texto(a.titulo, 120));
      if (!evento) return { tipo: "erro", mensagem: ERROS.eventoNaoEncontrado };
      return { tipo: "confirmar", agente: "organizador", cartao: { tipo: "eventoFeito", situacao: "pendente", dados: { id: evento.id, titulo: evento.titulo, data } } };
    },
  },
  {
    definicao: {
      nome: "criar_habito",
      descricao: "Prepara um hábito novo para marcar como feito todo dia no Journal. Use quando a pessoa quer acompanhar algo diário com check (ex.: beber água, bater o ponto). Hora opcional: avisa nesse horário se ainda não foi feito. Meta acima de 1 vira hábito de quantidade. O usuário confirma.",
      parametros: { type: "object", properties: { nome: { type: "string" }, hora: HORA, meta: { type: "integer", minimum: 1, maximum: 1000 }, unidade: { type: "string" } }, required: ["nome"] },
    },
    executar: (a) => {
      const nome = texto(a.nome, 60);
      if (!nome) return { tipo: "erro", mensagem: ERROS.semTitulo };
      const meta = Math.min(1000, Math.max(1, Math.round(Number(a.meta) || 1)));
      return { tipo: "confirmar", agente: "organizador", cartao: { tipo: "novoHabito", situacao: "pendente", dados: { nome, hora: horaValida(a.hora) ?? "", meta, unidade: texto(a.unidade, 20) } } };
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
      const fin = useFinancas.getState();
      fin.garantirCategorias();
      const valor = Math.round(Number(a.valor) * 100);
      if (!Number.isFinite(valor) || valor <= 0) return { tipo: "erro", mensagem: ERROS.valorInvalido };
      const contas = fin.contas.filter((c) => !c.arquivada);
      if (contas.length === 0) return { tipo: "erro", mensagem: T.chat.respostas.semConta };
      const tipo = a.tipo === "receita" ? "receita" : "gasto";
      const descricao = texto(a.descricao, 120) || (tipo === "gasto" ? T.financas.tipos.despesa : T.financas.tipos.receita);
      const categorias = useFinancas.getState().categorias.filter((c) => c.tipo === (tipo === "gasto" ? "despesa" : "receita"));
      const conta = acharPorNome(contas, texto(a.conta, 60) || undefined) ?? contas[0];
      return { tipo: "confirmar", agente: "operador", cartao: { tipo, situacao: "pendente", dados: { valor, descricao, ...dadosDeCategoria(categorias, texto(a.categoria, 60) || undefined, descricao), contaId: conta.id, data: dataValida(a.data) ?? hojeISO() } } };
    },
  },
  {
    definicao: {
      nome: "marcar_habito",
      descricao: "Prepara o registro de um hábito feito (pegue o id com ler_habitos). O usuário confirma.",
      parametros: { type: "object", properties: { id: { type: "string" }, valor: { type: "number" }, data: DATA }, required: ["id"] },
    },
    executar: (a) => {
      const r = useRotina.getState();
      const habito = r.habitos.find((h) => h.id === a.id) ?? acharPorNome(r.habitos.filter((h) => !h.arquivado), texto(a.id, 60));
      if (!habito) return { tipo: "erro", mensagem: ERROS.habitoNaoEncontrado };
      const data = dataValida(a.data) ?? hojeISO();
      const valor = habito.tipo === "sim_nao" ? 1 : Math.max(1, Math.round(Number(a.valor) || habito.meta));
      return { tipo: "confirmar", agente: "organizador", cartao: { tipo: "habito", situacao: "pendente", dados: { id: habito.id, nome: habito.nome, valor, data } } };
    },
  },
  {
    definicao: {
      nome: "adicionar_compras",
      descricao: "Prepara itens para a lista de compras. O usuário confirma.",
      parametros: { type: "object", properties: { itens: { type: "array", items: { type: "string" } } }, required: ["itens"] },
    },
    executar: (a) => {
      const itens = (Array.isArray(a.itens) ? a.itens : []).map((i) => texto(i, 80)).filter(Boolean).slice(0, 30);
      if (itens.length === 0) return { tipo: "erro", mensagem: ERROS.semItens };
      return { tipo: "confirmar", agente: "operador", cartao: { tipo: "compra", situacao: "pendente", dados: { itens } } };
    },
  },
  {
    definicao: {
      nome: "lembrar_fato",
      descricao: "Prepara um fato para a memória do time (algo que o usuário quer que vocês lembrem). O usuário confirma.",
      parametros: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] },
    },
    executar: (a) => {
      const fato = texto(a.texto, 300);
      if (!fato) return { tipo: "erro", mensagem: ERROS.semTexto };
      return { tipo: "confirmar", agente: "organizador", cartao: { tipo: "memoria", situacao: "pendente", dados: { texto: fato } } };
    },
  },
];

function areasDisponiveis(): string[] {
  return Object.keys(AREAS_BANCO).filter((a) => areaDoBancoLigada(a));
}

function definicaoAtual(f: FerramentaIa): FerramentaIa {
  if (f.nome === "abrir_tela") {
    const parametros = f.parametros as { properties: Record<string, unknown> };
    return { ...f, parametros: { ...parametros, properties: { ...parametros.properties, tela: { type: "string", enum: TELAS.filter((t) => rotaLigada(t)) } } } };
  }
  if (f.nome !== "consultar_banco") return f;
  const areas = areasDisponiveis();
  const parametros = f.parametros as { properties: Record<string, unknown> };
  return {
    ...f,
    descricao: f.descricao.replace(Object.keys(AREAS_BANCO).join(", "), areas.join(", ")),
    parametros: { ...parametros, properties: { ...parametros.properties, area: { type: "string", enum: areas } } },
  };
}

const ACOES_IMEDIATAS = new Set(["abrir_tela", "iniciar_pomodoro", "controlar_pomodoro"]);

export function definicoesFerramentas(personaPersonalizada = false): FerramentaIa[] {
  const financeiroBloqueado = useConfig.getState().nuncaFinanceiro;
  const gmailConectado = !conexaoEmTestes("google") && useComunicacao.getState().conexoes.some((c) => c.id === "google" && c.chaveSalva);
  return FERRAMENTAS.map((f) => definicaoAtual(f.definicao)).filter((f) => {
    if (personaPersonalizada && ACOES_IMEDIATAS.has(f.nome)) return false;
    if (financeiroBloqueado && f.nome === "ler_financas") return false;
    if (!gmailConectado && ["buscar_emails", "criar_rascunho_email", "enviar_email"].includes(f.nome)) return false;
    if (!ferramentaLigada(f.nome)) return false;
    return true;
  });
}

export function textoCapacidades(): string {
  const S = T.chat.recursos;
  const ferramentas = definicoesFerramentas().map((f) => `- ${f.nome}: ${f.descricao}`);
  return [S.capacidadesIntroducao, ferramentas.join("\n"), S.capacidadesModelo, S.capacidadesLimites, ...(useConfig.getState().nuncaFinanceiro ? [S.capacidadesPrivacidade] : []), S.capacidadesComandos].join("\n\n");
}

export function textoCapacidadesResumido(): string {
  const R = T.chat.recursos.resumoCapacidades;
  const nomes = new Set(definicoesFerramentas().map((f) => f.nome));
  const consultas = [
    ["ler_tarefas", "tarefas"], ["ler_agenda", "agenda"], ["ler_habitos", "habitos"], ["ler_metas", "metas"], ["ler_estudos", "estudos"], ["ler_pomodoro", "pomodoro"],
    ["ler_financas", "financas"], ["ler_conexoes", "conexoes"], ["buscar_emails", "emails"], ["ler_computador", "computador"],
  ].filter(([f]) => nomes.has(f)).map(([, c]) => R.consultas[c]);
  const acoes = [
    ["criar_tarefa", "tarefa"], ["criar_evento", "agenda"], ["lancar_transacao", "financas"], ["marcar_habito", "habito"], ["adicionar_compras", "compras"], ["criar_rascunho_email", "email"], ["iniciar_pomodoro", "foco"],
  ].filter(([f]) => nomes.has(f)).map(([, c]) => R.acoes[c]);
  const lista = (itens: string[]) => (itens.length > 1 ? `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}` : itens.join(""));
  return [
    R.titulo,
    R.consultar(lista(consultas)),
    R.fazer(lista(acoes)),
    ...(nomes.has("ler_arquivo") ? [R.arquivos] : []),
    R.semIa,
    [R.limites, ...(useConfig.getState().nuncaFinanceiro ? [R.financeiroBloqueado] : [])].join(" "),
  ].join("\n\n");
}

export async function executarFerramenta(nome: string, argumentos: Argumentos, personaPersonalizada = false): Promise<ResultadoFerramenta> {
  const ferramenta = FERRAMENTAS.find((f) => f.definicao.nome === normalizarTexto(nome));
  if (!ferramenta) return { tipo: "erro", mensagem: ERROS.ferramentaDesconhecida(nome) };
  const desligada = FUNCOES.find((f) => PARTES[f].ferramentasIa.includes(ferramenta.definicao.nome) && !funcaoLigada(f));
  if (desligada) return { tipo: "erro", mensagem: avisoDeFuncaoDesligada(desligada) };
  if (!definicoesFerramentas(personaPersonalizada).some((f) => f.nome === ferramenta.definicao.nome)) return { tipo: "erro", mensagem: T.chat.confianca.ferramentaIndisponivel(nome) };
  try {
    if (ferramenta.assincrona) return await ferramenta.assincrona(argumentos ?? {});
    return ferramenta.executar(argumentos ?? {});
  } catch (e) {
    return { tipo: "erro", mensagem: (e as Error).message };
  }
}
