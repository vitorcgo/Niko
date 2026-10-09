import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { readSecret, writeSecret, deleteSecret } from "./secrets";
import { createThoughtFilter } from "./thought";

export type TypeProvider = "anthropic" | "openai_compativel";

export interface Provider {
  id: string;
  tipo: TypeProvider;
  nome: string;
  urlBase: string;
  modelo: string;
  temChave: boolean;
  catalogo?: string;
}

export interface CallTool {
  id: string;
  nome: string;
  argumentos: Record<string, unknown>;
}

export interface ImageAi {
  tipo: string;
  base64: string;
}

export interface MessageAi {
  papel: "usuario" | "assistente" | "ferramenta";
  texto: string;
  chamadas?: CallTool[];
  idChamada?: string;
  imagens?: ImageAi[];
}

export interface Tool {
  nome: string;
  descricao: string;
  parametros: Record<string, unknown>;
}

export function validateTools(value: unknown): Tool[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((f): f is Tool => typeof f?.nome === "string" && /^[a-z_]{2,40}$/.test(f.nome) && typeof f.descricao === "string" && typeof f.parametros === "object" && f.parametros !== null)
    .slice(0, 30)
    .map((f) => ({ nome: f.nome, descricao: f.descricao.slice(0, 600), parametros: f.parametros }));
}

export function validateMessages(value: unknown): MessageAi[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((m) => typeof m?.texto === "string" && ["usuario", "assistente", "ferramenta"].includes(m.papel))
    .map((m) => ({
      papel: m.papel,
      texto: m.texto,
      idChamada: typeof m.idChamada === "string" ? m.idChamada.slice(0, 80) : undefined,
      imagens: Array.isArray(m.imagens)
        ? m.imagens
            .filter((i: ImageAi) => /^image\/(png|jpeg|gif|webp)$/.test(String(i?.tipo)) && typeof i?.base64 === "string" && /^[A-Za-z0-9+/=]+$/.test(i.base64.slice(0, 200)))
            .slice(0, 4)
            .map((i: ImageAi) => ({ tipo: i.tipo, base64: i.base64.slice(0, 7_000_000) }))
        : undefined,
      chamadas: Array.isArray(m.chamadas)
        ? m.chamadas
            .filter((c: CallTool) => typeof c?.id === "string" && typeof c?.nome === "string")
            .map((c: CallTool) => ({ id: c.id.slice(0, 80), nome: c.nome.slice(0, 40), argumentos: typeof c.argumentos === "object" && c.argumentos ? c.argumentos : {} }))
        : undefined,
    }));
}

const DIRECTORY = join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "com.niko.desktop");
const FILE = join(DIRECTORY, "provedores.json");

export function dataDirectory() {
  return DIRECTORY;
}

export function listProviders(): Provider[] {
  try {
    if (!existsSync(FILE)) return [];
    const payload = JSON.parse(readFileSync(FILE, "utf8")) as Provider[];
    return Array.isArray(payload) ? payload : [];
  } catch {
    return [];
  }
}

function saveList(list: Provider[]) {
  mkdirSync(DIRECTORY, { recursive: true });
  const temporary = `${FILE}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(list, null, 2), "utf8");
  renameSync(temporary, FILE);
}

export function validateUrlBase(text: string): string {
  const url = new URL(text.trim());
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) throw new Error("url_insegura");
  return url.href.replace(/\/$/, "");
}

export async function saveProvider(payload: { id?: string; tipo: TypeProvider; nome: string; urlBase?: string; modelo?: string; chave?: string; catalogo?: string }): Promise<Provider> {
  if (payload.tipo !== "anthropic" && payload.tipo !== "openai_compativel") throw new Error("tipo_invalido");
  const nameValue = String(payload.nome ?? "").trim().slice(0, 40);
  const model = String(payload.modelo ?? "").trim().slice(0, 160);
  if (!nameValue) throw new Error("campos_obrigatorios");
  const catalog = typeof payload.catalogo === "string" && /^[a-z0-9-]{1,30}$/.test(payload.catalogo) ? payload.catalogo : undefined;
  const urlBase = payload.tipo === "anthropic" ? "https://api.anthropic.com" : validateUrlBase(payload.urlBase ?? "");
  const list = listProviders();
  const id = payload.id && list.some((p) => p.id === payload.id) ? payload.id : `ia-${randomUUID().slice(0, 8)}`;
  if (payload.chave) await writeSecret(id, payload.chave.trim());
  const previous = list.find((p) => p.id === id);
  const provider: Provider = { id, tipo: payload.tipo, nome: nameValue, urlBase, modelo: model, temChave: Boolean(payload.chave) || Boolean(previous?.temChave), catalogo: catalog ?? previous?.catalogo };
  saveList([...list.filter((p) => p.id !== id), provider]);
  return provider;
}

export async function removeProvider(id: string) {
  await deleteSecret(id).catch(() => undefined);
  saveList(listProviders().filter((p) => p.id !== id));
}

async function headers(p: Provider): Promise<Record<string, string>> {
  const key = p.temChave ? await readSecret(p.id) : null;
  if (p.tipo === "anthropic") {
    if (!key) throw new Error("sem_chave");
    return { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" };
  }
  return { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) };
}

const NOT_CHAT = /(embed|embedding|whisper|tts|transcri|dall-e|imagen|image-gen|rerank|moderation|guard|safety|clip|bge-|e5-|nv-embed|parse|ocr|audio|speech|veo)/i;

export async function testProvider(id: string): Promise<{ ok: boolean; modelos: string[]; erro?: string }> {
  const p = listProviders().find((x) => x.id === id);
  if (!p) return { ok: false, modelos: [], erro: "nao_encontrado" };
  try {
    const githubModels = new URL(p.urlBase).hostname === "models.github.ai";
    const url = p.tipo === "anthropic" ? `${p.urlBase}/v1/models?limit=100` : githubModels ? "https://models.github.ai/catalog/models" : `${p.urlBase}/models`;
    const r = await fetch(url, { headers: await headers(p), signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { ok: false, modelos: [], erro: `http_${r.status}` };
    const json = (await r.json()) as { data?: { id?: string; name?: string }[] } | { id?: string; name?: string }[];
    const items = Array.isArray(json) ? json : json.data ?? [];
    const ids = items
      .map((m) => String(m.id ?? m.name ?? "").replace(/^models\//, ""))
      .filter((id) => id && !NOT_CHAT.test(id));
    return { ok: true, modelos: [...new Set(ids)].sort((a, b) => a.localeCompare(b)).slice(0, 300) };
  } catch (e) {
    return { ok: false, modelos: [], erro: (e as Error).message };
  }
}

export interface EventType {
  tipo: "texto" | "fim" | "erro" | "ferramenta" | "aviso";
  texto?: string;
  entrada?: number;
  saida?: number;
  modelo?: string;
  provedor?: string;
  chamada?: CallTool;
  status?: number;
}

function startValid(messages: MessageAi[]): MessageAi[] {
  const crop = messages.slice(-30);
  const start = crop.findIndex((m) => m.papel === "usuario");
  return start < 0 ? [] : crop.slice(start);
}

function readArguments(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  try {
    const value = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function historyAnthropic(messages: MessageAi[]) {
  const output: { role: "user" | "assistant"; content: unknown }[] = [];
  for (const m of messages) {
    if (m.papel === "ferramenta") {
      const block = { type: "tool_result", tool_use_id: m.idChamada ?? "", content: m.texto.slice(0, 20000) };
      const last = output[output.length - 1];
      if (last?.role === "user" && Array.isArray(last.content)) (last.content as unknown[]).push(block);
      else output.push({ role: "user", content: [block] });
    } else if (m.papel === "assistente" && m.chamadas?.length) {
      output.push({
        role: "assistant",
        content: [...(m.texto.trim() ? [{ type: "text", text: m.texto.slice(0, 20000) }] : []), ...m.chamadas.map((c) => ({ type: "tool_use", id: c.id, name: c.nome, input: c.argumentos }))],
      });
    } else if (m.papel === "usuario" && m.imagens?.length) {
      output.push({ role: "user", content: [...m.imagens.map((i) => ({ type: "image", source: { type: "base64", media_type: i.tipo, data: i.base64 } })), { type: "text", text: m.texto.slice(0, 60000) || "." }] });
    } else if (m.texto.trim()) {
      output.push({ role: m.papel === "usuario" ? "user" : "assistant", content: m.texto.slice(0, 60000) });
    }
  }
  return output;
}

function historyCompatible(messages: MessageAi[]) {
  return messages
    .map((m) => {
      if (m.papel === "ferramenta") return { role: "tool", tool_call_id: m.idChamada ?? "", content: m.texto.slice(0, 20000) };
      if (m.papel === "assistente" && m.chamadas?.length)
        return {
          role: "assistant",
          content: m.texto.trim() ? m.texto.slice(0, 20000) : null,
          tool_calls: m.chamadas.map((c) => ({ id: c.id, type: "function", function: { name: c.nome, arguments: JSON.stringify(c.argumentos) } })),
        };
      if (m.papel === "usuario" && m.imagens?.length)
        return { role: "user", content: [{ type: "text", text: m.texto.slice(0, 60000) || "." }, ...m.imagens.map((i) => ({ type: "image_url", image_url: { url: `data:${i.tipo};base64,${i.base64}` } }))] };
      return m.texto.trim() ? { role: m.papel === "usuario" ? "user" : "assistant", content: m.texto.slice(0, 60000) } : null;
    })
    .filter(Boolean);
}

const DENIAL_TOOLS = /(tool|function).{0,80}(not support|unsupported|não suport|invalid|not available|no endpoints)|(not support|unsupported|no endpoints).{0,80}(tool|function)/i;

async function* linesSse(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let rest = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    rest += decoder.decode(value, { stream: true });
    const parts = rest.split("\n");
    rest = parts.pop() ?? "";
    for (const line of parts) if (line.startsWith("data:")) yield line.slice(5).trim();
  }
  rest += decoder.decode();
  if (rest.startsWith("data:")) yield rest.slice(5).trim();
}

export async function* chat(providerId: string, system: string, messages: MessageAi[], model: string | undefined, signal: AbortSignal, tools: Tool[] = []): AsyncGenerator<EventType> {
  const p = listProviders().find((x) => x.id === providerId);
  if (!p) {
    yield { tipo: "erro", texto: "provedor_nao_encontrado" };
    return;
  }
  const modelFinal = (model || p.modelo).slice(0, 160);
  if (!modelFinal) {
    yield { tipo: "erro", texto: "sem_modelo" };
    return;
  }
  const valid = startValid(messages);
  let input = 0;
  let output = 0;
  const control = new AbortController();
  let reason: "tempo_esgotado" | null = null;
  const onCancel = () => control.abort();
  signal.addEventListener("abort", onCancel);
  let clock: ReturnType<typeof setTimeout> | undefined;
  const arm = (ms: number) => {
    clearTimeout(clock);
    clock = setTimeout(() => {
      reason = "tempo_esgotado";
      control.abort();
    }, ms);
  };
  try {
    arm(45000);
    const cab = await headers(p);
    const request = (hasUsage: boolean, hasTools: boolean) => {
      const use = hasTools && tools.length > 0;
      if (p.tipo === "anthropic")
        return fetch(`${p.urlBase}/v1/messages`, {
          method: "POST",
          headers: cab,
          signal: control.signal,
          body: JSON.stringify({
            model: modelFinal,
            max_tokens: 4096,
            system: system,
            messages: historyAnthropic(use ? valid : valid.filter((m) => m.papel !== "ferramenta").map((m) => ({ ...m, chamadas: undefined }))),
            stream: true,
            ...(use ? { tools: tools.map((f) => ({ name: f.nome, description: f.descricao, input_schema: f.parametros })) } : {}),
          }),
        });
      return fetch(`${p.urlBase}/chat/completions`, {
        method: "POST",
        headers: cab,
        signal: control.signal,
        body: JSON.stringify({
          model: modelFinal,
          stream: true,
          ...(hasUsage ? { stream_options: { include_usage: true } } : {}),
          max_tokens: 4096,
          messages: [{ role: "system", content: system }, ...historyCompatible(use ? valid : valid.filter((m) => m.papel !== "ferramenta").map((m) => ({ ...m, chamadas: undefined })))],
          ...(use ? { tools: tools.map((f) => ({ type: "function", function: { name: f.nome, description: f.descricao, parameters: f.parametros } })) } : {}),
        }),
      });
    };
    let hasUsage = p.tipo !== "anthropic";
    let hasTools = tools.length > 0;
    let response = await request(hasUsage, hasTools);
    for (let attempt = 0; attempt < 2 && [400, 404, 422].includes(response.status); attempt++) {
      const body = await response.clone().text().catch(() => "");
      if (hasUsage && /stream_options|include_usage/i.test(body)) hasUsage = false;
      else if (hasTools && (DENIAL_TOOLS.test(body) || /tools?\b|tool_choice|functions?\b/i.test(body))) {
        hasTools = false;
        yield { tipo: "aviso", texto: "sem_ferramentas" };
      } else break;
      response = await request(hasUsage, hasTools);
    }
    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => "");
      yield { tipo: "erro", status: response.status, texto: `http_${response.status} ${body.slice(0, 200)}` };
      return;
    }
    const blocksAnthropic = new Map<number, { id: string; nome: string; json: string }>();
    const callsCompatible = new Map<number, { id: string; nome: string; json: string }>();
    let hadText = false;
    let hadReasoning = false;
    let trimmed = false;
    const thought = createThoughtFilter();
    arm(60000);
    for await (const data of linesSse(response.body)) {
      arm(60000);
      if (data === "[DONE]") break;
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      if (p.tipo === "anthropic") {
        const type = json.type as string;
        const index = Number(json.index ?? 0);
        if (type === "content_block_start") {
          const block = json.content_block as { type: string; id?: string; name?: string };
          if (block?.type === "tool_use") blocksAnthropic.set(index, { id: block.id ?? `t${index}`, nome: block.name ?? "", json: "" });
        } else if (type === "content_block_delta") {
          const delta = json.delta as { type: string; text?: string; partial_json?: string };
          if (delta.type === "text_delta" && delta.text) yield { tipo: "texto", texto: delta.text };
          else if (delta.type === "input_json_delta" && blocksAnthropic.has(index)) blocksAnthropic.get(index)!.json += delta.partial_json ?? "";
        } else if (type === "content_block_stop") {
          const block = blocksAnthropic.get(index);
          if (block) {
            blocksAnthropic.delete(index);
            yield { tipo: "ferramenta", chamada: { id: block.id, nome: block.nome, argumentos: readArguments(block.json) } };
          }
        } else if (type === "message_start") {
          const usage = (json.message as { usage?: { input_tokens?: number } }).usage;
          input = usage?.input_tokens ?? 0;
        } else if (type === "message_delta") {
          output = (json.usage as { output_tokens?: number } | undefined)?.output_tokens ?? output;
          if ((json.delta as { stop_reason?: string } | undefined)?.stop_reason === "max_tokens") trimmed = true;
        } else if (type === "error") {
          yield { tipo: "erro", texto: JSON.stringify(json.error).slice(0, 200) };
          return;
        }
      } else {
        const selection = (json.choices as { finish_reason?: string | null; delta?: { content?: string; reasoning_content?: string; reasoning?: string; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[] | undefined)?.[0];
        if (selection?.delta?.content) {
          const visible = thought.receive(selection.delta.content);
          if (thought.hasThought()) hadReasoning = true;
          if (visible) {
            yield { tipo: "texto", texto: visible };
            hadText = true;
          }
        }
        if (selection?.delta?.reasoning_content || selection?.delta?.reasoning) hadReasoning = true;
        if (selection?.finish_reason === "length") trimmed = true;
        selection?.delta?.tool_calls?.forEach((c, position) => {
          const index = c.index ?? position;
          const current = callsCompatible.get(index) ?? { id: "", nome: "", json: "" };
          if (c.id) current.id = c.id;
          if (c.function?.name) current.nome += c.function.name;
          if (c.function?.arguments) current.json += c.function.arguments;
          callsCompatible.set(index, current);
        });
        const usage = json.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
        if (usage) {
          input = usage.prompt_tokens ?? input;
          output = usage.completion_tokens ?? output;
        }
      }
    }
    const restVisible = thought.finish();
    if (restVisible) {
      yield { tipo: "texto", texto: restVisible };
      hadText = true;
    }
    for (const [index, c] of [...callsCompatible.entries()].sort((a, b) => a[0] - b[0])) {
      if (c.nome) yield { tipo: "ferramenta", chamada: { id: c.id || `chamada_${index}_${randomUUID().slice(0, 6)}`, nome: c.nome, argumentos: readArguments(c.json) } };
    }
    if (trimmed) yield { tipo: "aviso", texto: hadText ? "cortado" : hadReasoning ? "so_raciocinio" : "cortado" };
    yield { tipo: "fim", entrada: input, saida: output, modelo: modelFinal, provedor: p.nome };
  } catch (e) {
    yield { tipo: "erro", texto: reason ?? ((e as Error).name === "AbortError" ? "cancelado" : `rede ${(e as Error).message}`) };
  } finally {
    clearTimeout(clock);
    signal.removeEventListener("abort", onCancel);
  }
}
