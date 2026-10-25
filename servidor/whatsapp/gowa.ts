import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { uptime } from "node:os";
import { join } from "node:path";
import { pastaDados } from "../ia.ts";
import { extrairDoZip } from "./zip.ts";

const RELEASE_MAIS_RECENTE = "https://api.github.com/repos/aldinokemal/go-whatsapp-web-multidevice/releases/latest";
const TAMANHO_MAXIMO_DO_DOWNLOAD = 120 * 1024 * 1024;
const INTERVALO_MINIMO_ENTRE_INICIOS_MS = 60_000;

export interface ArquivoDaRelease {
  nome: string;
  url: string;
  tamanho: number;
  digest?: string;
}

export function pastaDoWhatsapp() {
  return join(pastaDados(), "whatsapp");
}

export function caminhoDoGowa() {
  return join(pastaDoWhatsapp(), process.platform === "win32" ? "gowa.exe" : "gowa");
}

export function gowaInstalado() {
  return existsSync(caminhoDoGowa());
}

export function alvoDaPlataforma(plataforma = process.platform, arquitetura = process.arch): { so: string; arq: string } | null {
  const so = plataforma === "win32" ? "windows" : plataforma === "linux" ? "linux" : null;
  const arq = arquitetura === "x64" ? "amd64" : arquitetura === "arm64" ? "arm64" : arquitetura === "ia32" ? "386" : null;
  if (!so || !arq || (so === "windows" && arq === "arm64")) return null;
  return { so, arq };
}

export function escolherArquivos(arquivos: ArquivoDaRelease[], versao: string, alvo: { so: string; arq: string }) {
  const zip = arquivos.find((a) => a.nome === `whatsapp_${versao}_${alvo.so}_${alvo.arq}.zip`);
  if (!zip) return null;
  return { zip, somas: arquivos.find((a) => a.nome === "checksums.txt"), binario: `${alvo.so}-${alvo.arq}${alvo.so === "windows" ? ".exe" : ""}` };
}

export function sha256Esperado(zip: ArquivoDaRelease, somas: string | null): string | null {
  for (const linha of (somas ?? "").split(/\r?\n/)) {
    const [hex, nome] = linha.trim().split(/\s+/);
    if (nome === zip.nome && /^[0-9a-f]{64}$/i.test(hex ?? "")) return hex.toLowerCase();
  }
  const digest = zip.digest ?? "";
  return /^sha256:[0-9a-f]{64}$/i.test(digest) ? digest.slice(7).toLowerCase() : null;
}

export function hostDoGithub(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "github.com" || host === "api.github.com" || host.endsWith(".githubusercontent.com");
  } catch {
    return false;
  }
}

async function baixarDoGithub(url: string, limite: number): Promise<Buffer> {
  let atual = url;
  for (let saltos = 0; saltos < 6; saltos++) {
    if (!hostDoGithub(atual) || !atual.startsWith("https://")) throw new Error("download_fora_do_github");
    const r = await fetch(atual, { redirect: "manual", headers: { "user-agent": "Niko", accept: "application/octet-stream" }, signal: AbortSignal.timeout(600_000) });
    if (r.status >= 300 && r.status < 400) {
      const proximo = r.headers.get("location");
      if (!proximo) throw new Error("download_falhou");
      atual = new URL(proximo, atual).toString();
      continue;
    }
    if (!r.ok) throw new Error(`download_falhou_${r.status}`);
    const tamanho = Number(r.headers.get("content-length") ?? 0);
    if (tamanho > limite) throw new Error("download_grande_demais");
    const dados = Buffer.from(await r.arrayBuffer());
    if (dados.length > limite) throw new Error("download_grande_demais");
    return dados;
  }
  throw new Error("download_falhou");
}

export type EtapaDaInstalacao = "parado" | "verificando" | "baixando" | "conferindo" | "instalando" | "pronto" | "falhou";

export const instalacao: { etapa: EtapaDaInstalacao; megabytes: number; versao: string; erro: string } = { etapa: "parado", megabytes: 0, versao: "", erro: "" };

export async function instalarGowa(antesDeTrocar: () => Promise<void>): Promise<string> {
  if (["verificando", "baixando", "conferindo", "instalando"].includes(instalacao.etapa)) throw new Error("instalacao_em_andamento");
  Object.assign(instalacao, { etapa: "verificando", megabytes: 0, erro: "" });
  try {
    const alvo = alvoDaPlataforma();
    if (!alvo) throw new Error("sem_build_para_este_sistema");
    const r = await fetch(RELEASE_MAIS_RECENTE, { headers: { accept: "application/vnd.github+json", "user-agent": "Niko" }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`github_${r.status}`);
    const release = (await r.json()) as { tag_name?: string; assets?: { name: string; browser_download_url: string; size: number; digest?: string }[] };
    const versao = String(release.tag_name ?? "").replace(/^v/, "");
    const arquivos: ArquivoDaRelease[] = (release.assets ?? []).map((a) => ({ nome: a.name, url: a.browser_download_url, tamanho: a.size, digest: a.digest }));
    const escolha = escolherArquivos(arquivos, versao, alvo);
    if (!versao || !escolha) throw new Error("sem_build_para_este_sistema");
    const somas = escolha.somas ? (await baixarDoGithub(escolha.somas.url, 64 * 1024)).toString("utf8") : null;
    const esperado = sha256Esperado(escolha.zip, somas);
    if (!esperado) throw new Error("sem_checksum");

    Object.assign(instalacao, { etapa: "baixando", megabytes: Math.max(1, Math.round(escolha.zip.tamanho / 1_000_000)) });
    const zip = await baixarDoGithub(escolha.zip.url, TAMANHO_MAXIMO_DO_DOWNLOAD);

    instalacao.etapa = "conferindo";
    if (createHash("sha256").update(zip).digest("hex") !== esperado) throw new Error("checksum_diferente");

    instalacao.etapa = "instalando";
    const binario = extrairDoZip(zip, escolha.binario);
    mkdirSync(pastaDoWhatsapp(), { recursive: true });
    const temporario = `${caminhoDoGowa()}.baixando`;
    writeFileSync(temporario, binario);
    if (process.platform !== "win32") chmodSync(temporario, 0o755);
    await antesDeTrocar();
    renameSync(temporario, caminhoDoGowa());
    Object.assign(instalacao, { etapa: "pronto", versao });
    return versao;
  } catch (e) {
    rmSync(`${caminhoDoGowa()}.baixando`, { force: true });
    Object.assign(instalacao, { etapa: "falhou", erro: (e as Error).message });
    throw e;
  }
}

export function portaLivre(): Promise<number> {
  return new Promise((resolver, rejeitar) => {
    const s = createServer();
    s.unref();
    s.on("error", rejeitar);
    s.listen(0, "127.0.0.1", () => {
      const endereco = s.address();
      const porta = typeof endereco === "object" && endereco ? endereco.port : 0;
      s.close(() => (porta ? resolver(porta) : rejeitar(new Error("sem_porta"))));
    });
  });
}

export interface OpcoesDoGowa {
  porta: number;
  acesso: string;
  urlDoWebhook: string;
  segredoDoWebhook: string;
}

export function ambienteDoGowa(o: OpcoesDoGowa, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...base,
    APP_HOST: "127.0.0.1",
    APP_PORT: String(o.porta),
    APP_OS: "Niko",
    APP_BASIC_AUTH: o.acesso,
    APP_UI_ENABLED: "false",
    APP_UI_AUTO_UPDATE: "false",
    WHATSAPP_AUTO_DOWNLOAD_MEDIA: "false",
    WHATSAPP_IGNORE_STATUS_MEDIA: "true",
    WHATSAPP_WEBHOOK: o.urlDoWebhook,
    WHATSAPP_WEBHOOK_SECRET: o.segredoDoWebhook,
    WHATSAPP_WEBHOOK_EVENTS: "message,message.revoked,message.edited,message.reaction,message.ack,chat_presence",
  };
}

let processo: ChildProcess | null = null;
let assinaturaEmUso: string | null = null;
let ultimoInicio = 0;

export function gowaRodando() {
  return processo !== null && processo.exitCode === null && processo.signalCode === null;
}

export function iniciarGowa(o: OpcoesDoGowa): boolean {
  const assinatura = [o.porta, o.acesso, o.urlDoWebhook, o.segredoDoWebhook].join("\u001f");
  if (gowaRodando()) {
    if (assinatura === assinaturaEmUso) return true;
    pararGowa();
  } else if (assinatura === assinaturaEmUso && Date.now() - ultimoInicio < INTERVALO_MINIMO_ENTRE_INICIOS_MS) {
    return false;
  }
  if (!gowaInstalado()) return false;
  mkdirSync(pastaDoWhatsapp(), { recursive: true });
  encerrarOrfao();
  const filho = spawn(caminhoDoGowa(), ["rest"], { cwd: pastaDoWhatsapp(), env: ambienteDoGowa(o), stdio: "ignore", windowsHide: true });
  filho.on("error", () => {
    if (processo === filho) processo = null;
  });
  filho.on("exit", () => {
    if (processo === filho) processo = null;
  });
  processo = filho;
  assinaturaEmUso = assinatura;
  ultimoInicio = Date.now();
  if (filho.pid) writeFileSync(arquivoDoPid(), String(filho.pid), "utf8");
  return true;
}

const arquivoDoPid = () => join(pastaDoWhatsapp(), "gowa.pid");

function encerrarOrfao() {
  if (!existsSync(arquivoDoPid())) return;
  const gravadoNesteBoot = statSync(arquivoDoPid()).mtimeMs > Date.now() - uptime() * 1000;
  const pid = Number(readFileSync(arquivoDoPid(), "utf8").trim());
  rmSync(arquivoDoPid(), { force: true });
  if (!gravadoNesteBoot) return;
  if (!Number.isInteger(pid) || pid <= 4 || pid === process.pid || pid === processo?.pid) return;
  try {
    process.kill(pid);
  } catch {
    return;
  }
}

let parando: ChildProcess | null = null;

export function pararGowa() {
  const filho = processo;
  processo = null;
  assinaturaEmUso = null;
  if (!filho || filho.exitCode !== null || filho.signalCode !== null) return;
  parando = filho;
  rmSync(arquivoDoPid(), { force: true });
  filho.once("exit", () => {
    if (parando === filho) parando = null;
  });
  try {
    filho.kill();
  } catch {
    parando = null;
  }
}

export function aguardarGowaParar(limiteMs = 3000): Promise<void> {
  return new Promise((resolver) => {
    const inicio = Date.now();
    const verificar = () => {
      const ativo = parando && parando.exitCode === null && parando.signalCode === null;
      if (!ativo || Date.now() - inicio > limiteMs) {
        if (ativo) {
          try {
            parando?.kill("SIGKILL");
          } catch {
            parando = null;
          }
        }
        resolver();
      } else setTimeout(verificar, 100);
    };
    verificar();
  });
}
