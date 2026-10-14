import type { IncomingMessage } from "node:http";
import { rmSync, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { plataforma } from "./plataforma/index.ts";
import type { ResultadoOcr } from "./plataforma/tipos.ts";

const LIMITE_IMAGEM = 25 * 1024 * 1024;

function receberImagem(req: IncomingMessage, destino: string): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    let tamanho = 0;
    const saida = createWriteStream(destino);
    req.on("data", (p: Buffer) => {
      tamanho += p.length;
      if (tamanho > LIMITE_IMAGEM) {
        req.destroy();
        saida.destroy();
        rejeitar(new Error("imagem_grande_ocr"));
      }
    });
    req.on("error", rejeitar);
    saida.on("error", rejeitar);
    saida.on("finish", () => (tamanho === 0 ? rejeitar(new Error("arquivo_vazio")) : resolver()));
    req.pipe(saida);
  });
}

export async function ocrDaRequisicao(req: IncomingMessage): Promise<ResultadoOcr> {
  const caminho = join(tmpdir(), `niko-ocr-${randomUUID()}.png`);
  try {
    await receberImagem(req, caminho);
    return await plataforma.ocr(caminho);
  } finally {
    rmSync(caminho, { force: true });
  }
}
