export type MidiaWhatsapp = "nenhuma" | "imagem" | "video" | "audio" | "documento" | "figurinha" | "localizacao" | "contato" | "outra";

export interface MensagemWhatsapp {
  id: string;
  conversa: string;
  remetente: string;
  nomeRemetente: string;
  texto: string;
  midia: MidiaWhatsapp;
  nomeDoArquivo?: string;
  data: string;
  minha: boolean;
  mencionaMe: boolean;
  visualizacaoUnica?: boolean;
  unicaAberta?: boolean;
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
  midia: MidiaWhatsapp;
  nomeDoArquivo?: string;
  data: string;
  quando: string;
}

export interface AgendadaWhatsapp {
  id: string;
  jid: string;
  nome: string;
  resumo: string;
  tipo: string;
  situacao: string;
  quando: string;
  proxima: string | null;
  erro: string;
}

export interface ConversaWhatsapp {
  id: string;
  nome: string;
  grupo: boolean;
  mensagens: MensagemWhatsapp[];
  naoLidas: number;
  ultimaAtividade: string;
  arquivada?: boolean;
  foto?: string | null;
}

export type VinculoWhatsapp = "desligado" | "sem_gateway" | "iniciando" | "precisa_qr" | "conectando" | "conectado";
export type EtapaDaInstalacao = "parado" | "verificando" | "baixando" | "conferindo" | "instalando" | "pronto" | "falhou";

export interface EstadoWhatsapp {
  suportado: boolean;
  ligado: boolean;
  instalado: boolean;
  instalacao: { etapa: EtapaDaInstalacao; megabytes: number; versao: string; erro: string };
  rodando: boolean;
  vinculo: VinculoWhatsapp;
  eu: string | null;
  qr: string | null;
  erro: string;
  filtros: { silenciarGrupos: boolean; lerAoAbrir: boolean; esconderArquivadas: boolean; esconderGrupos: boolean; mostrarFotos: boolean; ignoradas: string[] };
  conversas: ConversaWhatsapp[];
  abertas?: ConversaWhatsapp[];
  naoLidas: number;
  seq: number;
  digitando?: Record<string, { nome: string; audio: boolean }>;
  rastros?: number;
  ultimoRastro?: string;
}

export interface NovidadeWhatsapp {
  seq: number;
  jid: string;
  nome: string;
  grupo: boolean;
}

async function pedir<T>(caminho: string, corpo?: unknown): Promise<T> {
  const r = await fetch(`/ponte/whatsapp/${caminho}`, {
    method: corpo === undefined ? "GET" : "POST",
    headers: { "x-niko": "1", "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const json = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw new Error(json.erro ?? `http_${r.status}`);
  return json;
}

async function urlDaMidia(jid: string, id: string): Promise<string> {
  const r = await fetch(`/ponte/whatsapp/midia?${new URLSearchParams({ jid, id })}`, { headers: { "x-niko": "1" } });
  if (!r.ok) throw new Error(`http_${r.status}`);
  return URL.createObjectURL(await r.blob());
}

async function enviarArquivo(jid: string, arquivo: File, legenda: string): Promise<ConversaWhatsapp | null> {
  const r = await fetch(`/ponte/whatsapp/enviar-arquivo?${new URLSearchParams({ jid, nome: arquivo.name, legenda })}`, {
    method: "POST",
    headers: { "x-niko": "1", "content-type": "application/octet-stream" },
    body: arquivo,
  });
  const json = (await r.json().catch(() => ({}))) as ConversaWhatsapp & { erro?: string };
  if (!r.ok) throw new Error(json.erro ?? `http_${r.status}`);
  return json;
}

async function urlDaMidiaUnica(jid: string, id: string): Promise<string> {
  const r = await fetch(`/ponte/whatsapp/midia?${new URLSearchParams({ jid, id })}`, { headers: { "x-niko": "1" }, cache: "no-store" });
  if (!r.ok) {
    const json = (await r.json().catch(() => ({}))) as { erro?: string };
    throw new Error(json.erro ?? `http_${r.status}`);
  }
  return URL.createObjectURL(await r.blob());
}

export const whatsappPonte = {
  midia: urlDaMidia,
  midiaUnica: urlDaMidiaUnica,
  enviarArquivo,
  estado: () => pedir<EstadoWhatsapp>("estado"),
  novidades: (desde: number) => pedir<{ seq: number; itens: NovidadeWhatsapp[] }>(`novidades?desde=${desde}`),
  instalar: () => pedir<{ ok: boolean; versao: string }>("instalar", {}),
  ligar: (ligado: boolean) => pedir<EstadoWhatsapp>("ligar", { ligado }),
  filtros: (filtros: { silenciarGrupos?: boolean; lerAoAbrir?: boolean; esconderArquivadas?: boolean; esconderGrupos?: boolean; mostrarFotos?: boolean }) => pedir<EstadoWhatsapp>("filtros", filtros),
  ignorar: (jid: string, ignorar: boolean) => pedir<EstadoWhatsapp>("ignorar", { jid, ignorar }),
  abrir: (jid: string) => pedir<ConversaWhatsapp | null>("abrir", { jid }),
  fechar: (jid: string) => pedir<{ ok: boolean }>("fechar", { jid }),
  enviar: (jid: string, texto: string) => pedir<ConversaWhatsapp | null>("enviar", { jid, texto }),
  desconectar: () => pedir<EstadoWhatsapp>("desconectar", {}),
  esquecer: () => pedir<EstadoWhatsapp>("esquecer", {}),
  historico: (jid: string, deslocamento: number, busca = "") =>
    pedir<{ mensagens: MensagemWhatsapp[]; total: number | null; fim: boolean }>(`historico?${new URLSearchParams({ jid, deslocamento: String(deslocamento), busca })}`),
  editar: (jid: string, id: string, texto: string) => pedir<MensagemWhatsapp | null>("editar", { jid, id, texto }),
  apagar: (jid: string, id: string) => pedir<MensagemWhatsapp | null>("apagar", { jid, id }),
  rastros: () => pedir<{ rastros: RastroWhatsapp[] }>("rastros"),
  limparRastros: () => pedir<{ rastros: RastroWhatsapp[] }>("limpar-rastros", {}),
  agendadas: () => pedir<{ agendadas: AgendadaWhatsapp[] }>("agendadas"),
  agendar: (jid: string, texto: string, quando: string) => pedir<{ agendadas: AgendadaWhatsapp[] }>("agendar", { jid, texto, quando }),
  cancelarAgendada: (id: string) => pedir<{ agendadas: AgendadaWhatsapp[] }>("cancelar-agendada", { id }),
};

export function numeroDoJid(jid: string | null): string {
  if (!jid) return "";
  const digitos = jid.split("@")[0].split(":")[0];
  return /^\d+$/.test(digitos) ? `+${digitos}` : digitos;
}

export function iniciaisDoNome(nome: string): string {
  const letras = nome.split(/[\s-]+/).filter((p) => /^\p{L}/u.test(p)).slice(0, 2).map((p) => p[0].toUpperCase());
  return letras.length ? letras.join("") : "#";
}

export function corDoNome(nome: string): string {
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 45%)`;
}
