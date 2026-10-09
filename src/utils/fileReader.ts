import { unzipSync, strFromU8 } from "fflate";
import { databaseHeaders } from "../bridge/storage";
import { T } from "../i18n/ptBR";

export type OriginText = "texto" | "pdf" | "office" | "ocr" | "pdf_ocr";

export interface TextExtracted {
  texto: string;
  origem: OriginText;
  paginas?: number;
  paginasLidasComOcr?: number;
  idioma?: string;
}

export type FailureRead = keyof typeof T.estudos.arquivos.leitura;

export function messageRead(e: unknown, nameValue: string): string | null {
  const code = (e as Error)?.message ?? "";
  return Object.hasOwn(T.estudos.arquivos.leitura, code) ? T.estudos.arquivos.leitura[code as FailureRead](nameValue) : null;
}

const EXTENSIONS_TEXT = new Set(["txt", "md", "markdown", "csv", "tsv", "json", "xml", "yaml", "yml", "log", "rtf"]);
const EXTENSIONS_IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);
const EXTENSIONS_OFFICE = new Set(["docx", "pptx", "xlsx", "odt", "odp", "ods"]);
const EXTENSIONS_PREVIOUS = new Set(["doc", "ppt", "xls"]);
const MAXIMUM_PAGES_PDF = 400;
const MAXIMUM_PAGES_OCR = 25;
const MAXIMUM_SIDE_OCR = 3000;
const LIMIT_CHARACTERS = 400_000;

export function extensionName(nameValue: string): string {
  const i = nameValue.lastIndexOf(".");
  return i > 0 ? nameValue.slice(i + 1).toLowerCase() : "";
}

export function canExtractText(nameValue: string): boolean {
  const e = extensionName(nameValue);
  return e === "pdf" || EXTENSIONS_TEXT.has(e) || EXTENSIONS_IMAGE.has(e) || EXTENSIONS_OFFICE.has(e);
}

export function isImage(nameValue: string): boolean {
  return EXTENSIONS_IMAGE.has(extensionName(nameValue));
}

function clear(text: string): string {
  return text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, LIMIT_CHARACTERS);
}

async function ocrImage(image: Blob): Promise<{ texto: string; idioma: string }> {
  const r = await fetch("/ponte/ocr", { method: "POST", headers: { "x-niko": "1", "content-type": "application/octet-stream", ...databaseHeaders() }, body: image });
  const json = (await r.json().catch(() => ({}))) as { texto?: string; idioma?: string; erro?: string };
  if (!r.ok) throw new Error(json.erro ?? "falha_ocr");
  return { texto: json.texto ?? "", idioma: json.idioma ?? "" };
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("leitura"))), "image/png"));
}

async function prepareImageToOcr(image: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(image);
  const scale = Math.min(1, MAXIMUM_SIDE_OCR / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("leitura");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvasToPng(canvas);
}

export async function readTextImage(image: Blob): Promise<TextExtracted> {
  const { texto: text, idioma: language } = await ocrImage(await prepareImageToOcr(image));
  const clean = clear(text);
  if (!clean) throw new Error("sem_texto" satisfies FailureRead);
  return { texto: clean, origem: "ocr", idioma: language };
}

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  }
  return pdfjs;
}

async function readPdf(payload: ArrayBuffer, onProgress?: (p: number) => void): Promise<TextExtracted> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: new Uint8Array(payload) });
  let documentValue;
  try {
    documentValue = await task.promise;
  } catch (e) {
    throw new Error((e as Error)?.name === "PasswordException" ? "pdf_protegido" : "pdf_invalido");
  }
  try {
    const total = Math.min(documentValue.numPages, MAXIMUM_PAGES_PDF);
    const pages: string[] = [];
    const empty: number[] = [];
    for (let n = 1; n <= total; n++) {
      const page = await documentValue.getPage(n);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ("str" in item ? `${item.str}${item.hasEOL ? "\n" : ""}` : "")).join("");
      pages.push(text.trim());
      if (text.replace(/\s/g, "").length < 20) empty.push(n);
      onProgress?.(n / total / 2);
    }
    let readWithOcr = 0;
    if (empty.length > 0) {
      for (const n of empty.slice(0, MAXIMUM_PAGES_OCR)) {
        const page = await documentValue.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(2.5, MAXIMUM_SIDE_OCR / Math.max(base.width, base.height));
        const viewport = page.getViewport({ scale: scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise;
        try {
          const { texto: text } = await ocrImage(await canvasToPng(canvas));
          if (text.trim()) {
            pages[n - 1] = text.trim();
            readWithOcr++;
          }
        } catch (e) {
          if (readWithOcr === 0 && pages.every((p) => !p)) throw e;
        }
        onProgress?.(0.5 + (readWithOcr / Math.min(empty.length, MAXIMUM_PAGES_OCR)) / 2);
      }
    }
    const text = clear(pages.map((p, i) => (p ? `[Página ${i + 1}]\n${p}` : "")).filter(Boolean).join("\n\n"));
    if (!text) throw new Error("sem_texto" satisfies FailureRead);
    return { texto: text, origem: readWithOcr > 0 ? "pdf_ocr" : "pdf", paginas: documentValue.numPages, paginasLidasComOcr: readWithOcr };
  } finally {
    void task.destroy();
  }
}

function textXml(xml: string, selectorParagraph: string, selectorText: string): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const paragraphs = Array.from(doc.getElementsByTagName(selectorParagraph));
  if (paragraphs.length === 0) return Array.from(doc.getElementsByTagName(selectorText)).map((t) => t.textContent ?? "").join(" ");
  return paragraphs.map((p) => Array.from(p.getElementsByTagName(selectorText)).map((t) => t.textContent ?? "").join("")).filter((t) => t.trim()).join("\n");
}

function numberName(nameValue: string): number {
  return Number(/(\d+)\.xml$/.exec(nameValue)?.[1] ?? 0);
}

function readOffice(payload: ArrayBuffer, extension: string): TextExtracted {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(payload), { filter: (f) => f.name.endsWith(".xml") });
  } catch {
    throw new Error("leitura" satisfies FailureRead);
  }
  const read = (nameValue: string) => (files[nameValue] ? strFromU8(files[nameValue]) : "");
  let text = "";
  if (extension === "docx") {
    const parts = ["word/document.xml", ...Object.keys(files).filter((n) => /^word\/(footnotes|endnotes)\.xml$/.test(n))];
    text = parts.map((n) => textXml(read(n), "w:p", "w:t")).join("\n\n");
  } else if (extension === "pptx") {
    const slides = Object.keys(files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => numberName(a) - numberName(b));
    text = slides.map((n, i) => {
      const body = textXml(read(n), "a:p", "a:t");
      const notes = textXml(read(`ppt/notesSlides/notesSlide${numberName(n)}.xml`), "a:p", "a:t");
      return `[Slide ${i + 1}]\n${body}${notes.trim() ? `\n[Notas]\n${notes}` : ""}`;
    }).join("\n\n");
  } else if (extension === "xlsx") {
    const shared = Array.from(new DOMParser().parseFromString(read("xl/sharedStrings.xml") || "<sst/>", "application/xml").getElementsByTagName("si")).map((si) => Array.from(si.getElementsByTagName("t")).map((t) => t.textContent ?? "").join(""));
    const spreadsheets = Object.keys(files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => numberName(a) - numberName(b));
    text = spreadsheets.map((n, i) => {
      const doc = new DOMParser().parseFromString(read(n), "application/xml");
      const lines = Array.from(doc.getElementsByTagName("row")).map((line) =>
        Array.from(line.getElementsByTagName("c")).map((c) => {
          const type = c.getAttribute("t");
          if (type === "inlineStr") return c.getElementsByTagName("t")[0]?.textContent ?? "";
          const value = c.getElementsByTagName("v")[0]?.textContent ?? "";
          return type === "s" ? shared[Number(value)] ?? "" : value;
        }).join("\t"),
      ).filter((l) => l.trim());
      return `[Planilha ${i + 1}]\n${lines.join("\n")}`;
    }).join("\n\n");
  } else {
    const doc = new DOMParser().parseFromString(read("content.xml") || "<vazio/>", "application/xml");
    const blocks = Array.from(doc.getElementsByTagName("*")).filter((el) => el.tagName === "text:p" || el.tagName === "text:h");
    text = blocks.length ? blocks.map((el) => el.textContent ?? "").filter((t) => t.trim()).join("\n") : doc.documentElement.textContent ?? "";
  }
  const clean = clear(text);
  if (!clean) throw new Error("sem_texto" satisfies FailureRead);
  return { texto: clean, origem: "office" };
}

export async function extractText(file: Blob, nameValue: string, onProgress?: (p: number) => void): Promise<TextExtracted> {
  const extension = extensionName(nameValue);
  if (EXTENSIONS_PREVIOUS.has(extension)) throw new Error("formato_antigo" satisfies FailureRead);
  if (EXTENSIONS_IMAGE.has(extension)) return readTextImage(file);
  if (EXTENSIONS_TEXT.has(extension)) {
    const text = clear(await file.text());
    if (!text) throw new Error("sem_texto" satisfies FailureRead);
    return { texto: text, origem: "texto" };
  }
  if (extension === "pdf") return readPdf(await file.arrayBuffer(), onProgress);
  if (EXTENSIONS_OFFICE.has(extension)) return readOffice(await file.arrayBuffer(), extension);
  throw new Error("sem_suporte" satisfies FailureRead);
}
