import { plataforma } from "./plataforma/index.ts";
import type { Computador } from "./plataforma/tipos.ts";

const { sistema } = plataforma;

function texto(v: unknown, max: number) {
  const s = typeof v === "string" ? v : "";
  if (!s || s.length > max || /[\u0000-\u001f]/.test(s)) throw new Error("valor_invalido");
  return s;
}

function nomeDeRede(v: unknown) {
  const ssid = texto(v, 64);
  if (ssid.includes('"')) throw new Error("valor_invalido");
  return ssid;
}

export const tipoDoComputador = () => sistema.tipo();
export const estadoDoSistema = () => sistema.estado();
export const encerrarSistema = () => sistema.encerrar();
export const listarRedes = () => sistema.redes();

export const conectarRede = (dados: Record<string, unknown>) => {
  const ssid = nomeDeRede(dados.ssid);
  const senha = typeof dados.senha === "string" && dados.senha ? texto(dados.senha, 63) : "";
  if (senha && senha.length < 8) throw new Error("senha_curta");
  return sistema.conectar(ssid, senha);
};

export const esquecerRede = (dados: Record<string, unknown>) => sistema.esquecer(nomeDeRede(dados.ssid));
export const desconectarRede = () => sistema.desconectar();

export const definirBrilho = (dados: Record<string, unknown>) => {
  const nivel = Number(dados.nivel);
  if (!Number.isFinite(nivel)) throw new Error("valor_invalido");
  return sistema.brilho(Math.max(0, Math.min(100, Math.round(nivel))));
};

export const definirRadio = (dados: Record<string, unknown>) => {
  const tipo = dados.tipo === "Bluetooth" ? "Bluetooth" : dados.tipo === "WiFi" ? "WiFi" : null;
  if (!tipo) throw new Error("valor_invalido");
  return sistema.radio(tipo, Boolean(dados.ligado));
};

export const listarBluetooth = () => sistema.bluetooth();

let computadorEmCache: { quando: number; dados: Promise<Computador> } | null = null;
export const lerComputador = () => {
  if (!computadorEmCache || Date.now() - computadorEmCache.quando > 15000) {
    const dados = sistema.computador();
    computadorEmCache = { quando: Date.now(), dados };
    dados.catch(() => (computadorEmCache = null));
  }
  return computadorEmCache.dados;
};

export const abrirConfiguracoesDoSistema = (dados: Record<string, unknown>) => {
  const pagina = dados.pagina === "bluetooth" || dados.pagina === "wifi" || dados.pagina === "rede" ? dados.pagina : "bateria";
  return sistema.configuracoes(pagina);
};
