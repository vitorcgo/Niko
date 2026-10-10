import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Sun, Moon, PanelLeftClose, PanelLeftOpen, Check, Settings, ChevronDown } from "lucide-react";
import { useConfig, GRUPO_DA_ROTA } from "../../estado/configuracoes";
import { useInterface } from "../../estado/interface";
import { useRotina, tarefasDoDia } from "../../estado/rotina";
import { useEstudos, revisoesParaHoje } from "../../estado/estudos";
import { useAgentes } from "../../estado/agentes";
import { useOrganizacao } from "../../estado/organizacao";
import { T } from "../../textos/textos";
import { ICONE_ROTA } from "./rotas";
import { LogoNiko } from "../../componentes/LogoNiko";
import { Avatar } from "../../componentes/FotoPerfil";
import { hojeISO } from "../../utilitarios/datas";
import type { Rota } from "../../tipos";
import { funcaoLigada, rotaLigada } from "../../utilitarios/funcoes";
import { mudarTema } from "../area-de-trabalho/mudarTema";

function useContadores(): Partial<Record<Rota, { n: number; alerta?: boolean }>> {
  const hoje = hojeISO();
  const tarefas = useRotina((s) => tarefasDoDia(s.tarefas, hoje).filter((t) => t.status !== "concluida" && t.status !== "cancelada").length);
  const revisoes = useEstudos((s) => revisoesParaHoje(s));
  const falhas = useAgentes((s) => s.alertas.filter((a) => a.servico).length);
  const eventos = useOrganizacao((s) => s.eventos.filter((e) => e.data === hoje).length);
  return {
    journal: { n: tarefas },
    estudos: { n: revisoes },
    conexoes: { n: falhas, alerta: true },
    calendario: { n: eventos },
  };
}

interface Caixa {
  l: number;
  t: number;
  w: number;
  h: number;
  r: number;
  tr: string;
}

const BOLA = 10;

function mesmaCaixa(a: Caixa, b: Caixa) {
  return a.l === b.l && a.t === b.t && a.w === b.w && a.h === b.h;
}

function usarIndicador(rota: Rota, recolhida: boolean) {
  const rolagem = useRef<HTMLDivElement>(null);
  const [caixa, setCaixa] = useState<Caixa | null>(null);
  const atual = useRef<Caixa | null>(null);
  const rotaDoIndicador = useRef<Rota | null>(null);
  const rotaViva = useRef(rota);
  const recolhidaViva = useRef(recolhida);
  const animando = useRef(false);
  const relogios = useRef<number[]>([]);
  rotaViva.current = rota;
  recolhidaViva.current = recolhida;

  const definir = useCallback((c: Caixa | null) => {
    atual.current = c;
    setCaixa(c);
  }, []);

  const posicionar = useCallback(() => {
    const nav = rolagem.current;
    if (!nav) return;
    const botao = nav.querySelector<HTMLElement>('.barra-item[aria-current="page"]');
    if (!botao) {
      if (atual.current) definir(null);
      rotaDoIndicador.current = null;
      return;
    }
    const alvo: Caixa = { l: botao.offsetLeft, t: botao.offsetTop, w: botao.offsetWidth, h: botao.offsetHeight, r: 8, tr: "none" };
    const antes = atual.current;
    if (rotaDoIndicador.current && rotaDoIndicador.current !== rotaViva.current && antes) {
      rotaDoIndicador.current = rotaViva.current;
      animar(antes, alvo, nav.clientWidth);
      return;
    }
    rotaDoIndicador.current = rotaViva.current;
    if (animando.current) return;
    if (!antes || !mesmaCaixa(antes, alvo)) definir(alvo);
  }, [definir]);

  const animar = (o: Caixa, alvo: Caixa, largura: number) => {
    relogios.current.forEach(clearTimeout);
    animando.current = true;
    const bola = (x: Caixa): Caixa => ({ l: Math.round(x.l + x.w / 2 - BOLA / 2), t: Math.round(x.t + x.h / 2 - BOLA / 2), w: BOLA, h: BOLA, r: BOLA / 2, tr: "" });
    const distancia = Math.abs(alvo.t - o.t) + Math.abs(alvo.l - o.l);
    const duracao = Math.round(Math.min(640, Math.max(320, distancia * 1.2)));
    const meio = Math.round(duracao / 2);
    const inicio = bola(o);
    const fim = bola(alvo);
    const cx = (inicio.l + fim.l) / 2;
    const folga = Math.max(0, Math.min(largura - BOLA - 4 - cx, cx - 4));
    const arco = Math.round(Math.min(folga, 18 + distancia * 0.28));
    const lado = cx + arco <= largura - BOLA - 4 ? 1 : -1;
    const fechada = recolhidaViva.current;
    let pico: Caixa = { l: Math.round(cx + lado * arco), t: Math.round((inicio.t + fim.t) / 2), w: BOLA, h: BOLA, r: BOLA / 2, tr: "" };
    if (fechada) {
      const estica = Math.round(Math.min(46, 14 + Math.abs(alvo.t - o.t) * 0.22));
      const fina = 7;
      pico = { l: Math.round(cx + lado * Math.min(arco, 6) + (BOLA - fina) / 2), t: Math.round((inicio.t + fim.t) / 2 + BOLA / 2 - estica / 2), w: fina, h: estica, r: fina / 2, tr: "" };
    }
    const forma = fechada ? `${meio}ms` : "0.2s";
    const transicao = (ms: number, curvaX: string, curvaY: string) =>
      `left ${ms}ms ${curvaX}, top ${ms}ms ${curvaY}, width ${forma} ${curvaY}, height ${forma} ${curvaY}, border-radius 0.2s`;
    definir({ ...inicio, tr: "all 0.18s cubic-bezier(0.4, 0, 0.2, 1)" });
    relogios.current = [
      window.setTimeout(() => definir({ ...pico, tr: transicao(meio, "cubic-bezier(0.2, 0.7, 0.3, 1)", "cubic-bezier(0.5, 0, 0.75, 0.4)") }), 180),
      window.setTimeout(() => definir({ ...fim, tr: transicao(meio, "cubic-bezier(0.6, 0, 0.8, 0.3)", "cubic-bezier(0.25, 0.6, 0.5, 1)") }), 180 + meio),
      window.setTimeout(() => definir({ ...alvo, tr: "all 0.28s cubic-bezier(0.34, 1.4, 0.5, 1)" }), 180 + duracao),
      window.setTimeout(() => {
        animando.current = false;
        posicionar();
      }, 180 + duracao + 300),
    ];
  };

  useLayoutEffect(() => {
    posicionar();
  });

  useEffect(() => {
    const t = [120, 240].map((ms) => window.setTimeout(posicionar, ms));
    return () => t.forEach(clearTimeout);
  }, [recolhida, posicionar]);

  useEffect(() => {
    const nav = rolagem.current;
    if (!nav) return;
    const obs = new ResizeObserver(() => posicionar());
    obs.observe(nav);
    void document.fonts?.ready.then(() => posicionar());
    const ativos = relogios;
    return () => {
      obs.disconnect();
      ativos.current.forEach(clearTimeout);
    };
  }, [posicionar]);

  return { rolagem, caixa };
}

export function BarraLateral({ recolhida }: { recolhida: boolean }) {
  const barra = useConfig((s) => s.barraLateral);
  const tema = useConfig((s) => s.tema);
  const nome = useConfig((s) => s.nome);
  const fechados = useConfig((s) => s.gruposFechados);
  const definir = useConfig((s) => s.definir);
  const recolhidaManual = useConfig((s) => s.barraRecolhida);
  const rota = useInterface((s) => s.rota);
  const irPara = useInterface((s) => s.irPara);
  const tarefas = useRotina((s) => s.tarefas);
  const mudarStatus = useRotina((s) => s.mudarStatus);
  const contadores = useContadores();
  const { rolagem, caixa } = usarIndicador(rota, recolhida);
  const [fade, setFade] = useState({ topo: false, base: false });
  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const hoje = tarefasDoDia(tarefas, hojeISO()).filter((t) => t.status !== "cancelada").slice(0, 5);
  const visiveis = barra.filter((i) => i.visivel && rotaLigada(i.rota, desligadas));
  const mostrarHoje = funcaoLigada("journal", desligadas);

  useEffect(() => {
    const el = rolagem.current;
    if (!el) return;
    const medir = () => setFade({ topo: el.scrollTop > 4, base: el.scrollTop + el.clientHeight < el.scrollHeight - 4 });
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => {
      el.removeEventListener("scroll", medir);
      obs.disconnect();
    };
  }, [recolhida, fechados.length, rolagem]);

  const grupos = (["principal", "organizacao", "ferramentas"] as const).map((g) => ({
    grupo: g,
    itens: visiveis.filter((i) => GRUPO_DA_ROTA[i.rota] === g && i.rota !== "configuracoes"),
  }));

  const alternarGrupo = (g: string) => definir({ gruposFechados: fechados.includes(g) ? fechados.filter((x) => x !== g) : [...fechados, g] });

  const item = (r: Rota, nomeItem?: string) => {
    const Icone = ICONE_ROTA[r];
    const ativo = rota === r;
    const rotulo = nomeItem || T.rotas[r];
    const posicao = visiveis.findIndex((v) => v.rota === r) + 1;
    const contador = contadores[r];
    const atalho = posicao > 0 && posicao <= 9 ? ` (Ctrl + ${posicao})` : "";
    return (
      <button key={r} type="button" className="barra-item" aria-current={ativo ? "page" : undefined} title={`${rotulo}${atalho}`} onClick={() => irPara(r)}>
        <Icone size={16} />
        {!recolhida && <span className="cortar">{rotulo}</span>}
        {contador && contador.n > 0 && <span className={`barra-contador ${contador.alerta ? "barra-contador-alerta" : ""}`} aria-label={String(contador.n)}>{recolhida ? "" : contador.n}</span>}
      </button>
    );
  };

  const sistemaEscuro = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const escuroAgora = tema === "escuro" || (tema === "sistema" && sistemaEscuro);
  const hojeFechado = fechados.includes("hoje");
  const rotuloTema = escuroAgora ? T.barraLateral.temaClaro : T.barraLateral.temaEscuro;
  const emAjustes = rota === "configuracoes";

  return (
    <nav className={`barra-lateral ${recolhida ? "barra-recolhida" : ""}`} aria-label={T.barraLateral.navegacao}>
      <div className="barra-topo">
        <LogoNiko tamanho={26} />
        {!recolhida && <span className="barra-marca">{T.app.nome}</span>}
        {!recolhida && (
          <button type="button" className="botao botao-fantasma botao-pequeno botao-icone empurrar" aria-label={T.barraLateral.recolher} title={`${T.barraLateral.recolher} (Ctrl + B)`} onClick={() => definir({ barraRecolhida: !recolhidaManual })}>
            <PanelLeftClose size={15} />
          </button>
        )}
      </div>
      {recolhida && (
        <button type="button" className="barra-icone barra-icone-largo" aria-label={T.barraLateral.expandir} title={`${T.barraLateral.expandir} (Ctrl + B)`} onClick={() => definir({ barraRecolhida: false })}>
          <PanelLeftOpen size={16} />
        </button>
      )}
      <div ref={rolagem} className="barra-rolagem" data-fade-topo={fade.topo ? "sim" : "nao"} data-fade-base={fade.base ? "sim" : "nao"}>
        <span
          className="barra-indicador"
          aria-hidden="true"
          style={caixa ? { left: caixa.l, top: caixa.t, width: caixa.w, height: caixa.h, borderRadius: caixa.r, transition: caixa.tr, opacity: 1 } : { left: 0, top: 0, width: 0, height: 0, opacity: 0 }}
        />
        {grupos.map(({ grupo, itens }) => {
          if (itens.length === 0) return null;
          const fechado = !recolhida && fechados.includes(grupo) && !itens.some((i) => i.rota === rota);
          return (
            <div key={grupo} className="barra-grupo">
              {!recolhida && (
                <button type="button" className="barra-rotulo" aria-expanded={!fechado} onClick={() => alternarGrupo(grupo)}>
                  <span className="rotulo-secao">{T.gruposBarra[grupo]}</span>
                  <ChevronDown size={12} className="barra-rotulo-seta" />
                </button>
              )}
              {!fechado && itens.map((i) => item(i.rota, i.nome))}
            </div>
          );
        })}
        {!recolhida && mostrarHoje && (
          <div className="barra-grupo">
            <button type="button" className="barra-rotulo" aria-expanded={!hojeFechado} onClick={() => alternarGrupo("hoje")}>
              <span className="rotulo-secao">{T.gruposBarra.hoje}</span>
              <ChevronDown size={12} className="barra-rotulo-seta" />
            </button>
            {!hojeFechado &&
              (hoje.length === 0 ? (
                <span className="barra-hoje-vazio">{T.barraLateral.semTarefasHoje}</span>
              ) : (
                hoje.map((t) => {
                  const feita = t.status === "concluida";
                  return (
                    <div key={t.id} className="barra-hoje">
                      <button type="button" role="checkbox" aria-checked={feita} aria-label={feita ? T.geral.reabrir : T.geral.concluir} onClick={() => mudarStatus(t.id, feita ? "a_fazer" : "concluida")} className="marcador marcador-pequeno">
                        <Check />
                      </button>
                      <span className={`cortar ${feita ? "riscado" : ""}`}>{t.titulo}</span>
                      {t.hora && <span className="texto-3 numero empurrar">{t.hora}</span>}
                    </div>
                  );
                })
              ))}
          </div>
        )}
      </div>
      <div className="barra-base">
        <div className="barra-base-linha">
          <button type="button" className="barra-perfil" title={T.perfil.abrirPerfil} onClick={() => irPara("configuracoes", { secao: "geral" })}>
            <Avatar tamanho={28} />
            {!recolhida && <span className="cortar">{nome || T.barraLateral.perfil}</span>}
          </button>
          {!recolhida && (
            <>
              <button type="button" className="barra-icone" role="switch" aria-checked={escuroAgora} aria-label={rotuloTema} title={rotuloTema} onClick={(evento) => mudarTema(escuroAgora ? "claro" : "escuro", evento.currentTarget)}>
                {escuroAgora ? <Moon size={15} /> : <Sun size={15} />}
              </button>
              <button type="button" className="barra-icone" aria-current={emAjustes ? "page" : undefined} aria-label={T.rotas.configuracoes} title={T.rotas.configuracoes} onClick={() => irPara("configuracoes")}>
                <Settings size={15} />
              </button>
            </>
          )}
        </div>
        {recolhida && (
          <>
            <button type="button" className="barra-icone barra-icone-largo" role="switch" aria-checked={escuroAgora} aria-label={rotuloTema} title={rotuloTema} onClick={(evento) => mudarTema(escuroAgora ? "claro" : "escuro", evento.currentTarget)}>
              {escuroAgora ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <button type="button" className="barra-icone barra-icone-largo" aria-current={emAjustes ? "page" : undefined} aria-label={T.rotas.configuracoes} title={T.rotas.configuracoes} onClick={() => irPara("configuracoes")}>
              <Settings size={16} />
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
