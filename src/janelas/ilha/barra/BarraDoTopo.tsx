import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronUp, LayoutGrid, ListTodo, Palette, SlidersHorizontal } from "lucide-react";
import { useConfig, type AbaIlha, type SecaoHoje } from "../../../estado/configuracoes";
import { funcaoLigada } from "../../../utilitarios/funcoes";
import { useRotina, tarefasDoDia } from "../../../estado/rotina";
import { useControleRapido, usarAudio, usarRede } from "../../../estado/controleRapido";
import { T } from "../../../textos/textos";
import { tocarSom } from "../../../ponte/sons";
import { usarCursorFora } from "../../../desktop/desktop";
import { hojeISO } from "../../../utilitarios/datas";
import { controle, type EstadoSistema } from "../../../ponte/ponteLocal";
import { PainelRapido } from "./PainelRapido";
import { Bandeja } from "./Bandeja";
import { Personalizacao } from "./Personalizacao";
import { criarAlternadorDoIniciar } from "./acoesDaBarra";
import { useIlha } from "../../../estado/ilha";
import { BateriaDesenhada, IconeDeRede, IconeDeVolume, situacaoDaRede, wifiLigado } from "./IconesDeStatus";
import { atributosDoFundo, variaveisDaBorda } from "../../aparencia";
import type { AparenciaDeBorda } from "../../../utilitarios/cores";
import "./barra.css";

export const ALTURA_DA_FAIXA = 5;
const ALTURA_DA_ABA = 30;
const RAIO_DAS_ORELHAS = 10;
const PASSO_DA_RODA = 2;
const MARGEM_DOS_POPS = 6;
const INTERVALO_LEITURA_INICIAR_MS = 400;

type Pop = { tipo: "painel" } | { tipo: "personalizar" } | { tipo: "bandeja"; direita: number } | null;

interface PropsBarra {
  visivel: boolean;
  escala: number;
  larguraDaIlha: number;
  aparencia: AparenciaDeBorda;
  aoAbrirAba: (aba: AbaIlha, secao?: SecaoHoje) => void;
  aoUsar: (emUso: boolean) => void;
}

function rotuloDaRede(rede: EstadoSistema) {
  const situacao = situacaoDaRede(rede);
  if (situacao === "cabo") return T.ilha.barra.cabo;
  if (situacao === "semInternet") return T.ilha.barra.semInternet;
  if (situacao === "desconectado") return T.ilha.barra.semConexao;
  if (!wifiLigado(rede)) return T.ilha.barra.wifiDesligado;
  return rede.wifi.conectado && rede.wifi.ssid ? T.ilha.barra.wifi(rede.wifi.ssid) : T.ilha.barra.wifiSemRede;
}

function LadoEsquerdo({ pop, alternarPersonalizacao, aoAbrirAba }: { pop: Pop; alternarPersonalizacao: () => void; aoAbrirAba: (aba: AbaIlha, secao?: SecaoHoje) => void }) {
  const estadoIlha = useIlha((s) => s.estado);
  const abaIlha = useIlha((s) => s.aba);
  const secaoHoje = useIlha((s) => s.secaoHoje);
  const tarefasAbertas = estadoIlha === "expandida" && abaIlha === "hoje" && secaoHoje === "tarefas";
  const iniciar = useRef(criarAlternadorDoIniciar(controle.iniciar, controle.alternarIniciar));
  const relogioIniciar = useRef<number | undefined>(undefined);
  const [iniciarOcupado, setIniciarOcupado] = useState(false);
  useEffect(() => () => window.clearInterval(relogioIniciar.current), []);
  const prepararIniciar = () => {
    iniciar.current.preparar();
    window.clearInterval(relogioIniciar.current);
    relogioIniciar.current = window.setInterval(() => iniciar.current.preparar(), INTERVALO_LEITURA_INICIAR_MS);
  };
  const tarefas = useRotina((s) => s.tarefas);
  const comTarefas = useConfig((s) => funcaoLigada("journal", s.funcoesDesligadas));
  const doDia = tarefasDoDia(tarefas, hojeISO()).filter((t) => t.status !== "cancelada");
  const feitas = doDia.filter((t) => t.status === "concluida").length;
  const rotuloTarefas = doDia.length ? T.ilha.barra.tarefasHojeDica(feitas, doDia.length) : T.ilha.barra.semTarefas;

  return (
    <div className="ilha-barra-lado">
      <button
        type="button"
        className="ilha-barra-botao"
        data-ativo={pop?.tipo === "personalizar" || undefined}
        aria-label={T.ilha.barra.personalizar}
        aria-expanded={pop?.tipo === "personalizar"}
        title={T.ilha.barra.personalizar}
        onClick={alternarPersonalizacao}
      >
        <Palette size={14} />
      </button>
      <button
        type="button"
        className="ilha-barra-botao"
        aria-label={T.ilha.barra.iniciar}
        title={T.ilha.barra.iniciar}
        aria-busy={iniciarOcupado}
        onPointerEnter={prepararIniciar}
        onPointerLeave={() => {
          window.clearInterval(relogioIniciar.current);
          iniciar.current.limpar();
        }}
        onFocus={() => iniciar.current.preparar()}
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => {
          if (iniciarOcupado) return;
          void tocarSom("blip");
          setIniciarOcupado(true);
          void iniciar.current.alternar().catch(() => useIlha.getState().avisarFalha(T.ilha.barra.indisponivel)).finally(() => setIniciarOcupado(false));
        }}
      >
        <LayoutGrid size={14} />
      </button>
      {comTarefas && (
        <button type="button" className="ilha-barra-botao ilha-barra-texto" title={rotuloTarefas} aria-label={rotuloTarefas} aria-expanded={tarefasAbertas} data-ativo={tarefasAbertas || undefined} onClick={() => aoAbrirAba("hoje", "tarefas")}>
          <ListTodo size={13} />
          <span className="numero">{doDia.length ? T.ilha.barra.tarefasHoje(feitas, doDia.length) : "0"}</span>
        </button>
      )}
    </div>
  );
}
function LadoDireito({ pop, alternarPainel, alternarBandeja }: { pop: Pop; alternarPainel: () => void; alternarBandeja: (botao: HTMLElement) => void }) {
  const saida = useControleRapido((s) => s.audio?.saida ?? null);
  const rede = useControleRapido((s) => s.rede);
  const definirVolume = useControleRapido((s) => s.definirVolume);
  const icones = useConfig((s) => s.ilha.iconesDaBarra);
  const bateria = icones.bateria ? (rede?.bateria ?? null) : null;
  const mostrarRede = icones.rede && rede;
  const mostrarVolume = icones.volume && saida;

  return (
    <div className="ilha-barra-lado ilha-barra-lado-direito">
      <button
        type="button"
        className="ilha-barra-botao"
        data-ativo={pop?.tipo === "bandeja" || undefined}
        aria-label={T.ilha.barra.bandeja}
        aria-expanded={pop?.tipo === "bandeja"}
        title={T.ilha.barra.bandeja}
        onClick={(e) => alternarBandeja(e.currentTarget)}
      >
        <ChevronUp size={14} className="ilha-barra-chevron" />
      </button>
      <button type="button" className="ilha-barra-botao ilha-barra-status" data-ativo={pop?.tipo === "painel" || undefined} aria-label={T.ilha.barra.painel} aria-expanded={pop?.tipo === "painel"} title={T.ilha.barra.painel} onClick={alternarPainel}>
        {mostrarRede && (
          <span className="ilha-barra-indicador" title={rotuloDaRede(rede)} data-alerta={situacaoDaRede(rede) === "semInternet" || undefined}>
            <IconeDeRede rede={rede} tamanho={14} />
          </span>
        )}
        {mostrarVolume && (
          <span
            className="ilha-barra-indicador"
            title={`${saida.mudo ? T.ilha.barra.volumeMudo : T.ilha.barra.volume(saida.volume)}. ${T.ilha.barra.rolarParaVolume}`}
            onWheel={(e) => definirVolume("saida", Math.max(0, Math.min(100, saida.volume + (e.deltaY < 0 ? PASSO_DA_RODA : -PASSO_DA_RODA))))}
          >
            <IconeDeVolume volume={saida.volume} mudo={saida.mudo} tamanho={14} />
          </span>
        )}
        {bateria && (
          <span className="ilha-barra-indicador ilha-barra-bateria" title={T.ilha.barra.bateria(bateria.nivel, bateria.carregando)}>
            <span className="ilha-barra-valor">{bateria.nivel}%</span>
            <BateriaDesenhada nivel={bateria.nivel} carregando={bateria.carregando} />
          </span>
        )}
        {!mostrarRede && !mostrarVolume && !bateria && <SlidersHorizontal size={13} />}
      </button>
    </div>
  );
}

export function BarraDoTopo({ visivel, escala, larguraDaIlha, aparencia, aoAbrirAba, aoUsar }: PropsBarra) {
  const [pop, setPop] = useState<Pop>(null);
  const [sobre, setSobre] = useState(false);
  const playerAberto = useIlha((s) => s.estado === "expandida" && s.aba === "midia");
  usarAudio(visivel || playerAberto, pop?.tipo === "painel" ? 1000 : 3000);
  usarRede(visivel, pop?.tipo === "painel" ? 8000 : 30000);
  usarCursorFora(useCallback(() => setSobre(false), []));

  useEffect(() => {
    const { audio, rede, sincronizarAudio, sincronizarRede } = useControleRapido.getState();
    if (!audio) void sincronizarAudio();
    if (!rede) void sincronizarRede();
  }, []);

  useEffect(() => {
    if (!visivel) setPop(null);
  }, [visivel]);

  useEffect(() => aoUsar(sobre || pop !== null), [sobre, pop, aoUsar]);

  useEffect(() => {
    if (!pop) return;
    const fechar = () => setPop(null);
    const fecharSeNaoEscolhendoCor = () => {
      const ativo = document.activeElement;
      if (ativo instanceof HTMLInputElement && ativo.type === "color") return;
      fechar();
    };
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    const aoClicarFora = (e: PointerEvent) => {
      const alvo = e.target as Element | null;
      if (!alvo?.closest(".ilha-pop, .ilha-barra")) fechar();
    };
    window.addEventListener("keydown", aoTeclar);
    window.addEventListener("pointerdown", aoClicarFora, true);
    window.addEventListener("blur", fecharSeNaoEscolhendoCor);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("pointerdown", aoClicarFora, true);
      window.removeEventListener("blur", fecharSeNaoEscolhendoCor);
    };
  }, [pop]);

  const alternarPainel = () => {
    void tocarSom(pop?.tipo === "painel" ? "close" : "open");
    setPop((atual) => (atual?.tipo === "painel" ? null : { tipo: "painel" }));
  };

  const alternarPersonalizacao = () => {
    void tocarSom(pop?.tipo === "personalizar" ? "close" : "open");
    setPop((atual) => (atual?.tipo === "personalizar" ? null : { tipo: "personalizar" }));
  };

  const alternarBandeja = (botao: HTMLElement) => {
    void tocarSom(pop?.tipo === "bandeja" ? "close" : "open");
    const r = botao.getBoundingClientRect();
    const direita = Math.max(MARGEM_DOS_POPS, window.innerWidth - r.right - 40);
    setPop((atual) => (atual?.tipo === "bandeja" ? null : { tipo: "bandeja", direita }));
  };

  const altura = ALTURA_DA_ABA * escala;
  const topoDosPops = altura + MARGEM_DOS_POPS;
  const meiaIlha = Math.max(0, larguraDaIlha / 2 - 1);
  const recorteDaIlha = `linear-gradient(to right, #000 calc(50% - ${meiaIlha}px), transparent calc(50% - ${meiaIlha}px), transparent calc(50% + ${meiaIlha}px), #000 calc(50% + ${meiaIlha}px))`;
  const variaveis = variaveisDaBorda(aparencia);
  const aoEntrar = () => setSobre(true);
  const aoSair = () => setSobre(false);

  return (
    <>
      <AnimatePresence>
        {visivel && (
          <motion.div
            key="barra"
            className="ilha-barra"
            {...atributosDoFundo(aparencia)}
            style={{ ...variaveis, height: altura, ["--escala-barra" as string]: escala, ["--faixa" as string]: `${ALTURA_DA_FAIXA}px`, ["--raio-aba" as string]: `${RAIO_DAS_ORELHAS}px` }}
            initial={{ y: "-100%" }}
            animate={{ y: 0 }}
            exit={{ y: "-100%" }}
            transition={{ type: "spring", visualDuration: 0.35, bounce: 0.12 }}
          >
            <span className="ilha-barra-faixa" style={{ maskImage: recorteDaIlha, WebkitMaskImage: recorteDaIlha }} aria-hidden="true" />
            <div className="ilha-barra-aba ilha-barra-aba-esquerda" onPointerEnter={aoEntrar} onPointerLeave={aoSair}>
              <LadoEsquerdo
                pop={pop}
                alternarPersonalizacao={alternarPersonalizacao}
                aoAbrirAba={(aba, secao) => {
                  const ilha = useIlha.getState();
                  setPop(null);
                  void tocarSom(ilha.estado === "expandida" && ilha.aba === aba && (!secao || ilha.secaoHoje === secao) ? "close" : "open");
                  aoAbrirAba(aba, secao);
                }}
              />
            </div>
            <div className="ilha-barra-aba ilha-barra-aba-direita" onPointerEnter={aoEntrar} onPointerLeave={aoSair}>
              <LadoDireito pop={pop} alternarPainel={alternarPainel} alternarBandeja={alternarBandeja} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="ilha-pops" {...atributosDoFundo(aparencia)} style={variaveis}>
        <AnimatePresence>
          {visivel && pop?.tipo === "personalizar" && <Personalizacao key="personalizar" topo={topoDosPops} aoFechar={() => setPop(null)} />}
          {visivel && pop?.tipo === "painel" && <PainelRapido key="painel" topo={topoDosPops} aoFechar={() => setPop(null)} />}
          {visivel && pop?.tipo === "bandeja" && <Bandeja key="bandeja" topo={topoDosPops} direita={pop.direita} aoFechar={() => setPop(null)} />}
        </AnimatePresence>
      </div>
    </>
  );
}
