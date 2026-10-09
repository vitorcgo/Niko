import type { IncomingMessage, ServerResponse } from "node:http";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, copyFileSync } from "node:fs";
import { execFile, spawn } from "node:child_process";
import { homedir } from "node:os";
import { extname, join, parse } from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "./ai";

export const LIMIT_FILE = 300 * 1024 * 1024;

const TYPES: Record<string, string> = {
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

export interface FileSubject {
  id: string;
  nome: string;
  extensao: string;
  tamanho: number;
  criadoEm: string;
}

const ID_VALID = /^[A-Za-z0-9-]{1,64}$/;
const SEPARATOR = "__";

function validateId(id: string) {
  if (!ID_VALID.test(id)) throw new Error("id_invalido");
  return id;
}

function directorySubject(database: string, subject: string) {
  if (database && !/^[a-z0-9-]{1,20}$/.test(database)) throw new Error("banco_invalido");
  return join(dataDirectory(), database ? `arquivos-${database}` : "arquivos", validateId(subject));
}

function nameSafe(nameValue: string) {
  const clean = nameValue.normalize("NFC").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/, "").trim();
  const { name, ext } = parse(clean || "arquivo");
  return `${name.slice(0, 140) || "arquivo"}${ext.toLowerCase()}`;
}

function extensionAllowed(nameValue: string) {
  const ext = extname(nameValue).toLowerCase();
  if (!TYPES[ext]) throw new Error("tipo_nao_suportado");
  return ext;
}

function locate(database: string, subject: string, id: string) {
  const directory = directorySubject(database, subject);
  validateId(id);
  if (!existsSync(directory)) throw new Error("arquivo_inexistente");
  const nameValue = readdirSync(directory).find((n) => n.startsWith(`${id}${SEPARATOR}`));
  if (!nameValue) throw new Error("arquivo_inexistente");
  return { caminho: join(directory, nameValue), nome: nameValue.slice(id.length + SEPARATOR.length) };
}

export function listFiles(database: string, subject: string): FileSubject[] {
  const directory = directorySubject(database, subject);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((n) => n.includes(SEPARATOR) && !n.endsWith(".parcial"))
    .map((n) => {
      const index = n.indexOf(SEPARATOR);
      const info = statSync(join(directory, n));
      const nameValue = n.slice(index + SEPARATOR.length);
      return { id: n.slice(0, index), nome: nameValue, extensao: extname(nameValue).toLowerCase().slice(1), tamanho: info.size, criadoEm: info.birthtime.toISOString() };
    })
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

export function receiveFile(req: IncomingMessage, database: string, subject: string, nameOriginal: string): Promise<FileSubject> {
  const nameValue = nameSafe(nameOriginal);
  extensionAllowed(nameValue);
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > LIMIT_FILE) return Promise.reject(new Error("arquivo_grande"));
  const directory = directorySubject(database, subject);
  mkdirSync(directory, { recursive: true });
  const id = randomUUID();
  const finalValue = join(directory, `${id}${SEPARATOR}${nameValue}`);
  const partial = `${finalValue}.parcial`;
  return new Promise((resolve, reject) => {
    let size = 0;
    let failed = false;
    const output = createWriteStream(partial);
    const fail = (e: Error) => {
      if (failed) return;
      failed = true;
      output.destroy();
      rmSync(partial, { force: true });
      reject(e);
    };
    req.on("data", (p: Buffer) => {
      size += p.length;
      if (size > LIMIT_FILE) {
        req.destroy();
        fail(new Error("arquivo_grande"));
      }
    });
    req.on("error", fail);
    req.on("close", () => {
      if (!req.complete) fail(new Error("envio_interrompido"));
    });
    output.on("error", fail);
    output.on("finish", () => {
      if (failed) return;
      if (size === 0) return fail(new Error("arquivo_vazio"));
      try {
        renameSync(partial, finalValue);
        const info = statSync(finalValue);
        resolve({ id, nome: nameValue, extensao: extname(nameValue).slice(1), tamanho: info.size, criadoEm: info.birthtime.toISOString() });
      } catch (e) {
        fail(e as Error);
      }
    });
    req.pipe(output);
  });
}

export function sendContent(res: ServerResponse, database: string, subject: string, id: string) {
  const { caminho: path, nome: nameValue } = locate(database, subject, id);
  const type = TYPES[extname(nameValue).toLowerCase()] ?? "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("content-type", type);
  res.setHeader("content-length", String(statSync(path).size));
  res.setHeader("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(nameValue)}`);
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("cache-control", "no-store");
  if (type === "image/svg+xml") res.setHeader("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
  const readResult = createReadStream(path);
  readResult.on("error", () => res.destroy());
  readResult.pipe(res);
}

export function deleteFile(database: string, subject: string, id: string) {
  unlinkSync(locate(database, subject, id).caminho);
  return { ok: true };
}

export function deleteFilesSubject(database: string, subject: string) {
  const directory = directorySubject(database, subject);
  if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
  return { ok: true };
}

function directoryDownloads(): Promise<string> {
  const fallback = join(homedir(), "Downloads");
  if (process.platform !== "win32") return Promise.resolve(fallback);
  return new Promise((resolve) => {
    execFile("reg", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders", "/v", "{374DE290-123F-4565-9164-39C4925E467B}"], { windowsHide: true }, (error, output) => {
      const value = error ? null : /REG_(?:EXPAND_)?SZ\s+(.+)$/m.exec(output)?.[1]?.trim();
      const expanded = value?.replace(/%([^%]+)%/g, (_, v: string) => process.env[v] ?? `%${v}%`);
      resolve(expanded && existsSync(expanded) ? expanded : fallback);
    });
  });
}

function pathFree(directory: string, nameValue: string) {
  const { name, ext } = parse(nameValue);
  let destination = join(directory, nameValue);
  for (let i = 2; existsSync(destination) && i < 1000; i++) destination = join(directory, `${name} (${i})${ext}`);
  return destination;
}

function openWindows(args: string[]) {
  if (process.platform !== "win32") return;
  const child = spawn("explorer.exe", args, { detached: true, stdio: "ignore", windowsHide: false });
  child.on("error", () => undefined);
  child.unref();
}

export async function downloadFile(database: string, subject: string, id: string) {
  const { caminho: path, nome: nameValue } = locate(database, subject, id);
  const directory = await directoryDownloads();
  mkdirSync(directory, { recursive: true });
  const destination = pathFree(directory, nameValue);
  copyFileSync(path, destination);
  openWindows(["/select,", destination]);
  return { caminho: destination };
}

export function openFileProgram(database: string, subject: string, id: string) {
  const { caminho: path, nome: nameValue } = locate(database, subject, id);
  extensionAllowed(nameValue);
  openWindows([path]);
  return { ok: true };
}
