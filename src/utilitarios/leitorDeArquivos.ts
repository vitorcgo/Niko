import { strFromU8 } from "fflate";
import { LIMITE_OFFICE_COMPRIMIDO } from "./officeLimitado";
import { cabecalhoDoBanco } from "../ponte/armazenamento";
import { T } from "../textos/textos";

export type OrigemDoTexto = "texto" | "pdf" | "office" | "ocr" | "pdf_ocr";

export interface TextoExtraido {
  texto: string;
  origem: OrigemDoTexto;
  paginas?: number;
  paginasLidasComOcr?: number;
  idioma?: string;
}

export type FalhaDeLeitura = keyof typeof T.estudos.arquivos.leitura;

export function mensagemDeLeitura(e: unknown, nome: string): string | null {
  const codigo = (e as Error)?.message ?? "";
  return Object.hasOwn(T.estudos.arquivos.leitura, codigo) ? T.estudos.arquivos.leitura[codigo as FalhaDeLeitura](nome) : null;
}

const EXTENSOES_TEXTO = new Set(["txt", "md", "markdown", "csv", "tsv", "json", "xml", "yaml", "yml", "log", "rtf"]);
const EXTENSOES_IMAGEM = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);
const EXTENSOES_OFFICE = new Set(["docx", "pptx", "xlsx", "odt", "odp", "ods"]);
const EXTENSOES_ANTIGAS = new Set(["doc", "ppt", "xls"]);
const MAXIMO_PAGINAS_PDF = 400;
const MAXIMO_PAGINAS_OCR = 25;
const MAXIMO_LADO_OCR = 3000;
const LIMITE_CARACTERES = 400_000;

export function extensaoDoNome(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i > 0 ? nome.slice(i + 1).toLowerCase() : "";
}

export function podeExtrairTexto(nome: string): boolean {
  const e = extensaoDoNome(nome);
  return e === "pdf" || EXTENSOES_TEXTO.has(e) || EXTENSOES_IMAGEM.has(e) || EXTENSOES_OFFICE.has(e);
}

export function ehImagem(nome: string): boolean {
  return EXTENSOES_IMAGEM.has(extensaoDoNome(nome));
}

function limpar(texto: string): string {
  return texto.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, LIMITE_CARACTERES);
}

async function ocrDeImagem(imagem: Blob): Promise<{ texto: string; idioma: string }> {
  const r = await fetch("/ponte/ocr", { method: "POST", headers: { "x-niko": "1", "content-type": "application/octet-stream", ...cabecalhoDoBanco() }, body: imagem });
  const json = (await r.json().catch(() => ({}))) as { texto?: string; idioma?: string; erro?: string };
  if (!r.ok) throw new Error(json.erro ?? "falha_ocr");
  return { texto: json.texto ?? "", idioma: json.idioma ?? "" };
}

function canvasParaPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolver, rejeitar) => canvas.toBlob((b) => (b ? resolver(b) : rejeitar(new Error("leitura"))), "image/png"));
}

async function prepararImagemParaOcr(imagem: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(imagem);
  const escala = Math.min(1, MAXIMO_LADO_OCR / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("leitura");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvasParaPng(canvas);
}

export async function lerTextoDeImagem(imagem: Blob): Promise<TextoExtraido> {
  const { texto, idioma } = await ocrDeImagem(await prepararImagemParaOcr(imagem));
  const limpo = limpar(texto);
  if (!limpo) throw new Error("sem_texto" satisfies FalhaDeLeitura);
  return { texto: limpo, origem: "ocr", idioma };
}

async function carregarPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const trabalhador = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = trabalhador.default;
  }
  return pdfjs;
}

async function lerPdf(dados: ArrayBuffer, aoProgresso?: (p: number) => void): Promise<TextoExtraido> {
  const pdfjs = await carregarPdfJs();
  const tarefa = pdfjs.getDocument({ data: new Uint8Array(dados) });
  let documento;
  try {
    documento = await tarefa.promise;
  } catch (e) {
    await tarefa.destroy().catch(() => undefined);
    throw new Error((e as Error)?.name === "PasswordException" ? "pdf_protegido" : "pdf_invalido");
  }
  try {
    const total = Math.min(documento.numPages, MAXIMO_PAGINAS_PDF);
    const paginas: string[] = [];
    const vazias: number[] = [];
    for (let n = 1; n <= total; n++) {
      const pagina = await documento.getPage(n);
      const conteudo = await pagina.getTextContent();
      const texto = conteudo.items.map((item) => ("str" in item ? `${item.str}${item.hasEOL ? "\n" : ""}` : "")).join("");
      paginas.push(texto.trim());
      if (texto.replace(/\s/g, "").length < 20) vazias.push(n);
      aoProgresso?.(n / total / 2);
    }
    let lidasComOcr = 0;
    if (vazias.length > 0) {
      for (const n of vazias.slice(0, MAXIMO_PAGINAS_OCR)) {
        const pagina = await documento.getPage(n);
        const base = pagina.getViewport({ scale: 1 });
        const escala = Math.min(2.5, MAXIMO_LADO_OCR / Math.max(base.width, base.height));
        const viewport = pagina.getViewport({ scale: escala });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await pagina.render({ canvas, viewport }).promise;
        try {
          const { texto } = await ocrDeImagem(await canvasParaPng(canvas));
          if (texto.trim()) {
            paginas[n - 1] = texto.trim();
            lidasComOcr++;
          }
        } catch (e) {
          if (lidasComOcr === 0 && paginas.every((p) => !p)) throw e;
        }
        aoProgresso?.(0.5 + (lidasComOcr / Math.min(vazias.length, MAXIMO_PAGINAS_OCR)) / 2);
      }
    }
    const texto = limpar(paginas.map((p, i) => (p ? `[Página ${i + 1}]\n${p}` : "")).filter(Boolean).join("\n\n"));
    if (!texto) throw new Error("sem_texto" satisfies FalhaDeLeitura);
    return { texto, origem: lidasComOcr > 0 ? "pdf_ocr" : "pdf", paginas: documento.numPages, paginasLidasComOcr: lidasComOcr };
  } finally {
    void tarefa.destroy();
  }
}

function textoDoXml(xml: string, seletorParagrafo: string, seletorTexto: string): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const paragrafos = Array.from(doc.getElementsByTagName(seletorParagrafo));
  if (paragrafos.length === 0) return Array.from(doc.getElementsByTagName(seletorTexto)).map((t) => t.textContent ?? "").join(" ");
  return paragrafos.map((p) => Array.from(p.getElementsByTagName(seletorTexto)).map((t) => t.textContent ?? "").join("")).filter((t) => t.trim()).join("\n");
}

function numeroNoNome(nome: string): number {
  return Number(/(\d+)\.xml$/.exec(nome)?.[1] ?? 0);
}

function descompactarForaDaInterface(dados: ArrayBuffer, extensao: string): Promise<Record<string, Uint8Array>> {
  return new Promise((resolver, rejeitar) => {
    const trabalhador = new Worker(new URL("./office.worker.ts", import.meta.url), { type: "module" });
    const limite = window.setTimeout(() => { trabalhador.terminate(); rejeitar(new Error("tempo_leitura")); }, 15000);
    const finalizar = () => { window.clearTimeout(limite); trabalhador.terminate(); };
    trabalhador.onmessage = (e: MessageEvent<{ arquivos?: Record<string, Uint8Array>; erro?: string }>) => {
      finalizar();
      if (e.data.erro || !e.data.arquivos) rejeitar(new Error(e.data.erro ?? "leitura"));
      else resolver(e.data.arquivos);
    };
    trabalhador.onerror = (e) => { e.preventDefault(); finalizar(); rejeitar(new Error("leitura")); };
    trabalhador.onmessageerror = () => { finalizar(); rejeitar(new Error("leitura")); };
    try { trabalhador.postMessage({ dados, extensao }, [dados]); }
    catch (erro) { finalizar(); rejeitar(erro); }
  });
}

async function lerOffice(dados: ArrayBuffer, extensao: string): Promise<TextoExtraido> {
  const arquivos = await descompactarForaDaInterface(dados, extensao);
  const ler = (nome: string) => (arquivos[nome] ? strFromU8(arquivos[nome]) : "");
  let texto = "";
  if (extensao === "docx") {
    const partes = ["word/document.xml", ...Object.keys(arquivos).filter((n) => /^word\/(footnotes|endnotes)\.xml$/.test(n))];
    texto = partes.map((n) => textoDoXml(ler(n), "w:p", "w:t")).join("\n\n");
  } else if (extensao === "pptx") {
    const slides = Object.keys(arquivos).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => numeroNoNome(a) - numeroNoNome(b));
    texto = slides.map((n, i) => {
      const corpo = textoDoXml(ler(n), "a:p", "a:t");
      const notas = textoDoXml(ler(`ppt/notesSlides/notesSlide${numeroNoNome(n)}.xml`), "a:p", "a:t");
      return `[Slide ${i + 1}]\n${corpo}${notas.trim() ? `\n[Notas]\n${notas}` : ""}`;
    }).join("\n\n");
  } else if (extensao === "xlsx") {
    const compartilhados = Array.from(new DOMParser().parseFromString(ler("xl/sharedStrings.xml") || "<sst/>", "application/xml").getElementsByTagName("si")).map((si) => Array.from(si.getElementsByTagName("t")).map((t) => t.textContent ?? "").join(""));
    const planilhas = Object.keys(arquivos).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => numeroNoNome(a) - numeroNoNome(b));
    texto = planilhas.map((n, i) => {
      const doc = new DOMParser().parseFromString(ler(n), "application/xml");
      const linhas = Array.from(doc.getElementsByTagName("row")).map((linha) =>
        Array.from(linha.getElementsByTagName("c")).map((c) => {
          const tipo = c.getAttribute("t");
          if (tipo === "inlineStr") return c.getElementsByTagName("t")[0]?.textContent ?? "";
          const valor = c.getElementsByTagName("v")[0]?.textContent ?? "";
          return tipo === "s" ? compartilhados[Number(valor)] ?? "" : valor;
        }).join("\t"),
      ).filter((l) => l.trim());
      return `[Planilha ${i + 1}]\n${linhas.join("\n")}`;
    }).join("\n\n");
  } else {
    const doc = new DOMParser().parseFromString(ler("content.xml") || "<vazio/>", "application/xml");
    const blocos = Array.from(doc.getElementsByTagName("*")).filter((el) => el.tagName === "text:p" || el.tagName === "text:h");
    texto = blocos.length ? blocos.map((el) => el.textContent ?? "").filter((t) => t.trim()).join("\n") : doc.documentElement.textContent ?? "";
  }
  const limpo = limpar(texto);
  if (!limpo) throw new Error("sem_texto" satisfies FalhaDeLeitura);
  return { texto: limpo, origem: "office" };
}

export async function extrairTexto(arquivo: Blob, nome: string, aoProgresso?: (p: number) => void): Promise<TextoExtraido> {
  const extensao = extensaoDoNome(nome);
  if (arquivo.size > (extensao === "pdf" ? 64 * 1024 * 1024 : LIMITE_OFFICE_COMPRIMIDO)) throw new Error("arquivo_grande" satisfies FalhaDeLeitura);
  if (EXTENSOES_ANTIGAS.has(extensao)) throw new Error("formato_antigo" satisfies FalhaDeLeitura);
  if (EXTENSOES_IMAGEM.has(extensao)) return lerTextoDeImagem(arquivo);
  if (EXTENSOES_TEXTO.has(extensao)) {
    const texto = limpar(await arquivo.text());
    if (!texto) throw new Error("sem_texto" satisfies FalhaDeLeitura);
    return { texto, origem: "texto" };
  }
  if (extensao === "pdf") return lerPdf(await arquivo.arrayBuffer(), aoProgresso);
  if (EXTENSOES_OFFICE.has(extensao)) return lerOffice(await arquivo.arrayBuffer(), extensao);
  throw new Error("sem_suporte" satisfies FalhaDeLeitura);
}
