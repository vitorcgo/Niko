import { create } from "zustand";
import type { AgenteId, CartaoConfirmacao, Mensagem } from "../tipos";
import { useComunicacao } from "./comunicacao";
import { useAgentes } from "./agentes";
import { useConfig } from "./configuracoes";
import { executarComando, confirmarComando, faltaCategoria } from "../utilitarios/comandos";
import { detectarIntencao } from "../utilitarios/intencoes";
import { preferenciasDoAgente, resumoPorAgente } from "../utilitarios/contextoIa";
import { acharMencao, escolherAgente, historicoParaIa, perguntarAssistente, provedoresEmOrdem, mensagemDeErroIa } from "../utilitarios/assistente";
import { hojeISO } from "../utilitarios/datas";
import { guardarImagens, imagemParaBlob, type AnexoPronto } from "../utilitarios/anexos";
import { lerTextoDeImagem, mensagemDeLeitura } from "../utilitarios/leitorDeArquivos";
import { tocarSom } from "../ponte/sons";
import { chaveConfirmacao, reservarConfirmacao } from "../ponte/confirmacoes";
import { useInterface } from "./interface";
import { aoPrepararSaida } from "../ponte/armazenamento";
import { T } from "../textos/textos";
import { controlarPomodoro, detectarPedidoLocal, montarPedidoAnexo, textoPomodoro, textoRelatorioSemanal, type AcaoAnexo } from "../utilitarios/recursosChat";
import { textoCapacidadesResumido } from "../utilitarios/ferramentasIa";

export type FaseConversa = "escolhendo" | "respondendo" | null;

interface EstadoConversando {
  conversaId: string | null;
  fase: FaseConversa;
  agente: AgenteId | null;
  parcial: string;
  confirmando: Record<string, boolean>;
}

export const useConversando = create<EstadoConversando>()(() => ({ conversaId: null, fase: null, agente: null, parcial: "", confirmando: {} }));

let controle: AbortController | null = null;
let quadroPendente = 0;
let parcialPendente = "";

function mostrarParcial(texto: string) {
  parcialPendente = texto;
  if (quadroPendente) return;
  quadroPendente = window.requestAnimationFrame(() => {
    quadroPendente = 0;
    useConversando.setState({ parcial: parcialPendente });
  });
}

function limpar() {
  if (quadroPendente) window.cancelAnimationFrame(quadroPendente);
  quadroPendente = 0;
  parcialPendente = "";
  controle = null;
  useConversando.setState({ conversaId: null, fase: null, agente: null, parcial: "" });
}

export function ocupado(): boolean {
  return useConversando.getState().fase !== null;
}

export function pararResposta() {
  controle?.abort();
}

aoPrepararSaida(() => {
  pararResposta();
  const pendente = () => ocupado() || Object.keys(useConversando.getState().confirmando).length > 0;
  if (!pendente()) return Promise.resolve();
  return new Promise<void>((resolver, rejeitar) => {
    const limite = window.setTimeout(() => { parar(); rejeitar(new Error("acoes_pendentes")); }, 8500);
    const parar = useConversando.subscribe(() => {
      if (!pendente()) { window.clearTimeout(limite); parar(); resolver(); }
    });
  });
});

const esperar = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

async function responder(conversaId: string, agente: AgenteId, texto: string, extra: Partial<Mensagem> = {}, atraso = 280) {
  useConversando.setState({ conversaId, fase: "respondendo", agente, parcial: "" });
  await esperar(atraso);
  useComunicacao.getState().adicionarMensagem(conversaId, { autor: "agente", agenteId: agente, texto, ...extra });
  limpar();
}

function limiteAtingido(): boolean {
  const cfg = useConfig.getState().consumo;
  if (cfg.limiteMensal <= 0 || cfg.precoEntrada + cfg.precoSaida <= 0) return false;
  const mes = hojeISO().slice(0, 7);
  const custo = useComunicacao.getState().usoIa.filter((u) => u.data.startsWith(mes)).reduce((a, u) => a + (u.entrada * cfg.precoEntrada + u.saida * cfg.precoSaida) / 1e6, 0);
  return custo >= cfg.limiteMensal;
}

async function perguntar(conversaId: string, pedido: string, agente: AgenteId, rapido: boolean, historico?: Mensagem[], enviada?: Mensagem, apenasAnalise = false) {
  useConversando.setState({ conversaId, fase: "escolhendo", agente, parcial: "" });
  await esperar(rapido ? 320 : 1100);
  useConversando.setState({ fase: "respondendo" });
  void useAgentes.getState().trabalhar(agente, T.chat.pensando, 400);
  controle = new AbortController();
  const conversa = useComunicacao.getState().conversas.find((c) => c.id === conversaId);
  const anteriores = historico ?? (conversa?.mensagens ?? []).slice(0, -1);
  const mensagemPedido = enviada ?? [...(conversa?.mensagens ?? [])].reverse().find((m) => m.autor === "usuario" && m.texto === pedido);
  const r = await perguntarAssistente({ agente, historico: apenasAnalise ? [{ papel: "usuario", texto: pedido }] : historicoParaIa(anteriores, agente, mensagemPedido ? { ...mensagemPedido, texto: pedido } : pedido), sinal: controle.signal, aoTexto: mostrarParcial, apenasAnalise });
  const adicionar = useComunicacao.getState().adicionarMensagem;
  const origem = r.origem ? (r.trocas.length ? T.chat.trocouProvedor(r.trocas.join(", "), r.origem) : r.origem) : undefined;
  const automaticas = r.exigirConfirmacao || preferenciasDoAgente(agente) !== null ? [] : useConfig.getState().ia.autoAprovar ?? [];
  const avisoConfirmacao = r.confirmacoes.length ? T.chat.ferramentas.confira(r.confirmacoes.length) : "";
  for (let i = 0; i < r.confirmacoes.length; i++) {
    const c = r.confirmacoes[i];
    if (!automaticas.includes(c.tipo) || c.tipo === "email" || c.tipo === "rascunho" || faltaCategoria(c)) continue;
    const resultado = await confirmarComando(c);
    const falhou = resultado === T.chat.respostas.naoAchei || resultado === T.chat.respostas.semConta;
    r.texto += `\n\n${resultado}`;
    if (!falhou) {
      r.acoes.push(T.chat.permissao.acoes[c.tipo]);
      r.confirmacoes[i] = { ...c, situacao: "confirmado" };
    }
  }
  if (avisoConfirmacao) {
    const pendentes = r.confirmacoes.filter((c) => c.situacao === "pendente").length;
    r.texto = r.texto.replace(avisoConfirmacao, pendentes ? T.chat.ferramentas.confira(pendentes) : "").trim();
  }
  if (r.texto.trim() || r.confirmacoes.length) {
    adicionar(conversaId, {
      autor: "agente",
      agenteId: agente,
      texto: r.texto.trim(),
      confirmacoes: r.confirmacoes.length ? r.confirmacoes : undefined,
      acoes: r.acoes.length ? r.acoes : undefined,
      origem,
      incompleta: r.parado || (r.falha !== null && r.texto.trim().length > 0),
    });
    if (r.confirmacoes.length) void tocarSom("approval", "avisos");
  }
  if (r.parado && !r.texto.trim()) adicionar(conversaId, { autor: "agente", agenteId: agente, texto: T.chat.paradoAntes, repetir: pedido, analiseAnexo: apenasAnalise });
  if (!r.parado && r.falha === null && !r.texto.trim() && !r.confirmacoes.length) {
    void tocarSom("error", "avisos");
    adicionar(conversaId, { autor: "agente", agenteId: agente, texto: r.cortada === "so_raciocinio" ? T.chat.confianca.soRaciocinio : T.chat.confianca.respostaVazia, erro: true, repetir: pedido, analiseAnexo: apenasAnalise });
  }
  if (r.falha !== null && !r.parado) {
    void tocarSom("error", "avisos");
    adicionar(conversaId, { autor: "agente", agenteId: agente, texto: mensagemDeErroIa(r.falha, r.trocas), detalhe: r.falha.slice(0, 600), erro: true, repetir: pedido, analiseAnexo: apenasAnalise });
  }
  limpar();
}

async function semTravarOChat(conversaId: string, tarefa: () => Promise<void>) {
  try {
    await tarefa();
  } catch (erro) {
    console.error("Falha ao responder no chat", erro);
    const agente = useConversando.getState().agente ?? "organizador";
    limpar();
    void tocarSom("error", "avisos");
    useComunicacao.getState().adicionarMensagem(conversaId, { autor: "agente", agenteId: agente, texto: mensagemDeErroIa((erro as Error)?.message || "erro", []), erro: true });
  }
}

export async function enviarAoTime(conversaId: string, texto: string, anexos: AnexoPronto[] = [], opcoes: { acaoAnexo?: AcaoAnexo } = {}) {
  const limpo = texto.trim() || (opcoes.acaoAnexo ? T.chat.anexos.pedidos[opcoes.acaoAnexo] : anexos.length ? T.chat.anexos.semTexto : "");
  if (!limpo || ocupado()) return;
  useConversando.setState({ conversaId, fase: "escolhendo", agente: "organizador", parcial: "" });
  await semTravarOChat(conversaId, () => processarEnvio(conversaId, texto, limpo, anexos, opcoes));
}

async function processarEnvio(conversaId: string, texto: string, limpo: string, anexos: AnexoPronto[], opcoes: { acaoAnexo?: AcaoAnexo }) {
  const enviada = useComunicacao.getState().adicionarMensagem(conversaId, { autor: "usuario", agenteId: "organizador", texto: limpo, anexos: anexos.length ? anexos.map((a) => a.anexo) : undefined });
  guardarImagens(enviada.id, anexos.flatMap((a) => (a.imagemCompleta ? [a.imagemCompleta] : [])));
  void tocarSom("send");
  const mencao = acharMencao(limpo);
  const semMencao = mencao ? limpo.replace(/^@\S+\s*/, "") : limpo;
  if (opcoes.acaoAnexo) {
    let analisaveis = anexos;
    if (anexos.some((a) => !a.anexo.texto?.trim() && a.imagemCompleta)) {
      try {
        analisaveis = await Promise.all(anexos.map(async (a) => (a.anexo.texto?.trim() || !a.imagemCompleta ? a : { ...a, anexo: { ...a.anexo, texto: (await lerTextoDeImagem(imagemParaBlob(a.imagemCompleta))).texto } })));
      } catch (erro) {
        const nome = anexos.find((a) => a.imagemCompleta && !a.anexo.texto)?.anexo.nome ?? "";
        await responder(conversaId, "tutor", mensagemDeLeitura(erro, nome) ?? T.estudos.arquivos.leitura.falha_ocr(nome));
        return;
      }
    }
    let pedido: string;
    try { pedido = montarPedidoAnexo(opcoes.acaoAnexo, analisaveis.map((a) => a.anexo)); }
    catch (erro) { await responder(conversaId, "tutor", (erro as Error).message); return; }
    if (opcoes.acaoAnexo === "extrair") {
      const blocos = analisaveis
        .filter((a) => a.anexo.texto?.trim())
        .map((a) => {
          const original = a.anexo.texto ?? "";
          const trecho = original.slice(0, 45000).replace(/^```/gm, " ```");
          return `**${T.chat.anexos.extraidoTitulo(a.anexo.nome)}**\n\n\`\`\`texto\n${trecho}\n\`\`\`${trecho.length < original.length ? `\n\n${T.chat.anexos.recorte}` : ""}`;
        });
      await responder(conversaId, "tutor", blocos.join("\n\n"));
      return;
    }
    if (limiteAtingido()) { await responder(conversaId, "operador", T.chat.limiteAtingido); return; }
    await perguntar(conversaId, `${pedido}${texto.trim() ? `\n\n${texto.trim()}` : ""}`, mencao ?? "tutor", true, [], undefined, true);
    return;
  }
  const ultima = useComunicacao.getState().conversas.find((c) => c.id === conversaId)?.mensagens.at(-2);
  const contextoPomodoro = ultima?.autor === "agente" && /pomodoro|foco|timer/i.test(ultima.texto) && (Boolean(ultima.acoes?.length) || ultima.texto.startsWith("Pomodoro:"));
  const local = anexos.length ? null : detectarPedidoLocal(semMencao, contextoPomodoro);
  if (local) {
    if (local === "capacidades") await responder(conversaId, mencao ?? "organizador", textoCapacidadesResumido());
    else if (local === "relatorio") await responder(conversaId, mencao ?? "organizador", textoRelatorioSemanal());
    else if (local === "timer") await responder(conversaId, mencao ?? "organizador", textoPomodoro());
    else {
      const r = controlarPomodoro(local);
      await responder(conversaId, mencao ?? "organizador", r.tipo === "dados" ? r.resumo : r.mensagem, r.tipo === "dados" ? { acoes: [r.resumo] } : {});
    }
    return;
  }
  const intencao = anexos.length ? ({ tipo: "desconhecida", agente: escolherAgente(semMencao) } as const) : detectarIntencao(semMencao);

  if (intencao.tipo === "comando") {
    const r = executarComando(intencao.comando, { confirmar: intencao.confirmar });
    await responder(conversaId, mencao ?? r.agente, r.resposta, { confirmacao: r.confirmacao, ...(r.ok && intencao.comando.startsWith("/pomodoro") ? { acoes: [r.resposta] } : {}) });
    if (r.confirmacao) void tocarSom("approval", "avisos");
    return;
  }
  if (intencao.tipo === "saudacao" || intencao.tipo === "resumo") {
    const resumo = resumoPorAgente();
    const nomes = useConfig.getState().agentes.nomes;
    if (mencao) {
      await responder(conversaId, mencao, intencao.tipo === "saudacao" ? `${T.chat.oi(useConfig.getState().nome)} ${resumo[mencao]}` : resumo[mencao]);
      return;
    }
    const linhas = (Object.keys(resumo) as AgenteId[]).map((a) => `**${nomes[a]}:** ${resumo[a]}`).join("\n");
    await responder(conversaId, "organizador", `${intencao.tipo === "saudacao" ? `${T.chat.oi(useConfig.getState().nome)}\n\n` : ""}${linhas}`, {}, 420);
    return;
  }
  const temCodigo = anexos.some((a) => a.anexo.texto != null && /\.(js|jsx|ts|tsx|mjs|cjs|py|java|kt|cs|go|rs|rb|php|c|h|cpp|hpp|swift|sql|sh|ps1|vue|svelte|html?|css|scss|json)$/i.test(a.anexo.nome));
  const agente = mencao ?? (temCodigo ? "java" : escolherAgente(semMencao));
  const provedores = await provedoresEmOrdem();
  if (provedores.length === 0) {
    await responder(conversaId, agente, T.chat.semIaResposta);
    return;
  }
  if (limiteAtingido()) {
    void tocarSom("rate", "avisos");
    await responder(conversaId, "operador", T.chat.limiteAtingido);
    return;
  }
  await perguntar(conversaId, semMencao, agente, Boolean(mencao), undefined, enviada);
}

export async function tentarDeNovo(conversaId: string, mensagem: Mensagem) {
  if (ocupado() || !mensagem.repetir) return;
  const pedido = mensagem.repetir;
  const mensagens = useComunicacao.getState().conversas.find((c) => c.id === conversaId)?.mensagens ?? [];
  const ultimoPedido = mensagens.map((m) => m.autor === "usuario").lastIndexOf(true);
  const anteriores = mensagens.slice(0, Math.max(0, ultimoPedido)).filter((m) => !m.repetir);
  useComunicacao.getState().atualizarMensagem(conversaId, mensagem.id, { repetir: undefined });
  if (limiteAtingido()) {
    await responder(conversaId, "operador", T.chat.limiteAtingido, {}, 0);
    return;
  }
  await semTravarOChat(conversaId, () => perguntar(conversaId, pedido, mensagem.agenteId, true, anteriores, undefined, Boolean(mensagem.analiseAnexo)));
}

export async function usarSugestao(conversaId: string, comando: string) {
  if (ocupado()) return;
  const r = executarComando(comando, { confirmar: true });
  void tocarSom(r.confirmacao ? "approval" : "blip", r.confirmacao ? "avisos" : "interface");
  await responder(conversaId, r.agente, r.resposta, { confirmacao: r.confirmacao }, 120);
}

export function alterarDadosDoCartao(conversaId: string, mensagem: Mensagem, indice: number | null, dados: CartaoConfirmacao["dados"]) {
  if (useConversando.getState().confirmando[chaveConfirmacao(conversaId, mensagem.id, indice)]) return;
  const com = useComunicacao.getState();
  const atual = com.conversas.find((c) => c.id === conversaId)?.mensagens.find((m) => m.id === mensagem.id);
  const cartao = indice === null ? atual?.confirmacao : atual?.confirmacoes?.[indice];
  if (!atual || cartao?.situacao !== "pendente") return;
  if (indice === null) {
    if (atual.confirmacao) com.atualizarMensagem(conversaId, mensagem.id, { confirmacao: { ...atual.confirmacao, dados: { ...atual.confirmacao.dados, ...dados } } });
  } else if (atual.confirmacoes) {
    com.atualizarMensagem(conversaId, mensagem.id, { confirmacoes: atual.confirmacoes.map((c, i) => (i === indice ? { ...c, dados: { ...c.dados, ...dados } } : c)) });
  }
}

export async function decidirCartao(conversaId: string, mensagem: Mensagem, indice: number | null, aceitar: boolean) {
  const id = chaveConfirmacao(conversaId, mensagem.id, indice);
  if (useConversando.getState().confirmando[id]) return;
  const atual = () => useComunicacao.getState().conversas.find((c) => c.id === conversaId)?.mensagens.find((m) => m.id === mensagem.id);
  const original = atual();
  if (!original) return;
  const cartao = indice === null ? original?.confirmacao : original?.confirmacoes?.[indice];
  if (!cartao || cartao.situacao !== "pendente") return;
  if (aceitar && faltaCategoria(cartao)) return;
  useConversando.setState((s) => ({ confirmando: { ...s.confirmando, [id]: true } }));
  const atualizar = (situacao: CartaoConfirmacao["situacao"]) => {
    const corrente = atual();
    if (!corrente) return;
    const novo = { ...cartao, situacao };
    const com = useComunicacao.getState();
    if (indice === null) com.atualizarMensagem(conversaId, mensagem.id, { confirmacao: novo });
    else if (corrente.confirmacoes) com.atualizarMensagem(conversaId, mensagem.id, { confirmacoes: corrente.confirmacoes.map((c, i) => i === indice ? novo : c) });
  };
  let reservada = false;
  try {
    const reserva = await reservarConfirmacao(id, aceitar);
    if (!reserva.reservada) {
      atualizar(reserva.situacao === "cancelado" ? "cancelado" : "verificar");
      useInterface.getState().avisar(T.chat.confirmacaoJaRespondida);
      return;
    }
    reservada = true;
    const corrente = atual();
    const decisaoAtual = indice === null ? corrente?.confirmacao : corrente?.confirmacoes?.[indice];
    if (!decisaoAtual || decisaoAtual.situacao !== "pendente") return;
    const resposta = aceitar ? await confirmarComando(cartao) : T.chat.cancelado;
    atualizar(reserva.situacao);
    if ((original.confirmacoes?.length ?? 0) <= 1) useComunicacao.getState().adicionarMensagem(conversaId, { autor: "agente", agenteId: original.agenteId, texto: resposta });
    if (aceitar) void tocarSom("approve");
  } catch {
    if (reservada) atualizar("verificar");
    useInterface.getState().avisar(T.chat.confirmacaoFalhou);
  } finally {
    useConversando.setState((s) => ({ confirmando: Object.fromEntries(Object.entries(s.confirmando).filter(([chave]) => chave !== id)) }));
  }
}
