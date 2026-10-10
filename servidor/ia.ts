import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { lerSegredo, gravarSegredo, apagarSegredo } from "./segredos.ts";
import { criarFiltroDePensamento } from "./pensamento.ts";

export type TipoProvedor = "anthropic" | "openai_compativel";

export interface Provedor {
  id: string;
  tipo: TipoProvedor;
  nome: string;
  urlBase: string;
  modelo: string;
  temChave: boolean;
  catalogo?: string;
}

export interface ChamadaFerramenta {
  id: string;
  nome: string;
  argumentos: Record<string, unknown>;
}

export interface ImagemIa {
  tipo: string;
  base64: string;
}

export interface MensagemIa {
  papel: "usuario" | "assistente" | "ferramenta";
  texto: string;
  chamadas?: ChamadaFerramenta[];
  idChamada?: string;
  imagens?: ImagemIa[];
}

export interface Ferramenta {
  nome: string;
  descricao: string;
  parametros: Record<string, unknown>;
}

export function validarFerramentas(valor: unknown): Ferramenta[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((f): f is Ferramenta => typeof f?.nome === "string" && /^[a-z_]{2,40}$/.test(f.nome) && typeof f.descricao === "string" && typeof f.parametros === "object" && f.parametros !== null)
    .slice(0, 30)
    .map((f) => ({ nome: f.nome, descricao: f.descricao.slice(0, 600), parametros: f.parametros }));
}

export function validarMensagens(valor: unknown): MensagemIa[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((m) => typeof m?.texto === "string" && ["usuario", "assistente", "ferramenta"].includes(m.papel))
    .map((m) => ({
      papel: m.papel,
      texto: m.texto,
      idChamada: typeof m.idChamada === "string" ? m.idChamada.slice(0, 80) : undefined,
      imagens: Array.isArray(m.imagens)
        ? m.imagens
            .filter((i: ImagemIa) => /^image\/(png|jpeg|gif|webp)$/.test(String(i?.tipo)) && typeof i?.base64 === "string" && /^[A-Za-z0-9+/=]+$/.test(i.base64.slice(0, 200)))
            .slice(0, 4)
            .map((i: ImagemIa) => ({ tipo: i.tipo, base64: i.base64.slice(0, 7_000_000) }))
        : undefined,
      chamadas: Array.isArray(m.chamadas)
        ? m.chamadas
            .filter((c: ChamadaFerramenta) => typeof c?.id === "string" && typeof c?.nome === "string")
            .map((c: ChamadaFerramenta) => ({ id: c.id.slice(0, 80), nome: c.nome.slice(0, 40), argumentos: typeof c.argumentos === "object" && c.argumentos ? c.argumentos : {} }))
        : undefined,
    }));
}

const PASTA = join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "com.niko.desktop");
const ARQUIVO = join(PASTA, "provedores.json");

export function pastaDados() {
  return PASTA;
}

export function listarProvedores(): Provedor[] {
  try {
    if (!existsSync(ARQUIVO)) return [];
    const dados = JSON.parse(readFileSync(ARQUIVO, "utf8")) as Provedor[];
    return Array.isArray(dados) ? dados : [];
  } catch {
    return [];
  }
}

function salvarLista(lista: Provedor[]) {
  mkdirSync(PASTA, { recursive: true });
  const temporario = `${ARQUIVO}.${process.pid}.tmp`;
  writeFileSync(temporario, JSON.stringify(lista, null, 2), "utf8");
  renameSync(temporario, ARQUIVO);
}

export function validarUrlBase(texto: string): string {
  const url = new URL(texto.trim());
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) throw new Error("url_insegura");
  return url.href.replace(/\/$/, "");
}

export async function salvarProvedor(dados: { id?: string; tipo: TipoProvedor; nome: string; urlBase?: string; modelo?: string; chave?: string; catalogo?: string }): Promise<Provedor> {
  if (dados.tipo !== "anthropic" && dados.tipo !== "openai_compativel") throw new Error("tipo_invalido");
  const nome = String(dados.nome ?? "").trim().slice(0, 40);
  const modelo = String(dados.modelo ?? "").trim().slice(0, 160);
  if (!nome) throw new Error("campos_obrigatorios");
  const catalogo = typeof dados.catalogo === "string" && /^[a-z0-9-]{1,30}$/.test(dados.catalogo) ? dados.catalogo : undefined;
  const urlBase = dados.tipo === "anthropic" ? "https://api.anthropic.com" : validarUrlBase(dados.urlBase ?? "");
  const lista = listarProvedores();
  const id = dados.id && lista.some((p) => p.id === dados.id) ? dados.id : `ia-${randomUUID().slice(0, 8)}`;
  if (dados.chave) await gravarSegredo(id, dados.chave.trim());
  const anterior = lista.find((p) => p.id === id);
  const provedor: Provedor = { id, tipo: dados.tipo, nome, urlBase, modelo, temChave: Boolean(dados.chave) || Boolean(anterior?.temChave), catalogo: catalogo ?? anterior?.catalogo };
  salvarLista([...lista.filter((p) => p.id !== id), provedor]);
  return provedor;
}

export async function removerProvedor(id: string) {
  await apagarSegredo(id).catch(() => undefined);
  salvarLista(listarProvedores().filter((p) => p.id !== id));
}

async function cabecalhos(p: Provedor): Promise<Record<string, string>> {
  const chave = p.temChave ? await lerSegredo(p.id) : null;
  if (p.tipo === "anthropic") {
    if (!chave) throw new Error("sem_chave");
    return { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" };
  }
  return { "content-type": "application/json", ...(chave ? { authorization: `Bearer ${chave}` } : {}) };
}

const NAO_CHAT = /(embed|embedding|whisper|tts|transcri|dall-e|imagen|image-gen|rerank|moderation|guard|safety|clip|bge-|e5-|nv-embed|parse|ocr|audio|speech|veo)/i;

export async function testarProvedor(id: string): Promise<{ ok: boolean; modelos: string[]; erro?: string }> {
  const p = listarProvedores().find((x) => x.id === id);
  if (!p) return { ok: false, modelos: [], erro: "nao_encontrado" };
  try {
    const githubModels = new URL(p.urlBase).hostname === "models.github.ai";
    const url = p.tipo === "anthropic" ? `${p.urlBase}/v1/models?limit=100` : githubModels ? "https://models.github.ai/catalog/models" : `${p.urlBase}/models`;
    const r = await fetch(url, { headers: await cabecalhos(p), signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { ok: false, modelos: [], erro: `http_${r.status}` };
    const json = (await r.json()) as { data?: { id?: string; name?: string }[] } | { id?: string; name?: string }[];
    const itens = Array.isArray(json) ? json : json.data ?? [];
    const ids = itens
      .map((m) => String(m.id ?? m.name ?? "").replace(/^models\//, ""))
      .filter((id) => id && !NAO_CHAT.test(id));
    return { ok: true, modelos: [...new Set(ids)].sort((a, b) => a.localeCompare(b)).slice(0, 300) };
  } catch (e) {
    return { ok: false, modelos: [], erro: (e as Error).message };
  }
}

export interface Evento {
  tipo: "texto" | "fim" | "erro" | "ferramenta" | "aviso";
  texto?: string;
  entrada?: number;
  saida?: number;
  modelo?: string;
  provedor?: string;
  chamada?: ChamadaFerramenta;
  status?: number;
}

function inicioValido(mensagens: MensagemIa[]): MensagemIa[] {
  const recorte = mensagens.slice(-30);
  const inicio = recorte.findIndex((m) => m.papel === "usuario");
  return inicio < 0 ? [] : recorte.slice(inicio);
}

function lerArgumentos(texto: string): Record<string, unknown> {
  if (!texto.trim()) return {};
  try {
    const valor = JSON.parse(texto);
    return typeof valor === "object" && valor !== null && !Array.isArray(valor) ? valor : {};
  } catch {
    return {};
  }
}

function historicoAnthropic(mensagens: MensagemIa[]) {
  const saida: { role: "user" | "assistant"; content: unknown }[] = [];
  for (const m of mensagens) {
    if (m.papel === "ferramenta") {
      const bloco = { type: "tool_result", tool_use_id: m.idChamada ?? "", content: m.texto.slice(0, 20000) };
      const ultima = saida[saida.length - 1];
      if (ultima?.role === "user" && Array.isArray(ultima.content)) (ultima.content as unknown[]).push(bloco);
      else saida.push({ role: "user", content: [bloco] });
    } else if (m.papel === "assistente" && m.chamadas?.length) {
      saida.push({
        role: "assistant",
        content: [...(m.texto.trim() ? [{ type: "text", text: m.texto.slice(0, 20000) }] : []), ...m.chamadas.map((c) => ({ type: "tool_use", id: c.id, name: c.nome, input: c.argumentos }))],
      });
    } else if (m.papel === "usuario" && m.imagens?.length) {
      saida.push({ role: "user", content: [...m.imagens.map((i) => ({ type: "image", source: { type: "base64", media_type: i.tipo, data: i.base64 } })), { type: "text", text: m.texto.slice(0, 60000) || "." }] });
    } else if (m.texto.trim()) {
      saida.push({ role: m.papel === "usuario" ? "user" : "assistant", content: m.texto.slice(0, 60000) });
    }
  }
  return saida;
}

function historicoCompativel(mensagens: MensagemIa[]) {
  return mensagens
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

const RECUSA_FERRAMENTAS = /(tool|function).{0,80}(not support|unsupported|não suport|invalid|not available|no endpoints)|(not support|unsupported|no endpoints).{0,80}(tool|function)/i;

async function* linhasSse(corpo: ReadableStream<Uint8Array>) {
  const leitor = corpo.getReader();
  const decodificador = new TextDecoder();
  let resto = "";
  while (true) {
    const { done, value } = await leitor.read();
    if (done) break;
    resto += decodificador.decode(value, { stream: true });
    const partes = resto.split("\n");
    resto = partes.pop() ?? "";
    for (const linha of partes) if (linha.startsWith("data:")) yield linha.slice(5).trim();
  }
  resto += decodificador.decode();
  if (resto.startsWith("data:")) yield resto.slice(5).trim();
}

export async function* conversar(provedorId: string, sistema: string, mensagens: MensagemIa[], modelo: string | undefined, sinal: AbortSignal, ferramentas: Ferramenta[] = []): AsyncGenerator<Evento> {
  const p = listarProvedores().find((x) => x.id === provedorId);
  if (!p) {
    yield { tipo: "erro", texto: "provedor_nao_encontrado" };
    return;
  }
  const modeloFinal = (modelo || p.modelo).slice(0, 160);
  if (!modeloFinal) {
    yield { tipo: "erro", texto: "sem_modelo" };
    return;
  }
  const validas = inicioValido(mensagens);
  let entrada = 0;
  let saida = 0;
  const controle = new AbortController();
  let motivo: "tempo_esgotado" | null = null;
  const aoCancelar = () => controle.abort();
  sinal.addEventListener("abort", aoCancelar);
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const armar = (ms: number) => {
    clearTimeout(relogio);
    relogio = setTimeout(() => {
      motivo = "tempo_esgotado";
      controle.abort();
    }, ms);
  };
  try {
    armar(45000);
    const cab = await cabecalhos(p);
    const pedir = (comUso: boolean, comFerramentas: boolean) => {
      const usar = comFerramentas && ferramentas.length > 0;
      if (p.tipo === "anthropic")
        return fetch(`${p.urlBase}/v1/messages`, {
          method: "POST",
          headers: cab,
          signal: controle.signal,
          body: JSON.stringify({
            model: modeloFinal,
            max_tokens: 4096,
            system: sistema,
            messages: historicoAnthropic(usar ? validas : validas.filter((m) => m.papel !== "ferramenta").map((m) => ({ ...m, chamadas: undefined }))),
            stream: true,
            ...(usar ? { tools: ferramentas.map((f) => ({ name: f.nome, description: f.descricao, input_schema: f.parametros })) } : {}),
          }),
        });
      return fetch(`${p.urlBase}/chat/completions`, {
        method: "POST",
        headers: cab,
        signal: controle.signal,
        body: JSON.stringify({
          model: modeloFinal,
          stream: true,
          ...(comUso ? { stream_options: { include_usage: true } } : {}),
          max_tokens: 4096,
          messages: [{ role: "system", content: sistema }, ...historicoCompativel(usar ? validas : validas.filter((m) => m.papel !== "ferramenta").map((m) => ({ ...m, chamadas: undefined })))],
          ...(usar ? { tools: ferramentas.map((f) => ({ type: "function", function: { name: f.nome, description: f.descricao, parameters: f.parametros } })) } : {}),
        }),
      });
    };
    let comUso = p.tipo !== "anthropic";
    let comFerramentas = ferramentas.length > 0;
    let resposta = await pedir(comUso, comFerramentas);
    for (let tentativa = 0; tentativa < 2 && [400, 404, 422].includes(resposta.status); tentativa++) {
      const corpo = await resposta.clone().text().catch(() => "");
      if (comUso && /stream_options|include_usage/i.test(corpo)) comUso = false;
      else if (comFerramentas && (RECUSA_FERRAMENTAS.test(corpo) || /tools?\b|tool_choice|functions?\b/i.test(corpo))) {
        comFerramentas = false;
        yield { tipo: "aviso", texto: "sem_ferramentas" };
      } else break;
      resposta = await pedir(comUso, comFerramentas);
    }
    if (!resposta.ok || !resposta.body) {
      const corpo = await resposta.text().catch(() => "");
      yield { tipo: "erro", status: resposta.status, texto: `http_${resposta.status} ${corpo.slice(0, 200)}` };
      return;
    }
    const blocosAnthropic = new Map<number, { id: string; nome: string; json: string }>();
    const chamadasCompativel = new Map<number, { id: string; nome: string; json: string }>();
    let teveTexto = false;
    let teveRaciocinio = false;
    let cortado = false;
    const pensamento = criarFiltroDePensamento();
    armar(60000);
    for await (const dado of linhasSse(resposta.body)) {
      armar(60000);
      if (dado === "[DONE]") break;
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(dado);
      } catch {
        continue;
      }
      if (p.tipo === "anthropic") {
        const tipo = json.type as string;
        const indice = Number(json.index ?? 0);
        if (tipo === "content_block_start") {
          const bloco = json.content_block as { type: string; id?: string; name?: string };
          if (bloco?.type === "tool_use") blocosAnthropic.set(indice, { id: bloco.id ?? `t${indice}`, nome: bloco.name ?? "", json: "" });
        } else if (tipo === "content_block_delta") {
          const delta = json.delta as { type: string; text?: string; partial_json?: string };
          if (delta.type === "text_delta" && delta.text) yield { tipo: "texto", texto: delta.text };
          else if (delta.type === "input_json_delta" && blocosAnthropic.has(indice)) blocosAnthropic.get(indice)!.json += delta.partial_json ?? "";
        } else if (tipo === "content_block_stop") {
          const bloco = blocosAnthropic.get(indice);
          if (bloco) {
            blocosAnthropic.delete(indice);
            yield { tipo: "ferramenta", chamada: { id: bloco.id, nome: bloco.nome, argumentos: lerArgumentos(bloco.json) } };
          }
        } else if (tipo === "message_start") {
          const uso = (json.message as { usage?: { input_tokens?: number } }).usage;
          entrada = uso?.input_tokens ?? 0;
        } else if (tipo === "message_delta") {
          saida = (json.usage as { output_tokens?: number } | undefined)?.output_tokens ?? saida;
          if ((json.delta as { stop_reason?: string } | undefined)?.stop_reason === "max_tokens") cortado = true;
        } else if (tipo === "error") {
          yield { tipo: "erro", texto: JSON.stringify(json.error).slice(0, 200) };
          return;
        }
      } else {
        const escolha = (json.choices as { finish_reason?: string | null; delta?: { content?: string; reasoning_content?: string; reasoning?: string; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[] | undefined)?.[0];
        if (escolha?.delta?.content) {
          const visivel = pensamento.receber(escolha.delta.content);
          if (pensamento.pensou()) teveRaciocinio = true;
          if (visivel) {
            yield { tipo: "texto", texto: visivel };
            teveTexto = true;
          }
        }
        if (escolha?.delta?.reasoning_content || escolha?.delta?.reasoning) teveRaciocinio = true;
        if (escolha?.finish_reason === "length") cortado = true;
        escolha?.delta?.tool_calls?.forEach((c, posicao) => {
          const indice = c.index ?? posicao;
          const atual = chamadasCompativel.get(indice) ?? { id: "", nome: "", json: "" };
          if (c.id) atual.id = c.id;
          if (c.function?.name) atual.nome += c.function.name;
          if (c.function?.arguments) atual.json += c.function.arguments;
          chamadasCompativel.set(indice, atual);
        });
        const uso = json.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
        if (uso) {
          entrada = uso.prompt_tokens ?? entrada;
          saida = uso.completion_tokens ?? saida;
        }
      }
    }
    const restoVisivel = pensamento.terminar();
    if (restoVisivel) {
      yield { tipo: "texto", texto: restoVisivel };
      teveTexto = true;
    }
    for (const [indice, c] of [...chamadasCompativel.entries()].sort((a, b) => a[0] - b[0])) {
      if (c.nome) yield { tipo: "ferramenta", chamada: { id: c.id || `chamada_${indice}_${randomUUID().slice(0, 6)}`, nome: c.nome, argumentos: lerArgumentos(c.json) } };
    }
    if (cortado) yield { tipo: "aviso", texto: teveTexto ? "cortado" : teveRaciocinio ? "so_raciocinio" : "cortado" };
    yield { tipo: "fim", entrada, saida, modelo: modeloFinal, provedor: p.nome };
  } catch (e) {
    yield { tipo: "erro", texto: motivo ?? ((e as Error).name === "AbortError" ? "cancelado" : `rede ${(e as Error).message}`) };
  } finally {
    clearTimeout(relogio);
    sinal.removeEventListener("abort", aoCancelar);
  }
}
