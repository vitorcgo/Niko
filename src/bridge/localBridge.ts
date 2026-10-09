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

export interface StateBridge {
  disponivel: boolean;
  plataforma?: string;
  provedores: Provider[];
}

export interface WindowUsage {
  id: string;
  rotulo: string;
  usado: number;
  reiniciaEm?: string;
}

export interface UsageTool {
  id: "claude" | "codex";
  nome: string;
  situacao: "ok" | "sem_login" | "erro" | "ausente";
  plano?: string;
  nota?: string;
  janelas: WindowUsage[];
}

export interface SessionCurrent {
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

export interface Usage {
  atualizadoEm: string;
  ferramentas: UsageTool[];
  sessao: SessionCurrent | null;
}

export interface CallTool {
  id: string;
  nome: string;
  argumentos: Record<string, unknown>;
}

export interface MessageBridgeAi {
  papel: "usuario" | "assistente" | "ferramenta";
  texto: string;
  chamadas?: CallTool[];
  idChamada?: string;
  imagens?: { tipo: string; base64: string }[];
}

export interface ToolAi {
  nome: string;
  descricao: string;
  parametros: Record<string, unknown>;
}

export interface EventAi {
  tipo: "texto" | "fim" | "erro" | "ferramenta" | "aviso";
  chamada?: CallTool;
  status?: number;
  texto?: string;
  entrada?: number;
  saida?: number;
  modelo?: string;
  provedor?: string;
}

const HEADERS = { "x-niko": "1", "content-type": "application/json" };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const r = await fetch(`/ponte${path}`, { ...options, headers: { ...HEADERS, ...(options.headers ?? {}) } });
  const json = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw new Error(json.erro ?? `http_${r.status}`);
  return json;
}

let stateAtCache: Promise<StateBridge> | null = null;

export function stateBridge(force = false): Promise<StateBridge> {
  if (!stateAtCache || force) {
    stateAtCache = request<StateBridge>("/estado").catch(() => ({ disponivel: false, provedores: [] }));
  }
  return stateAtCache;
}

export async function saveProvider(payload: { id?: string; tipo: TypeProvider; nome: string; urlBase?: string; modelo?: string; chave?: string; catalogo?: string }) {
  const p = await request<Provider>("/provedores", { method: "POST", body: JSON.stringify(payload) });
  stateAtCache = null;
  return p;
}

export async function removeProvider(id: string) {
  await request(`/provedores/${encodeURIComponent(id)}`, { method: "DELETE" });
  stateAtCache = null;
}

export function testProvider(id: string) {
  return request<{ ok: boolean; modelos: string[]; erro?: string }>(`/provedores/${encodeURIComponent(id)}/testar`, { method: "POST" });
}

export interface StateSystem {
  bateria: { nivel: number; carregando: boolean; minutos: number | null } | null;
  brilho: number | null;
  wifi: { ssid: string | null; sinal: number | null; conectado: boolean; existe: boolean };
  radios: Partial<Record<"WiFi" | "Bluetooth", boolean>>;
  conexao?: { cabo: boolean; internet: boolean | null };
}

export interface NetworkWifi {
  ssid: string;
  sinal: number;
  segura: boolean;
  salva: boolean;
}

export interface DeviceBluetooth {
  id: string;
  nome: string;
  ativo: boolean;
  conectado: boolean | null;
}

let cachedType: Promise<{ notebook: boolean; bateria: boolean }> | null = null;

export const system = {
  tipo: () => (cachedType ??= request<{ notebook: boolean; bateria: boolean }>("/sistema/tipo").catch(() => ({ notebook: false, bateria: false }))),
  estado: () => request<StateSystem>("/sistema/estado"),
  computador: () => request<Record<string, unknown>>("/sistema/computador"),
  redes: () => request<{ redes: NetworkWifi[] | NetworkWifi | null }>("/sistema/redes").then((r) => (Array.isArray(r.redes) ? r.redes : r.redes ? [r.redes] : [])),
  bluetooth: () => request<{ aparelhos: DeviceBluetooth[] | DeviceBluetooth | null }>("/sistema/bluetooth").then((r) => (Array.isArray(r.aparelhos) ? r.aparelhos : r.aparelhos ? [r.aparelhos] : [])),
  conectar: (ssid: string, password?: string) => request<{ ok: boolean; wifi: StateSystem["wifi"] }>("/sistema/conectar", { method: "POST", body: JSON.stringify({ ssid, senha: password }) }),
  esquecer: (ssid: string) => request("/sistema/esquecer", { method: "POST", body: JSON.stringify({ ssid }) }),
  desconectar: () => request("/sistema/desconectar", { method: "POST", body: "{}" }),
  brilho: (level: number) => request("/sistema/brilho", { method: "POST", body: JSON.stringify({ nivel: level }) }),
  radio: (type: "WiFi" | "Bluetooth", enabled: boolean) => request("/sistema/radio", { method: "POST", body: JSON.stringify({ tipo: type, ligado: enabled }) }),
  configuracoes: (page: "bluetooth" | "wifi" | "rede" | "bateria") => request("/sistema/configuracoes", { method: "POST", body: JSON.stringify({ pagina: page }) }),
};

export interface LevelAudio {
  volume: number;
  mudo: boolean;
}

export interface SessionAudio {
  pid: number;
  sistema: boolean;
  ativa: boolean;
  volume: number;
  mudo: boolean;
  nome: string;
  caminho: string | null;
  icone: string | null;
}

export interface StateAudio {
  saida: LevelAudio | null;
  entrada: LevelAudio | null;
  sessoes: SessionAudio[];
}

export interface ItemTray {
  caminho: string;
  nome: string;
  dica: string | null;
  icone: string | null;
}

export interface AppInstalled {
  id: string;
  nome: string;
  admin: boolean;
}

export interface IconApp {
  id: string;
  icone: string | null;
}

export type CommandSystem = "rede" | "wifi" | "bluetooth" | "som" | "tela" | "configuracoes" | "atualizacoes" | "tarefas" | "adaptadores" | "terminal" | "arquivos" | "painel";

export type TargetAudio = "saida" | "entrada";
export type ToolWindows = "captura" | "teclado" | "iniciar" | "papelDeParede";
export type ActionPower = "bloquear" | "suspender" | "reiniciar" | "desligar";

function asList<T>(value: T[] | T | null | undefined): T[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function send<T>(path: string, body: unknown) {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export const control = {
  iniciar: () => request<{ aberto: boolean }>("/controle/iniciar"),
  alternarIniciar: (openBefore?: boolean) => send("/controle/ferramenta", { nome: "iniciar", abertoAntes: openBefore }),
  audio: () => request<StateAudio>("/controle/audio").then((r) => ({ ...r, sessoes: asList(r.sessoes) })),
  volume: (target: TargetAudio, volume: number) => send("/controle/volume", { alvo: target, volume }),
  mudo: (target: TargetAudio, mute: boolean) => send("/controle/mudo", { alvo: target, mudo: mute }),
  sessao: (pids: number[], adjustment: { volume?: number; mudo?: boolean }) => send("/controle/sessao", { pids, ...adjustment }),
  tema: () => request<{ escuro: boolean }>("/controle/tema"),
  definirTema: (dark: boolean) => send<{ escuro: boolean }>("/controle/tema", { escuro: dark }),
  ferramenta: (nameValue: ToolWindows) => send("/controle/ferramenta", { nome: nameValue }),
  energia: (type: ActionPower) => send("/controle/energia", { tipo: type, confirmacao: "CONFIRMADO" }),
  bandeja: () => request<{ itens: ItemTray[] | ItemTray | null }>("/controle/bandeja").then((r) => asList(r.itens)),
  abrirDaBandeja: (path: string) => send("/controle/bandeja", { caminho: path }),
  pastaDaBandeja: (path: string) => send("/controle/bandejaPasta", { caminho: path }),
  encerrarDaBandeja: (path: string) => send("/controle/bandejaEncerrar", { caminho: path, confirmacao: "CONFIRMADO" }),
  apps: (force = false) => send<{ apps: AppInstalled[] | AppInstalled | null }>("/controle/apps", { forcar: force }).then((r) => asList(r.apps)),
  iconesDeApps: (ids: string[]) => send<{ icones: IconApp[] | IconApp | null }>("/controle/iconesApps", { ids }).then((r) => asList(r.icones)),
  abrirApp: (id: string, admin = false) => send("/controle/abrirApp", { id, admin }),
  comandoDoSistema: (command: CommandSystem) => send("/controle/comandoDoSistema", { comando: command }),
};

export function readUsage(force = false) {
  return request<Usage>(`/consumo${force ? "?forcar=1" : ""}`);
}

export function readUsageOfficial() {
  return request<Usage>("/consumo?oficial=1");
}

export async function* chatAi(
  payload: { provedorId: string; sistema: string; mensagens: MessageBridgeAi[]; modelo?: string; ferramentas?: ToolAi[] },
  signal?: AbortSignal,
): AsyncGenerator<EventAi> {
  const r = await fetch("/ponte/ia", { method: "POST", headers: HEADERS, body: JSON.stringify(payload), signal: signal });
  if (!r.ok || !r.body) {
    yield { tipo: "erro", texto: `http_${r.status}` };
    return;
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let rest = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    rest += decoder.decode(value, { stream: true });
    const lines = rest.split("\n");
    rest = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        yield JSON.parse(line) as EventAi;
      } catch {
        continue;
      }
    }
  }
}
