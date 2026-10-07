
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

export interface EstadoPonte {
  disponivel: boolean;
  plataforma?: string;
  provedores: Provedor[];
}

export interface JanelaUso {
  id: string;
  rotulo: string;
  usado: number;
  reiniciaEm?: string;
}

export interface UsoFerramenta {
  id: "claude" | "codex";
  nome: string;
  situacao: "ok" | "sem_login" | "erro" | "ausente";
  plano?: string;
  nota?: string;
  janelas: JanelaUso[];
}

export interface SessaoAtual {
  projeto: string;
  arquivo: string;
  modelo?: string;
  inicio?: string;
  ultimaAtividade: string;
  mensagens: number;
  entrada: number;
  saida: number;
  cacheCriado: number;
  cacheLido: number;
}

export interface Consumo {
  atualizadoEm: string;
  ferramentas: UsoFerramenta[];
  sessao: SessaoAtual | null;
}

export interface ChamadaFerramenta {
  id: string;
  nome: string;
  argumentos: Record<string, unknown>;
}

export interface MensagemPonteIa {
  papel: "usuario" | "assistente" | "ferramenta";
  texto: string;
  chamadas?: ChamadaFerramenta[];
  idChamada?: string;
  imagens?: { tipo: string; base64: string }[];
}

export interface FerramentaIa {
  nome: string;
  descricao: string;
  parametros: Record<string, unknown>;
}

export interface EventoIa {
  tipo: "texto" | "fim" | "erro" | "ferramenta" | "aviso";
  chamada?: ChamadaFerramenta;
  status?: number;
  texto?: string;
  entrada?: number;
  saida?: number;
  modelo?: string;
  provedor?: string;
}

const CABECALHOS = { "x-niko": "1", "content-type": "application/json" };

export function integracaoIlhaGnome(instalar = false) {
  return pedir<{ estado: import("../../servidor/gnomeIlhaLinux").EstadoIntegracaoIlha }>("/ilha/gnome", instalar
    ? { method: "POST", body: JSON.stringify({ confirmacao: "ATIVAR_ILHA" }) } : {});
}

async function pedir<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const r = await fetch(`/ponte${caminho}`, { ...opcoes, headers: { ...CABECALHOS, ...(opcoes.headers ?? {}) } });
  const json = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw new Error(json.erro ?? `http_${r.status}`);
  return json;
}

let estadoEmCache: Promise<EstadoPonte> | null = null;

export function estadoDaPonte(forcar = false): Promise<EstadoPonte> {
  if (!estadoEmCache || forcar) {
    estadoEmCache = pedir<EstadoPonte>("/estado").catch(() => ({ disponivel: false, provedores: [] }));
  }
  return estadoEmCache;
}

export async function salvarProvedor(dados: { id?: string; tipo: TipoProvedor; nome: string; urlBase?: string; modelo?: string; chave?: string; catalogo?: string }) {
  const p = await pedir<Provedor>("/provedores", { method: "POST", body: JSON.stringify(dados) });
  estadoEmCache = null;
  return p;
}

export async function removerProvedor(id: string) {
  await pedir(`/provedores/${encodeURIComponent(id)}`, { method: "DELETE" });
  estadoEmCache = null;
}

export function testarProvedor(id: string) {
  return pedir<{ ok: boolean; modelos: string[]; erro?: string }>(`/provedores/${encodeURIComponent(id)}/testar`, { method: "POST" });
}

export interface EstadoSistema {
  bateria: { nivel: number; carregando: boolean; minutos: number | null } | null;
  brilho: number | null;
  wifi: { ssid: string | null; sinal: number | null; conectado: boolean; existe: boolean };
  radios: Partial<Record<"WiFi" | "Bluetooth", boolean>>;
}

export interface RedeWifi {
  ssid: string;
  sinal: number;
  segura: boolean;
  salva: boolean;
}

export interface AparelhoBluetooth {
  id: string;
  nome: string;
  ativo: boolean;
  conectado: boolean | null;
}

let tipoEmCache: Promise<{ notebook: boolean; bateria: boolean }> | null = null;

export const sistema = {
  tipo: () => (tipoEmCache ??= pedir<{ notebook: boolean; bateria: boolean }>("/sistema/tipo").catch(() => ({ notebook: false, bateria: false }))),
  estado: () => pedir<EstadoSistema>("/sistema/estado"),
  computador: () => pedir<Record<string, unknown>>("/sistema/computador"),
  redes: () => pedir<{ redes: RedeWifi[] | RedeWifi | null }>("/sistema/redes").then((r) => (Array.isArray(r.redes) ? r.redes : r.redes ? [r.redes] : [])),
  bluetooth: () => pedir<{ aparelhos: AparelhoBluetooth[] | AparelhoBluetooth | null }>("/sistema/bluetooth").then((r) => (Array.isArray(r.aparelhos) ? r.aparelhos : r.aparelhos ? [r.aparelhos] : [])),
  conectar: (ssid: string, senha?: string) => pedir<{ ok: boolean; wifi: EstadoSistema["wifi"] }>("/sistema/conectar", { method: "POST", body: JSON.stringify({ ssid, senha }) }),
  esquecer: (ssid: string) => pedir("/sistema/esquecer", { method: "POST", body: JSON.stringify({ ssid }) }),
  desconectar: () => pedir("/sistema/desconectar", { method: "POST", body: "{}" }),
  brilho: (nivel: number) => pedir("/sistema/brilho", { method: "POST", body: JSON.stringify({ nivel }) }),
  radio: (tipo: "WiFi" | "Bluetooth", ligado: boolean) => pedir("/sistema/radio", { method: "POST", body: JSON.stringify({ tipo, ligado }) }),
  configuracoes: (pagina: "bluetooth" | "wifi" | "bateria") => pedir("/sistema/configuracoes", { method: "POST", body: JSON.stringify({ pagina }) }),
};

export interface NivelDeAudio {
  volume: number;
  mudo: boolean;
}

export interface SessaoDeAudio {
  pid: number;
  sistema: boolean;
  ativa: boolean;
  volume: number;
  mudo: boolean;
  nome: string;
  caminho: string | null;
  icone: string | null;
}

export interface EstadoAudio {
  saida: NivelDeAudio | null;
  entrada: NivelDeAudio | null;
  sessoes: SessaoDeAudio[];
}

export interface ItemDaBandeja {
  caminho: string;
  nome: string;
  dica: string | null;
  icone: string | null;
}

export type AlvoDeAudio = "saida" | "entrada";
export type FerramentaWindows = "captura" | "teclado" | "iniciar" | "papelDeParede";
export type AcaoDeEnergia = "bloquear" | "suspender" | "reiniciar" | "desligar";

function comoLista<T>(valor: T[] | T | null | undefined): T[] {
  return Array.isArray(valor) ? valor : valor ? [valor] : [];
}

function enviar<T>(caminho: string, corpo: unknown) {
  return pedir<T>(caminho, { method: "POST", body: JSON.stringify(corpo) });
}

export const controle = {
  iniciar: () => pedir<{ aberto: boolean }>("/controle/iniciar"),
  alternarIniciar: (abertoAntes?: boolean) => enviar("/controle/ferramenta", { nome: "iniciar", abertoAntes }),
  audio: () => pedir<EstadoAudio>("/controle/audio").then((r) => ({ ...r, sessoes: comoLista(r.sessoes) })),
  volume: (alvo: AlvoDeAudio, volume: number) => enviar("/controle/volume", { alvo, volume }),
  mudo: (alvo: AlvoDeAudio, mudo: boolean) => enviar("/controle/mudo", { alvo, mudo }),
  sessao: (pids: number[], ajuste: { volume?: number; mudo?: boolean }) => enviar("/controle/sessao", { pids, ...ajuste }),
  tema: () => pedir<{ escuro: boolean }>("/controle/tema"),
  definirTema: (escuro: boolean) => enviar<{ escuro: boolean }>("/controle/tema", { escuro }),
  ferramenta: (nome: FerramentaWindows) => enviar("/controle/ferramenta", { nome }),
  energia: (tipo: AcaoDeEnergia) => enviar("/controle/energia", { tipo, confirmacao: "CONFIRMADO" }),
  bandeja: () => pedir<{ itens: ItemDaBandeja[] | ItemDaBandeja | null }>("/controle/bandeja").then((r) => comoLista(r.itens)),
  abrirDaBandeja: (caminho: string) => enviar("/controle/bandeja", { caminho }),
};

export function lerConsumo(forcar = false) {
  return pedir<Consumo>(`/consumo${forcar ? "?forcar=1" : ""}`);
}

export async function* conversarIa(
  dados: { provedorId: string; sistema: string; mensagens: MensagemPonteIa[]; modelo?: string; ferramentas?: FerramentaIa[] },
  sinal?: AbortSignal,
): AsyncGenerator<EventoIa> {
  const r = await fetch("/ponte/ia", { method: "POST", headers: CABECALHOS, body: JSON.stringify(dados), signal: sinal });
  if (!r.ok || !r.body) {
    yield { tipo: "erro", texto: `http_${r.status}` };
    return;
  }
  const leitor = r.body.getReader();
  const decodificador = new TextDecoder();
  let resto = "";
  while (true) {
    const { done, value } = await leitor.read();
    if (done) break;
    resto += decodificador.decode(value, { stream: true });
    const linhas = resto.split("\n");
    resto = linhas.pop() ?? "";
    for (const linha of linhas) {
      if (!linha.trim()) continue;
      try {
        yield JSON.parse(linha) as EventoIa;
      } catch {
        continue;
      }
    }
  }
}
