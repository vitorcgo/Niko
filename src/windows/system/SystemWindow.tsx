import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useInterface, type Geometry } from "../../state/interface";
import { useConfig } from "../../state/settings";
import { WindowValue, areaUtil } from "../Window";
import { Sidebar } from "./Sidebar";
import { PAGE_ROUTE, ICON_ROUTE } from "./routes";
import { T } from "../../i18n/ptBR";
import { NoticesFooter } from "../../components/basics";
import { playSound } from "../../bridge/sounds";
import { NATIVE, windowCurrent } from "../../desktop/desktop";
import { routeEnabled } from "../../utils/features";

const MINIMUM = { w: 960, h: 600 };

function geometryDefault(): Geometry {
  const area = areaUtil();
  const w = Math.max(Math.min(1560, area.w - 32), Math.min(960, area.w));
  const h = Math.max(area.h - 56, Math.min(600, area.h));
  return { x: Math.round((area.w - w) / 2), y: Math.min(44, Math.max(0, area.h - h)), w, h };
}

export function SystemWindow() {
  const routeRequested = useInterface((s) => s.rota);
  const disabled = useConfig((s) => s.funcoesDesligadas);
  const route = routeEnabled(routeRequested, disabled) ? routeRequested : "inicio";
  const historyValue = useInterface((s) => s.historico);
  const back = useInterface((s) => s.back);
  const geometrySalva = useInterface((s) => s.geometria);
  const maximized = useInterface((s) => s.sistemaMaximizado);
  const setSystem = useInterface((s) => s.setSystem);
  const z = useInterface((s) => s.zSistema);
  const focusValue = useInterface((s) => s.focusSystem);
  const collapsedManual = useConfig((s) => s.barraRecolhida);
  const content = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1280);

  const geometry = geometrySalva.w > 0 ? geometrySalva : geometryDefault();

  useEffect(() => {
    const el = content.current?.parentElement;
    if (!el) return;
    const observer = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    content.current?.scrollTo({ top: 0 });
  }, [route]);

  const onChangeGeometry = useCallback((g: Geometry) => setSystem({ geometria: g }), [setSystem]);

  const Page = PAGE_ROUTE[route];
  const Icon = ICON_ROUTE[route];
  const collapsed = collapsedManual || width < 1100;

  return (
    <WindowValue
      titulo={
        <span className="linha">
          <Icon size={14} />
          {T.rotas[route]}
        </span>
      }
      rotuloAcessivel={T.app.nome}
      geometria={geometry}
      maximizada={maximized}
      z={z}
      minimo={MINIMUM}
      idCamada="camada-sistema"
      nativa={NATIVE}
      inicioBarra={
        <button
          type="button"
          className="janela-controle"
          aria-label={T.janela.voltar}
          title={T.janela.voltar}
          disabled={historyValue.length === 0}
          onClick={back}
        >
          <ArrowLeft size={14} />
        </button>
      }
      aoFocar={focusValue}
      aoFechar={() => {
        void playSound("close");
        if (NATIVE) void windowCurrent().then((j) => j.hide());
        else setSystem({ sistemaAberto: false, sistemaMaximizado: false });
      }}
      aoMinimizar={() => setSystem({ sistemaMinimizado: true })}
      aoMaximizar={() => setSystem({ sistemaMaximizado: !maximized })}
      aoMudarGeometria={onChangeGeometry}
    >
      <div className="sistema">
        <Sidebar recolhida={collapsed} />
        <main className="sistema-conteudo" ref={content}>
          <Suspense fallback={<div className="carregando-pagina" aria-busy="true" />}>
            <div className="pagina" key={route}>
              <Page />
            </div>
          </Suspense>
        </main>
      </div>
      <NoticesFooter />
    </WindowValue>
  );
}
