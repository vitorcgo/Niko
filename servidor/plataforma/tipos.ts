export type Fluxo = 0 | 1;
export type Ferramenta = "captura" | "teclado" | "iniciar" | "papelDeParede";
export type AcaoDeEnergia = "bloquear" | "suspender" | "reiniciar" | "desligar";
export type ComandoDoSistema = "rede" | "wifi" | "bluetooth" | "som" | "tela" | "configuracoes" | "atualizacoes" | "tarefas" | "adaptadores" | "terminal" | "arquivos" | "painel";
export type PaginaDeConfiguracao = "bluetooth" | "wifi" | "rede" | "bateria";
export type Radio = "WiFi" | "Bluetooth";
export type AcaoDeJanela = "listar" | "focar" | "minimizar" | "fechar";
export type AcaoDeMidia = "estado" | "alternar" | "proxima" | "anterior" | "posicao";

export interface PontaDeAudio {
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

export interface EstadoDoAudio {
  saida: PontaDeAudio | null;
  entrada: PontaDeAudio | null;
  sessoes: SessaoDeAudio[];
}

export interface ItemDaBandeja {
  caminho: string;
  nome: string;
  dica: string | null;
  icone: string | null;
}

export interface AppInstalado {
  id: string;
  nome: string;
  admin: boolean;
}

export interface Bateria {
  nivel: number;
  carregando: boolean;
  minutos: number | null;
}

export interface WifiAtual {
  ssid: string | null;
  sinal: number | null;
  conectado: boolean;
  existe: boolean;
}

export interface EstadoDoSistema {
  bateria: Bateria | null;
  brilho: number | null;
  wifi: WifiAtual;
  radios: Partial<Record<Radio, boolean>>;
  conexao: { cabo: boolean; internet: boolean | null };
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

export interface GrupoDeProcessos {
  nome: string;
  processos: number;
  memoria_mb: number;
  cpu_segundos: number;
}

export interface Computador {
  nome: string;
  sistema: string;
  fabricante: string;
  modelo: string;
  processador: string;
  nucleos: number;
  uso_cpu_pct: number;
  memoria_total_gb: number;
  memoria_livre_gb: number;
  placa_de_video: string[];
  ligado_ha_horas: number;
  discos: { unidade: string; nome: string; total_gb: number; livre_gb: number }[];
  bateria: Bateria | null;
  wifi: WifiAtual;
  ips: { interface: string; ip: string }[];
  bluetooth: { nome: string; conectado: boolean | null }[];
  programas_mais_memoria: GrupoDeProcessos[];
  programas_mais_cpu_acumulada: GrupoDeProcessos[];
  janelas_abertas: { programa: string; titulo: string }[];
  total_processos: number;
}

export interface JanelaAberta {
  id: string;
  pid: number;
  titulo: string;
  minimizada: boolean;
  ativa: boolean;
  app: string;
  nome: string;
  caminho: string | null;
  icone: string | null;
  monitor?: string;
  grupo?: string | null;
  nomeDoGrupo?: string | null;
}

export interface EstadoDaMidia {
  sessao: boolean;
  app?: string;
  titulo?: string;
  artista?: string;
  album?: string;
  tocando?: boolean;
  posicao?: number;
  duracao?: number;
  atualizadoEm?: number;
  podeAvancar?: boolean;
  podeVoltar?: boolean;
  podeBuscar?: boolean;
  capa?: string | null;
}

export interface ResultadoOcr {
  texto: string;
  idioma: string;
}

export interface Plataforma {
  nome: "windows" | "linux";
  pastaBaseDeDados(): string;
  pastaDeDownloads(): Promise<string>;
  abrirNoNavegador(url: string): void;
  abrirArquivo(caminho: string): void;
  mostrarArquivoNaPasta(caminho: string): void;
  abrirPasta(caminho: string): void;
  caminhoDoVsCode(): string | null;
  programaCurl: string;
  segredos: {
    gravar(id: string, segredo: string): Promise<void>;
    ler(id: string): Promise<string | null>;
    apagar(id: string): Promise<void>;
  };
  sistema: {
    tipo(): Promise<{ notebook: boolean; bateria: boolean }>;
    estado(): Promise<EstadoDoSistema>;
    redes(): Promise<{ redes: RedeWifi[] }>;
    conectar(ssid: string, senha: string): Promise<{ ok: boolean; wifi: WifiAtual }>;
    esquecer(ssid: string): Promise<{ ok: boolean }>;
    desconectar(): Promise<{ ok: boolean }>;
    brilho(nivel: number): Promise<{ ok: boolean; brilho: number }>;
    radio(tipo: Radio, ligado: boolean): Promise<{ ok: boolean; radios: Partial<Record<Radio, boolean>> }>;
    bluetooth(): Promise<{ aparelhos: AparelhoBluetooth[] }>;
    computador(): Promise<Computador>;
    configuracoes(pagina: PaginaDeConfiguracao): Promise<{ ok: boolean }>;
    encerrar(): void;
  };
  controle: {
    audio(): Promise<EstadoDoAudio>;
    volume(fluxo: Fluxo, valor: number): Promise<{ ok: boolean }>;
    mudo(fluxo: Fluxo, mudo: boolean): Promise<{ ok: boolean }>;
    sessao(pids: number[], volume: number, mudo: number): Promise<{ ajustadas: number }>;
    tema(): Promise<{ escuro: boolean }>;
    definirTema(escuro: boolean): Promise<{ escuro: boolean }>;
    iniciarAberto(): Promise<{ aberto: boolean }>;
    ferramenta(nome: Ferramenta, abertoAntes?: boolean): Promise<{ ok: boolean; aberto?: boolean }>;
    energia(tipo: AcaoDeEnergia): Promise<{ ok: boolean }>;
    bandeja(): Promise<{ itens: ItemDaBandeja[] }>;
    abrirDaBandeja(caminho: string): Promise<{ ok: boolean }>;
    pastaDaBandeja(caminho: string): Promise<{ ok: boolean }>;
    encerrarDaBandeja(caminho: string): Promise<{ ok: boolean; encerrados: number }>;
    apps(forcar: boolean): Promise<{ apps: AppInstalado[] }>;
    iconesDeApps(ids: string[]): Promise<{ icones: { id: string; icone: string | null }[] }>;
    abrirApp(id: string, admin: boolean): Promise<{ ok: boolean }>;
    appDaJanela(caminho: string | null, nome: string): Promise<{ id: string | null; nome: string | null }>;
    comandoDoSistema(comando: ComandoDoSistema): Promise<{ ok: boolean }>;
    donoDaConexao(portaLocal: number, portaRemota: number): Promise<number>;
    focarProcesso(pid: number): Promise<{ ok: boolean; janela: string }>;
    encerrar(): void;
  };
  janelas: {
    listar(): Promise<{ janelas: JanelaAberta[] }>;
    agir(acao: Exclude<AcaoDeJanela, "listar">, janela: string): Promise<{ ok: boolean }>;
    encerrar(): void;
  };
  midia: {
    pedir(acao: AcaoDeMidia, segundos: number): Promise<EstadoDaMidia>;
    encerrar(): void;
  };
  ocr(caminho: string): Promise<ResultadoOcr>;
}
