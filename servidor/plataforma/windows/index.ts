import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Plataforma } from "../tipos.ts";
import { controle } from "./controle.ts";
import { janelas } from "./janelas.ts";
import { midia } from "./midia.ts";
import { ocr } from "./ocr.ts";
import { segredos } from "./segredos.ts";
import { sistema } from "./sistema.ts";

function abrirComExplorer(argumentos: string[]) {
  if (process.platform !== "win32") return;
  const filho = spawn("explorer.exe", argumentos, { detached: true, stdio: "ignore", windowsHide: false });
  filho.on("error", () => undefined);
  filho.unref();
}

function pastaDeDownloads(): Promise<string> {
  const reserva = join(homedir(), "Downloads");
  if (process.platform !== "win32") return Promise.resolve(reserva);
  return new Promise((resolver) => {
    execFile("reg", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders", "/v", "{374DE290-123F-4565-9164-39C4925E467B}"], { windowsHide: true }, (erro, saida) => {
      const valor = erro ? null : /REG_(?:EXPAND_)?SZ\s+(.+)$/m.exec(saida)?.[1]?.trim();
      const expandido = valor?.replace(/%([^%]+)%/g, (_, v: string) => process.env[v] ?? `%${v}%`);
      resolver(expandido && existsSync(expandido) ? expandido : reserva);
    });
  });
}

function caminhoDoVsCode(): string | null {
  const candidatos = [
    join(process.env.LOCALAPPDATA ?? "", "Programs", "Microsoft VS Code", "Code.exe"),
    join(process.env.ProgramFiles ?? "C:\\Program Files", "Microsoft VS Code", "Code.exe"),
    join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft VS Code", "Code.exe"),
  ];
  for (const pasta of (process.env.PATH ?? "").split(";")) {
    if (/microsoft vs code[\\/]bin$/i.test(pasta.trim())) candidatos.push(join(pasta.trim(), "..", "Code.exe"));
  }
  return candidatos.find((c) => c && existsSync(c)) ?? null;
}

function abrirNoNavegador(url: string) {
  if (process.platform !== "win32") throw new Error("somente_windows");
  const filho = spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], { detached: true, stdio: "ignore", windowsHide: true });
  filho.on("error", () => undefined);
  filho.unref();
}

export const windows: Plataforma = {
  nome: "windows",
  pastaBaseDeDados: () => process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
  pastaDeDownloads,
  abrirNoNavegador,
  abrirArquivo: (caminho) => abrirComExplorer([caminho]),
  mostrarArquivoNaPasta: (caminho) => abrirComExplorer(["/select,", caminho]),
  abrirPasta: (caminho) => abrirComExplorer([caminho]),
  caminhoDoVsCode,
  programaCurl: "curl.exe",
  segredos,
  sistema,
  controle,
  janelas,
  midia,
  ocr,
};
