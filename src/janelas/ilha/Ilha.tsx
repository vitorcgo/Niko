import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ListTodo, Zap, Music, Timer, Repeat, CalendarDays, MessageCircle, Plug, Bell, Volume2, VolumeX, AppWindow, ChevronUp, Check, CircleAlert, Download, SquareTerminal, ShieldAlert, LoaderCircle,
  type LucideIcon,
} from "lucide-react";
import { useConfig, type AbaIlha } from "../../estado/configuracoes";
import { useIlha } from "../../estado/ilha";
import { useInterface } from "../../estado/interface";
import { useAgentes, AGENTES, estadoDoAgente, alertaFresco } from "../../estado/agentes";
import { usePomodoro, restanteAtual, formatarRelogio } from "../../estado/pomodoro";
import { useMidia, fundoDaCapa, midiaAtivaNaIlha } from "../../estado/midia";
import { Personagem } from "../../personagens/Personagem";
import { Marca } from "../../marcas/Marca";
import { Anel } from "../../componentes/Graficos";
import { T } from "../../textos/textos";
import { tocarSom } from "../../ponte/sons";
import {
  VisaoHoje, VisaoCaptura, VisaoMidia, VisaoFoco, VisaoHabitos, VisaoConexoes, VisaoCalendario, VisaoAvisos,
} from "./Visoes";
import { alguemCobre } from "../geometria";
import { VisaoChat } from "./VisaoChat";
import { VisaoClaude } from "./claude/VisaoClaude";
import { usarClaudeCode, devolverPendentesAoTerminal } from "./claude/usarClaudeCode";
import { abaLigada } from "../../utilitarios/funcoes";
import { useClaudeCode, sessaoAtiva } from "../../estado/claudeCode";
import { useAtualizacao } from "../../estado/atualizacao";
import { LINUX, NATIVO, dimensionarIlha, usarAreaInterativa, usarCursorFora, usarEstadoDaFrente } from "../../desktop/desktop";
import { BarraDoTopo, ALTURA_DA_FAIXA } from "./barra/BarraDoTopo";
import { alternarAbaDaBarra } from "./barra/acoesDaBarra";
import { EspacoDoPersonagem, PersonagemContinuo } from "./animacoes/PersonagemContinuo";
import { EtapaDeTrabalho, EtapasAnimadas } from "./animacoes/EtapasAnimadas";
import { usarAparenciaDeBorda, variaveisDaBorda } from "../aparencia";
import type { AgenteId, EstadoAgente } from "../../tipos";
import "./ilha.css";

const ICONE_ABA: Record<AbaIlha, LucideIcon> = {
  hoje: ListTodo,
  captura: Zap,
  midia: Music,
  foco: Timer,
  habitos: Repeat,
 chat: MessageCircle,
  conexoes: Plug,
  calendario: CalendarDays,
  avisos: Bell,
  claude: SquareTerminal,
};

const VISAO_ABA: Record<AbaIlha, () => React.JSX.Element> = {
  hoje: VisaoHoje,
  captura: VisaoCaptura,
  midia: VisaoMidia,
  foco: VisaoFoco,
  habitos: VisaoHabitos,
 chat: VisaoChat,
  conexoes: VisaoConexoes,
  calendario: VisaoCalendario,
  avisos: VisaoAvisos,
  claude: VisaoClaude,
};

const ALTURA_ABA: Record<AbaIlha, number> = {
  hoje: 250,
  captura: 168,
  midia: 184,
  foco: 176,
  habitos: 230,
 chat: 300,
  conexoes: 350,
  calendario: 286,
  avisos: 178,
  claude: 336,
};

const ESCALA = { pequena: 0.85, media: 1, grande: 1.15 };

function estadoCalmo(e: EstadoAgente): EstadoAgente {
  return e === "alerta" || e === "erro" ? "ocioso" : e;
}
const LARGURA_EXPANDIDA = 660;
const ALTURA_COMPACTA = 30;
const AGENTE_DA_ABA: Partial<Record<AbaIlha, AgenteId>> = { hoje: "organizador", foco: "tutor", conexoes: "java", claude: "java" };
const RODIZIO_MS = 8 * 60_000;
const ABAS_SEM_LATERAL: AbaIlha[] = ["chat", "midia"];
const ABAS_LOCAIS: AbaIlha[] = ["hoje", "captura", "midia", "foco", "habitos", "calendario", "avisos", "conexoes"];

function agenteDoRodizio(favorito: AgenteId, agora: number): AgenteId {
  const ordem: AgenteId[] = [favorito, ...AGENTES.filter((a) => a !== favorito)];
  return ordem[Math.floor(agora / RODIZIO_MS) % ordem.length];
}
const MOLA = { type: "spring" as const, visualDuration: 0.5, bounce: 0.2 };
const FECHAR = { duration: 0.34, ease: [0.45, 0, 0.2, 1] as [number, number, number, number] };

function useAgora(intervalo: number, ativo: boolean) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    if (!ativo) return;
    setAgora(Date.now());
    const t = window.setInterval(() => setAgora(Date.now()), intervalo);
    return () => window.clearInterval(t);
  }, [intervalo, ativo]);
  return agora;
}

export function Ilha() {
  const cfg = useConfig((s) => s.ilha);
  const somLigado = useConfig((s) => s.sons.ligado);
  const definirConfig = useConfig((s) => s.definir);
  const sons = useConfig((s) => s.sons);
  const favorito = useConfig((s) => s.agentes.favorito);
  const nomes = useConfig((s) => s.agentes.nomes);
  const cargos = useConfig((s) => s.agentes.cargos);
  const privacidade = useConfig((s) => s.privacidade);
  const estado = useIlha((s) => s.estado);
  const aba = useIlha((s) => s.aba);
  const revelacao = useIlha((s) => s.revelacao);
  const definirEstado = useIlha((s) => s.definirEstado);
  const abrir = useIlha((s) => s.abrir);
  const recolher = useIlha((s) => s.recolher);
  useInterface((s) => s.sistemaMaximizado);
  useInterface((s) => s.geometria);
  const janelasConexao = useInterface((s) => s.janelasConexao);
  const [revelada, setRevelada] = useState(false);
  const sistemaAberto = useInterface((s) => s.sistemaAberto);
  const sistemaMinimizado = useInterface((s) => s.sistemaMinimizado);
  const irPara = useInterface((s) => s.irPara);
  const agentes = useAgentes();
  const pomodoro = usePomodoro();
  const midia = useMidia();
  usarClaudeCode(!LINUX && cfg.ativa && cfg.blocos.claude);
  const pedidosClaude = useClaudeCode((s) => s.pedidos);
  const minuto = useAgora(60_000, true);
  const agenteDaVez = agenteDoRodizio(favorito, minuto);
  const claudeAtivo = useClaudeCode(sessaoAtiva);
  const raiz = useRef<HTMLDivElement>(null);
  const corpoIlha = useRef<HTMLDivElement>(null);
  const [sobre, setSobre] = useState(false);
  const atualizacao = useAtualizacao();
  useEffect(() => {
    if (LINUX) return;
    const primeira = window.setTimeout(() => void useAtualizacao.getState().verificar(), 15000);
    const sempre = window.setInterval(() => void useAtualizacao.getState().verificar(), 6 * 3600000);
    return () => {
      window.clearTimeout(primeira);
      window.clearInterval(sempre);
    };
  }, []);
  usarAreaInterativa([".ilha-raiz .ilha", ".ilha-gatilho", ".ilha-barra-aba", ".ilha-pop"]);
  usarCursorFora(useCallback(() => setSobre(false), []));
  const [barraEmUso, setBarraEmUso] = useState(false);
  const aparencia = usarAparenciaDeBorda(cfg.fundo, cfg.opacidade);
  const [restanteFechar, setRestanteFechar] = useState<number | null>(null);
  const anterior = useRef({ w: 0, h: 0 });
  const relogioHover = useRef<number | undefined>(undefined);
  const relogioRevelada = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(relogioHover.current);
      window.clearTimeout(relogioRevelada.current);
    },
    [],
  );

  const claudeInstalado = useConfig((s) => s.claudeInstalado);
  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const abas = cfg.ordemAbas.filter((a) => cfg.blocos[a] && (a !== "claude" || claudeInstalado) && abaLigada(a, desligadas));
  const disponiveis = LINUX ? abas.filter((a) => ABAS_LOCAIS.includes(a)) : abas;
  const abaAtual = disponiveis.includes(aba) ? aba : disponiveis[0] ?? "hoje";
  const frente = usarEstadoDaFrente(!LINUX && cfg.ativa);
  const [lateraisLivresNativo, setLateraisLivresNativo] = useState(true);
  useEffect(() => {
    if (frente.frente !== "sobreposta") setLateraisLivresNativo(!frente.maximizada && !frente.telaCheia);
  }, [frente.frente, frente.maximizada, frente.telaCheia]);
  const appAbertoNoNavegador = (sistemaAberto && !sistemaMinimizado) || janelasConexao.some((j) => !j.minimizada);
  const lateraisLivres = NATIVO ? lateraisLivresNativo : !appAbertoNoNavegador;
  const coberta = cfg.modo === "inteligente" && !revelada && (NATIVO ? frente.cobre : alguemCobre({ x: (window.innerWidth - LARGURA_EXPANDIDA) / 2, y: 0, w: LARGURA_EXPANDIDA, h: 40 }));
  const pomodoroIniciado = pomodoro.rodando || pomodoro.restanteMs != null;
  const agora = useAgora(1000, pomodoro.rodando && estado !== "expandida");
  const relogio = useAgora(15000, cfg.repouso === "relogio" || cfg.repouso === "agente" || cfg.repouso === "midia");
  const alertas = agentes.alertas;
  const naoVistos = alertas.filter((a) => !a.visto).length;
  const frescos = alertas.filter((a) => alertaFresco(a, agentes.relogio)).length;
  const trabalhando = AGENTES.filter((a) => ["pensando", "escrevendo"].includes(estadoDoAgente(agentes, a)));

  const pedidoPendente = pedidosClaude.length > 0;
  const estadoEfetivo = LINUX && estado === "escondida" ? "compacta" : coberta && estado !== "expandida" && !revelacao && !pedidoPendente ? "escondida" : (cfg.modo === "fixo" || pedidoPendente) && estado === "escondida" ? "compacta" : estado;

  useEffect(() => {
    if (LINUX || cfg.modo !== "esconder" || estadoEfetivo !== "compacta" || sobre || barraEmUso || revelacao || frescos > 0 || pomodoro.rodando || atualizacao.fase !== "nada" || pedidoPendente) return;
    const t = window.setTimeout(() => definirEstado("escondida"), cfg.esconderSeg * 1000);
    return () => window.clearTimeout(t);
  }, [cfg.modo, cfg.esconderSeg, estadoEfetivo, sobre, barraEmUso, revelacao, frescos, pomodoro.rodando, definirEstado, atualizacao.fase, pedidoPendente]);

  useEffect(() => {
    if (estado === "expandida" && abaAtual === "avisos") useAgentes.getState().marcarVistos();
  }, [estado, abaAtual, alertas.length]);

  useEffect(() => {
    if (estadoEfetivo !== "expandida" || sobre || cfg.fechamentoSeg === 0 || abaAtual === "claude") {
      setRestanteFechar(null);
      return;
    }
    const fim = Date.now() + cfg.fechamentoSeg * 1000;
    const t = window.setInterval(() => {
      const focoDentro = raiz.current?.contains(document.activeElement) && document.activeElement?.tagName === "INPUT";
      if (focoDentro) return;
      const r = fim - Date.now();
      if (r <= 0) {
        recolher();
        void tocarSom("close");
        setRestanteFechar(null);
        return;
      }
      setRestanteFechar(r);
    }, 100);
    return () => window.clearInterval(t);
  }, [estadoEfetivo, sobre, cfg.fechamentoSeg, recolher, abaAtual]);

  useEffect(() => {
    if (estadoEfetivo !== "expandida") return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        recolher();
        void tocarSom("close");
      }
    };
    const aoClicarFora = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) recolher();
    };
    window.addEventListener("keydown", aoTeclar);
    window.addEventListener("pointerdown", aoClicarFora, true);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("pointerdown", aoClicarFora, true);
    };
  }, [estadoEfetivo, recolher]);

  const claudeIndisponivel = !cfg.ativa || !cfg.blocos.claude;
  useEffect(() => {
    if (claudeIndisponivel && pedidosClaude.length > 0) devolverPendentesAoTerminal();
  }, [claudeIndisponivel, pedidosClaude.length]);

  useEffect(() => {
    if (!frente.telaCheia) return;
    window.clearTimeout(relogioHover.current);
    setRevelada(false);
    if (useIlha.getState().estado === "expandida") recolher();
  }, [frente.telaCheia, recolher]);

  const compacta = useMemo(() => {
    if (atualizacao.fase !== "nada") return { tipo: "atualizacao" as const, largura: 350 };
    if (revelacao) return { tipo: "revelacao" as const, largura: 340 };
    if (pedidosClaude.length > 0) return { tipo: "claudePedido" as const, largura: 340 };
    if (pomodoroIniciado) return { tipo: "pomodoro" as const, largura: midia.tocando ? 330 : 290 };
    if (cfg.blocos.midia && midiaAtivaNaIlha(midia)) return { tipo: "midia" as const, largura: 330 };
    if (claudeAtivo) return { tipo: "claude" as const, largura: 330 };
    if (trabalhando.length > 0) return { tipo: "trabalho" as const, largura: 280 };
    if (cfg.repouso === "relogio") return { tipo: "relogio" as const, largura: 190 };
    if (cfg.repouso === "midia") return { tipo: "relogio" as const, largura: 190 };
    if (cfg.repouso === "agente") return { tipo: "agente" as const, largura: 230 };
    return { tipo: "nada" as const, largura: 120 };
  }, [revelacao, pomodoroIniciado, midia.tocando, Boolean(midia.faixa), trabalhando.length, cfg.repouso, cfg.blocos.midia, atualizacao.fase, pedidosClaude.length, Boolean(claudeAtivo)]);

  useEffect(() => {
    if (!LINUX || !cfg.ativa || estadoEfetivo !== "expandida") return;
    const escala = ESCALA[cfg.tamanho];
    const w = LARGURA_EXPANDIDA;
    const h = ALTURA_ABA[abaAtual];
    void dimensionarIlha(Math.ceil(w * escala + 32), Math.ceil(h * escala + 16))
      .catch((erro) => console.error("Falha ao dimensionar a ilha", erro));
  }, [cfg.ativa, cfg.tamanho, estadoEfetivo, abaAtual]);

  if (!cfg.ativa || frente.telaCheia) return null;

  const escala = ESCALA[cfg.tamanho];
  const alvo =
    estadoEfetivo === "escondida"
      ? { w: 120, h: 6, r: 6 }
      : estadoEfetivo === "compacta"
        ? { w: compacta.largura, h: ALTURA_COMPACTA, r: 12 }
        : { w: LARGURA_EXPANDIDA, h: ALTURA_ABA[abaAtual], r: 30 };
  const crescendo = alvo.w * alvo.h >= anterior.current.w * anterior.current.h;
  anterior.current = { w: alvo.w, h: alvo.h };
  const transicao = crescendo ? MOLA : FECHAR;

  const VisaoAtual = VISAO_ABA[abaAtual];
  const agenteLateral: AgenteId = abaAtual === "avisos" && alertas[0] ? alertas[0].agenteId : AGENTE_DA_ABA[abaAtual] ?? (trabalhando[0] as AgenteId | undefined) ?? agenteDaVez;
  const agenteCompacto = ["agente", "pomodoro", "relogio", "nada"].includes(compacta.tipo) ? agenteDaVez : compacta.tipo === "trabalho" ? trabalhando[0] : compacta.tipo === "revelacao" && !revelacao?.marca ? revelacao?.agente : undefined;
  const agenteContinuo = estadoEfetivo === "expandida" ? agenteLateral : agenteCompacto ?? agenteDaVez;
  const restantePomodoro = restanteAtual(pomodoro, agora);
  const barraVisivel = !LINUX && cfg.laterais && estadoEfetivo !== "escondida" && lateraisLivres;

  const abaDaCompacta = (): AbaIlha | undefined =>
    compacta.tipo === "revelacao" ? revelacao?.aba : compacta.tipo === "pomodoro" ? "foco" : compacta.tipo === "midia" ? "midia" : compacta.tipo === "trabalho" ? "chat" : compacta.tipo === "claude" || compacta.tipo === "claudePedido" ? "claude" : undefined;

  const acionarCompacta = () => {
    window.clearTimeout(relogioHover.current);
    if (compacta.tipo === "atualizacao") {
      if (atualizacao.fase === "disponivel" || atualizacao.fase === "erro") void atualizacao.instalar();
      return;
    }
    abrir(abaDaCompacta());
    if (compacta.tipo === "revelacao") useIlha.getState().dispensarRevelacao();
    void tocarSom("open");
  };

  const conteudoCompacta = () => {
    switch (compacta.tipo) {
      case "atualizacao":
        return (
          <>
            <div className="ilha-compacta-lado">
              {atualizacao.fase === "baixando" || atualizacao.fase === "instalando" ? <Anel progresso={atualizacao.progresso} tamanho={18} espessura={2.5} cor="#a78bfa" /> : <Download size={15} color="#a78bfa" />}
            </div>
            <span className="ilha-compacta-texto">
              {atualizacao.fase === "disponivel" ? T.ilha.atualizacao.disponivel(atualizacao.versao) : atualizacao.fase === "baixando" ? T.ilha.atualizacao.baixando(Math.round(atualizacao.progresso * 100)) : atualizacao.fase === "instalando" ? T.ilha.atualizacao.instalando : T.ilha.atualizacao.falhou}
            </span>
            <div className="ilha-compacta-lado">
              {atualizacao.fase === "disponivel" && <span className="ilha-atualizar">{T.ilha.atualizacao.atualizar}</span>}
            </div>
          </>
        );
      case "revelacao":
        return (
          <>
            <div className="ilha-compacta-lado">
              {revelacao?.marca ? <Marca marca={revelacao.marca} tamanho={16} /> : revelacao?.agente ? <EspacoDoPersonagem agente={revelacao.agente} tamanho={20} posicao="compacta" /> : null}
            </div>
            <span className="ilha-compacta-texto privado">{revelacao?.texto}</span>
            <div className="ilha-compacta-lado">
              {revelacao?.tipo === "alerta" ? <CircleAlert size={15} color="#f5a524" /> : <Check size={15} color="#34d399" />}
            </div>
          </>
        );
      case "pomodoro":
        return (
          <>
            <div className="ilha-compacta-lado">
              <Anel progresso={1 - restantePomodoro / pomodoro.duracaoMs} tamanho={18} espessura={2.5} cor={pomodoro.etapa === "foco" ? undefined : "#34d399"} />
              <span className="ilha-tempo">{formatarRelogio(restantePomodoro)}</span>
            </div>
            <span className="ilha-compacta-texto" style={{ color: "var(--i-dim-2)" }}>
              {T.pomodoro.etapas[pomodoro.etapa]}
            </span>
            <div className="ilha-compacta-lado">
              {midia.tocando ? <span className="ilha-capa" style={{ width: 18, height: 18, background: fundoDaCapa(midia.faixa) }} /> : <MiniAgentes ids={trabalhando} />}
            </div>
          </>
        );
      case "midia":
        return (
          <>
            <div className="ilha-compacta-lado">
              <span className="ilha-capa" style={{ width: 24, height: 24, background: fundoDaCapa(midia.faixa) }} />
            </div>
            <span className="ilha-compacta-texto privado">{midia.faixa?.titulo ?? ""}</span>
            <div className="ilha-compacta-lado">
              <span className={`ilha-onda ${midia.tocando ? "" : "parada"}`}>
                <i />
                <i />
                <i />
                <i />
              </span>
            </div>
          </>
        );
      case "trabalho":
        return (
          <>
            <MiniAgentes ids={trabalhando} continuo />
            <EtapaDeTrabalho contexto={trabalhando[0]} texto={agentes.tarefaAtual[trabalhando[0]] || T.agentes.estados.escrevendo} />
          </>
        );
      case "claudePedido":
        return (
          <>
            <div className="ilha-compacta-lado">
              <Marca marca="claudecode" tamanho={16} />
            </div>
            <span className="ilha-compacta-texto ilha-claude-compacta" data-estado="aprovacao">
              {T.ilha.claude.permissaoCompacta(pedidosClaude[0]?.projeto ?? "")}
            </span>
            <div className="ilha-compacta-lado">
              <ShieldAlert size={15} color="#f0a060" />
            </div>
          </>
        );
      case "claude": {
        const passo = [...(claudeAtivo?.passos ?? [])].reverse().find((p) => p.tipo === "ferramenta");
        return (
          <>
            <div className="ilha-compacta-lado">
              <Marca marca="claudecode" tamanho={16} />
            </div>
            {passo && claudeAtivo ? <EtapasAnimadas contexto={claudeAtivo.id} etapas={claudeAtivo.passos.filter((p) => p.tipo === "ferramenta" || p.tipo === "fim" || p.tipo === "erro").map((p) => ({ id: p.id, texto: `${p.rotulo} ${p.detalhe ?? ""}`.trim() }))} compacta /> : <span className="ilha-compacta-texto brilho-texto">{T.ilha.claude.estados[claudeAtivo?.estado ?? "pensando"]}</span>}
            <div className="ilha-compacta-lado">
              <LoaderCircle size={14} className="girando" color="#4daafc" />
            </div>
          </>
        );
      }
      case "relogio":
        return <span className="ilha-compacta-texto ilha-tempo">{new Date(relogio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>;
      case "agente":
        return (
          <>
            <div className="ilha-compacta-lado">
              <EspacoDoPersonagem agente={agenteDaVez} tamanho={22} posicao="compacta" />
            </div>
            <span className="ilha-compacta-texto ilha-relogio">
              <span className="ilha-tempo">{new Date(relogio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              <span className="ilha-mini">{new Date(relogio).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "")}</span>
            </span>
            <div className="ilha-compacta-lado" style={{ width: 22 }} />
          </>
        );      default:
        return null;
    }
  };

  return (
    <>
      {!LINUX && cfg.laterais && (
        <BarraDoTopo
          visivel={barraVisivel}
          escala={escala}
          larguraDaIlha={alvo.w * escala}
          aparencia={aparencia}
          aoAbrirAba={(a) => alternarAbaDaBarra(abas.includes(a) ? a : abaAtual)}
          aoUsar={setBarraEmUso}
        />
      )}
      {estadoEfetivo === "escondida" && (
        <div
          className="ilha-gatilho"
          onDragEnter={(e) => {
            if (!Array.from(e.dataTransfer.types).includes("Files")) return;
            setRevelada(true);
            abrir("chat");
          }}
          onPointerEnter={() => {
            setRevelada(true);
            definirEstado("compacta");
            void tocarSom("peek");
          }}
        />
      )}
      <div
        ref={raiz}
        className="ilha-raiz"
        data-privacidade={privacidade ? "sim" : "nao"}
        data-fundo-claro={aparencia.claro || undefined}
        style={{
          ...variaveisDaBorda(aparencia),
          transform: `translateX(-50%) scale(${escala})`,
          transformOrigin: "top center",
          opacity: coberta && estadoEfetivo === "escondida" ? 0 : 1,
          ["--topo-orelhas" as string]: `${barraVisivel ? ALTURA_DA_FAIXA : 0}px`,
          ["--raio-orelha" as string]: barraVisivel ? "10px" : "14px",
        }}
        onPointerEnter={() => {
          setSobre(true);
          window.clearTimeout(relogioRevelada.current);
        }}
        onDragEnter={(e) => {
          if (LINUX) return;
          if (!Array.from(e.dataTransfer.types).includes("Files")) return;
          if (useIlha.getState().estado !== "expandida" || useIlha.getState().aba !== "chat") {
            abrir("chat");
            void tocarSom("open");
          }
        }}
        onPointerLeave={() => {
          setSobre(false);
          window.clearTimeout(relogioHover.current);
          window.clearTimeout(relogioRevelada.current);
          if (revelada) relogioRevelada.current = window.setTimeout(() => setRevelada(false), 1500);
        }}
      >
        <motion.div
          ref={corpoIlha}
          className="ilha"
          style={{ ["--fundo-ilha" as string]: aparencia.fundo }}
          initial={false}
          animate={{ width: alvo.w, height: alvo.h, borderBottomLeftRadius: alvo.r, borderBottomRightRadius: alvo.r }}
          transition={LINUX ? { duration: 0 } : transicao}
        >
          <div className="ilha-recorte">
            <AnimatePresence mode="popLayout" initial={false}>
              {estadoEfetivo === "compacta" && (
                <motion.div
                  key={`c-${compacta.tipo}`}
                  className="ilha-compacta"
                  role="button"
                  tabIndex={0}
                  aria-label={T.ilha.expandir}
                  initial={{ opacity: 0, filter: "blur(8px)", scale: 0.97 }}
                  animate={{ opacity: 1, filter: "blur(0px)", scale: 1, transition: { delay: 0.16, duration: 0.3 } }}
                  exit={{ opacity: 0, filter: "blur(8px)", scale: 0.97, transition: { duration: 0.16 } }}
                  onClick={acionarCompacta}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      acionarCompacta();
                    }
                  }}
                  onPointerEnter={() => {
                    window.clearTimeout(relogioHover.current);
                    if (cfg.abrirHover && compacta.tipo !== "atualizacao") relogioHover.current = window.setTimeout(() => useIlha.getState().estado === "compacta" && abrir(abaDaCompacta()), 280);
                  }}
                  onPointerLeave={() => window.clearTimeout(relogioHover.current)}
                >
                  {["pomodoro", "relogio", "nada"].includes(compacta.tipo) && (
                    <div className="ilha-compacta-lado">
                      <EspacoDoPersonagem agente={agenteDaVez} tamanho={22} posicao="compacta" />
                    </div>
                  )}
                  {conteudoCompacta()}
                  {compacta.tipo !== "revelacao" && naoVistos > 0 && (
                    <span className="ilha-contador" aria-label={T.ilha.fila(naoVistos)} title={T.ilha.fila(naoVistos)}>{naoVistos}</span>
                  )}
                </motion.div>
              )}
              {estadoEfetivo === "expandida" && (
                <motion.div
                  key="expandida"
                  className="ilha-expandida"
                  initial={{ opacity: 0, filter: "blur(8px)", scale: 0.97 }}
                  animate={{ opacity: 1, filter: "blur(0px)", scale: 1, transition: { delay: 0.16, duration: 0.3 } }}
                  exit={{ opacity: 0, filter: "blur(8px)", scale: 0.97, transition: { duration: 0.16 } }}
                >
                  <div className="ilha-cabecalho">
                    <div className="ilha-abas" role="tablist" aria-label={T.app.nome}>
                      {abas.map((a, i) => {
                        const Icone = ICONE_ABA[a];
                        return (
                          <motion.button
                            key={a}
                            type="button"
                            role="tab"
                            className="ilha-aba"
                            aria-selected={a === abaAtual}
                            aria-label={T.ilha.abas[a]}
                            title={LINUX && !ABAS_LOCAIS.includes(a) ? `${T.ilha.abas[a]}: indisponível no Linux nesta etapa` : T.ilha.abas[a]}
                            disabled={LINUX && !ABAS_LOCAIS.includes(a)}
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0, transition: { delay: 0.3 + i * 0.035 } }}
                            onClick={() => {
                              if (a !== abaAtual) void tocarSom("blip");
                              abrir(a);
                            }}
                          >
                            {a === "claude" ? <Marca marca="claudecode" tamanho={14} monocromatica={a !== abaAtual} /> : <Icone size={14} />}
                            {a === abaAtual && <span className="ilha-aba-nome">{T.ilha.abas[a]}</span>}
                            {a === "claude" && pedidosClaude.length > 0 && <span className="ilha-aba-selo">{pedidosClaude.length}</span>}
                            {a === "avisos" && naoVistos > 0 && <span className="ilha-aba-selo">{naoVistos}</span>}
                          </motion.button>
                        );
                      })}
                    </div>
                    <div className="ilha-acoes">
                      <button
                        type="button"
                        className="ilha-acao"
                        aria-label={somLigado ? T.ilha.silenciar : T.ilha.ativarSom}
                        data-dica={somLigado ? T.ilha.silenciar : T.ilha.ativarSom}
                        onClick={() => definirConfig({ sons: { ...sons, ligado: !somLigado } })}
                      >
                        {somLigado ? <Volume2 size={14} /> : <VolumeX size={14} />}
                      </button>
                      <button
                        type="button"
                        className="ilha-acao"
                        aria-label={T.ilha.abrirSistema}
                        data-dica={T.ilha.abrirSistema}
                        onClick={() => {
                          const rota = { hoje: "journal", captura: "inicio", midia: "inicio", foco: "estudos", habitos: "journal", chat: "chat", conexoes: "conexoes", calendario: "calendario", avisos: "inicio", claude: "configuracoes" } as const;
                          irPara(rota[abaAtual]);
                          recolher();
                          void tocarSom("open");
                        }}
                      >
                        <AppWindow size={14} />
                      </button>
                      <button type="button" className="ilha-acao" aria-label={T.ilha.fecharIlha} data-dica={T.ilha.fecharIlha} onClick={() => recolher()}>
                        <ChevronUp size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="ilha-miolo">
                  {!ABAS_SEM_LATERAL.includes(abaAtual) && <motion.div className="ilha-lateral" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.2, duration: 0.2 } }}>
                    <EspacoDoPersonagem agente={agenteLateral} tamanho={ALTURA_ABA[abaAtual] < 200 ? 50 : 70} posicao="expandida" />
                    <span className="ilha-lateral-nome cortar">{nomes[agenteLateral]}</span>
                    <span className="ilha-lateral-cargo" title={cargos[agenteLateral]}>{cargos[agenteLateral]}</span>
                  </motion.div>}
                  <div className="ilha-visoes">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={abaAtual}
                        className="ilha-visao"
                        initial={{ opacity: 0, scale: 0.97, filter: "blur(6px)" }}
                        animate={{ opacity: 1, scale: 1, filter: "blur(0px)", transition: { duration: 0.24, ease: [0.3, 1.2, 0.4, 1] } }}
                        exit={{ opacity: 0, scale: 0.97, filter: "blur(6px)", transition: { duration: 0.12 } }}
                      >
                        <VisaoAtual />
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <PersonagemContinuo ilha={corpoIlha} posicao={estadoEfetivo === "expandida" ? "expandida" : "compacta"} ativo={estadoEfetivo !== "escondida"} escala={escala} agente={agenteContinuo} estado={estadoEfetivo === "compacta" ? estadoCalmo(estadoDoAgente(agentes, agenteContinuo)) : estadoDoAgente(agentes, agenteContinuo)} rotulo={nomes[agenteContinuo]} destinoKey={estadoEfetivo === "expandida" ? abaAtual : compacta.tipo} />
          {restanteFechar != null && restanteFechar <= 10000 && (
            <span className="ilha-contagem" style={{ width: (restanteFechar / 10000) * 160 }} aria-hidden="true" />
          )}
        </motion.div>
      </div>
    </>
  );
}

function MiniAgentes({ ids, continuo = false }: { ids: string[]; continuo?: boolean }) {
  return (
    <div className="ilha-compacta-lado" style={{ gap: 2 }}>
      {ids.slice(0, 3).map((id, i) => (
        <motion.span key={id} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1, transition: { delay: i * 0.035 } }}>
          {i === 0 && continuo ? <EspacoDoPersonagem agente={id as AgenteId} tamanho={20} posicao="compacta" /> : <Personagem agente={id as AgenteId} tamanho={20} interativo={false} halo={false} />}
        </motion.span>
      ))}
    </div>
  );
}
