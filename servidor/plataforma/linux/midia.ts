import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { AcaoDeMidia, EstadoDaMidia, Plataforma } from "../tipos.ts";
import { esperar, rodar, tentar } from "./comum.ts";

const SEPARADOR = "\u001f";
const FORMATO = ["{{playerInstance}}", "{{playerName}}", "{{status}}", "{{title}}", "{{artist}}", "{{album}}", "{{position}}", "{{mpris:length}}", "{{mpris:artUrl}}"].join(SEPARADOR);
const TAMANHO_MAXIMO_DA_CAPA = 2_000_000;

let playerAtual = "";

function playerctl(argumentos: string[]): Promise<string> {
  return rodar("playerctl", playerAtual ? ["-p", playerAtual, ...argumentos] : argumentos, 5000);
}

async function capa(url: string): Promise<string | null> {
  if (url.startsWith("https://")) return url;
  if (!url.startsWith("file://")) return null;
  try {
    const bytes = await readFile(fileURLToPath(url));
    if (bytes.length === 0 || bytes.length > TAMANHO_MAXIMO_DA_CAPA) return null;
    const tipo = /\.png$/i.test(url) ? "image/png" : /\.webp$/i.test(url) ? "image/webp" : "image/jpeg";
    return `data:${tipo};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

function microParaSegundos(valor: string): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.round(n / 100000) / 10 : 0;
}

async function controlesDoPlayer(instancia: string): Promise<{ podeAvancar: boolean; podeVoltar: boolean; podeBuscar: boolean } | null> {
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(instancia)) return null;
  const saida = await tentar(rodar("busctl", ["--user", "get-property", `org.mpris.MediaPlayer2.${instancia}`, "/org/mpris/MediaPlayer2", "org.mpris.MediaPlayer2.Player", "CanGoNext", "CanGoPrevious", "CanSeek"], 3000), "");
  const valores = saida.split("\n").filter((l) => l.startsWith("b ")).map((l) => l.trim() === "b true");
  if (valores.length !== 3) return null;
  return { podeAvancar: valores[0] === true, podeVoltar: valores[1] === true, podeBuscar: valores[2] === true };
}

async function estado(): Promise<EstadoDaMidia> {
  let saida: string;
  try {
    saida = await rodar("playerctl", ["metadata", "--format", FORMATO], 5000);
  } catch {
    playerAtual = "";
    return { sessao: false };
  }
  const [instancia = "", app = "", status = "", titulo = "", artista = "", album = "", posicao = "", duracao = "", arte = ""] = saida.replace(/\n$/, "").split(SEPARADOR);
  playerAtual = instancia;
  const segundos = microParaSegundos(duracao);
  const [controles, imagem] = await Promise.all([controlesDoPlayer(instancia), capa(arte)]);
  return {
    sessao: true,
    app,
    titulo,
    artista,
    album,
    tocando: status === "Playing",
    posicao: microParaSegundos(posicao),
    duracao: segundos,
    atualizadoEm: Date.now(),
    podeAvancar: controles?.podeAvancar ?? true,
    podeVoltar: controles?.podeVoltar ?? true,
    podeBuscar: (controles?.podeBuscar ?? true) && segundos > 0,
    capa: imagem,
  };
}

const COMANDOS: Record<Exclude<AcaoDeMidia, "estado" | "posicao">, string> = { alternar: "play-pause", proxima: "next", anterior: "previous" };

export const midia: Plataforma["midia"] = {
  async pedir(acao, segundos) {
    if (acao !== "estado") {
      await playerctl(acao === "posicao" ? ["position", String(segundos)] : [COMANDOS[acao]]).catch(() => undefined);
      await esperar(250);
    }
    return estado();
  },
  encerrar: () => {
    playerAtual = "";
  },
};
