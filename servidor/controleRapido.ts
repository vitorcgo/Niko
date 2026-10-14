import { plataforma } from "./plataforma/index.ts";
import type { AcaoDeEnergia, ComandoDoSistema, Ferramenta, Fluxo } from "./plataforma/tipos.ts";

const { controle } = plataforma;

const FLUXOS = { saida: 0, entrada: 1 } as const;
const FERRAMENTAS: readonly Ferramenta[] = ["captura", "teclado", "iniciar", "papelDeParede"];
const ENERGIA: readonly AcaoDeEnergia[] = ["bloquear", "suspender", "reiniciar", "desligar"];
export const COMANDOS_DO_SISTEMA: readonly ComandoDoSistema[] = ["rede", "wifi", "bluetooth", "som", "tela", "configuracoes", "atualizacoes", "tarefas", "adaptadores", "terminal", "arquivos", "painel"];
const LIMITE_DE_ICONES = 12;

function fluxoDe(valor: unknown): Fluxo {
  if (valor !== "saida" && valor !== "entrada") throw new Error("valor_invalido");
  return FLUXOS[valor];
}

function percentual(valor: unknown): number {
  const n = Number(valor);
  if (!Number.isFinite(n)) throw new Error("valor_invalido");
  return Math.max(0, Math.min(100, Math.round(n)));
}

function caminhoDeApp(valor: unknown): string {
  if (typeof valor !== "string" || !valor || valor.length > 400 || /[\u0000-\u001f"]/.test(valor)) throw new Error("valor_invalido");
  return valor;
}

export function idDeApp(valor: unknown): string {
  if (typeof valor !== "string" || !valor || valor.length > 500 || /[\u0000-\u001f]/.test(valor)) throw new Error("valor_invalido");
  return valor;
}

function porta(valor: unknown): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error("valor_invalido");
  return n;
}

export const lerAudio = () => controle.audio();
export const definirVolume = (d: Record<string, unknown>) => controle.volume(fluxoDe(d.alvo), percentual(d.volume));
export const definirMudo = (d: Record<string, unknown>) => controle.mudo(fluxoDe(d.alvo), d.mudo === true);

export const ajustarSessao = (d: Record<string, unknown>) => {
  const pids = Array.isArray(d.pids) ? d.pids.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff).slice(0, 64) : [];
  if (pids.length === 0) throw new Error("valor_invalido");
  const volume = d.volume === undefined ? -1 : percentual(d.volume);
  const mudo = d.mudo === undefined ? -1 : d.mudo === true ? 1 : 0;
  return controle.sessao(pids, volume, mudo);
};

export const lerTema = () => controle.tema();
export const lerIniciar = () => controle.iniciarAberto();
export const definirTema = (d: Record<string, unknown>) => controle.definirTema(d.escuro === true);

export const abrirFerramenta = (d: Record<string, unknown>) => {
  if (!FERRAMENTAS.includes(d.nome as Ferramenta)) throw new Error("valor_invalido");
  if (d.abertoAntes !== undefined && typeof d.abertoAntes !== "boolean") throw new Error("valor_invalido");
  return controle.ferramenta(d.nome as Ferramenta, d.abertoAntes as boolean | undefined);
};

export const agirNaEnergia = (d: Record<string, unknown>) => {
  if (!ENERGIA.includes(d.tipo as AcaoDeEnergia)) throw new Error("valor_invalido");
  if (d.confirmacao !== "CONFIRMADO") throw new Error("confirmacao_invalida");
  return controle.energia(d.tipo as AcaoDeEnergia);
};

export const lerBandeja = () => controle.bandeja();
export const abrirDaBandeja = (d: Record<string, unknown>) => controle.abrirDaBandeja(caminhoDeApp(d.caminho));
export const pastaDaBandeja = (d: Record<string, unknown>) => controle.pastaDaBandeja(caminhoDeApp(d.caminho));
export const encerrarDaBandeja = (d: Record<string, unknown>) => {
  if (d.confirmacao !== "CONFIRMADO") throw new Error("confirmacao_invalida");
  return controle.encerrarDaBandeja(caminhoDeApp(d.caminho));
};

export const listarApps = (d: Record<string, unknown>) => controle.apps(d.forcar === true);
export const iconesDeApps = (d: Record<string, unknown>) => {
  const ids = Array.isArray(d.ids) ? d.ids.slice(0, LIMITE_DE_ICONES).map(idDeApp) : [];
  if (ids.length === 0) throw new Error("valor_invalido");
  return controle.iconesDeApps(ids);
};
export const abrirApp = (d: Record<string, unknown>) => controle.abrirApp(idDeApp(d.id), d.admin === true);
export const appDaJanela = (d: Record<string, unknown>) => {
  const caminho = d.caminho === null || d.caminho === undefined ? null : idDeApp(d.caminho);
  const nome = typeof d.nome === "string" && d.nome.length <= 200 && !/[\u0000-\u001f]/.test(d.nome) ? d.nome : "";
  return controle.appDaJanela(caminho, nome);
};
export const abrirComandoDoSistema =(d: Record<string, unknown>) => {
  if (!COMANDOS_DO_SISTEMA.includes(d.comando as ComandoDoSistema)) throw new Error("valor_invalido");
  return controle.comandoDoSistema(d.comando as ComandoDoSistema);
};

export const donoDaConexao = async (portaLocal: number, portaRemota: number) => controle.donoDaConexao(porta(portaLocal), porta(portaRemota));

export function focarJanelaDoProcesso(processoId: number) {
  if (!Number.isInteger(processoId) || processoId <= 4) throw new Error("valor_invalido");
  return controle.focarProcesso(processoId);
}

export const encerrarControle = () => controle.encerrar();
