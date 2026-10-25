import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { pastaDados } from "../ia.ts";
import { lerSegredo, gravarSegredo, apagarSegredo } from "../segredos.ts";
import { porta as portaDaPonte } from "../claude.ts";
import {
  CaixaWhatsapp, LimiteDeEnvios, caminhoDoQr, conversasDoGateway, dispositivoDoGateway, ehGrupo, jidNormalizado, mensagemDoWebhook,
  mensagensDoGateway, numeroParaExibir, recusaDaResposta, webhookAutentico, type ConversaWhatsapp, type FiltrosWhatsapp, type MensagemWhatsapp, type SituacaoDoVinculo,
} from "./caixa.ts";
import { aguardarGowaParar, alvoDaPlataforma, gowaInstalado, gowaRodando, iniciarGowa, instalacao, instalarGowa, pararGowa, pastaDoWhatsapp, portaLivre } from "./gowa.ts";

export const CAMINHO_DO_WEBHOOK = "/ponte/whatsapp/webhook";
const DISPOSITIVO = "niko";
const TICK_MS = 5000;
const SILENCIO_DO_WEBHOOK_MS = 90_000;
const STATUS_CONECTADO_MS = 60_000;
const VARREDURA_COM_WEBHOOK_MS = 60_000;
const VARREDURA_SEM_WEBHOOK_MS = 20_000;
const MAXIMO_DE_NOVIDADES = 50;

interface ConfigWhatsapp extends FiltrosWhatsapp {
  ligado: boolean;
  lerAoAbrir: boolean;
  mostrarFotos: boolean;
}

const PADRAO: ConfigWhatsapp = { ligado: false, silenciarGrupos: true, ignoradas: [], lerAoAbrir: true, esconderArquivadas: true, esconderGrupos: false, mostrarFotos: true };
const arquivoDeConfig = () => join(pastaDados(), "whatsapp.json");

function lerConfig(): ConfigWhatsapp {
  try {
    if (!existsSync(arquivoDeConfig())) return { ...PADRAO };
    const lido = JSON.parse(readFileSync(arquivoDeConfig(), "utf8")) as Partial<ConfigWhatsapp>;
    return {
      ligado: lido.ligado === true,
      silenciarGrupos: lido.silenciarGrupos !== false,
      ignoradas: Array.isArray(lido.ignoradas) ? lido.ignoradas.filter((j): j is string => typeof j === "string").slice(0, 500) : [],
      lerAoAbrir: lido.lerAoAbrir !== false,
      esconderArquivadas: lido.esconderArquivadas !== false,
      esconderGrupos: lido.esconderGrupos === true,
      mostrarFotos: lido.mostrarFotos !== false,
    };
  } catch {
    return { ...PADRAO };
  }
}

function salvarConfig(c: ConfigWhatsapp) {
  mkdirSync(pastaDados(), { recursive: true });
  const temporario = `${arquivoDeConfig()}.${process.pid}.tmp`;
  writeFileSync(temporario, JSON.stringify(c, null, 2), "utf8");
  renameSync(temporario, arquivoDeConfig());
}

async function segredoGuardado(id: string, criar: () => string): Promise<string> {
  const atual = await lerSegredo(id);
  if (atual) return atual;
  const novo = criar();
  await gravarSegredo(id, novo);
  return novo;
}

const estado = {
  config: lerConfig(),
  porta: 0,
  dispositivo: DISPOSITIVO,
  acesso: "",
  segredo: "",
  vinculo: "desligado" as SituacaoDoVinculo | "desligado" | "sem_gateway" | "iniciando",
  eu: null as string | null,
  qr: null as { png: string; expira: number } | null,
  erro: "",
  falhasSeguidas: 0,
  historicoCarregado: false,
  ultimoWebhook: 0,
  ultimaVarredura: 0,
  ultimoStatus: 0,
  conversaAberta: null as string | null,
  nomesPedidos: new Set<string>(),
  novidades: [] as { seq: number; jid: string; nome: string; grupo: boolean }[],
  seq: 0,
};
const caixa = new CaixaWhatsapp();
const envios = new LimiteDeEnvios();
let relogio: ReturnType<typeof setInterval> | null = null;
let ocupado = false;

async function chamar(metodo: string, caminho: string, opcoes: { query?: Record<string, string>; json?: unknown; tempoMs?: number; binario?: boolean } = {}): Promise<{ status: number; corpo: unknown; bytes?: Buffer }> {
  if (!estado.porta) throw new Error("gateway_parado");
  const url = new URL(`http://127.0.0.1:${estado.porta}${caminho}`);
  for (const [k, v] of Object.entries(opcoes.query ?? {})) url.searchParams.set(k, v);
  const r = await fetch(url, {
    method: metodo,
    redirect: "manual",
    headers: {
      authorization: `Basic ${Buffer.from(estado.acesso).toString("base64")}`,
      "x-device-id": estado.dispositivo,
      accept: opcoes.binario ? "image/png" : "application/json",
      ...(opcoes.json === undefined ? {} : { "content-type": "application/json" }),
    },
    body: opcoes.json === undefined ? undefined : JSON.stringify(opcoes.json),
    signal: AbortSignal.timeout(opcoes.tempoMs ?? 10_000),
  });
  if (opcoes.binario) return { status: r.status, corpo: null, bytes: Buffer.from(await r.arrayBuffer()) };
  const corpo = await r.json().catch(() => null);
  return { status: r.status, corpo };
}

function codigoDeErro(corpo: unknown) {
  const c = (corpo as Record<string, unknown> | null)?.code;
  return typeof c === "string" ? c : "";
}

async function chamarComSucesso(metodo: string, caminho: string, opcoes: Parameters<typeof chamar>[2] = {}) {
  const r = await chamar(metodo, caminho, opcoes);
  if (r.status === 401) throw new Error("gateway_recusou_acesso");
  if (r.status < 200 || r.status >= 300) throw new Error(codigoDeErro(r.corpo) || `gateway_${r.status}`);
  return r.corpo;
}

function anunciar(m: MensagemWhatsapp) {
  const id = jidNormalizado(m.conversa);
  const conversa = caixa.conversas.get(id);
  if (!conversa) return;
  estado.seq += 1;
  estado.novidades = [...estado.novidades.filter((n) => n.jid !== id), { seq: estado.seq, jid: id, nome: conversa.nome, grupo: conversa.grupo }].slice(-MAXIMO_DE_NOVIDADES);
}

function guardar(mensagens: MensagemWhatsapp[], avisar: boolean) {
  for (const m of mensagens) {
    const id = jidNormalizado(m.conversa);
    const resultado = caixa.adicionar(m, estado.config, !avisar);
    if (resultado === "repetida" || resultado === "ignorada") continue;
    if (estado.conversaAberta === id && !m.minha) {
      caixa.marcarLida(id);
      continue;
    }
    if (resultado === "avisar") anunciar(m);
    if (ehGrupo(id) && caixa.conversas.get(id)?.nome === numeroParaExibir(id) && !estado.nomesPedidos.has(id)) void nomearGrupo(id);
  }
}

async function nomearGrupo(jid: string) {
  estado.nomesPedidos.add(jid);
  try {
    const corpo = await chamarComSucesso("GET", "/group/info", { query: { group_id: jid } });
    const r = (corpo as Record<string, unknown> | null)?.results as Record<string, unknown> | undefined;
    const nome = typeof r?.Name === "string" ? r.Name : typeof r?.name === "string" ? r.name : "";
    if (nome) caixa.renomear(jid, nome);
  } catch {
    return;
  }
}

async function carregarHistorico() {
  const conversas = conversasDoGateway(await chamarComSucesso("GET", "/chats", { query: { limit: "40" } }));
  if (conversas.length === 0) return;
  for (const c of conversas) caixa.registrarConversa(c.jid, c.nome, c.ultima, estado.config, c.arquivada);
  for (const c of [...conversas].sort((a, b) => b.ultima.localeCompare(a.ultima)).slice(0, 8)) {
    const corpo = await chamarComSucesso("GET", `/chat/${encodeURIComponent(c.jid)}/messages`, { query: { limit: "10" } }).catch(() => null);
    for (const m of mensagensDoGateway(corpo, estado.eu)) caixa.adicionar(m, estado.config, true, ehGrupo(c.jid) ? c.nome || undefined : undefined);
  }
  caixa.marcarTodasLidas();
  estado.historicoCarregado = true;
  estado.ultimaVarredura = Date.now();
}

function horaDeVarrer() {
  const webhookCalado = Date.now() - estado.ultimoWebhook > SILENCIO_DO_WEBHOOK_MS;
  return Date.now() - estado.ultimaVarredura > (webhookCalado ? VARREDURA_SEM_WEBHOOK_MS : VARREDURA_COM_WEBHOOK_MS);
}

async function varrerSemWebhook() {
  const desde = new Date(estado.ultimaVarredura - 5000).toISOString();
  estado.ultimaVarredura = Date.now();
  const conversas = conversasDoGateway(await chamarComSucesso("GET", "/chats", { query: { limit: "40" } }));
  for (const c of conversas) caixa.registrarConversa(c.jid, c.nome, c.ultima, estado.config, c.arquivada);
  for (const c of conversas.filter((x) => x.ultima > desde).slice(0, 8)) {
    const corpo = await chamarComSucesso("GET", `/chat/${encodeURIComponent(c.jid)}/messages`, { query: { limit: "10", start_time: desde } }).catch(() => null);
    guardar(mensagensDoGateway(corpo, estado.eu).sort((a, b) => a.data.localeCompare(b.data)), true);
  }
}

function gatewayAindaConectando(corpo: unknown) {
  const mensagem = (corpo as Record<string, unknown> | null)?.message;
  return codigoDeErro(corpo) === "AUTHENTICATION_ERROR" && typeof mensagem === "string" && /reconnect/i.test(mensagem);
}

async function atualizarQr() {
  if (estado.qr && estado.qr.expira > Date.now()) return;
  const r = await chamar("GET", `/devices/${encodeURIComponent(estado.dispositivo)}/login`, { tempoMs: 45_000 });
  if (codigoDeErro(r.corpo) === "ALREADY_LOGGED_IN" || gatewayAindaConectando(r.corpo)) return;
  if (r.status < 200 || r.status >= 300) throw new Error(codigoDeErro(r.corpo) || `gateway_${r.status}`);
  const qr = caminhoDoQr(r.corpo);
  if (!qr) return;
  const imagem = await chamar("GET", qr.caminho, { binario: true });
  if (imagem.status !== 200 || !imagem.bytes || imagem.bytes.subarray(0, 4).toString("hex") !== "89504e47") return;
  estado.qr = { png: `data:image/png;base64,${imagem.bytes.toString("base64")}`, expira: Date.now() + Math.max(20, qr.segundos * 2 - 5) * 1000 };
}

async function prepararGateway() {
  estado.acesso ||= await segredoGuardado("whatsapp-acesso", () => `niko:${randomBytes(18).toString("hex")}`);
  estado.segredo ||= await segredoGuardado("whatsapp-webhook", () => randomBytes(32).toString("hex"));
  if (!estado.porta || (!gowaRodando() && estado.falhasSeguidas > 2)) estado.porta = await portaLivre();
  if (!estado.config.ligado || !relogio) throw new Error("gateway_parado");
  iniciarGowa({ porta: estado.porta, acesso: estado.acesso, urlDoWebhook: `http://127.0.0.1:${portaDaPonte()}${CAMINHO_DO_WEBHOOK}`, segredoDoWebhook: estado.segredo });
}

async function passo() {
  if (ocupado || !estado.config.ligado) return;
  ocupado = true;
  try {
    if (!gowaInstalado()) {
      estado.vinculo = "sem_gateway";
      return;
    }
    await prepararGateway();
    if (estado.vinculo === "conectado" && estado.historicoCarregado && estado.falhasSeguidas === 0 && gowaRodando() && Date.now() - estado.ultimoStatus < STATUS_CONECTADO_MS) {
      if (horaDeVarrer()) await varrerSemWebhook();
      return;
    }
    let dispositivo = dispositivoDoGateway(await chamarComSucesso("GET", "/devices"));
    estado.ultimoStatus = Date.now();
    if (!dispositivo) {
      await chamarComSucesso("POST", "/devices", { json: { device_id: DISPOSITIVO } });
      dispositivo = { id: DISPOSITIVO, vinculo: "precisa_qr", eu: null };
    }
    estado.dispositivo = dispositivo.id;
    estado.vinculo = dispositivo.vinculo;
    estado.eu = dispositivo.eu;
    estado.falhasSeguidas = 0;
    estado.erro = "";
    if (dispositivo.vinculo === "precisa_qr") {
      estado.historicoCarregado = false;
      await atualizarQr();
      return;
    }
    estado.qr = null;
    if (dispositivo.vinculo !== "conectado") return;
    if (!estado.historicoCarregado) await carregarHistorico();
    else if (horaDeVarrer()) await varrerSemWebhook();
  } catch (e) {
    const mensagem = (e as Error).message;
    const gatewayCaiu = /fetch failed|ECONNREFUSED|gateway_parado/i.test(mensagem);
    if (!gatewayCaiu) {
      if (!/aborted|timeout/i.test(mensagem)) estado.erro = mensagem;
      return;
    }
    estado.falhasSeguidas += 1;
    if (estado.falhasSeguidas > 2) {
      estado.erro = "gateway_fora";
      estado.vinculo = "iniciando";
    } else if (estado.vinculo !== "conectado") estado.vinculo = "iniciando";
  } finally {
    ocupado = false;
  }
}

function iniciarRelogio() {
  if (relogio) return;
  relogio = setInterval(() => void passo(), TICK_MS);
  relogio.unref?.();
  void passo();
}

function pararTudo(esquecer: boolean) {
  if (relogio) clearInterval(relogio);
  relogio = null;
  pararGowa();
  estado.vinculo = "desligado";
  estado.qr = null;
  estado.porta = 0;
  estado.historicoCarregado = false;
  if (esquecer) {
    caixa.limpar();
    fotos.clear();
    midias.clear();
    estado.novidades = [];
    estado.conversaAberta = null;
  }
}

export function iniciarWhatsapp() {
  if (estado.config.ligado) iniciarRelogio();
}

export function encerrarWhatsapp() {
  pararTudo(true);
}

const FOTO_VALIDA_MS = 6 * 3600_000;
const FOTO_FALHOU_MS = 3600_000;
const TAMANHO_MAXIMO_DA_FOTO = 300_000;
const fotos = new Map<string, { imagem: string | null; quando: number }>();
const fotosPedidas = new Set<string>();

function fotoDoServidorDoWhatsapp(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "whatsapp.net" || u.hostname.endsWith(".whatsapp.net")) ? u.toString() : null;
  } catch {
    return null;
  }
}

async function buscarFoto(jid: string) {
  let imagem: string | null = null;
  try {
    const corpo = await chamarComSucesso("GET", "/user/avatar", { query: { phone: jid, is_preview: "true" }, tempoMs: 8000 });
    const resultado = (corpo as Record<string, unknown> | null)?.results as Record<string, unknown> | undefined;
    const url = fotoDoServidorDoWhatsapp(resultado?.url);
    if (url) {
      const r = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(8000) });
      const tipo = r.headers.get("content-type") ?? "";
      const bytes = r.ok && /^image\/(jpeg|png|webp)$/.test(tipo) ? Buffer.from(await r.arrayBuffer()) : null;
      if (bytes && bytes.length <= TAMANHO_MAXIMO_DA_FOTO) imagem = `data:${tipo};base64,${bytes.toString("base64")}`;
    }
  } catch {
    imagem = null;
  }
  fotos.set(jid, { imagem, quando: Date.now() });
  fotosPedidas.delete(jid);
}

function pedirFotos(conversas: ConversaWhatsapp[]) {
  if (estado.config.mostrarFotos === false || estado.vinculo !== "conectado") return;
  for (const c of conversas) {
    if (fotosPedidas.size >= 2) return;
    const guardada = fotos.get(c.id);
    const validade = guardada?.imagem ? FOTO_VALIDA_MS : FOTO_FALHOU_MS;
    if (fotosPedidas.has(c.id) || (guardada && Date.now() - guardada.quando < validade)) continue;
    fotosPedidas.add(c.id);
    void buscarFoto(c.id);
  }
}

const MIDIAS_BAIXAVEIS = new Set(["imagem", "figurinha", "video", "audio"]);
const TAMANHO_MAXIMO_DA_MIDIA = 25 * 1024 * 1024;
const LIMITE_DAS_MIDIAS_NA_MEMORIA = 80 * 1024 * 1024;
const TIPOS_POR_EXTENSAO: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  mp4: "video/mp4", "3gp": "video/3gpp", mov: "video/quicktime",
  ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac",
};

export function tipoPelosBytes(b: Buffer, midia: string): string | null {
  const hex = b.subarray(0, 4).toString("hex");
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (hex === "89504e47") return "image/png";
  if (hex === "47494638") return "image/gif";
  if (hex === "52494646" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (hex === "4f676753") return midia === "video" ? "video/ogg" : "audio/ogg";
  if (b.subarray(4, 8).toString("latin1") === "ftyp") return midia === "audio" ? "audio/mp4" : "video/mp4";
  if (hex.startsWith("494433") || hex.startsWith("fffb") || hex.startsWith("fff3")) return "audio/mpeg";
  return null;
}
type MidiaBaixada = { tipo: string; bytes: Buffer };
const midias = new Map<string, MidiaBaixada>();
const midiasEmAndamento = new Map<string, Promise<MidiaBaixada>>();

function guardarMidia(chave: string, midia: MidiaBaixada) {
  midias.delete(chave);
  midias.set(chave, midia);
  let total = [...midias.values()].reduce((soma, m) => soma + m.bytes.length, 0);
  for (const [antiga, m] of midias) {
    if (total <= LIMITE_DAS_MIDIAS_NA_MEMORIA || antiga === chave) break;
    total -= m.bytes.length;
    midias.delete(antiga);
  }
}

async function baixarMidia(jid: string, id: string, tipoDaMidia: string): Promise<MidiaBaixada> {
  const corpo = await chamarComSucesso("GET", `/message/${encodeURIComponent(id)}/download`, { query: { phone: jid }, tempoMs: 60_000 });
  const relativo = ((corpo as Record<string, unknown> | null)?.results as Record<string, unknown> | undefined)?.file_path;
  const pasta = resolve(pastaDoWhatsapp());
  const caminho = typeof relativo === "string" && relativo ? resolve(pasta, relativo) : "";
  if (!caminho.startsWith(pasta + sep)) throw new Error("midia_indisponivel");
  try {
    if (statSync(caminho).size > TAMANHO_MAXIMO_DA_MIDIA) throw new Error("midia_grande_demais");
    const bytes = readFileSync(caminho);
    const tipo = tipoPelosBytes(bytes, tipoDaMidia) ?? TIPOS_POR_EXTENSAO[extname(caminho).slice(1).toLowerCase()];
    if (!tipo) throw new Error("midia_formato");
    const midia = { tipo, bytes };
    guardarMidia(`${jid}/${id}`, midia);
    return midia;
  } finally {
    rmSync(caminho, { force: true });
  }
}

export async function midiaDaMensagem(jid: unknown, id: unknown): Promise<MidiaBaixada> {
  if (typeof jid !== "string" || typeof id !== "string") throw new Error("pedido_invalido");
  const conversa = caixa.conversas.get(jidNormalizado(jid));
  const mensagem = conversa?.mensagens.find((m) => m.id === id);
  if (!conversa || !mensagem || !MIDIAS_BAIXAVEIS.has(mensagem.midia) || mensagem.visualizacaoUnica) throw new Error("midia_indisponivel");
  if ((mensagem.tamanho ?? 0) > TAMANHO_MAXIMO_DA_MIDIA) throw new Error("midia_grande_demais");
  const chave = `${conversa.id}/${id}`;
  const guardada = midias.get(chave);
  if (guardada) {
    guardarMidia(chave, guardada);
    return guardada;
  }
  let pedido = midiasEmAndamento.get(chave);
  if (!pedido) {
    pedido = baixarMidia(conversa.id, id, mensagem.midia).finally(() => midiasEmAndamento.delete(chave));
    midiasEmAndamento.set(chave, pedido);
  }
  return pedido;
}

function resumoDaConversa(c: ConversaWhatsapp) {
  const foto = estado.config.mostrarFotos === false ? null : fotos.get(c.id)?.imagem ?? null;
  return { ...c, mensagens: c.mensagens.slice(-20), foto };
}

export function estadoDoWhatsapp() {
  const filtros = estado.config;
  const visiveis = caixa.visiveis(filtros).slice(0, 30);
  pedirFotos(visiveis);
  return {
    suportado: alvoDaPlataforma() !== null,
    ligado: estado.config.ligado,
    instalado: gowaInstalado(),
    instalacao: { ...instalacao },
    rodando: gowaRodando(),
    vinculo: estado.config.ligado ? estado.vinculo : "desligado",
    eu: estado.eu,
    qr: estado.vinculo === "precisa_qr" ? estado.qr?.png ?? null : null,
    erro: estado.erro,
    filtros: { silenciarGrupos: filtros.silenciarGrupos, lerAoAbrir: filtros.lerAoAbrir, esconderArquivadas: filtros.esconderArquivadas !== false, esconderGrupos: filtros.esconderGrupos === true, mostrarFotos: filtros.mostrarFotos !== false, ignoradas: filtros.ignoradas },
    conversas: visiveis.map(resumoDaConversa),
    aberta: estado.conversaAberta && caixa.conversas.has(estado.conversaAberta) ? resumoDaConversa(caixa.conversas.get(estado.conversaAberta)!) : null,
    naoLidas: caixa.naoLidasVisiveis(filtros),
    seq: estado.seq,
  };
}

export function novidadesDoWhatsapp(desde: number) {
  return { seq: estado.seq, itens: estado.novidades.filter((n) => n.seq > desde) };
}

export async function instalarWhatsapp() {
  const versao = await instalarGowa(async () => {
    pararGowa();
    await aguardarGowaParar();
  });
  estado.porta = 0;
  if (estado.config.ligado) iniciarRelogio();
  return { ok: true, versao };
}

export function ligarWhatsapp(ligado: boolean) {
  estado.config = { ...estado.config, ligado };
  salvarConfig(estado.config);
  if (ligado) iniciarRelogio();
  else pararTudo(true);
  return estadoDoWhatsapp();
}

export function definirFiltrosDoWhatsapp(dados: Record<string, unknown>) {
  estado.config = {
    ...estado.config,
    ...(typeof dados.silenciarGrupos === "boolean" ? { silenciarGrupos: dados.silenciarGrupos } : {}),
    ...(typeof dados.lerAoAbrir === "boolean" ? { lerAoAbrir: dados.lerAoAbrir } : {}),
    ...(typeof dados.esconderArquivadas === "boolean" ? { esconderArquivadas: dados.esconderArquivadas } : {}),
    ...(typeof dados.esconderGrupos === "boolean" ? { esconderGrupos: dados.esconderGrupos } : {}),
    ...(typeof dados.mostrarFotos === "boolean" ? { mostrarFotos: dados.mostrarFotos } : {}),
  };
  salvarConfig(estado.config);
  return estadoDoWhatsapp();
}

export function ignorarConversa(jid: unknown, ignorar: unknown) {
  if (typeof jid !== "string" || !jid.includes("@") || jid.length > 120) throw new Error("conversa_invalida");
  const id = jidNormalizado(jid);
  const ignoradas = new Set(estado.config.ignoradas);
  if (ignorar === false) ignoradas.delete(id);
  else {
    ignoradas.add(id);
    caixa.remover(id);
    estado.novidades = estado.novidades.filter((n) => n.jid !== id);
  }
  estado.config = { ...estado.config, ignoradas: [...ignoradas] };
  salvarConfig(estado.config);
  return estadoDoWhatsapp();
}

async function confirmarLeitura(jid: string) {
  const conversa = caixa.conversas.get(jid);
  const ultimaRecebida = [...(conversa?.mensagens ?? [])].reverse().find((m) => !m.minha);
  if (!ultimaRecebida) return;
  await chamarComSucesso("POST", `/message/${encodeURIComponent(ultimaRecebida.id)}/read`, { json: { phone: jid } }).catch(() => undefined);
}

export async function abrirConversa(jid: unknown) {
  if (typeof jid !== "string" || !caixa.conversas.has(jidNormalizado(jid))) throw new Error("conversa_invalida");
  const id = jidNormalizado(jid);
  estado.conversaAberta = id;
  const tinhaNaoLidas = (caixa.conversas.get(id)?.naoLidas ?? 0) > 0;
  const recentes = await chamarComSucesso("GET", `/chat/${encodeURIComponent(id)}/messages`, { query: { limit: "20" } }).catch(() => null);
  for (const m of mensagensDoGateway(recentes, estado.eu)) caixa.adicionar(m, estado.config, true);
  caixa.marcarLida(id);
  estado.novidades = estado.novidades.filter((n) => n.jid !== id);
  if (estado.config.lerAoAbrir && tinhaNaoLidas) await confirmarLeitura(id);
  const conversa = caixa.conversas.get(id);
  return conversa ? resumoDaConversa(conversa) : null;
}

export function fecharConversa() {
  estado.conversaAberta = null;
  return { ok: true };
}

export async function enviarMensagem(jid: unknown, texto: unknown) {
  if (typeof jid !== "string" || typeof texto !== "string") throw new Error("pedido_invalido");
  const id = jidNormalizado(jid);
  const recusa = recusaDaResposta(texto, id, caixa);
  if (recusa) throw new Error(`resposta_${recusa}`);
  if (!envios.permitir()) throw new Error("resposta_muitas");
  const corpo = await chamarComSucesso("POST", "/send/message", { json: { phone: id, message: texto.trim() } });
  const idDaMensagem = ((corpo as Record<string, unknown> | null)?.results as Record<string, unknown> | undefined)?.message_id;
  caixa.adicionar({ id: typeof idDaMensagem === "string" ? idDaMensagem : `niko-${randomBytes(6).toString("hex")}`, conversa: id, remetente: estado.eu ?? id, nomeRemetente: "", texto: texto.trim(), midia: "nenhuma", data: horarioDoEnvio(id), minha: true, mencionaMe: false, local: true }, estado.config);
  void confirmarLeitura(id);
  confirmarHorariosDepois(id);
  const conversa = caixa.conversas.get(id);
  return conversa ? resumoDaConversa(conversa) : null;
}

function horarioDoEnvio(jid: string): string {
  const ultima = caixa.conversas.get(jid)?.mensagens.at(-1)?.data ?? "";
  const agora = new Date().toISOString();
  return ultima > agora ? new Date(Date.parse(ultima) + 1).toISOString() : agora;
}

const confirmacoesPendentes = new Map<string, ReturnType<typeof setTimeout>>();

function confirmarHorariosDepois(jid: string) {
  clearTimeout(confirmacoesPendentes.get(jid));
  confirmacoesPendentes.set(jid, setTimeout(() => {
    confirmacoesPendentes.delete(jid);
    void chamarComSucesso("GET", `/chat/${encodeURIComponent(jid)}/messages`, { query: { limit: "20" } })
      .then((corpo) => guardar(mensagensDoGateway(corpo, estado.eu), false))
      .catch(() => undefined);
  }, 1500));
}

const TAMANHO_MAXIMO_DO_ENVIO = 16 * 1024 * 1024;

function lerBytes(req: IncomingMessage, limite: number): Promise<Buffer> {
  return new Promise((resolver, rejeitar) => {
    let partes: Buffer[] = [];
    let tamanho = 0;
    req.on("data", (p: Buffer) => {
      tamanho += p.length;
      if (tamanho > limite) partes = [];
      else partes.push(p);
    });
    req.on("end", () => (tamanho > limite ? rejeitar(new Error("arquivo_grande_demais")) : resolver(Buffer.concat(partes))));
    req.on("error", rejeitar);
  });
}

function rotaDoEnvio(bytes: Buffer): { caminho: string; campo: string; midia: MensagemWhatsapp["midia"] } {
  const tipo = tipoPelosBytes(bytes, "");
  if (tipo === "image/jpeg" || tipo === "image/png") return { caminho: "/send/image", campo: "image", midia: "imagem" };
  if (tipo === "video/mp4") return { caminho: "/send/video", campo: "video", midia: "video" };
  return { caminho: "/send/file", campo: "file", midia: "documento" };
}

export async function enviarArquivoNoWhatsapp(req: IncomingMessage, consulta: URLSearchParams) {
  const jid = consulta.get("jid") ?? "";
  const nome = (consulta.get("nome") ?? "arquivo").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120) || "arquivo";
  const legenda = (consulta.get("legenda") ?? "").trim().slice(0, 1024);
  const id = jidNormalizado(jid);
  if (!jid.includes("@") || !caixa.conversas.has(id)) throw new Error("resposta_sem_conversa");
  const bytes = await lerBytes(req, TAMANHO_MAXIMO_DO_ENVIO);
  if (bytes.length === 0) throw new Error("arquivo_vazio");
  if (!envios.permitir()) throw new Error("resposta_muitas");
  if (!estado.porta) throw new Error("gateway_parado");
  const rota = rotaDoEnvio(bytes);
  const formulario = new FormData();
  formulario.set("phone", id);
  if (legenda) formulario.set("caption", legenda);
  formulario.set(rota.campo, new Blob([new Uint8Array(bytes)]), nome);
  const r = await fetch(`http://127.0.0.1:${estado.porta}${rota.caminho}`, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(estado.acesso).toString("base64")}`, "x-device-id": estado.dispositivo },
    body: formulario,
    signal: AbortSignal.timeout(120_000),
  });
  const corpo = (await r.json().catch(() => null)) as Record<string, unknown> | null;
  if (!r.ok) throw new Error(codigoDeErro(corpo) || `gateway_${r.status}`);
  const idDaMensagem = (corpo?.results as Record<string, unknown> | undefined)?.message_id;
  const idFinal = typeof idDaMensagem === "string" ? idDaMensagem : `niko-${randomBytes(6).toString("hex")}`;
  const tipo = tipoPelosBytes(bytes, rota.midia);
  if (tipo && rota.midia !== "documento") guardarMidia(`${id}/${idFinal}`, { tipo, bytes });
  caixa.adicionar({ id: idFinal, conversa: id, remetente: estado.eu ?? id, nomeRemetente: "", texto: legenda, midia: rota.midia, nomeDoArquivo: nome, tamanho: bytes.length, data: horarioDoEnvio(id), minha: true, mencionaMe: false, local: true }, estado.config);
  confirmarHorariosDepois(id);
  const conversa = caixa.conversas.get(id);
  return conversa ? resumoDaConversa(conversa) : null;
}

export async function desconectarWhatsapp() {
  await chamarComSucesso("POST", `/devices/${encodeURIComponent(estado.dispositivo)}/logout`).catch(() => undefined);
  caixa.limpar();
  estado.novidades = [];
  estado.historicoCarregado = false;
  estado.qr = null;
  estado.vinculo = "precisa_qr";
  return estadoDoWhatsapp();
}

export async function esquecerWhatsapp() {
  await chamarComSucesso("POST", `/devices/${encodeURIComponent(estado.dispositivo)}/logout`).catch(() => undefined);
  pararTudo(true);
  await aguardarGowaParar();
  for (const pasta of ["storages", "statics"]) rmSync(join(pastaDoWhatsapp(), pasta), { recursive: true, force: true });
  await apagarSegredo("whatsapp-acesso").catch(() => undefined);
  await apagarSegredo("whatsapp-webhook").catch(() => undefined);
  estado.acesso = "";
  estado.segredo = "";
  estado.config = { ...PADRAO };
  salvarConfig(estado.config);
  return estadoDoWhatsapp();
}

const LIMITE_DO_CORPO = 1_000_000;

export function receberWebhookDoWhatsapp(req: IncomingMessage, res: ServerResponse) {
  const partes: Buffer[] = [];
  let tamanho = 0;
  let recusado = false;
  req.on("data", (p: Buffer) => {
    tamanho += p.length;
    if (tamanho > LIMITE_DO_CORPO) {
      recusado = true;
      req.destroy();
      return;
    }
    partes.push(p);
  });
  req.on("end", () => {
    if (recusado) return;
    const corpo = Buffer.concat(partes);
    if (!estado.config.ligado || !webhookAutentico(corpo, req.headers["x-hub-signature-256"], estado.segredo)) {
      res.statusCode = 401;
      return res.end();
    }
    res.statusCode = 200;
    res.end();
    let lido: unknown;
    try {
      lido = JSON.parse(corpo.toString("utf8"));
    } catch {
      return;
    }
    const mensagem = mensagemDoWebhook(lido, estado.eu);
    if (!mensagem) return;
    estado.ultimoWebhook = Date.now();
    if (estado.historicoCarregado) guardar([mensagem], true);
  });
}
