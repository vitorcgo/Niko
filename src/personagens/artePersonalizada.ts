import { useEffect, useMemo, useState } from "react";
import type { AgenteId, EstadoAgente } from "../tipos";
import { caminhoPersonagem } from "./cores";
import { aparenciaValida, modeloDoAgente, type AparenciaAgente } from "./personalizacao";
import { acessoriosValidos, SEM_ACESSORIOS, type AcessoriosAgente } from "./acessorios";
import { adicionarAcessorios, primeiroQuadroSvg } from "./desenhosDosAcessorios";

const fontes = new Map<string, Promise<string | null>>();

export function personalizarSvg(svg: string, aparencia: AparenciaAgente, agente: AgenteId, acessorios: AcessoriosAgente = SEM_ACESSORIOS, corAcessorio: string | null = null): string {
  const valida = aparenciaValida(aparencia, agente);
  const colorido = svg.replace(/<use\b[^>]*\bhref="#s0"[^>]*>/g, (uso) => uso.replace(/\bfill="[^"]*"/, `fill="${valida.cor}"`));
  return adicionarAcessorios(colorido, acessoriosValidos(acessorios), modeloDoAgente(agente, valida.formato), corAcessorio);
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

export function usarArtePersonalizada(agente: AgenteId, estado: EstadoAgente, aparencia: AparenciaAgente, ativo: boolean, acessorios: AcessoriosAgente = SEM_ACESSORIOS, reduzirAnimacoes = false, corAcessorio: string | null = null): string | null {
  const caminho = caminhoPersonagem(modeloDoAgente(agente, aparencia.formato), estado);
  const [fonte, setFonte] = useState<{ caminho: string; svg: string } | null>(null);
  const selecao = JSON.stringify(acessoriosValidos(acessorios));
  useEffect(() => {
    if (!ativo) return;
    let presente = true;
    void carregarSvg(caminho).then((svg) => { if (presente && svg) setFonte({ caminho, svg }); });
    return () => { presente = false; };
  }, [ativo, caminho]);
  return useMemo(() => {
    if (!ativo || !fonte || fonte.caminho.split("/").slice(0, -1).join("/") !== caminho.split("/").slice(0, -1).join("/")) return null;
    const quadro = reduzirAnimacoes ? primeiroQuadroSvg(fonte.svg) : fonte.svg;
    const svg = personalizarSvg(quadro, aparencia, agente, JSON.parse(selecao) as AcessoriosAgente, corAcessorio);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, [ativo, fonte, caminho, aparencia.cor, aparencia.formato, agente, selecao, reduzirAnimacoes, corAcessorio]);
}
