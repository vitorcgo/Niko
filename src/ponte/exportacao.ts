import { NATIVO } from "../desktop/desktop";
import { useInterface } from "../estado/interface";
import { T } from "../textos/textos";
import { baixarArquivo } from "../utilitarios/basicos";

interface OpcoesDeExportacao {
  tipo?: string;
  mostrarNaPasta?: boolean;
}

export async function salvarNosDownloads(nome: string, conteudo: string, { tipo = "application/json", mostrarNaPasta = true }: OpcoesDeExportacao = {}): Promise<string | null> {
  if (!NATIVO) {
    baixarArquivo(nome, conteudo, tipo);
    return null;
  }
  const parametros = new URLSearchParams({ nome, mostrar: mostrarNaPasta ? "1" : "0" });
  const resposta = await fetch(`/ponte/exportar?${parametros}`, {
    method: "POST",
    headers: { "x-niko": "1", "content-type": "text/plain; charset=utf-8" },
    body: conteudo,
  });
  const json = (await resposta.json().catch(() => ({}))) as { caminho?: unknown; erro?: string };
  if (!resposta.ok || typeof json.caminho !== "string") throw new Error(json.erro ?? `http_${resposta.status}`);
  return json.caminho;
}

export async function exportarArquivo(nome: string, conteudo: string, opcoes: OpcoesDeExportacao = {}): Promise<boolean> {
  const avisar = useInterface.getState().avisar;
  try {
    const caminho = await salvarNosDownloads(nome, conteudo, opcoes);
    if (caminho) avisar(T.geral.salvoEm(caminho));
    return true;
  } catch {
    avisar(T.geral.salvarFalhou);
    return false;
  }
}
