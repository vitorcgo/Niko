import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Plataforma } from "../tipos.ts";
import { abrirDesacoplado, funcionou, pastaDeDadosDoUsuario, rodar, tentar } from "./comum.ts";
import { controle } from "./controle.ts";
import { janelas } from "./janelas.ts";
import { midia } from "./midia.ts";
import { ocr } from "./ocr.ts";
import { segredos } from "./segredos.ts";
import { sistema } from "./sistema.ts";

function abrirComXdg(alvo: string) {
  abrirDesacoplado("xdg-open", [alvo]).catch(() => undefined);
}

async function pastaDeDownloads(): Promise<string> {
  const configurada = (await tentar(rodar("xdg-user-dir", ["DOWNLOAD"], 3000), "")).trim();
  return configurada && configurada !== homedir() && existsSync(configurada) ? configurada : join(homedir(), "Downloads");
}

async function mostrarArquivoNaPasta(caminho: string) {
  const endereco = pathToFileURL(caminho).href;
  const destacou = await funcionou(rodar("gdbus", ["call", "--session", "--dest", "org.freedesktop.FileManager1", "--object-path", "/org/freedesktop/FileManager1", "--method", "org.freedesktop.FileManager1.ShowItems", `["${endereco}"]`, ""], 5000));
  if (!destacou) abrirComXdg(dirname(caminho));
}

function caminhoDoVsCode(): string | null {
  const doPath = (process.env.PATH ?? "").split(delimiter).filter(Boolean).map((p) => join(p, "code"));
  const conhecidos = ["/usr/bin/code", "/usr/local/bin/code", "/snap/bin/code", "/var/lib/flatpak/exports/bin/com.visualstudio.code", join(pastaDeDadosDoUsuario(), "flatpak/exports/bin/com.visualstudio.code")];
  return [...doPath, ...conhecidos].find((c) => existsSync(c)) ?? null;
}

export const linux: Plataforma = {
  nome: "linux",
  pastaBaseDeDados: pastaDeDadosDoUsuario,
  pastaDeDownloads,
  abrirNoNavegador: abrirComXdg,
  abrirArquivo: abrirComXdg,
  mostrarArquivoNaPasta: (caminho) => void mostrarArquivoNaPasta(caminho),
  abrirPasta: abrirComXdg,
  caminhoDoVsCode,
  programaCurl: "curl",
  segredos,
  sistema,
  controle,
  janelas,
  midia,
  ocr,
};
