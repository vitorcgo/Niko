import { databaseHeaders } from "./storage";

export interface FileSubject {
  id: string;
  nome: string;
  extensao: string;
  tamanho: number;
  criadoEm: string;
}

export type ShapeView = "pdf" | "imagem" | "texto" | "audio" | "video" | "programa";

export const LIMIT_FILE = 300 * 1024 * 1024;

export const EXTENSIONS_ACCEPTED = [
  "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "odt", "odp", "ods", "rtf", "txt", "md", "csv", "json",
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "mp3", "wav", "ogg", "m4a", "mp4", "webm", "mov", "zip", "rar", "7z", "epub",
];

const SHAPES: Record<string, ShapeView> = {
  pdf: "pdf",
  png: "imagem", jpg: "imagem", jpeg: "imagem", gif: "imagem", webp: "imagem", bmp: "imagem", svg: "imagem",
  txt: "texto", md: "texto", csv: "texto", json: "texto",
  mp3: "audio", wav: "audio", ogg: "audio", m4a: "audio",
  mp4: "video", webm: "video", mov: "video",
};

export function shapeView(extension: string): ShapeView {
  return SHAPES[extension.toLowerCase()] ?? "programa";
}

export function getExtension(nameValue: string): string {
  const i = nameValue.lastIndexOf(".");
  return i > 0 ? nameValue.slice(i + 1).toLowerCase() : "";
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { "x-niko": "1", ...databaseHeaders(), ...extra };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const r = await fetch(`/ponte/arquivos/${path}`, { ...options, headers: headers(options.headers as Record<string, string> | undefined) });
  const json = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw new Error(json.erro ?? `http_${r.status}`);
  return json;
}

export async function listFiles(subjectId: string): Promise<FileSubject[]> {
  return (await request<{ arquivos: FileSubject[] }>(subjectId)).arquivos;
}

export function sendFile(subjectId: string, file: File): Promise<FileSubject> {
  return request<FileSubject>(`${subjectId}?nome=${encodeURIComponent(file.name)}`, {
    method: "POST",
    body: file,
    headers: { "content-type": "application/octet-stream" },
  });
}

export async function readContent(subjectId: string, id: string): Promise<Blob> {
  const r = await fetch(`/ponte/arquivos/${subjectId}/${id}`, { headers: headers() });
  if (!r.ok) throw new Error(`http_${r.status}`);
  return r.blob();
}

export function deleteFile(subjectId: string, id: string) {
  return request<{ ok: boolean }>(`${subjectId}/${id}`, { method: "DELETE" });
}

export function deleteFilesSubject(subjectId: string) {
  return request<{ ok: boolean }>(subjectId, { method: "DELETE" });
}

export function downloadFile(subjectId: string, id: string) {
  return request<{ caminho: string }>(`${subjectId}/${id}/baixar`, { method: "POST" });
}

export function openProgram(subjectId: string, id: string) {
  return request<{ ok: boolean }>(`${subjectId}/${id}/abrir`, { method: "POST" });
}
