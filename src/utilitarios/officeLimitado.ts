import { Unzip, UnzipInflate } from "fflate";

export const LIMITE_OFFICE_COMPRIMIDO = 32 * 1024 * 1024;
const LIMITE_XML = 4 * 1024 * 1024;
const LIMITE_TOTAL_XML = 16 * 1024 * 1024;
const LIMITE_ENTRADAS = 2000;

function parteNecessaria(nome: string, extensao: string): boolean {
  if (extensao === "docx") return /^word\/(document|footnotes|endnotes)\.xml$/.test(nome);
  if (extensao === "pptx") return /^ppt\/(slides\/slide|notesSlides\/notesSlide)\d+\.xml$/.test(nome);
  if (extensao === "xlsx") return nome === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(nome);
  return ["odt", "odp", "ods"].includes(extensao) && nome === "content.xml";
}

export function descompactarOffice(dados: Uint8Array, extensao: string): Record<string, Uint8Array> {
  if (dados.length > LIMITE_OFFICE_COMPRIMIDO) throw new Error("arquivo_grande");
  const arquivos: Record<string, Uint8Array> = {};
  let entradas = 0;
  let total = 0;
  let falha: Error | null = null;
  const leitor = new Unzip((arquivo) => {
    if (++entradas > LIMITE_ENTRADAS) throw new Error("office_grande");
    if (!parteNecessaria(arquivo.name, extensao)) return;
    if (arquivo.originalSize !== undefined && arquivo.originalSize > LIMITE_XML) throw new Error("office_grande");
    let tamanho = 0;
    const partes: Uint8Array[] = [];
    arquivo.ondata = (erro, parte, final) => {
      if (erro) throw falha ?? new Error("leitura");
      tamanho += parte.length;
      total += parte.length;
      if (tamanho > LIMITE_XML || total > LIMITE_TOTAL_XML) {
        arquivo.terminate();
        falha = new Error("office_grande");
        throw falha;
      }
      partes.push(parte);
      if (final) {
        const conteudo = new Uint8Array(tamanho);
        let posicao = 0;
        for (const p of partes) { conteudo.set(p, posicao); posicao += p.length; }
        arquivos[arquivo.name] = conteudo;
      }
    };
    arquivo.start();
  });
  leitor.register(UnzipInflate);
  for (let i = 0; i < dados.length; i += 1024) leitor.push(dados.subarray(i, i + 1024), i + 1024 >= dados.length);
  return arquivos;
}
