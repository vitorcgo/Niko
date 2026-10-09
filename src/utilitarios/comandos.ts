import type { AgenteId, CartaoConfirmacao, Repeticao } from "../tipos";
import { extrairRepeticao } from "./itensDoCalendario";
import { T } from "../textos/textos";
import { interpretarQuando } from "./linguagem";
import { lerValorEmCentavos, formatarDinheiro } from "./dinheiro";
import { normalizarTexto, urlSegura } from "./basicos";
import { formatar, hojeISO } from "./datas";
import { useRotina, tarefasDoDia, habitoCumprido } from "../estado/rotina";
import { useFinancas, gastosDoMes, parteDoUsuario, EU, valorEmReais } from "../estado/financas";
import { useEstudos, revisoesParaHoje } from "../estado/estudos";
import { usePomodoro } from "../estado/pomodoro";
import { useConfig } from "../estado/configuracoes";
import { useOrganizacao } from "../estado/organizacao";
import { useComunicacao } from "../estado/comunicacao";
import { conexoesPonte } from "../ponte/conexoesReais";
import { useAgentes } from "../estado/agentes";
import { useInterface } from "../estado/interface";
import { somar } from "./basicos";
import { controlarPomodoro, textoPomodoro } from "./recursosChat";
import { avisoDeFuncaoDesligada, comandoDisponivel, funcaoDoCartao, funcaoDoComando, funcaoLigada } from "./funcoes";

export interface ResultadoComando {
  agente: AgenteId;
  resposta: string;
  confirmacao?: CartaoConfirmacao;
  ok: boolean;
}

const DONO: Record<string, AgenteId> = {
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

export function donoDoComando(texto: string): AgenteId | null {
  const m = /^\/(\w+)/.exec(texto.trim());
  if (!m) return null;
  return DONO[normalizarTexto(m[1])] ?? null;
}

function extrairMarcadores(texto: string) {
  const categoria = /#([\p{L}\d_-]+)/u.exec(texto)?.[1];
  const conta = /@([\p{L}\d_-]+)/u.exec(texto)?.[1];
  const limpo = texto.replace(/[#@][\p{L}\d_-]+/gu, " ").replace(/\s+/g, " ").trim();
  return { categoria, conta, limpo };
}

export function acharPorNome<T extends { id: string; nome: string }>(lista: T[], nome?: string): T | undefined {
  if (!nome) return undefined;
  const alvo = normalizarTexto(nome);
  return lista.find((x) => normalizarTexto(x.nome) === alvo) ?? lista.find((x) => normalizarTexto(x.nome).startsWith(alvo));
}

const PALAVRAS_CATEGORIA: [string, RegExp][] = [
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

export function categoriaPelaDescricao<C extends { id: string; nome: string }>(categorias: C[], descricao: string): C | undefined {
  const alvo = normalizarTexto(descricao);
  const pelaPalavra = categorias.find((c) => new RegExp(`\\b${normalizarTexto(c.nome).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(alvo));
  if (pelaPalavra) return pelaPalavra;
  const regra = PALAVRAS_CATEGORIA.find(([, padrao]) => padrao.test(alvo));
  return regra ? categorias.find((c) => normalizarTexto(c.nome) === normalizarTexto(regra[0])) : undefined;
}

export function tipoDeCategoriaDoCartao(c: CartaoConfirmacao): "despesa" | "receita" | null {
  if (c.tipo === "gasto" || c.tipo === "dividir") return "despesa";
  if (c.tipo === "receita") return "receita";
  return null;
}

function categoriaDoCartao(c: CartaoConfirmacao) {
  const tipo = tipoDeCategoriaDoCartao(c);
  return useFinancas.getState().categorias.find((x) => x.id === c.dados.categoriaId && x.tipo === tipo);
}

export function faltaCategoria(c: CartaoConfirmacao): boolean {
  if (!tipoDeCategoriaDoCartao(c)) return false;
  return !categoriaDoCartao(c) && !String(c.dados.novaCategoria ?? "").trim();
}

function resolverCategoria(c: CartaoConfirmacao): string | undefined {
  const tipo = tipoDeCategoriaDoCartao(c);
  if (!tipo) return undefined;
  const existente = categoriaDoCartao(c);
  if (existente) return existente.id;
  const nova = String(c.dados.novaCategoria ?? "").trim().slice(0, 40);
  return nova ? useFinancas.getState().obterOuCriarCategoria(nova, tipo).id : undefined;
}

export function dadosDeCategoria<C extends { id: string; nome: string }>(categorias: C[], pedida: string | undefined, descricao: string) {
  const fin = useFinancas.getState();
  const cat = acharPorNome(categorias, pedida) ?? categorias.find((c) => c.id === fin.categorizar(descricao)) ?? categoriaPelaDescricao(categorias, descricao);
  if (cat) return { categoriaId: cat.id, novaCategoria: "" };
  return { categoriaId: "", novaCategoria: pedida?.replace(/[_-]+/g, " ").trim().slice(0, 40) ?? "" };
}

function limparDescricao(texto: string): string {
  return texto
    .replace(/^(?:(?:um|uma|uns|umas|o|a|os|as)\s+)+/i, "")
    .replace(/\s+(?:de|do|da|por|no|na|com|pra|para)$/i, "")
    .trim();
}

function prepararLancamento(tipo: "gasto" | "receita", argumentos: string): ResultadoComando {
  const fin = useFinancas.getState();
  fin.garantirCategorias();
  const { categoria, conta, limpo } = extrairMarcadores(argumentos);
  const [valorTexto, ...resto] = limpo.split(" ");
  const valor = lerValorEmCentavos(valorTexto ?? "");
  if (valor == null || valor <= 0) return { agente: "operador", resposta: T.chat.respostas.faltaValor, ok: false };
  const contas = fin.contas.filter((c) => !c.arquivada);
  if (contas.length === 0) return { agente: "operador", resposta: T.chat.respostas.semConta, ok: false };
  const quando = interpretarQuando(resto.join(" "));
  const descricao = (limparDescricao(quando.resto) || (tipo === "gasto" ? T.financas.tipos.despesa : T.financas.tipos.receita)).slice(0, 120);
  const categorias = useFinancas.getState().categorias.filter((c) => c.tipo === (tipo === "gasto" ? "despesa" : "receita"));
  const contaEscolhida = acharPorNome(contas, conta) ?? contas[0];
  return {
    agente: "operador",
    resposta: tipo === "gasto" ? T.chat.respostas.gastoConferir : T.chat.respostas.receitaConferir,
    ok: true,
    confirmacao: {
      tipo,
      situacao: "pendente",
      dados: {
        valor,
        descricao,
        ...dadosDeCategoria(categorias, categoria, descricao),
        contaId: contaEscolhida.id,
        data: quando.data ?? hojeISO(),
      },
    },
  };
}

function prepararDivisao(argumentos: string): ResultadoComando {
  const fin = useFinancas.getState();
  const partes = /^([\d.,]+)\s+(.*?)\s+com\s+(.+)$/i.exec(argumentos.trim());
  if (!partes) return { agente: "operador", resposta: T.chat.respostas.faltaPessoas, ok: false };
  const valor = lerValorEmCentavos(partes[1]);
  if (valor == null || valor <= 0) return { agente: "operador", resposta: T.chat.respostas.faltaValor, ok: false };
  const nomes = partes[3].split(/,|\se\s/).map((n) => n.trim()).filter(Boolean).slice(0, 12);
  if (nomes.length === 0) return { agente: "operador", resposta: T.chat.respostas.faltaPessoas, ok: false };
  const contas = fin.contas.filter((c) => !c.arquivada);
  return {
    agente: "operador",
    resposta: T.chat.respostas.dividirConferir,
    ok: true,
    confirmacao: {
      tipo: "dividir",
      situacao: "pendente",
      dados: {
        valor,
        descricao: partes[2].slice(0, 120),
        pessoas: nomes,
        ...dadosDeCategoria(fin.categorias.filter((c) => c.tipo === "despesa"), undefined, partes[2]),
        contaId: contas[0]?.id ?? "",
        data: hojeISO(),
      },
    },
  };
}

function semConectores(texto: string): string {
  return texto.replace(/^(?:(?:de|que|para|pra|pro|o|a)\s+)+/i, "").trim();
}

function repeticaoDoCartao(valor: unknown): Repeticao {
  return valor === "diaria" || valor === "semanal" || valor === "mensal" ? valor : "nenhuma";
}

function descreverComRepeticao(quando: string, repeticao: Repeticao): string {
  return repeticao === "nenhuma" ? quando : `${quando}, ${T.calendario.repeticoes[repeticao].toLowerCase()}`;
}

export function nomeDaCategoriaDoCartao(c: CartaoConfirmacao): string {
  const nova = String(c.dados.novaCategoria ?? "").trim();
  return categoriaDoCartao(c)?.nome ?? (nova ? T.chat.respostas.categoriaNova(nova) : T.financas.semCategoria);
}

export function linhasDaConfirmacao(c: CartaoConfirmacao): [string, string][] {
  const d = c.dados;
  const R = T.chat.rotulos;
  const quando = (): [string, string][] => [
    [R.data, d.data ? formatar(String(d.data), "EEE, d 'de' MMM") : T.geral.semData],
    ...(d.hora ? ([[R.hora, String(d.hora)]] as [string, string][]) : []),
  ];
  const fin = useFinancas.getState();
  switch (c.tipo) {
    case "tarefa":
      return [[R.titulo, String(d.titulo)], ...quando()];
    case "lembrete":
    case "evento": {
      const repeticao = repeticaoDoCartao(d.repeticao);
      return [[R.titulo, String(d.titulo)], ...quando(), ...(repeticao !== "nenhuma" ? ([[R.repete, T.calendario.repeticoes[repeticao]]] as [string, string][]) : [])];
    }
    case "novoHabito":
      return [[R.habito, String(d.nome)], ...(d.hora ? ([[R.hora, String(d.hora)]] as [string, string][]) : []), ...(Number(d.meta) > 1 ? ([[R.meta, `${d.meta} ${d.unidade ?? ""}`.trim()]] as [string, string][]) : [])];
    case "concluir":
      return [[R.tarefa, String(d.titulo)]];
    case "eventoFeito":
      return [[R.titulo, String(d.titulo)], [R.data, formatar(String(d.data), "EEE, d 'de' MMM")]];
    case "habito":
      return [[R.habito, String(d.nome)], ...(Number(d.valor) > 1 ? ([[R.valor, String(d.valor)]] as [string, string][]) : []), [R.data, formatar(String(d.data), "d 'de' MMM")]];
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
        [R.valor, formatarDinheiro(Number(d.valor))],
        [R.descricao, String(d.descricao)],
        [R.categoria, nomeDaCategoriaDoCartao(c)],
        [R.conta, fin.contas.find((x) => x.id === d.contaId)?.nome ?? ""],
        [R.data, formatar(String(d.data), "d 'de' MMM")],
      ];
    default: {
      const pessoas = (d.pessoas as string[]) ?? [];
      return [
        [R.valor, formatarDinheiro(Number(d.valor))],
        [R.descricao, String(d.descricao)],
        [R.pessoas, pessoas.join(", ")],
        [R.parte, formatarDinheiro(Math.ceil(Number(d.valor) / (pessoas.length + 1)))],
        [R.categoria, nomeDaCategoriaDoCartao(c)],
      ];
    }
  }
}

export function confirmarComando(c: CartaoConfirmacao): string | Promise<string> {
  const desligada = funcaoDoCartao(c.tipo);
  if (desligada) return avisoDeFuncaoDesligada(desligada);
  const fin = useFinancas.getState();
  const d = c.dados;
  if (c.tipo === "rascunho" || c.tipo === "email") {
    const dados = { para: String(d.para), assunto: String(d.assunto), corpo: String(d.corpo) };
    const envio = c.tipo === "email" ? conexoesPonte.enviarEmail(dados) : conexoesPonte.criarRascunho(dados);
    return envio.then(
      () => (c.tipo === "email" ? T.chat.respostas.emailEnviado(dados.para) : T.chat.respostas.rascunhoCriado(dados.para)),
      (e: Error) => T.chat.respostas.emailFalhou(e.message),
    );
  }
  if (c.tipo === "evento") {
    const titulo = String(d.titulo);
    const repeticao = repeticaoDoCartao(d.repeticao);
    useOrganizacao.getState().criarEvento({ titulo, data: String(d.data), hora: d.hora ? String(d.hora) : undefined, tipo: "evento", repeticao });
    void useAgentes.getState().trabalhar("organizador", titulo, 400);
    return T.chat.respostas.evento(titulo, descreverComRepeticao(descreverQuando(String(d.data), d.hora ? String(d.hora) : undefined), repeticao));
  }
  if (c.tipo === "novoHabito") {
    const nome = String(d.nome).trim().slice(0, 60);
    const rotina = useRotina.getState();
    if (rotina.habitos.some((h) => !h.arquivado && h.nome.toLowerCase() === nome.toLowerCase())) return T.chat.respostas.habitoJaExiste(nome);
    const meta = Math.max(1, Math.round(Number(d.meta) || 1));
    rotina.criarHabito({ nome, tipo: meta > 1 ? "quantidade" : "sim_nao", meta, unidade: String(d.unidade ?? "").slice(0, 20), hora: d.hora ? String(d.hora) : undefined });
    void useAgentes.getState().trabalhar("organizador", nome, 400);
    return T.chat.respostas.habitoCriado(nome, d.hora ? String(d.hora) : "");
  }
  if (c.tipo === "eventoFeito") {
    if (!useOrganizacao.getState().eventos.some((e) => e.id === d.id)) return T.chat.respostas.naoAchei;
    useOrganizacao.getState().marcarEventoFeito(String(d.id), String(d.data), true);
    void useAgentes.getState().trabalhar("organizador", String(d.titulo), 300);
    return T.chat.respostas.eventoFeito(String(d.titulo));
  }
  if (c.tipo === "concluir") {
    if (!useRotina.getState().tarefas.some((t) => t.id === d.id)) return T.chat.respostas.naoAchei;
    useRotina.getState().mudarStatus(String(d.id), "concluida");
    void useAgentes.getState().trabalhar("organizador", String(d.titulo), 300);
    return T.chat.respostas.concluida(String(d.titulo));
  }
  if (c.tipo === "habito") {
    if (!useRotina.getState().habitos.some((h) => h.id === d.id)) return T.chat.respostas.naoAchei;
    useRotina.getState().registrarHabito(String(d.data), String(d.id), Number(d.valor) || 1);
    void useAgentes.getState().trabalhar("organizador", String(d.nome), 300);
    return T.chat.respostas.habito(String(d.nome));
  }
  if (c.tipo === "compra") {
    const itens = (d.itens as string[]).slice(0, 30);
    const lista = fin.listas[0] ?? fin.criarLista(T.financas.abas.compras, fin.categorias.find((x) => normalizarTexto(x.nome) === "mercado")?.id);
    fin.adicionarItens(lista.id, itens.map((nomeItem) => ({ nome: nomeItem, quantidade: 1, precoEstimado: 0 })));
    void useAgentes.getState().trabalhar("operador", T.chat.respostas.compra(itens.length, lista.nome), 400);
    return T.chat.respostas.compra(itens.length, lista.nome);
  }
  if (c.tipo === "memoria") {
    useComunicacao.getState().lembrar(String(d.texto), "organizador", "comando");
    return T.chat.respostas.lembrar;
  }
  if (c.tipo === "tarefa") {
    const titulo = String(d.titulo);
    useRotina.getState().criarTarefa({ titulo, data: d.data ? String(d.data) : undefined, hora: d.hora ? String(d.hora) : undefined });
    void useAgentes.getState().trabalhar("organizador", `${T.inicio.novaTarefa}: ${titulo}`, 500);
    return T.chat.respostas.tarefa(titulo, descreverQuando(d.data ? String(d.data) : undefined, d.hora ? String(d.hora) : undefined));
  }
  if (c.tipo === "lembrete") {
    const titulo = String(d.titulo);
    const data = String(d.data);
    const repeticao = repeticaoDoCartao(d.repeticao);
    useOrganizacao.getState().criarEvento({ titulo, data, hora: d.hora ? String(d.hora) : undefined, tipo: "lembrete", repeticao });
    void useAgentes.getState().trabalhar("organizador", titulo, 400);
    return T.chat.respostas.lembrete(titulo, descreverComRepeticao(descreverQuando(data, d.hora ? String(d.hora) : undefined), repeticao));
  }
  if (faltaCategoria(c)) return T.chat.respostas.faltaCategoria;
  if (c.tipo === "gasto" || c.tipo === "receita") {
    if (!fin.contas.some((x) => x.id === d.contaId)) return T.chat.respostas.semConta;
    fin.lancar({
      tipo: c.tipo === "gasto" ? "despesa" : "receita",
      valor: Number(d.valor),
      descricao: String(d.descricao),
      categoriaId: resolverCategoria(c),
      contaId: String(d.contaId),
      data: String(d.data),
    });
    void useAgentes.getState().trabalhar("operador", `${c.tipo === "gasto" ? T.financas.tipos.despesa : T.financas.tipos.receita}: ${String(d.descricao)}`, 500);
    return T.chat.confirmado;
  }
  const nomes = (d.pessoas as string[]) ?? [];
  const ids = nomes.map((n) => acharPorNome(fin.pessoas, n)?.id ?? useFinancas.getState().criarPessoa(n).id);
  const total = Number(d.valor);
  const participantes = [EU, ...ids];
  const base = Math.floor(total / participantes.length);
  const resto = total - base * participantes.length;
  useFinancas.getState().dividir({
    descricao: String(d.descricao),
    total,
    pagadorId: EU,
    partes: participantes.map((p, i) => ({ pessoaId: p, valor: base + (i === 0 ? resto : 0) })),
    data: String(d.data),
    categoriaId: resolverCategoria(c),
    contaId: d.contaId ? String(d.contaId) : undefined,
  });
  void useAgentes.getState().trabalhar("operador", `${T.financas.novaDivisao}: ${String(d.descricao)}`, 500);
  return T.chat.confirmado;
}

function descreverQuando(data?: string, hora?: string): string {
  return [data ? formatar(data, "EEE, d 'de' MMM") : "", hora ?? ""].filter(Boolean).join(" ");
}

export function executarComando(entrada: string, opcoes: { confirmar?: boolean } = {}): ResultadoComando {
  const texto = entrada.trim();
  const m = /^\/(\w+)\s*([\s\S]*)$/.exec(texto);
  if (!m) return { agente: "organizador", resposta: T.chat.naoEntendi, ok: false };
  const nome = normalizarTexto(m[1]);
  const argumentos = m[2].trim();
  const agentes = useAgentes.getState();
  const desligada = funcaoDoComando(nome);
  if (desligada) return { agente: "organizador", resposta: avisoDeFuncaoDesligada(desligada), ok: false };

  switch (nome) {
    case "ajuda":
      return { agente: "organizador", resposta: T.chat.ajuda.filter((linha) => comandoDisponivel(linha)).join("\n"), ok: true };
    case "tarefa": {
      if (!argumentos) return { agente: "organizador", resposta: T.chat.respostas.faltaTitulo, ok: false };
      const { categoria, limpo } = extrairMarcadores(argumentos);
      const quando = interpretarQuando(limpo);
      const titulo = semConectores(quando.resto || limpo).slice(0, 200);
      if (!titulo) return { agente: "organizador", resposta: T.chat.respostas.faltaTitulo, ok: false };
      const materia = acharPorNome(useEstudos.getState().materias, categoria);
      if (opcoes.confirmar)
        return {
          agente: "organizador",
          resposta: T.chat.respostas.tarefaConferir,
          ok: true,
          confirmacao: { tipo: "tarefa", situacao: "pendente", dados: { titulo, data: quando.data ?? "", hora: quando.hora ?? "" } },
        };
      useRotina.getState().criarTarefa({ titulo, data: quando.data, hora: quando.hora, materiaId: materia?.id, colunaId: materia?.colunas[0]?.id });
      void agentes.trabalhar("organizador", `${T.inicio.novaTarefa}: ${titulo}`, 500);
      const descricao = [quando.data ? formatar(quando.data, "EEE, d 'de' MMM") : "", quando.hora ?? ""].filter(Boolean).join(" ");
      return { agente: "organizador", resposta: T.chat.respostas.tarefa(titulo, descricao), ok: true };
    }
    case "gasto":
      return prepararLancamento("gasto", argumentos);
    case "receita":
      return prepararLancamento("receita", argumentos);
    case "dividir":
      return prepararDivisao(argumentos);
    case "compra": {
      const itens = argumentos.split(",").map((i) => i.trim()).filter(Boolean).slice(0, 30);
      if (itens.length === 0) return { agente: "operador", resposta: T.chat.respostas.faltaTitulo, ok: false };
      const fin = useFinancas.getState();
      const lista = fin.listas[0] ?? fin.criarLista(T.financas.abas.compras, fin.categorias.find((c) => normalizarTexto(c.nome) === "mercado")?.id);
      fin.adicionarItens(lista.id, itens.map((nomeItem) => ({ nome: nomeItem, quantidade: 1, precoEstimado: 0 })));
      void agentes.trabalhar("operador", T.chat.respostas.compra(itens.length, lista.nome), 400);
      return { agente: "operador", resposta: T.chat.respostas.compra(itens.length, lista.nome), ok: true };
    }
    case "pomodoro": {
      const acao = normalizarTexto(argumentos.trim());
      if (acao === "status" || acao === "tempo") return { agente: "organizador", resposta: textoPomodoro(), ok: true };
      if (["pausar", "continuar", "encerrar"].includes(acao)) {
        const r = controlarPomodoro(acao);
        return { agente: "organizador", resposta: r.tipo === "dados" ? r.resumo : r.mensagem, ok: r.tipo === "dados" };
      }
      const { categoria, limpo } = extrairMarcadores(argumentos);
      const minutos = limpo ? Number(limpo.split(" ")[0]) : useConfig.getState().pomodoro.foco;
      if (!Number.isFinite(minutos) || minutos < 1 || minutos > 180) return { agente: "organizador", resposta: T.chat.recursos.minutosInvalidos, ok: false };
      const materia = acharPorNome(useEstudos.getState().materias, categoria);
      if (categoria && !materia) return { agente: "organizador", resposta: T.chat.recursos.materiaInvalida, ok: false };
      const p = usePomodoro.getState();
      if (p.inicioEtapa || p.rodando || p.restanteMs !== null) return { agente: "organizador", resposta: T.chat.recursos.timerAtivo, ok: false };
      p.escolherEtapa("foco");
      p.definirVinculo(materia?.id);
      p.iniciar(minutos);
      void agentes.trabalhar("organizador", T.chat.respostas.pomodoro(minutos, materia?.nome ?? ""), 300);
      return { agente: "organizador", resposta: T.chat.respostas.pomodoro(minutos, materia?.nome ?? ""), ok: true };
    }
    case "revisar": {
      const n = revisoesParaHoje(useEstudos.getState());
      if (n > 0) useInterface.getState().irPara("estudos", { aba: "revisoes", sessao: "1" });
      return { agente: "tutor", resposta: T.chat.respostas.revisar(n), ok: true };
    }
    case "link": {
      const { categoria, limpo } = extrairMarcadores(argumentos);
      const url = urlSegura(limpo.split(" ")[0] ?? "");
      if (!url) return { agente: "tutor", resposta: T.chat.respostas.faltaUrl, ok: false };
      const materia = acharPorNome(useEstudos.getState().materias, categoria);
      useEstudos.getState().salvarLink({
        url: url.href,
        titulo: url.hostname.replace(/^www\./, ""),
        nota: limpo.split(" ").slice(1).join(" "),
        tags: categoria && !materia ? [categoria] : [],
        materiaId: materia?.id,
        estado: "para_ler",
      });
      void agentes.trabalhar("tutor", T.chat.respostas.link(url.hostname), 400);
      return { agente: "tutor", resposta: T.chat.respostas.link(url.hostname), ok: true };
    }
    case "lembrete": {
      const { repeticao, resto: semRepeticao } = extrairRepeticao(argumentos);
      const quando = interpretarQuando(semRepeticao);
      if (!quando.hora && !quando.data) return { agente: "organizador", resposta: T.chat.respostas.faltaHora, ok: false };
      const titulo = semConectores(quando.resto).slice(0, 200);
      if (!titulo) return { agente: "organizador", resposta: T.chat.respostas.faltaTitulo, ok: false };
      const data = quando.data ?? hojeISO();
      if (opcoes.confirmar)
        return {
          agente: "organizador",
          resposta: T.chat.respostas.lembreteConferir,
          ok: true,
          confirmacao: { tipo: "lembrete", situacao: "pendente", dados: { titulo, data, hora: quando.hora ?? "", ...(repeticao !== "nenhuma" ? { repeticao } : {}) } },
        };
      useOrganizacao.getState().criarEvento({ titulo, data, hora: quando.hora, tipo: "lembrete", repeticao });
      const descricao = descreverComRepeticao(descreverQuando(data, quando.hora), repeticao);
      void agentes.trabalhar("organizador", T.chat.respostas.lembrete(titulo, descricao), 400);
      return { agente: "organizador", resposta: T.chat.respostas.lembrete(titulo, descricao), ok: true };
    }
    case "lembrar": {
      if (!argumentos) return { agente: "organizador", resposta: T.chat.respostas.faltaTitulo, ok: false };
      useComunicacao.getState().lembrar(argumentos, "organizador", "comando");
      return { agente: "organizador", resposta: T.chat.respostas.lembrar, ok: true };
    }
    case "status": {
      const hoje = hojeISO();
      const rotina = useRotina.getState();
      const abertas = tarefasDoDia(rotina.tarefas, hoje).filter((t) => t.status !== "concluida" && t.status !== "cancelada").length;
      const pendentes = rotina.habitos.filter((h) => !h.arquivado && !habitoCumprido(h, rotina.registros[hoje]?.[h.id])).length;
      const fin = useFinancas.getState();
      const gasto = somar(gastosDoMes(fin, hoje.slice(0, 7)), (t) => valorEmReais(t, fin, parteDoUsuario(t, fin.divisoes)));
      return {
        agente: "organizador",
        resposta: T.chat.respostas.status({
          ...(funcaoLigada("journal") ? { tarefas: abertas, habitos: pendentes } : {}),
          ...(funcaoLigada("estudos") ? { revisoes: revisoesParaHoje(useEstudos.getState()) } : {}),
          ...(funcaoLigada("financas") ? { gasto: formatarDinheiro(gasto) } : {}),
        }),
        ok: true,
      };
    }
    default:
      return { agente: "organizador", resposta: T.chat.naoEntendi, ok: false };
  }
}
