import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import type { AppInstalado, Plataforma } from "../tipos.ts";
import { iconeDoApp, lancar, pastaDeDadosDoUsuario } from "./comum.ts";

export interface AppDesktop {
  id: string;
  arquivo: string;
  nome: string;
  icone: string;
  visivel: boolean;
}

interface Catalogo {
  em: number;
  porId: Map<string, AppDesktop>;
  porChave: Map<string, AppDesktop>;
}

const VALIDADE_DO_CATALOGO_MS = 120_000;
const LANCADORES_GENERICOS = new Set(["env", "sh", "bash", "flatpak", "snap", "python", "python3", "java", "electron", "gio"]);
let catalogo: Catalogo | null = null;

function pastasDeApps(): string[] {
  const usuario = pastaDeDadosDoUsuario();
  const sistema = (process.env.XDG_DATA_DIRS || "/usr/local/share:/usr/share").split(":").filter(Boolean);
  return [join(usuario, "applications"), join(usuario, "flatpak/exports/share/applications"), ...sistema.map((d) => join(d, "applications")), "/var/lib/flatpak/exports/share/applications"];
}

function idiomasPreferidos(): string[] {
  const bruto = (process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || "").split(".")[0] ?? "";
  return bruto ? [bruto, bruto.split("_")[0] ?? ""].filter(Boolean) : [];
}

function lerEntrada(texto: string): Map<string, string> {
  const campos = new Map<string, string>();
  let dentro = false;
  for (const linha of texto.split(/\r?\n/)) {
    if (linha.startsWith("[")) {
      dentro = linha.trim() === "[Desktop Entry]";
      continue;
    }
    if (!dentro) continue;
    const igual = linha.indexOf("=");
    if (igual > 0) campos.set(linha.slice(0, igual).trim(), linha.slice(igual + 1).trim());
  }
  return campos;
}

function nomeTraduzido(campos: Map<string, string>): string {
  for (const idioma of idiomasPreferidos()) {
    const valor = campos.get(`Name[${idioma}]`);
    if (valor) return valor;
  }
  return campos.get("Name") ?? "";
}

function programaDoExec(exec: string): string {
  const primeiro = exec.replace(/^"([^"]*)".*$/, "$1").split(/\s+/)[0] ?? "";
  return basename(primeiro).toLowerCase();
}

function montarCatalogo(): Catalogo {
  const porId = new Map<string, AppDesktop>();
  const porChave = new Map<string, AppDesktop>();
  for (const pasta of pastasDeApps()) {
    let nomes: string[];
    try {
      nomes = readdirSync(pasta);
    } catch {
      continue;
    }
    for (const nomeDoArquivo of nomes) {
      if (!nomeDoArquivo.endsWith(".desktop") || porId.has(nomeDoArquivo)) continue;
      const arquivo = join(pasta, nomeDoArquivo);
      let campos: Map<string, string>;
      try {
        campos = lerEntrada(readFileSync(arquivo, "utf8"));
      } catch {
        continue;
      }
      const nome = nomeTraduzido(campos);
      const visivel = Boolean(nome) && campos.get("Type") === "Application" && campos.get("NoDisplay") !== "true" && campos.get("Hidden") !== "true";
      const app: AppDesktop = { id: nomeDoArquivo, arquivo, nome, icone: campos.get("Icon") ?? "", visivel };
      porId.set(nomeDoArquivo, app);
      if (!nome) continue;
      const programa = programaDoExec(campos.get("Exec") ?? "");
      const chaves = [campos.get("StartupWMClass") ?? "", nomeDoArquivo.replace(/\.desktop$/, ""), LANCADORES_GENERICOS.has(programa) ? "" : programa];
      for (const chave of chaves.map((c) => c.toLowerCase()).filter(Boolean)) if (!porChave.has(chave)) porChave.set(chave, app);
    }
  }
  return { em: Date.now(), porId, porChave };
}

export function catalogoDeApps(forcar = false): Catalogo {
  if (forcar || !catalogo || Date.now() - catalogo.em > VALIDADE_DO_CATALOGO_MS) catalogo = montarCatalogo();
  return catalogo;
}

export function acharAppDaJanela(classe: string, programa: string): AppDesktop | null {
  const partes = classe.toLowerCase().split(".");
  const candidatos = [classe.toLowerCase()];
  for (let i = 1; i < partes.length; i++) candidatos.push(partes.slice(i).join("."));
  for (let i = partes.length - 1; i > 0; i--) candidatos.push(partes.slice(0, i).join("."));
  candidatos.push(programa.toLowerCase());
  const { porChave } = catalogoDeApps();
  for (const candidato of candidatos) {
    const achado = candidato ? porChave.get(candidato) : undefined;
    if (achado) return achado;
  }
  return null;
}

function appConhecido(id: string): AppDesktop {
  const app = catalogoDeApps().porId.get(id) ?? catalogoDeApps(true).porId.get(id);
  if (!app || !app.visivel) throw new Error("app_desconhecido");
  return app;
}

export const listarApps: Plataforma["controle"]["apps"] = async (forcar) => {
  const apps: AppInstalado[] = [...catalogoDeApps(forcar).porId.values()]
    .filter((a) => a.visivel && !/^(uninstall|desinstalar)\b/i.test(a.nome))
    .map((a) => ({ id: a.id, nome: a.nome, admin: false }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  return { apps };
};

export const iconesDeApps: Plataforma["controle"]["iconesDeApps"] = async (ids) => {
  const { porId } = catalogoDeApps();
  return { icones: ids.map((id) => ({ id, icone: iconeDoApp(porId.get(id)?.icone) })) };
};

export const appDaJanela: Plataforma["controle"]["appDaJanela"] = async (caminho, nome) => {
  const { porChave, porId } = catalogoDeApps();
  const candidatos = [caminho ? basename(caminho).toLowerCase() : "", nome.toLowerCase()].filter(Boolean);
  for (const chave of candidatos) {
    const app = porChave.get(chave);
    if (app?.visivel) return { id: app.id, nome: app.nome };
  }
  const porNome = [...porId.values()].find((a) => a.visivel && a.nome.toLowerCase() === nome.toLowerCase());
  return { id: porNome?.id ?? null, nome: porNome?.nome ?? null };
};

export const abrirApp: Plataforma["controle"]["abrirApp"] = async (id, admin) => {
  if (admin) throw new Error("sem_admin");
  const app = appConhecido(id);
  try {
    await lancar("gio", ["launch", app.arquivo]);
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("falha_ao_abrir");
    await lancar("gtk-launch", [app.id]).catch(() => {
      throw new Error("falha_ao_abrir");
    });
  }
  return { ok: true };
};
