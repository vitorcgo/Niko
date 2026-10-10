import { useEffect, useState } from "react";
import type { AgenteId, EstadoAgente } from "../tipos";
import { caminhoPersonagem } from "./cores";
import { aparenciaValida, modeloDoAgente, type AparenciaAgente } from "./personalizacao";

const fontes = new Map<string, Promise<string | null>>();

export function personalizarSvg(svg: string, aparencia: AparenciaAgente, agente: AgenteId): string {
  const valida = aparenciaValida(aparencia, agente);
  return svg.replace(/<use\b[^>]*\bhref="#s0"[^>]*>/g, (uso) => uso.replace(/\bfill="[^"]*"/, `fill="${valida.cor}"`));
}

function carregarSvg(caminho: string): Promise<string | null> {
  const existente = fontes.get(caminho);
  if (existente) return existente;
  const carregamento = fetch(caminho).then(async (resposta) => {
    if (!resposta.ok) throw new Error("arte_indisponivel");
    const svg = await resposta.text();
    if (!svg.includes('<path id="s0"') || !svg.includes("<svg")) throw new Error("arte_invalida");
    return svg;
  }).catch(() => { fontes.delete(caminho); return null; });
  fontes.set(caminho, carregamento);
  return carregamento;
}

export function usarArtePersonalizada(agente: AgenteId, estado: EstadoAgente, aparencia: AparenciaAgente, ativo: boolean): string | null {
  const caminho = caminhoPersonagem(modeloDoAgente(agente, aparencia.formato), estado);
  const [fonte, setFonte] = useState<{ caminho: string; svg: string } | null>(null);
  const [arte, setArte] = useState<{ agente: AgenteId; url: string } | null>(null);
  useEffect(() => {
    if (!ativo) return;
    let presente = true;
    void carregarSvg(caminho).then((svg) => { if (presente && svg) setFonte({ caminho, svg }); });
    return () => { presente = false; };
  }, [ativo, caminho]);
  useEffect(() => {
    if (!ativo || fonte?.caminho !== caminho) return;
    const svg = personalizarSvg(fonte.svg, { cor: aparencia.cor, formato: aparencia.formato }, agente);
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const imagem = new Image();
    let presente = true;
    let entregue = false;
    imagem.onload = () => {
      if (!presente) return;
      entregue = true;
      setArte({ agente, url });
    };
    imagem.onerror = () => URL.revokeObjectURL(url);
    imagem.src = url;
    return () => {
      presente = false;
      imagem.onload = null;
      imagem.onerror = null;
      if (!entregue) URL.revokeObjectURL(url);
    };
  }, [ativo, fonte, caminho, aparencia.cor, aparencia.formato, agente]);
  useEffect(() => () => { if (arte) URL.revokeObjectURL(arte.url); }, [arte]);
  return ativo && arte?.agente === agente ? arte.url : null;
}
