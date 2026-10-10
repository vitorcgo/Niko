import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useInterface, type Geometria } from "../../estado/interface";
import { useConfig, GRUPO_DA_ROTA } from "../../estado/configuracoes";
import { Janela, areaUtil } from "../Janela";
import { BarraLateral } from "./BarraLateral";
import { PAGINA_ROTA } from "./rotas";
import { numeroDaRota } from "../../componentes/CabecalhoAba";
import { T } from "../../textos/textos";
import { AvisosRodape } from "../../componentes/basicos";
import { tocarSom } from "../../ponte/sons";
import { NATIVO, janelaAtual } from "../../desktop/desktop";
import { rotaLigada } from "../../utilitarios/funcoes";
import { LimiteDeErro } from "../../componentes/LimiteDeErro";

const MINIMO = { w: 960, h: 600 };

function geometriaPadrao(): Geometria {
  const area = areaUtil();
  const w = Math.max(Math.min(1560, area.w - 32), Math.min(960, area.w));
  const h = Math.max(area.h - 56, Math.min(600, area.h));
  return { x: Math.round((area.w - w) / 2), y: Math.min(44, Math.max(0, area.h - h)), w, h };
}

export function JanelaSistema() {
  const rotaPedida = useInterface((s) => s.rota);
  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const rota = rotaLigada(rotaPedida, desligadas) ? rotaPedida : "inicio";
  const historico = useInterface((s) => s.historico);
  const voltar = useInterface((s) => s.voltar);
  const geometriaSalva = useInterface((s) => s.geometria);
  const maximizada = useInterface((s) => s.sistemaMaximizado);
  const definirSistema = useInterface((s) => s.definirSistema);
  const z = useInterface((s) => s.zSistema);
  const focar = useInterface((s) => s.focarSistema);
  const recolhidaManual = useConfig((s) => s.barraRecolhida);
  const conteudo = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(1280);

  const geometria = geometriaSalva.w > 0 ? geometriaSalva : geometriaPadrao();

  useEffect(() => {
    const el = conteudo.current?.parentElement;
    if (!el) return;
    const observador = new ResizeObserver(([e]) => setLargura(e.contentRect.width));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    conteudo.current?.scrollTo({ top: 0 });
  }, [rota]);

  const aoMudarGeometria = useCallback((g: Geometria) => definirSistema({ geometria: g }), [definirSistema]);

  const Pagina = PAGINA_ROTA[rota];
  const recolhida = recolhidaManual || largura < 1100;

  return (
    <Janela
      className="estilo-sistema"
      titulo={
        <span className="migalha">
          <span className="migalha-app">{T.app.nome}</span>
          <span className="migalha-ponto" aria-hidden="true" />
          <span>{T.gruposBarra[GRUPO_DA_ROTA[rota]]}</span>
          <span className="migalha-barra" aria-hidden="true">/</span>
          <span className="migalha-atual">
            {numeroDaRota(rota)} {T.rotas[rota]}
          </span>
        </span>
      }
      rotuloAcessivel={T.app.nome}
      geometria={geometria}
      maximizada={maximizada}
      z={z}
      minimo={MINIMO}
      idCamada="camada-sistema"
      nativa={NATIVO}
      inicioBarra={
        <button
          type="button"
          className="janela-controle"
          aria-label={T.janela.voltar}
          title={T.janela.voltar}
          disabled={historico.length === 0}
          onClick={voltar}
        >
          <ArrowLeft size={14} />
        </button>
      }
      aoFocar={focar}
      aoFechar={() => {
        void tocarSom("close");
        if (NATIVO) void janelaAtual().then((j) => j.hide());
        else definirSistema({ sistemaAberto: false, sistemaMaximizado: false });
      }}
      aoMinimizar={() => definirSistema({ sistemaMinimizado: true })}
      aoMaximizar={() => definirSistema({ sistemaMaximizado: !maximizada })}
      aoMudarGeometria={aoMudarGeometria}
    >
      <div className="sistema">
        <BarraLateral recolhida={recolhida} />
        <main className="sistema-conteudo" ref={conteudo}>
          <LimiteDeErro key={rota} aoVoltar={() => useInterface.getState().irPara("inicio")}>
            <Suspense fallback={<div className="carregando-pagina" aria-busy="true" />}>
              <div className="pagina" key={rota}>
                <Pagina />
              </div>
            </Suspense>
          </LimiteDeErro>
        </main>
      </div>
      <AvisosRodape />
    </Janela>
  );
}
