import { execFile } from "node:child_process";
import type { ResultadoOcr } from "../tipos.ts";

const TEMPO_LIMITE = 60_000;

const PREFERIDOS: Record<string, string> = { pt: "por", en: "eng", es: "spa", fr: "fra", de: "deu", it: "ita" };
const ETIQUETAS: Record<string, string> = { por: "pt-BR", eng: "en-US", spa: "es", fra: "fr", deu: "de", ita: "it" };

interface Resultado {
  saida: string;
  erros: string;
}

function rodar(argumentos: string[], limiteMs: number): Promise<Resultado> {
  return new Promise((resolver, rejeitar) => {
    execFile("tesseract", argumentos, { timeout: limiteMs, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }, (erro, saida, erros) => {
      if (!erro) return resolver({ saida, erros });
      const e = erro as NodeJS.ErrnoException & { killed?: boolean };
      if (e.code === "ENOENT") return rejeitar(new Error("ocr_indisponivel"));
      if (e.killed) return rejeitar(new Error("tempo_ocr"));
      rejeitar(new Error("falha_ocr"));
    });
  });
}

async function idiomasInstalados(): Promise<string[]> {
  const { saida, erros } = await rodar(["--list-langs"], 10_000);
  return `${saida}\n${erros}`
    .split("\n")
    .map((linha) => linha.trim())
    .filter((linha) => /^[a-z_]{3,12}$/i.test(linha) && linha !== "osd");
}

function idiomaPreferido(): string | null {
  const ambiente = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANGUAGE || process.env.LANG || "";
  const prefixo = ambiente.slice(0, 2).toLowerCase();
  return PREFERIDOS[prefixo] ?? null;
}

export async function ocr(caminho: string): Promise<ResultadoOcr> {
  const instalados = await idiomasInstalados();
  const escolhidos = [idiomaPreferido(), "eng"].filter((i): i is string => i !== null && instalados.includes(i));
  const unicos = [...new Set(escolhidos)];
  if (unicos.length === 0 && instalados[0]) unicos.push(instalados[0]);
  if (unicos.length === 0) throw new Error("sem_idioma_ocr");
  const { saida } = await rodar([caminho, "stdout", "-l", unicos.join("+")], TEMPO_LIMITE);
  const texto = saida
    .replace(/\f/g, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { texto, idioma: ETIQUETAS[unicos[0] ?? ""] ?? unicos[0] ?? "" };
}