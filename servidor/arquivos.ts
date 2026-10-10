import type { IncomingMessage, ServerResponse } from "node:http";
import { constants, createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, unlinkSync } from "node:fs";
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { homedir } from "node:os";
import { extname, join, parse } from "node:path";
import { randomUUID } from "node:crypto";
import { pastaDados } from "./ia.ts";

export const LIMITE_ARQUIVO = 300 * 1024 * 1024;

const TIPOS: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".odp": "application/vnd.oasis.opendocument.presentation",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".rtf": "application/rtf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".csv": "text/plain; charset=utf-8",
  ".json": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".7z": "application/x-7z-compressed",
  ".epub": "application/epub+zip",
};

export interface ArquivoDaMateria {
  id: string;
  nome: string;
  extensao: string;
  tamanho: number;
  criadoEm: string;
}

const ID_VALIDO = /^[A-Za-z0-9-]{1,64}$/;
const SEPARADOR = "__";

function validarId(id: string) {
  if (!ID_VALIDO.test(id)) throw new Error("id_invalido");
  return id;
}

function pastaDaMateria(banco: string, materia: string) {
  if (banco && !/^[a-z0-9-]{1,20}$/.test(banco)) throw new Error("banco_invalido");
  return join(pastaDados(), banco ? `arquivos-${banco}` : "arquivos", validarId(materia));
}

function nomeSeguro(nome: string) {
  const limpo = nome.normalize("NFC").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/, "").trim();
  const { name, ext } = parse(limpo || "arquivo");
  return `${name.slice(0, 140) || "arquivo"}${ext.toLowerCase()}`;
}

function extensaoPermitida(nome: string) {
  const ext = extname(nome).toLowerCase();
  if (!TIPOS[ext]) throw new Error("tipo_nao_suportado");
  return ext;
}

function localizar(banco: string, materia: string, id: string) {
  const pasta = pastaDaMateria(banco, materia);
  validarId(id);
  if (!existsSync(pasta)) throw new Error("arquivo_inexistente");
  const nome = readdirSync(pasta).find((n) => n.startsWith(`${id}${SEPARADOR}`));
  if (!nome) throw new Error("arquivo_inexistente");
  return { caminho: join(pasta, nome), nome: nome.slice(id.length + SEPARADOR.length) };
}

export async function listarArquivos(banco: string, materia: string): Promise<ArquivoDaMateria[]> {
  const pasta = pastaDaMateria(banco, materia);
  let nomes: string[];
  try {
    nomes = await readdir(pasta);
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw erro;
  }
  const arquivos: ArquivoDaMateria[] = [];
  for (const n of nomes.filter((n) => n.includes(SEPARADOR) && !n.endsWith(".parcial"))) {
    try {
      const indice = n.indexOf(SEPARADOR);
      const info = await stat(join(pasta, n));
      if (!info.isFile()) continue;
      const nome = n.slice(indice + SEPARADOR.length);
      arquivos.push({ id: n.slice(0, indice), nome, extensao: extname(nome).toLowerCase().slice(1), tamanho: info.size, criadoEm: info.birthtime.toISOString() });
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code !== "ENOENT") throw erro;
    }
  }
  return arquivos.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

export function receberArquivo(req: IncomingMessage, banco: string, materia: string, nomeOriginal: string): Promise<ArquivoDaMateria> {
  const nome = nomeSeguro(nomeOriginal);
  extensaoPermitida(nome);
  const declarado = Number(req.headers["content-length"] ?? 0);
  if (declarado > LIMITE_ARQUIVO) return Promise.reject(new Error("arquivo_grande"));
  const pasta = pastaDaMateria(banco, materia);
  mkdirSync(pasta, { recursive: true });
  const id = randomUUID();
  const final = join(pasta, `${id}${SEPARADOR}${nome}`);
  const parcial = `${final}.parcial`;
  return new Promise((resolver, rejeitar) => {
    let tamanho = 0;
    let falhou = false;
    const saida = createWriteStream(parcial);
    const falhar = (e: Error) => {
      if (falhou) return;
      falhou = true;
      saida.destroy();
      rmSync(parcial, { force: true });
      rejeitar(e);
    };
    req.on("data", (p: Buffer) => {
      tamanho += p.length;
      if (tamanho > LIMITE_ARQUIVO) {
        req.destroy();
        falhar(new Error("arquivo_grande"));
      }
    });
    req.on("error", falhar);
    req.on("close", () => {
      if (!req.complete) falhar(new Error("envio_interrompido"));
    });
    saida.on("error", falhar);
    saida.on("finish", () => {
      if (falhou) return;
      if (tamanho === 0) return falhar(new Error("arquivo_vazio"));
      try {
        renameSync(parcial, final);
        const info = statSync(final);
        resolver({ id, nome, extensao: extname(nome).slice(1), tamanho: info.size, criadoEm: info.birthtime.toISOString() });
      } catch (e) {
        falhar(e as Error);
      }
    });
    req.pipe(saida);
  });
}

export function enviarConteudo(res: ServerResponse, banco: string, materia: string, id: string) {
  const { caminho, nome } = localizar(banco, materia, id);
  const tipo = TIPOS[extname(nome).toLowerCase()] ?? "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("content-type", tipo);
  res.setHeader("content-length", String(statSync(caminho).size));
  res.setHeader("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(nome)}`);
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("cache-control", "no-store");
  if (tipo === "image/svg+xml") res.setHeader("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
  const leitura = createReadStream(caminho);
  leitura.on("error", () => res.destroy());
  leitura.pipe(res);
}

export function excluirArquivo(banco: string, materia: string, id: string) {
  unlinkSync(localizar(banco, materia, id).caminho);
  return { ok: true };
}

export function excluirArquivosDaMateria(banco: string, materia: string) {
  const pasta = pastaDaMateria(banco, materia);
  if (existsSync(pasta)) rmSync(pasta, { recursive: true, force: true });
  return { ok: true };
}

function pastaDownloads(): Promise<string> {
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

export async function copiarSemSubstituir(caminho: string, pasta: string, nome: string): Promise<string> {
  const { name, ext } = parse(nome);
  for (let i = 1; i < 1000; i++) {
    const destino = join(pasta, i === 1 ? nome : `${name} (${i})${ext}`);
    try {
      await copyFile(caminho, destino, constants.COPYFILE_EXCL);
      return destino;
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code !== "EEXIST") throw erro;
    }
  }
  throw new Error("sem_nome_disponivel");
}

function abrirNoWindows(argumentos: string[]) {
  if (process.platform !== "win32") return;
  const filho = spawn("explorer.exe", argumentos, { detached: true, stdio: "ignore", windowsHide: false });
  filho.on("error", () => undefined);
  filho.unref();
}

export async function baixarArquivo(banco: string, materia: string, id: string) {
  const { caminho, nome } = localizar(banco, materia, id);
  const pasta = await pastaDownloads();
  await mkdir(pasta, { recursive: true });
  const destino = await copiarSemSubstituir(caminho, pasta, nome);
  abrirNoWindows(["/select,", destino]);
  return { caminho: destino };
}

export function abrirArquivoNoPrograma(banco: string, materia: string, id: string) {
  const { caminho, nome } = localizar(banco, materia, id);
  extensaoPermitida(nome);
  abrirNoWindows([caminho]);
  return { ok: true };
}
