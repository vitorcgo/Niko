import { execFile, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AMBIENTE = { ...process.env, LC_ALL: "C.UTF-8", LANG: "C.UTF-8" };
const TAMANHO_MAXIMO_DO_ICONE = 300_000;

export function rodar(programa: string, argumentos: string[], limiteMs = 8000, entrada?: string): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    const filho = execFile(programa, argumentos, { timeout: limiteMs, encoding: "utf8", env: AMBIENTE, maxBuffer: 8 * 1024 * 1024 }, (erro, saida) => (erro ? rejeitar(erro) : resolver(saida)));
    if (entrada === undefined) return;
    filho.stdin?.on("error", () => undefined);
    filho.stdin?.end(entrada);
  });
}

export function tentar<T>(promessa: Promise<T>, padrao: T): Promise<T> {
  return promessa.catch(() => padrao);
}

export function funcionou(promessa: Promise<unknown>): Promise<boolean> {
  return promessa.then(
    () => true,
    () => false,
  );
}

export const esperar = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

export function lerArquivo(caminho: string): string | null {
  try {
    return readFileSync(caminho, "utf8").trim();
  } catch {
    return null;
  }
}

export function abrirDesacoplado(programa: string, argumentos: string[]): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    const filho = spawn(programa, argumentos, { detached: true, stdio: "ignore" });
    filho.on("error", rejeitar);
    filho.on("spawn", () => {
      filho.unref();
      resolver();
    });
  });
}

export function lancar(programa: string, argumentos: string[], limiteMs = 15000): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    const filho = spawn(programa, argumentos, { detached: true, stdio: "ignore" });
    const relogio = setTimeout(() => rejeitar(new Error("tempo_esgotado")), limiteMs);
    filho.on("error", (erro) => {
      clearTimeout(relogio);
      rejeitar(erro);
    });
    filho.on("exit", (codigo) => {
      clearTimeout(relogio);
      if (codigo === 0) resolver();
      else rejeitar(new Error("falha_ao_abrir"));
    });
    filho.unref();
  });
}

export async function primeiraQueAbre(alternativas: [string, string[]][]): Promise<boolean> {
  for (const [programa, argumentos] of alternativas) {
    if (await funcionou(abrirDesacoplado(programa, argumentos))) return true;
  }
  return false;
}

export function pastaDeDadosDoUsuario(): string {
  return process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
}

function imagemComoDado(caminho: string): string | null {
  try {
    const bytes = readFileSync(caminho);
    if (bytes.length === 0 || bytes.length > TAMANHO_MAXIMO_DO_ICONE) return null;
    const tipo = /\.svg$/i.test(caminho) ? "image/svg+xml" : "image/png";
    return `data:${tipo};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

const iconesEmCache = new Map<string, string | null>();
const LIMITE_DO_CACHE_DE_ICONES = 400;

function iconeDoTema(nome: string): string | null {
  const casa = homedir();
  const bases = [join(pastaDeDadosDoUsuario(), "icons"), join(casa, ".icons"), "/usr/share/icons", "/usr/local/share/icons", "/var/lib/flatpak/exports/share/icons", join(pastaDeDadosDoUsuario(), "flatpak/exports/share/icons")];
  for (const base of bases) {
    for (const lado of ["64x64", "48x48", "128x128", "256x256", "32x32"]) {
      const valor = imagemComoDado(join(base, "hicolor", lado, "apps", `${nome}.png`));
      if (valor) return valor;
    }
    const vetor = imagemComoDado(join(base, "hicolor", "scalable", "apps", `${nome}.svg`));
    if (vetor) return vetor;
  }
  return imagemComoDado(`/usr/share/pixmaps/${nome}.png`) ?? imagemComoDado(`/usr/share/pixmaps/${nome}.svg`);
}

export function iconeDoApp(icone: string | undefined): string | null {
  if (!icone) return null;
  if (iconesEmCache.has(icone)) return iconesEmCache.get(icone) ?? null;
  let valor: string | null = null;
  if (icone.startsWith("/")) valor = /\.(png|svg)$/i.test(icone) ? imagemComoDado(icone) : null;
  else if (/^[A-Za-z0-9._-]{1,100}$/.test(icone)) valor = iconeDoTema(icone);
  if (iconesEmCache.size >= LIMITE_DO_CACHE_DE_ICONES) iconesEmCache.clear();
  iconesEmCache.set(icone, valor);
  return valor;
}
