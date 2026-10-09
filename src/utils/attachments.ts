import type { AttachmentMessage } from "../types";
import { extractText, extensionName } from "./fileReader";

export const LIMIT_FILE = 8 * 1024 * 1024;
export const LIMIT_DOCUMENT = 30 * 1024 * 1024;
export const LIMIT_TEXT_DOCUMENT = 45000;
export const LIMIT_TEXT = 30000;
export const MAXIMUM_ATTACHMENTS = 4;

const EXTENSIONS_TEXT = /\.(txt|md|markdown|csv|tsv|json|jsonc|xml|yaml|yml|toml|ini|env|log|html?|css|scss|less|js|jsx|ts|tsx|mjs|cjs|vue|svelte|py|rb|php|java|kt|kts|swift|c|h|cpp|hpp|cc|cs|go|rs|sql|sh|bash|ps1|bat|cmd|r|lua|dart|scala|gradle|dockerfile|gitignore)$/i;
const TYPES_IMAGE = /^image\/(png|jpeg|gif|webp)$/;
const EXTENSIONS_DOCUMENT = new Set(["pdf", "docx", "pptx", "xlsx", "odt", "odp", "ods"]);

export function isDocument(nameValue: string): boolean {
  return EXTENSIONS_DOCUMENT.has(extensionName(nameValue));
}

export interface AttachmentReady {
  anexo: AttachmentMessage;
  imagemCompleta?: { tipo: string; base64: string };
}

export type FailureAttachment = "grande" | "tipo" | "leitura";

export function typeAttachment(file: File): "texto" | "imagem" | "outro" {
  if (TYPES_IMAGE.test(file.type)) return "imagem";
  if (isDocument(file.name)) return "texto";
  if (file.type.startsWith("text/") || EXTENSIONS_TEXT.test(file.name) || file.type === "application/json") return "texto";
  return "outro";
}

function readAs(file: File, mode: "texto" | "url", onProgress: (p: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    reader.onerror = () => reject(new Error("leitura"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    if (mode === "texto") reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}

function reduceImage(url: string, side: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, side / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("leitura"));
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("leitura"));
    img.src = url;
  });
}

export async function readAttachment(file: File, onProgress: (p: number) => void): Promise<AttachmentReady> {
  const documentValue = isDocument(file.name);
  if (file.size > (documentValue ? LIMIT_DOCUMENT : LIMIT_FILE)) throw new Error("grande" satisfies FailureAttachment);
  const type = typeAttachment(file);
  const base: AttachmentMessage = { nome: file.name.slice(0, 120), tipo: file.type || "application/octet-stream", tamanho: file.size };
  if (documentValue) {
    const extracted = await extractText(file, file.name, onProgress);
    const trimmed = extracted.texto.length > LIMIT_TEXT_DOCUMENT;
    return { anexo: { ...base, texto: `${extracted.texto.slice(0, LIMIT_TEXT_DOCUMENT)}${trimmed ? "\n\n[...]" : ""}` } };
  }
  if (type === "texto") {
    const content = await readAs(file, "texto", onProgress);
    return { anexo: { ...base, texto: content.slice(0, LIMIT_TEXT) } };
  }
  if (type === "imagem") {
    const url = await readAs(file, "url", onProgress);
    const [thumbnail, complete] = await Promise.all([reduceImage(url, 160, 0.7), reduceImage(url, 1568, 0.86)]);
    return { anexo: { ...base, imagem: thumbnail }, imagemCompleta: { tipo: "image/jpeg", base64: complete.split(",")[1] ?? "" } };
  }
  throw new Error("tipo" satisfies FailureAttachment);
}

const imagesPending = new Map<string, { tipo: string; base64: string }[]>();

export function storeImages(messageId: string, images: { tipo: string; base64: string }[]) {
  if (images.length) imagesPending.set(messageId, images);
}

export function imagesMessage(messageId: string) {
  return imagesPending.get(messageId);
}

export function textWithAttachments(text: string, attachments?: AttachmentMessage[]): string {
  if (!attachments?.length) return text;
  const parts = attachments.map((a) => (a.texto != null ? `Arquivo anexado: ${a.nome}\n\`\`\`\n${a.texto}\n\`\`\`` : a.imagem ? `Imagem anexada: ${a.nome}` : `Arquivo anexado: ${a.nome}`));
  return `${text}\n\n${parts.join("\n\n")}`.trim();
}

export function imageToBlob(image: { tipo: string; base64: string }): Blob {
  const binary = atob(image.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: image.tipo });
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
