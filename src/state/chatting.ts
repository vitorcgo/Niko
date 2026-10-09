import { create } from "zustand";
import type { AgentId, CardConfirmation, Message } from "../types";
import { useCommunication } from "./communication";
import { useAgents } from "./agents";
import { useConfig } from "./settings";
import { executeCommand, confirmCommand, missingCategory } from "../utils/commands";
import { detectIntent } from "../utils/intents";
import { summaryByAgent } from "../utils/aiContext";
import { findMention, selectAgent, historyToAi, askAssistant, providersAtOrder, messageErrorAi } from "../utils/assistant";
import { todayISO } from "../utils/dates";
import { storeImages, imageToBlob, type AttachmentReady } from "../utils/attachments";
import { readTextImage, messageRead } from "../utils/fileReader";
import { playSound } from "../bridge/sounds";
import { T } from "../i18n/ptBR";
import { controlPomodoro, detectRequestLocal, mountRequestAttachment, textPomodoro, textReportWeekly, type ActionAttachment } from "../utils/chatFeatures";
import { textCapabilitiesSummary } from "../utils/aiTools";

export type PhaseConversation = "escolhendo" | "respondendo" | null;

interface StateChatting {
  conversaId: string | null;
  fase: PhaseConversation;
  agente: AgentId | null;
  parcial: string;
}

export const useChatting = create<StateChatting>()(() => ({ conversaId: null, fase: null, agente: null, parcial: "" }));

let control: AbortController | null = null;
let boardPending = 0;
let partialPending = "";

function showPartial(text: string) {
  partialPending = text;
  if (boardPending) return;
  boardPending = window.requestAnimationFrame(() => {
    boardPending = 0;
    useChatting.setState({ parcial: partialPending });
  });
}

function clear() {
  if (boardPending) window.cancelAnimationFrame(boardPending);
  boardPending = 0;
  partialPending = "";
  control = null;
  useChatting.setState({ conversaId: null, fase: null, agente: null, parcial: "" });
}

export function busy(): boolean {
  return useChatting.getState().fase !== null;
}

export function stopResponse() {
  control?.abort();
}

const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

async function respond(conversationId: string, agent: AgentId, text: string, extra: Partial<Message> = {}, delay = 280) {
  useChatting.setState({ conversaId: conversationId, fase: "respondendo", agente: agent, parcial: "" });
  await wait(delay);
  useCommunication.getState().addMessage(conversationId, { autor: "agente", agenteId: agent, texto: text, ...extra });
  clear();
}

function limitReached(): boolean {
  const cfg = useConfig.getState().consumo;
  if (cfg.limiteMensal <= 0 || cfg.precoEntrada + cfg.precoSaida <= 0) return false;
  const month = todayISO().slice(0, 7);
  const cost = useCommunication.getState().usoIa.filter((u) => u.data.startsWith(month)).reduce((a, u) => a + (u.entrada * cfg.precoEntrada + u.saida * cfg.precoSaida) / 1e6, 0);
  return cost >= cfg.limiteMensal;
}

async function ask(conversationId: string, request: string, agent: AgentId, quick: boolean, historyValue?: Message[], sent?: Message, analysisOnly = false) {
  useChatting.setState({ conversaId: conversationId, fase: "escolhendo", agente: agent, parcial: "" });
  await wait(quick ? 320 : 1100);
  useChatting.setState({ fase: "respondendo" });
  void useAgents.getState().trabalhar(agent, T.chat.pensando, 400);
  control = new AbortController();
  const conversation = useCommunication.getState().conversas.find((c) => c.id === conversationId);
  const previous = historyValue ?? (conversation?.mensagens ?? []).slice(0, -1);
  const messageRequest = sent ?? [...(conversation?.mensagens ?? [])].reverse().find((m) => m.autor === "usuario" && m.texto === request);
  const r = await askAssistant({ agente: agent, historico: analysisOnly ? [{ papel: "usuario", texto: request }] : historyToAi(previous, agent, messageRequest ? { ...messageRequest, texto: request } : request), sinal: control.signal, aoTexto: showPartial, apenasAnalise: analysisOnly });
  const add = useCommunication.getState().addMessage;
  const originValue = r.origem ? (r.trocas.length ? T.chat.trocouProvedor(r.trocas.join(", "), r.origem) : r.origem) : undefined;
  const automatic = useConfig.getState().ia.autoAprovar ?? [];
  const noticeConfirmation = r.confirmacoes.length ? T.chat.ferramentas.confira(r.confirmacoes.length) : "";
  for (let i = 0; i < r.confirmacoes.length; i++) {
    const c = r.confirmacoes[i];
    if (!automatic.includes(c.tipo) || c.tipo === "email" || c.tipo === "rascunho" || missingCategory(c)) continue;
    const result = await confirmCommand(c);
    const failed = result === T.chat.respostas.naoAchei || result === T.chat.respostas.semConta;
    r.texto += `\n\n${result}`;
    if (!failed) {
      r.acoes.push(T.chat.permissao.acoes[c.tipo]);
      r.confirmacoes[i] = { ...c, situacao: "confirmado" };
    }
  }
  if (noticeConfirmation) {
    const pendingRequests = r.confirmacoes.filter((c) => c.situacao === "pendente").length;
    r.texto = r.texto.replace(noticeConfirmation, pendingRequests ? T.chat.ferramentas.confira(pendingRequests) : "").trim();
  }
  if (r.texto.trim() || r.confirmacoes.length) {
    add(conversationId, {
      autor: "agente",
      agenteId: agent,
      texto: r.texto.trim(),
      confirmacoes: r.confirmacoes.length ? r.confirmacoes : undefined,
      acoes: r.acoes.length ? r.acoes : undefined,
      origem: originValue,
      incompleta: r.parado || (r.falha !== null && r.texto.trim().length > 0),
    });
    if (r.confirmacoes.length) void playSound("approval", "avisos");
  }
  if (r.parado && !r.texto.trim()) add(conversationId, { autor: "agente", agenteId: agent, texto: T.chat.paradoAntes, repetir: request, analiseAnexo: analysisOnly });
  if (!r.parado && r.falha === null && !r.texto.trim() && !r.confirmacoes.length) {
    void playSound("error", "avisos");
    add(conversationId, { autor: "agente", agenteId: agent, texto: r.cortada === "so_raciocinio" ? T.chat.confianca.soRaciocinio : T.chat.confianca.respostaVazia, erro: true, repetir: request, analiseAnexo: analysisOnly });
  }
  if (r.falha !== null && !r.parado) {
    void playSound("error", "avisos");
    add(conversationId, { autor: "agente", agenteId: agent, texto: messageErrorAi(r.falha, r.trocas), detalhe: r.falha.slice(0, 600), erro: true, repetir: request, analiseAnexo: analysisOnly });
  }
  clear();
}

async function withoutLockOChat(conversationId: string, task: () => Promise<void>) {
  try {
    await task();
  } catch (error) {
    console.error("Falha ao responder no chat", error);
    const agent = useChatting.getState().agente ?? "organizador";
    clear();
    void playSound("error", "avisos");
    useCommunication.getState().addMessage(conversationId, { autor: "agente", agenteId: agent, texto: messageErrorAi((error as Error)?.message || "erro", []), erro: true });
  }
}

export async function sendToTeam(conversationId: string, text: string, attachments: AttachmentReady[] = [], options: { acaoAnexo?: ActionAttachment } = {}) {
  const clean = text.trim() || (options.acaoAnexo ? T.chat.anexos.pedidos[options.acaoAnexo] : attachments.length ? T.chat.anexos.semTexto : "");
  if (!clean || busy()) return;
  useChatting.setState({ conversaId: conversationId, fase: "escolhendo", agente: "organizador", parcial: "" });
  await withoutLockOChat(conversationId, () => processSend(conversationId, text, clean, attachments, options));
}

async function processSend(conversationId: string, text: string, clean: string, attachments: AttachmentReady[], options: { acaoAnexo?: ActionAttachment }) {
  const sent = useCommunication.getState().addMessage(conversationId, { autor: "usuario", agenteId: "organizador", texto: clean, anexos: attachments.length ? attachments.map((a) => a.anexo) : undefined });
  storeImages(sent.id, attachments.flatMap((a) => (a.imagemCompleta ? [a.imagemCompleta] : [])));
  void playSound("send");
  const mention = findMention(clean);
  const withoutMention = mention ? clean.replace(/^@\S+\s*/, "") : clean;
  if (options.acaoAnexo) {
    let analyzable = attachments;
    if (attachments.some((a) => !a.anexo.texto?.trim() && a.imagemCompleta)) {
      try {
        analyzable = await Promise.all(attachments.map(async (a) => (a.anexo.texto?.trim() || !a.imagemCompleta ? a : { ...a, anexo: { ...a.anexo, texto: (await readTextImage(imageToBlob(a.imagemCompleta))).texto } })));
      } catch (error) {
        const nameValue = attachments.find((a) => a.imagemCompleta && !a.anexo.texto)?.anexo.nome ?? "";
        await respond(conversationId, "tutor", messageRead(error, nameValue) ?? T.estudos.arquivos.leitura.falha_ocr(nameValue));
        return;
      }
    }
    let request: string;
    try { request = mountRequestAttachment(options.acaoAnexo, analyzable.map((a) => a.anexo)); }
    catch (error) { await respond(conversationId, "tutor", (error as Error).message); return; }
    if (options.acaoAnexo === "extrair") {
      const blocks = analyzable
        .filter((a) => a.anexo.texto?.trim())
        .map((a) => {
          const original = a.anexo.texto ?? "";
          const excerpt = original.slice(0, 45000).replace(/^```/gm, " ```");
          return `**${T.chat.anexos.extraidoTitulo(a.anexo.nome)}**\n\n\`\`\`texto\n${excerpt}\n\`\`\`${excerpt.length < original.length ? `\n\n${T.chat.anexos.recorte}` : ""}`;
        });
      await respond(conversationId, "tutor", blocks.join("\n\n"));
      return;
    }
    if (limitReached()) { await respond(conversationId, "operador", T.chat.limiteAtingido); return; }
    await ask(conversationId, `${request}${text.trim() ? `\n\n${text.trim()}` : ""}`, mention ?? "tutor", true, [], undefined, true);
    return;
  }
  const last = useCommunication.getState().conversas.find((c) => c.id === conversationId)?.mensagens.at(-2);
  const contextPomodoro = last?.autor === "agente" && /pomodoro|foco|timer/i.test(last.texto) && (Boolean(last.acoes?.length) || last.texto.startsWith("Pomodoro:"));
  const local = attachments.length ? null : detectRequestLocal(withoutMention, contextPomodoro);
  if (local) {
    if (local === "capacidades") await respond(conversationId, mention ?? "organizador", textCapabilitiesSummary());
    else if (local === "relatorio") await respond(conversationId, mention ?? "organizador", textReportWeekly());
    else if (local === "timer") await respond(conversationId, mention ?? "organizador", textPomodoro());
    else {
      const r = controlPomodoro(local);
      await respond(conversationId, mention ?? "organizador", r.tipo === "dados" ? r.resumo : r.mensagem, r.tipo === "dados" ? { acoes: [r.resumo] } : {});
    }
    return;
  }
  const intent = attachments.length ? ({ tipo: "desconhecida", agente: selectAgent(withoutMention) } as const) : detectIntent(withoutMention);

  if (intent.tipo === "comando") {
    const r = executeCommand(intent.comando, { confirmar: intent.confirmar });
    await respond(conversationId, mention ?? r.agente, r.resposta, { confirmacao: r.confirmacao, ...(r.ok && intent.comando.startsWith("/pomodoro") ? { acoes: [r.resposta] } : {}) });
    if (r.confirmacao) void playSound("approval", "avisos");
    return;
  }
  if (intent.tipo === "saudacao" || intent.tipo === "resumo") {
    const summary = summaryByAgent();
    const names = useConfig.getState().agentes.nomes;
    if (mention) {
      await respond(conversationId, mention, intent.tipo === "saudacao" ? `${T.chat.oi(useConfig.getState().nome)} ${summary[mention]}` : summary[mention]);
      return;
    }
    const lines = (Object.keys(summary) as AgentId[]).map((a) => `**${names[a]}:** ${summary[a]}`).join("\n");
    await respond(conversationId, "organizador", `${intent.tipo === "saudacao" ? `${T.chat.oi(useConfig.getState().nome)}\n\n` : ""}${lines}`, {}, 420);
    return;
  }
  const hasCode = attachments.some((a) => a.anexo.texto != null && /\.(js|jsx|ts|tsx|mjs|cjs|py|java|kt|cs|go|rs|rb|php|c|h|cpp|hpp|swift|sql|sh|ps1|vue|svelte|html?|css|scss|json)$/i.test(a.anexo.nome));
  const agent = mention ?? (hasCode ? "java" : selectAgent(withoutMention));
  const providers = await providersAtOrder();
  if (providers.length === 0) {
    await respond(conversationId, agent, T.chat.semIaResposta);
    return;
  }
  if (limitReached()) {
    void playSound("rate", "avisos");
    await respond(conversationId, "operador", T.chat.limiteAtingido);
    return;
  }
  await ask(conversationId, withoutMention, agent, Boolean(mention), undefined, sent);
}

export async function tryNew(conversationId: string, message: Message) {
  if (busy() || !message.repetir) return;
  const request = message.repetir;
  const messages = useCommunication.getState().conversas.find((c) => c.id === conversationId)?.mensagens ?? [];
  const lastRequest = messages.map((m) => m.autor === "usuario").lastIndexOf(true);
  const previous = messages.slice(0, Math.max(0, lastRequest)).filter((m) => !m.repetir);
  useCommunication.getState().updateMessage(conversationId, message.id, { repetir: undefined });
  if (limitReached()) {
    await respond(conversationId, "operador", T.chat.limiteAtingido, {}, 0);
    return;
  }
  await withoutLockOChat(conversationId, () => ask(conversationId, request, message.agenteId, true, previous, undefined, Boolean(message.analiseAnexo)));
}

export async function useSuggestion(conversationId: string, command: string) {
  if (busy()) return;
  const r = executeCommand(command, { confirmar: true });
  void playSound(r.confirmacao ? "approval" : "blip", r.confirmacao ? "avisos" : "interface");
  await respond(conversationId, r.agente, r.resposta, { confirmacao: r.confirmacao }, 120);
}

export function changeDataCard(conversationId: string, message: Message, index: number | null, payload: CardConfirmation["dados"]) {
  const communication = useCommunication.getState();
  const current = communication.conversas.find((c) => c.id === conversationId)?.mensagens.find((m) => m.id === message.id) ?? message;
  if (index === null) {
    if (current.confirmacao) communication.updateMessage(conversationId, message.id, { confirmacao: { ...current.confirmacao, dados: { ...current.confirmacao.dados, ...payload } } });
  } else if (current.confirmacoes) {
    communication.updateMessage(conversationId, message.id, { confirmacoes: current.confirmacoes.map((c, i) => (i === index ? { ...c, dados: { ...c.dados, ...payload } } : c)) });
  }
}

export async function decideCard(conversationId: string, message: Message, index: number | null, accept: boolean) {
  const communication = useCommunication.getState();
  const card: CardConfirmation | undefined = index === null ? message.confirmacao : message.confirmacoes?.[index];
  if (!card || card.situacao !== "pendente") return;
  if (accept && missingCategory(card)) return;
  const newItem: CardConfirmation = { ...card, situacao: accept ? "confirmado" : "cancelado" };
  const response = accept ? await confirmCommand(card) : T.chat.cancelado;
  if (index === null) communication.updateMessage(conversationId, message.id, { confirmacao: newItem });
  else communication.updateMessage(conversationId, message.id, { confirmacoes: message.confirmacoes!.map((c, i) => (i === index ? newItem : c)) });
  const multiple = (message.confirmacoes?.length ?? 0) > 1;
  if (!multiple) communication.addMessage(conversationId, { autor: "agente", agenteId: message.agenteId, texto: response });
  if (accept) void playSound("approve");
}
