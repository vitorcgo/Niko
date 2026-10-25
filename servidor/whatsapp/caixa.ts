import { createHmac, timingSafeEqual } from "node:crypto";

export type TipoDeMidia = "nenhuma" | "imagem" | "video" | "audio" | "documento" | "figurinha" | "localizacao" | "contato" | "outra";

export interface MensagemWhatsapp {
  id: string;
  conversa: string;
  remetente: string;
  nomeRemetente: string;
  texto: string;
  midia: TipoDeMidia;
  nomeDoArquivo?: string;
  data: string;
  minha: boolean;
  mencionaMe: boolean;
  nomeDaConversa?: string;
  visualizacaoUnica?: boolean;
  encaminhada?: boolean;
  tamanho?: number;
  local?: boolean;
  apagada?: string;
  editada?: string;
  textoOriginal?: string;
  reacoes?: ReacaoWhatsapp[];
  entrega?: "entregue" | "lida";
}

export interface ReacaoWhatsapp {
  de: string;
  nome: string;
  emoji: string;
  minha: boolean;
}

export interface RastroWhatsapp {
  tipo: "apagada" | "editada";
  id: string;
  conversa: string;
  nomeDaConversa: string;
  grupo: boolean;
  remetente: string;
  nomeRemetente: string;
  texto: string;
  textoNovo?: string;
  midia: TipoDeMidia;
  nomeDoArquivo?: string;
  data: string;
  quando: string;
}

export interface ConversaWhatsapp {
  id: string;
  nome: string;
  grupo: boolean;
  mensagens: MensagemWhatsapp[];
  naoLidas: number;
  ultimaAtividade: string;
  arquivada?: boolean;
}

export interface FiltrosWhatsapp {
  silenciarGrupos: boolean;
  ignoradas: string[];
  esconderArquivadas?: boolean;
  esconderGrupos?: boolean;
}

function escondida(c: ConversaWhatsapp, filtros: FiltrosWhatsapp): boolean {
  return !ehConversa(c.id) || filtros.ignoradas.includes(c.id) || (filtros.esconderArquivadas !== false && c.arquivada === true) || (filtros.esconderGrupos === true && c.grupo);
}

export type Resultado = "repetida" | "ignorada" | "silenciosa" | "avisar";

const MENSAGENS_POR_CONVERSA = 20;
const LIMITE_DE_IDS_VISTOS = 2000;
const LIMITE_DE_LEMBRADAS = 3000;

export function ehGrupo(jid: string): boolean {
  return jid.endsWith("@g.us");
}

export function ehConversa(jid: string): boolean {
  return !/@(broadcast|newsletter)$/.test(jid);
}

export function jidNormalizado(jid: string): string {
  const [usuario, servidor] = jid.split("@");
  if (!servidor) return jid;
  const base = usuario.split(":")[0];
  return `${base}@${servidor === "c.us" ? "s.whatsapp.net" : servidor}`;
}

export function digitosDoJid(jid: string): string {
  return jid.split("@")[0].split(":")[0].replace(/\D/g, "");
}

export function numeroParaExibir(jid: string): string {
  const digitos = digitosDoJid(jid);
  return digitos && digitos === jid.split("@")[0].split(":")[0] ? `+${digitos}` : jid.split("@")[0];
}

export function iniciais(nome: string): string {
  const letras = nome
    .split(/[\s-]+/)
    .filter((p) => /^\p{L}/u.test(p))
    .slice(0, 2)
    .map((p) => p[0].toUpperCase());
  return letras.length ? letras.join("") : "#";
}

export function textoMencionaMe(texto: string, eu: string | null | undefined): boolean {
  if (!eu) return false;
  const digitos = digitosDoJid(eu);
  return digitos.length >= 6 && texto.includes(`@${digitos}`);
}

export class CaixaWhatsapp {
  conversas = new Map<string, ConversaWhatsapp>();
  private vistas = new Set<string>();
  private ordemVista: string[] = [];
  private lembradas = new Map<string, MensagemWhatsapp>();

  mensagem(id: string): MensagemWhatsapp | undefined {
    return this.lembradas.get(id);
  }

  conhecer(m: MensagemWhatsapp): MensagemWhatsapp {
    const guardada = this.lembradas.get(m.id);
    if (guardada) {
      if (m.reacoes) guardada.reacoes = m.reacoes;
      return guardada;
    }
    const nova = { ...m, conversa: jidNormalizado(m.conversa) };
    this.lembrar(nova);
    return nova;
  }

  private lembrar(m: MensagemWhatsapp) {
    this.lembradas.delete(m.id);
    this.lembradas.set(m.id, m);
    if (this.lembradas.size <= LIMITE_DE_LEMBRADAS) return;
    for (const antiga of [...this.lembradas.keys()].slice(0, LIMITE_DE_LEMBRADAS / 4)) this.lembradas.delete(antiga);
  }

  adicionar(m: MensagemWhatsapp, filtros: FiltrosWhatsapp, historico = false, nome?: string): Resultado {
    const id = jidNormalizado(m.conversa);
    if (this.vistas.has(m.id)) {
      if (!m.local) this.confirmarHorario(id, m);
      const guardada = this.lembradas.get(m.id);
      if (guardada && m.reacoes) guardada.reacoes = m.reacoes;
      return "repetida";
    }
    if (filtros.ignoradas.includes(id) || !ehConversa(id)) return "ignorada";
    this.vistas.add(m.id);
    this.ordemVista.push(m.id);
    if (this.ordemVista.length > LIMITE_DE_IDS_VISTOS) for (const velha of this.ordemVista.splice(0, LIMITE_DE_IDS_VISTOS / 2)) this.vistas.delete(velha);

    const grupo = ehGrupo(id);
    const numero = numeroParaExibir(id);
    const nomeDaPessoa = grupo || m.minha ? undefined : m.nomeRemetente || undefined;
    const conversa = this.conversas.get(id) ?? { id, nome: nome ?? m.nomeDaConversa ?? nomeDaPessoa ?? numero, grupo, mensagens: [], naoLidas: 0, ultimaAtividade: m.data };
    const nomeNovo = nome ?? m.nomeDaConversa;
    if (nomeNovo) conversa.nome = nomeNovo;
    else if (conversa.nome === numero && nomeDaPessoa) conversa.nome = nomeDaPessoa;
    const nova = { ...m, conversa: id };
    this.lembrar(nova);
    conversa.mensagens = [...conversa.mensagens, nova].sort((a, b) => a.data.localeCompare(b.data)).slice(-MENSAGENS_POR_CONVERSA);
    if (m.data > conversa.ultimaAtividade) conversa.ultimaAtividade = m.data;

    let resultado: Resultado;
    if (historico) resultado = "silenciosa";
    else if (m.minha) {
      conversa.naoLidas = 0;
      resultado = "silenciosa";
    } else {
      conversa.naoLidas += 1;
      resultado = escondida(conversa, filtros) || (grupo && filtros.silenciarGrupos && !m.mencionaMe) ? "silenciosa" : "avisar";
    }
    this.conversas.set(id, conversa);
    return resultado;
  }

  private confirmarHorario(id: string, m: MensagemWhatsapp) {
    const conversa = this.conversas.get(id);
    const guardada = conversa?.mensagens.find((x) => x.id === m.id);
    if (!conversa || !guardada?.local) return;
    const antes = guardada.data;
    guardada.local = false;
    guardada.data = m.data;
    conversa.mensagens = [...conversa.mensagens].sort((a, b) => a.data.localeCompare(b.data));
    if (conversa.ultimaAtividade === antes) conversa.ultimaAtividade = conversa.mensagens[conversa.mensagens.length - 1].data;
  }

  registrarConversa(jid: string, nome: string, ultima: string, filtros: FiltrosWhatsapp, arquivada = false) {
    const id = jidNormalizado(jid);
    if (filtros.ignoradas.includes(id) || !ehConversa(id)) return;
    const numero = numeroParaExibir(id);
    const atual = this.conversas.get(id);
    if (!atual) {
      this.conversas.set(id, { id, nome: nome || numero, grupo: ehGrupo(id), mensagens: [], naoLidas: 0, ultimaAtividade: ultima || new Date(0).toISOString(), arquivada });
      return;
    }
    atual.arquivada = arquivada;
    if (nome && atual.nome === numero) atual.nome = nome;
    if (ultima > atual.ultimaAtividade) atual.ultimaAtividade = ultima;
  }

  visiveis(filtros: FiltrosWhatsapp): ConversaWhatsapp[] {
    return [...this.conversas.values()]
      .filter((c) => !escondida(c, filtros))
      .sort((a, b) => b.ultimaAtividade.localeCompare(a.ultimaAtividade));
  }

  naoLidasVisiveis(filtros: FiltrosWhatsapp): number {
    const conta = (c: ConversaWhatsapp) => !c.grupo || !filtros.silenciarGrupos || c.mensagens.some((m) => m.mencionaMe && !m.minha);
    return this.visiveis(filtros).filter(conta).reduce((total, c) => total + c.naoLidas, 0);
  }

  marcarLida(jid: string) {
    const c = this.conversas.get(jidNormalizado(jid));
    if (c) c.naoLidas = 0;
  }

  marcarTodasLidas() {
    for (const c of this.conversas.values()) c.naoLidas = 0;
  }

  remover(jid: string) {
    this.conversas.delete(jidNormalizado(jid));
  }

  renomear(jid: string, nome: string) {
    const c = this.conversas.get(jidNormalizado(jid));
    if (c && nome) c.nome = nome;
  }

  private rastroDe(m: MensagemWhatsapp, tipo: RastroWhatsapp["tipo"], quando: string, texto: string): RastroWhatsapp {
    const conversa = this.conversas.get(m.conversa);
    const grupo = ehGrupo(m.conversa);
    return {
      tipo,
      id: m.id,
      conversa: m.conversa,
      nomeDaConversa: conversa?.nome ?? numeroParaExibir(m.conversa),
      grupo,
      remetente: m.remetente,
      nomeRemetente: m.nomeRemetente || (!grupo && conversa ? conversa.nome : numeroParaExibir(m.remetente)),
      texto,
      midia: m.midia,
      nomeDoArquivo: m.nomeDoArquivo,
      data: m.data,
      quando,
    };
  }

  aplicarApagada(id: string, quando: string): RastroWhatsapp | null {
    const m = this.lembradas.get(id);
    if (!m || m.apagada) return null;
    m.apagada = quando;
    if (m.minha || (!m.texto && m.midia === "nenhuma")) return null;
    return this.rastroDe(m, "apagada", quando, m.texto);
  }

  aplicarEdicao(id: string, texto: string, quando: string): RastroWhatsapp | null {
    const m = this.lembradas.get(id);
    if (!m || m.texto === texto) return null;
    const anterior = m.texto;
    m.textoOriginal ??= anterior;
    m.texto = texto;
    m.editada = quando;
    return m.minha ? null : { ...this.rastroDe(m, "editada", quando, anterior), textoNovo: texto };
  }

  aplicarReacao(id: string, reacao: ReacaoWhatsapp): boolean {
    const m = this.lembradas.get(id);
    if (!m) return false;
    m.reacoes = [...(m.reacoes ?? []).filter((r) => r.de !== reacao.de), ...(reacao.emoji ? [reacao] : [])];
    return true;
  }

  aplicarEntrega(ids: string[], estado: "entregue" | "lida") {
    for (const id of ids) {
      const m = this.lembradas.get(id);
      if (m?.minha && m.entrega !== "lida") m.entrega = estado;
    }
  }

  limpar() {
    this.conversas.clear();
    this.vistas.clear();
    this.ordemVista = [];
    this.lembradas.clear();
  }
}

export const TAMANHO_MAXIMO_DA_RESPOSTA = 4096;

export type RecusaDeResposta = "vazia" | "longa" | "sem_conversa" | "muitas";

export function recusaDaResposta(texto: string, jid: string, caixa: CaixaWhatsapp): Exclude<RecusaDeResposta, "muitas"> | null {
  const limpo = texto.trim();
  if (!limpo) return "vazia";
  if (limpo.length > TAMANHO_MAXIMO_DA_RESPOSTA) return "longa";
  return caixa.conversas.has(jidNormalizado(jid)) ? null : "sem_conversa";
}

export class LimiteDeEnvios {
  private envios: number[] = [];
  private maximo: number;
  private janelaMs: number;

  constructor(maximo = 30, janelaMs = 60_000) {
    this.maximo = maximo;
    this.janelaMs = janelaMs;
  }

  permitir(agora = Date.now()): boolean {
    this.envios = this.envios.filter((t) => agora - t <= this.janelaMs);
    if (this.envios.length >= this.maximo) return false;
    this.envios.push(agora);
    return true;
  }
}

export function assinaturaDoWebhook(corpo: Buffer | string, segredo: string): string {
  return `sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`;
}

export function webhookAutentico(corpo: Buffer, assinatura: unknown, segredo: string): boolean {
  if (!segredo || typeof assinatura !== "string" || !assinatura.startsWith("sha256=")) return false;
  const esperada = Buffer.from(assinaturaDoWebhook(corpo, segredo));
  const recebida = Buffer.from(assinatura);
  return esperada.length === recebida.length && timingSafeEqual(esperada, recebida);
}

const texto = (v: unknown) => (typeof v === "string" && v ? v : undefined);

function dataIso(v: unknown): string {
  const d = typeof v === "string" ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
}

function midiaDoWebhook(p: Record<string, unknown>): { midia: TipoDeMidia; nomeDoArquivo?: string } {
  if (p.image) return { midia: "imagem" };
  if (p.video || p.video_note) return { midia: "video" };
  if (p.audio) return { midia: "audio" };
  if (p.document) return { midia: "documento", nomeDoArquivo: texto((p.document as Record<string, unknown>)?.filename) };
  if (p.sticker) return { midia: "figurinha" };
  if (p.location || p.live_location) return { midia: "localizacao" };
  if (p.contact || p.contacts_array) return { midia: "contato" };
  if (p.poll) return { midia: "outra" };
  return { midia: "nenhuma" };
}

export function mensagemDoWebhook(corpo: unknown, eu?: string | null): MensagemWhatsapp | null {
  if (!corpo || typeof corpo !== "object") return null;
  const raiz = corpo as Record<string, unknown>;
  if (raiz.event !== "message" || !raiz.payload || typeof raiz.payload !== "object") return null;
  const p = raiz.payload as Record<string, unknown>;
  const id = texto(p.id);
  const conversa = texto(p.chat_id);
  if (!id || !conversa) return null;
  const corpoTexto = typeof p.body === "string" ? p.body : "";
  const minhaConta = eu ?? texto(raiz.device_id);
  return {
    id,
    conversa,
    remetente: texto(p.from) ?? conversa,
    nomeRemetente: texto(p.sender_display_name) ?? texto(p.from_name) ?? "",
    texto: corpoTexto,
    ...midiaDoWebhook(p),
    data: dataIso(p.timestamp),
    minha: p.is_from_me === true,
    mencionaMe: ehGrupo(conversa) && textoMencionaMe(corpoTexto, minhaConta),
    visualizacaoUnica: p.view_once === true,
    encaminhada: p.forwarded === true,
  };
}

export type EventoWhatsapp =
  | { tipo: "mensagem"; mensagem: MensagemWhatsapp }
  | { tipo: "apagada"; id: string; quando: string }
  | { tipo: "editada"; id: string; texto: string; quando: string }
  | { tipo: "reacao"; id: string; reacao: ReacaoWhatsapp }
  | { tipo: "entrega"; ids: string[]; estado: "entregue" | "lida" }
  | { tipo: "digitando"; conversa: string; nome: string; audio: boolean; parou: boolean };

export function eventoDoWebhook(corpo: unknown, eu?: string | null): EventoWhatsapp | null {
  if (!corpo || typeof corpo !== "object") return null;
  const raiz = corpo as Record<string, unknown>;
  const p = raiz.payload && typeof raiz.payload === "object" ? (raiz.payload as Record<string, unknown>) : null;
  if (!p) return null;
  switch (raiz.event) {
    case "message": {
      const mensagem = mensagemDoWebhook(corpo, eu);
      return mensagem ? { tipo: "mensagem", mensagem } : null;
    }
    case "message.revoked": {
      const id = texto(p.revoked_message_id);
      return id ? { tipo: "apagada", id, quando: dataIso(p.timestamp) } : null;
    }
    case "message.edited": {
      const id = texto(p.original_message_id);
      return id && typeof p.body === "string" ? { tipo: "editada", id, texto: p.body, quando: dataIso(p.timestamp) } : null;
    }
    case "message.reaction": {
      const id = texto(p.reacted_message_id);
      const de = texto(p.from);
      if (!id || !de) return null;
      return { tipo: "reacao", id, reacao: { de: jidNormalizado(de), nome: texto(p.sender_display_name) ?? texto(p.from_name) ?? "", emoji: typeof p.reaction === "string" ? p.reaction.slice(0, 16) : "", minha: p.is_from_me === true } };
    }
    case "message.ack": {
      const ids = Array.isArray(p.ids) ? p.ids.filter((i): i is string => typeof i === "string" && i.length > 0).slice(0, 200) : [];
      const estado = p.receipt_type === "read" ? "lida" : p.receipt_type === "delivered" ? "entregue" : null;
      return ids.length && estado ? { tipo: "entrega", ids, estado } : null;
    }
    case "chat_presence": {
      const conversa = texto(p.chat_id);
      if (!conversa) return null;
      return { tipo: "digitando", conversa: jidNormalizado(conversa), nome: texto(p.sender_display_name) ?? "", audio: p.media === "audio", parou: p.state !== "composing" };
    }
    default:
      return null;
  }
}

function reacoesDoGateway(lista: unknown): ReacaoWhatsapp[] | undefined {
  if (!Array.isArray(lista)) return undefined;
  return lista.flatMap((r: Record<string, unknown>) => {
    const de = texto(r?.sender_jid);
    const emoji = texto(r?.emoji);
    return de && emoji ? [{ de: jidNormalizado(de), nome: texto(r.sender_display_name) ?? "", emoji: emoji.slice(0, 16), minha: r.is_from_me === true }] : [];
  });
}

function midiaGuardada(tipo: unknown): TipoDeMidia {
  switch (tipo) {
    case "image": return "imagem";
    case "video":
    case "video_note": return "video";
    case "audio": return "audio";
    case "document": return "documento";
    case "sticker": return "figurinha";
    case "":
    case undefined:
    case null: return "nenhuma";
    default: return "outra";
  }
}

function resultados(corpo: unknown): Record<string, unknown> | null {
  const r = (corpo as Record<string, unknown> | null)?.results;
  return r && typeof r === "object" ? (r as Record<string, unknown>) : null;
}

export function conversasDoGateway(corpo: unknown): { jid: string; nome: string; ultima: string; arquivada: boolean }[] {
  const lista = resultados(corpo)?.data;
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((c: Record<string, unknown>) => {
    const jid = texto(c?.jid);
    return jid ? [{ jid, nome: texto(c.name) ?? "", ultima: typeof c.last_message_time === "string" ? dataIso(c.last_message_time) : "", arquivada: c.archived === true }] : [];
  });
}

export function mensagensDoGateway(corpo: unknown, eu?: string | null): MensagemWhatsapp[] {
  const r = resultados(corpo);
  const lista = r?.data;
  if (!Array.isArray(lista)) return [];
  const nomeDaConversa = texto((r?.chat_info as Record<string, unknown> | undefined)?.name);
  return lista.flatMap((m: Record<string, unknown>) => {
    const id = texto(m?.id);
    const conversa = texto(m?.chat_jid);
    if (!id || !conversa) return [];
    const corpoTexto = typeof m.content === "string" ? m.content : "";
    const grupo = ehGrupo(conversa);
    return [{
      id,
      conversa,
      remetente: texto(m.sender_jid) ?? conversa,
      nomeRemetente: texto(m.sender_display_name) ?? "",
      texto: corpoTexto,
      midia: midiaGuardada(m.media_type),
      nomeDoArquivo: texto(m.filename),
      data: dataIso(m.timestamp),
      minha: m.is_from_me === true,
      mencionaMe: grupo && textoMencionaMe(corpoTexto, eu),
      nomeDaConversa: grupo ? nomeDaConversa : undefined,
      tamanho: typeof m.file_length === "number" ? m.file_length : undefined,
      reacoes: reacoesDoGateway(m.reactions),
    }];
  });
}

export type SituacaoDoVinculo = "conectado" | "precisa_qr" | "conectando";

export function dispositivoDoGateway(corpo: unknown): { id: string; vinculo: SituacaoDoVinculo; eu: string | null } | null {
  const lista = (corpo as Record<string, unknown> | null)?.results;
  if (!Array.isArray(lista) || lista.length === 0) return null;
  const escolhido = (lista.find((d: Record<string, unknown>) => d?.state === "logged_in") ?? lista[0]) as Record<string, unknown>;
  const id = texto(escolhido?.id);
  if (!id) return null;
  const jid = texto(escolhido.jid) ?? null;
  const vinculo: SituacaoDoVinculo = escolhido.state === "logged_in" ? "conectado" : jid ? "conectando" : "precisa_qr";
  return { id, vinculo, eu: jid };
}

export function caminhoDoQr(corpo: unknown): { caminho: string; segundos: number } | null {
  const r = resultados(corpo);
  const link = texto(r?.qr_link);
  if (!link) return null;
  try {
    const caminho = new URL(link, "http://127.0.0.1").pathname;
    return caminho ? { caminho, segundos: typeof r?.qr_duration === "number" ? r.qr_duration : 30 } : null;
  } catch {
    return null;
  }
}
