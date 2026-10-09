import type { AgentId, CardConfirmation, Message } from "../types";
import { stateBridge, chatAi, testProvider, type Provider, type MessageBridgeAi, type CallTool } from "../bridge/localBridge";
import { useConfig } from "../state/settings";
import { useCommunication } from "../state/communication";
import { AGENTS } from "../state/agents";
import { definitionsTools, executeTool } from "./aiTools";
import { promptAgent } from "./aiContext";
import { agentPeloSubject } from "./intents";
import { generateId, normalizeText } from "./basics";
import { todayISO } from "./dates";
import { textWithAttachments, imagesMessage } from "./attachments";
import { T } from "../i18n/ptBR";
import { assertsExecution, removePrefixAgent } from "./chatFeatures";

export interface ProviderAtUsage {
  provedor: Provider;
  modelo: string;
}

export interface ResponseAssistant {
  texto: string;
  confirmacoes: CardConfirmation[];
  acoes: string[];
  origem: string | null;
  trocas: string[];
  falha: string | null;
  parado: boolean;
  cortada?: "cortado" | "so_raciocinio";
}

export function modelProvider(p: Provider): string {
  const ai = useConfig.getState().ia;
  return ai.modelos?.[p.id] || (p.id === ai.provedorId ? ai.modelo : "") || p.modelo;
}

export async function providersAtOrder(force = false): Promise<ProviderAtUsage[]> {
  const ai = useConfig.getState().ia;
  const state = await stateBridge(force);
  const ids = [...new Set([ai.provedorId, ...(ai.reservas ?? [])].filter((x): x is string => Boolean(x)))];
  return ids
    .map((id) => state.provedores.find((p) => p.id === id))
    .filter((p): p is Provider => Boolean(p))
    .map((provider) => ({ provedor: provider, modelo: modelProvider(provider) }));
}

export function findMention(text: string): AgentId | undefined {
  const names = useConfig.getState().agentes.nomes;
  const start = /^@([\p{L}\d_-]+)/u.exec(text.trim())?.[1];
  if (!start) return undefined;
  const target = normalizeText(start);
  return AGENTS.find((a) => normalizeText(names[a]) === target || a === target);
}

export function selectAgent(text: string): AgentId {
  return findMention(text) ?? agentPeloSubject(text);
}

export function historyToAi(messages: Message[], agent: AgentId, request: Message | string): MessageBridgeAi[] {
  const names = useConfig.getState().agentes.nomes;
  const previous = messages.filter((m) => !m.repetir && !m.erro && (m.texto.trim() || m.anexos?.length)).slice(-16).map((m): MessageBridgeAi => ({
    papel: m.autor === "usuario" ? "usuario" : "assistente",
    texto: m.autor === "agente" && m.agenteId !== agent ? `${names[m.agenteId]}: ${m.texto}` : textWithAttachments(m.texto, m.anexos),
  }));
  const last: MessageBridgeAi =
    typeof request === "string"
      ? { papel: "usuario", texto: request }
      : { papel: "usuario", texto: textWithAttachments(request.texto, request.anexos), imagens: imagesMessage(request.id) };
  return [...previous, last];
}

const withoutTools = new Set<string>();
const modelsProvider = new Map<string, Promise<string[]>>();

function family(model: string): string {
  return model.toLowerCase().split(/[-_/:.\d]/).filter(Boolean)[0] ?? "";
}

async function modelSibling(provider: Provider, current: string, used: Set<string>): Promise<string | null> {
  if (!modelsProvider.has(provider.id)) modelsProvider.set(provider.id, testProvider(provider.id).then((r) => (r.ok ? r.modelos : [])).catch(() => []));
  const list = await modelsProvider.get(provider.id)!;
  const fam = family(current);
  const typeCurrent = /lite|mini|small|nano/.test(current) ? "leve" : /pro|large|opus/.test(current) ? "grande" : "medio";
  const candidates = list
    .filter((m) => m !== current && family(m) === fam && !used.has(`${provider.id}|${m}`) && !/(preview|exp|tts|image|audio|live|embedding|vision-only|thinking)/i.test(m))
    .sort((a, b) => {
      const weight = (m: string) => ((/lite|mini|small|nano/.test(m) ? "leve" : /pro|large|opus/.test(m) ? "grande" : "medio") === typeCurrent ? 0 : 1);
      return weight(a) - weight(b) || b.localeCompare(a, undefined, { numeric: true });
    });
  const selected = candidates[0] ?? null;
  if (selected) {
    const ai = useConfig.getState().ia;
    useConfig.getState().set({ ia: { ...ai, modelos: { ...ai.modelos, [provider.id]: selected }, ...(ai.provedorId === provider.id ? { modelo: selected } : {}) } });
  }
  return selected;
}

export function registerUsage(usage: { entrada: number; saida: number; provedor: string; modelo: string }, agent: AgentId) {
  const list = useCommunication.getState().usoIa;
  useCommunication.getState().setUsageAi([...list, { id: generateId(), data: todayISO(), provedor: usage.provedor, modelo: usage.modelo, agenteId: agent, entrada: usage.entrada, saida: usage.saida }]);
}

export function textUntilLastSentence(text: string): string {
  const end = Math.max(...[". ", "! ", "? ", ".\n", "!\n", "?\n", ":\n", "\n\n"].map((m) => text.lastIndexOf(m)));
  return end < 0 ? "" : text.slice(0, end + 1).trimEnd();
}

export async function askAssistant(options: {
  agente: AgentId;
  historico: MessageBridgeAi[];
  sinal: AbortSignal;
  aoTexto?: (text: string) => void;
  apenasAnalise?: boolean;
}): Promise<ResponseAssistant> {
  const response: ResponseAssistant = { texto: "", confirmacoes: [], acoes: [], origem: null, trocas: [], falha: null, parado: false };
  const queue = await providersAtOrder();
  if (queue.length === 0) {
    response.falha = "sem_provedor";
    return response;
  }
  const system = promptAgent(options.agente, options.apenasAnalise);
  const definitions = options.apenasAnalise ? [] : definitionsTools();
  const allowed = new Set(definitions.map((f) => f.nome));
  const errorsTool: string[] = [];
  const stringsChecked: string[] = [];
  let analysisBlocked = false;
  let modelWithoutTools = false;
  const messages = [...options.historico];
  let index = 0;
  let lastError = "";
  const attempts = new Map<number, number>();
  const used = new Set(queue.map((f) => `${f.provedor.id}|${f.modelo}`));

  const namesAgents = [...Object.values(useConfig.getState().agentes.nomes), ...AGENTS, "Rubi", "Nanquim", "Sol", "Java"];
  let displayReleased = Boolean(options.aoTexto);
  let lastDisplayed = "";
  const displayPartial = (text: string) => {
    if (!displayReleased) return;
    const complete = textUntilLastSentence(text);
    if (!options.apenasAnalise && assertsExecution(complete)) {
      displayReleased = false;
      if (lastDisplayed) options.aoTexto?.("");
      return;
    }
    const clean = removePrefixAgent(complete, namesAgents);
    if (clean === lastDisplayed) return;
    lastDisplayed = clean;
    options.aoTexto?.(clean);
  };
  const stopDisplay = () => {
    if (!displayReleased) return;
    displayReleased = false;
    if (lastDisplayed) options.aoTexto?.("");
  };

  for (let step = 0; step < 8; step++) {
    let textStep = "";
    let calls: CallTool[] = [];
    let error: string | null = null;
    let end: { entrada: number; saida: number; provedor: string; modelo: string } | null = null;

    while (index < queue.length) {
      const { provedor: provider, modelo: model } = queue[index];
      const key = `${provider.id}|${model}`;
      modelWithoutTools = withoutTools.has(key);
      textStep = "";
      calls = [];
      error = null;
      end = null;
      try {
        for await (const ev of chatAi({ provedorId: provider.id, modelo: model || undefined, sistema: system, mensagens: messages, ferramentas: withoutTools.has(key) ? undefined : definitions }, options.sinal)) {
          if (ev.tipo === "texto" && ev.texto) {
            textStep += ev.texto;
            if (step === 0 && calls.length === 0) displayPartial(textStep);
          } else if (ev.tipo === "ferramenta" && ev.chamada) {
            calls.push(ev.chamada);
            stopDisplay();
          }
          else if (ev.tipo === "aviso" && (ev.texto === "cortado" || ev.texto === "so_raciocinio")) response.cortada = ev.texto;
          else if (ev.tipo === "aviso" && ev.texto === "sem_ferramentas") {
            withoutTools.add(key);
            modelWithoutTools = true;
          }
          else if (ev.tipo === "erro") {
            error = ev.texto || "erro";
            break;
          } else if (ev.tipo === "fim") end = { entrada: ev.entrada ?? 0, saida: ev.saida ?? 0, provedor: ev.provedor ?? provider.nome, modelo: ev.modelo ?? model };
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") response.parado = true;
        else error = T.chat.semPonte;
      }
      if (response.parado) break;
      if (error && error !== "cancelado" && !textStep && calls.length === 0) {
        lastError = error;
        const type = classifyErrorAi(error).tipo;
        const done = attempts.get(index) ?? 0;
        if (type === "cota" && done < 2) {
          attempts.set(index, done + 1);
          const sibling = await modelSibling(provider, model, used);
          if (sibling) {
            used.add(`${provider.id}|${sibling}`);
            response.trocas.push(`${provider.nome} . ${model}`);
            queue[index] = { provedor: provider, modelo: sibling };
            continue;
          }
        }
        if ((type === "sobrecarga" || type === "limite" || type === "tempo") && done < 1) {
          attempts.set(index, done + 1);
          options.aoTexto?.("");
          await new Promise((r) => window.setTimeout(r, type === "limite" ? 3000 : 1500));
          if (options.sinal.aborted) {
            response.parado = true;
            break;
          }
          continue;
        }
        response.trocas.push(provider.nome);
        index++;
        continue;
      }
      response.origem = `${provider.nome} . ${model}`;
      break;
    }

    if (calls.length === 0) response.texto = textStep;
    if (end) registerUsage(end, options.agente);
    if (response.parado) break;
    if (index >= queue.length) {
      response.falha = lastError || "erro";
      break;
    }
    if (error) {
      response.falha = error;
      break;
    }
    if (calls.length === 0) break;

    messages.push({ papel: "assistente", texto: textStep, chamadas: calls });
    let resume = false;
    for (const c of calls) {
      if (options.sinal.aborted) { response.parado = true; break; }
      if (options.apenasAnalise) { analysisBlocked = true; break; }
      if (modelWithoutTools || !allowed.has(c.nome)) {
        const message = T.chat.confianca.ferramentaIndisponivel(c.nome);
        errorsTool.push(message);
        messages.push({ papel: "ferramenta", idChamada: c.id, texto: message });
        resume = true;
        continue;
      }
      const r = await executeTool(c.nome, c.argumentos);
      if (r.tipo === "dados") {
        if (r.resumo) response.acoes.push(r.resumo);
        if (r.textoVerificado) stringsChecked.push(r.textoVerificado);
        messages.push({ papel: "ferramenta", idChamada: c.id, texto: JSON.stringify(r.conteudo).slice(0, 12000) });
        resume = true;
      } else if (r.tipo === "confirmar") {
        response.confirmacoes.push(r.cartao);
        messages.push({ papel: "ferramenta", idChamada: c.id, texto: T.chat.ferramentas.aguardandoConfirmacao });
      } else {
        errorsTool.push(r.mensagem);
        messages.push({ papel: "ferramenta", idChamada: c.id, texto: `Erro: ${r.mensagem}` });
        resume = true;
      }
    }
    if (!resume) break;
  }

  response.texto = removePrefixAgent(response.texto, namesAgents);
  if (analysisBlocked) response.texto = T.chat.confianca.analiseBloqueada;
  else if (stringsChecked.length || response.acoes.length || response.confirmacoes.length || errorsTool.length) {
    response.texto = [
      ...stringsChecked,
      ...response.acoes,
      ...(response.confirmacoes.length ? [T.chat.ferramentas.confira(response.confirmacoes.length)] : []),
      ...(errorsTool.length ? [T.chat.confianca.falhaFerramenta([...new Set(errorsTool)].join("; "))] : []),
    ].join("\n\n");
  } else if (!options.apenasAnalise && assertsExecution(response.texto)) response.texto = T.chat.confianca.semExecucao;
  if (modelWithoutTools && !options.apenasAnalise) response.texto = [response.texto, T.chat.confianca.semFerramentas].filter(Boolean).join("\n\n");
  if (response.cortada && response.texto.trim()) response.texto = `${response.texto}\n\n${T.chat.confianca.respostaCortada}`;
  options.aoTexto?.(response.texto);
  return response;
}

export type TypeErrorAi = "cota" | "sobrecarga" | "limite" | "chave" | "modelo" | "recusado" | "tempo" | "rede" | "ponte" | "sem_provedor" | "outro";

export function classifyErrorAi(error: string): { tipo: TypeErrorAi; status: number | null } {
  const status = Number(/http_(\d{3})/.exec(error)?.[1]) || null;
  const text = error.toLowerCase();
  if (error === "sem_provedor") return { tipo: "sem_provedor", status };
  if (error === T.chat.semPonte) return { tipo: "ponte", status };
  if (text.includes("tempo_esgotado") || status === 408 || status === 504) return { tipo: "tempo", status };
  if (/exceeded your current quota|quota exceeded|insufficient_quota|billing/.test(text)) return { tipo: "cota", status };
  if (status === 429 || /rate.?limit|quota|resource_exhausted|too many/.test(text)) return { tipo: "limite", status };
  if (status === 503 || status === 502 || status === 500 || status === 529 || /overloaded|high demand|unavailable/.test(text)) return { tipo: "sobrecarga", status };
  if (status === 401 || status === 403 || /sem_chave|api key|unauthorized|invalid.*key|permission/.test(text)) return { tipo: "chave", status };
  if (status === 404 || /sem_modelo|model.*not.*found|does not exist|provedor_nao_encontrado/.test(text)) return { tipo: "modelo", status };
  if (status === 400 || status === 422) return { tipo: "recusado", status };
  if (text.startsWith("rede") || /fetch failed|econnrefused|enotfound|network/.test(text)) return { tipo: "rede", status };
  return { tipo: "outro", status };
}

export function messageErrorAi(error: string, swaps: string[]): string {
  const { tipo: type } = classifyErrorAi(error);
  const base = T.chat.erros[type];
  return swaps.length > 1 ? `${base} ${T.chat.erros.tentados(swaps.join(", "))}` : base;
}
