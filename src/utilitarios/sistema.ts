import { platform, version } from "@tauri-apps/plugin-os";
import { NATIVO } from "../desktop/desktop";

export type Plataforma = "windows" | "macos" | "linux" | "desconhecido";

export interface SistemaAtual {
  plataforma: Plataforma;
  versao?: string;
}

function plataformaDoNavegador(): Plataforma {
  const nav = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { userAgentData?: { platform?: string } });
  const alvo = [nav?.userAgentData?.platform, nav?.platform, nav?.userAgent].filter(Boolean).join(" ").toLowerCase();
  if (alvo.includes("win")) return "windows";
  if (alvo.includes("mac") || alvo.includes("darwin")) return "macos";
  if (alvo.includes("linux") || alvo.includes("x11") || alvo.includes("android")) return "linux";
  return "desconhecido";
}

function versaoDoWindows(versao: string): string {
  const build = Number(versao.split(".")[2]);
  if (!Number.isFinite(build)) return versao;
  return `${build >= 22000 ? "11" : "10"} (build ${build})`;
}

let lembrado: SistemaAtual | undefined;

export function sistemaAtual(): SistemaAtual {
  if (lembrado) return lembrado;
  lembrado = ler();
  return lembrado;
}

function ler(): SistemaAtual {
  if (!NATIVO) return { plataforma: plataformaDoNavegador() };
  try {
    const alvo = platform();
    const versao = version();
    if (alvo === "windows") return { plataforma: "windows", versao: versaoDoWindows(versao) };
    if (alvo === "macos" || alvo === "ios") return { plataforma: "macos", versao };
    return { plataforma: "linux", versao: versao && versao !== "unknown" ? versao : undefined };
  } catch (erro) {
    console.error("Falha ao ler a versão do sistema operacional", erro);
    return { plataforma: plataformaDoNavegador() };
  }
}
