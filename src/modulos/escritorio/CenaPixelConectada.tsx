import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Maximize, Footprints, LocateFixed, Building2, Map } from "lucide-react";
import type { OfficeSnapshot } from "./motor/shared/types";
import type { DaylightMode } from "./motor/client/src/world/api";
import type { EstiloDoPersonagem } from "./aparenciaDoEscritorio";
import { criarMundoDoEscritorio } from "./mundoDoEscritorio";
import { T } from "../../textos/textos";

export function CenaPixelConectada({ snapshot, ciclo, estilo, seguir, selecionada, demonstracao, aoSelecionar, aoInteragir, ativa = true }: {
  snapshot: OfficeSnapshot; ciclo: DaylightMode; estilo: EstiloDoPersonagem; seguir: boolean; selecionada?: string; demonstracao: boolean; aoSelecionar: (id: string) => void;
  aoInteragir?: () => void;
  ativa?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const mundo = useRef<ReturnType<typeof criarMundoDoEscritorio> | null>(null);
  const selecionar = useRef(aoSelecionar); selecionar.current = aoSelecionar;
  const interagir = useRef(aoInteragir); interagir.current = aoInteragir;
  const palco = useRef<HTMLDivElement>(null);
  const [falhou, setFalhou] = useState(false);
  const [erroTelaCheia, setErroTelaCheia] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const E = T.escritorio.ias;
  useEffect(() => {
    if (!canvas.current) return;
    try { mundo.current = criarMundoDoEscritorio(canvas.current, (id) => selecionar.current(id), () => setFalhou(true), () => interagir.current?.()); }
    catch { setFalhou(true); }
    return () => { mundo.current?.destruir(); mundo.current = null; };
  }, [tentativa]);
  useEffect(() => { mundo.current?.aplicar(snapshot); }, [snapshot, tentativa]);
  useEffect(() => { mundo.current?.opcoes({ daylight: ciclo, followSelected: seguir }, estilo); }, [ciclo, estilo, seguir, tentativa]);
  useEffect(() => { mundo.current?.selecionar(selecionada); }, [selecionada, tentativa]);
  useEffect(() => { mundo.current?.visibilidade(ativa); }, [ativa, tentativa]);
  return <div ref={palco} className="ei-mundo">
    <header className="ei-mundo-topo"><span><Building2 size={14} />{E.ambiente}</span>
    <div className="ei-camera" role="group" aria-label={E.camera}>
      <button type="button" onClick={() => mundo.current?.aproximar(-1)} aria-label={E.afastar}><Minus size={16} /></button>
      <button type="button" onClick={() => mundo.current?.aproximar(1)} aria-label={E.aproximar}><Plus size={16} /></button>
      <button type="button" onClick={() => mundo.current?.enquadrar()} aria-label={E.enquadrar}><Building2 size={16} /></button>
      <button type="button" onClick={() => mundo.current?.enquadrar(true)} aria-label={E.verCidade}><Map size={16} /></button>
      <button type="button" disabled={!selecionada} onClick={() => selecionada && mundo.current?.foco(selecionada)} aria-label={E.localizar}><LocateFixed size={16} /></button>
      <button type="button" onClick={() => { setErroTelaCheia(false); const pedido = document.fullscreenElement ? document.exitFullscreen?.() : palco.current?.requestFullscreen?.(); if (!pedido) setErroTelaCheia(true); else void pedido.catch(() => setErroTelaCheia(true)); }} aria-label={E.telaCheia}><Maximize size={16} /></button>
      {demonstracao && <button type="button" onClick={() => mundo.current?.passear()}><Footprints size={16} />{E.passearDemo}</button>}
    </div></header>
    <canvas ref={canvas} className="ei-mundo-canvas" tabIndex={0} aria-label={E.mapaDica} />
    {falhou && <div className="ei-mundo-erro" role="alert"><p>{E.erroCena}</p><button type="button" className="ei-botao" onClick={() => { setFalhou(false); setTentativa((n) => n + 1); }}>{E.tentarNovamente}</button></div>}
    {erroTelaCheia && <p className="ei-mundo-erro" role="alert">{E.erroTelaCheia}</p>}
    <span className="ei-mapa-dica">{E.mapaDica}</span>
  </div>;
}
