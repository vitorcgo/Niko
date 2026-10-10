import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Plus, Music, Timer, CalendarDays, MessageCircle, Plug, Bell, Volume2, VolumeX, AppWindow, ChevronUp, Pin, PinOff, Check, CircleAlert, Download, CodeXml, ShieldAlert, LoaderCircle,
  type LucideIcon,
} from "lucide-react";
import { useConfig, type AbaIlha, type SecaoHoje, type VisaoIlha } from "../../estado/configuracoes";
import { estadoComAviso, useIlha } from "../../estado/ilha";
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
  VisaoHoje, VisaoCaptura, VisaoMidia, VisaoFoco, VisaoConexoes, VisaoAvisos,
} from "./Visoes";
import { alguemCobre } from "../geometria";
import { VisaoChat } from "./VisaoChat";
import { VisaoClaude } from "./claude/VisaoClaude";
import { usarClaudeCode, devolverPendentesAoTerminal } from "./claude/usarClaudeCode";
import { MARCA_DA_FERRAMENTA, nomeDaFerramenta } from "./claude/ferramentas";
import { abaLigada } from "../../utilitarios/funcoes";
import { tiposDeCapturaLigados } from "../../utilitarios/captura";
import { useClaudeCode, sessaoAtiva, nomeDoModelo } from "../../estado/claudeCode";
import { useAtualizacao } from "../../estado/atualizacao";
import { NATIVO, liberarSistemaInicial, ouvirAtalho, ouvirEvento, usarAreaInterativa, usarCursorFora, usarEstadoDaFrente } from "../../desktop/desktop";
import { Saudacao } from "./animacoes/Saudacao";
import { usarSaudacaoDiaria } from "./animacoes/usarSaudacaoDiaria";
import { ALTURA_DA_SAUDACAO, EVENTO_DA_SAUDACAO, LARGURA_DA_SAUDACAO } from "./animacoes/pedirSaudacao";
import { BarraDoTopo, ALTURA_DA_FAIXA } from "./barra/BarraDoTopo";
import { abaVizinha, alternarAbaDaBarra } from "./barra/acoesDaBarra";
import { EspacoDoPersonagem, PersonagemContinuo } from "./animacoes/PersonagemContinuo";
import { EtapaDeTrabalho, EtapasAnimadas } from "./animacoes/EtapasAnimadas";
import { atributosDoFundo, usarAparenciaDeBorda, variaveisDaBorda } from "../aparencia";
import { movimentoDaVisibilidade } from "./animacoes/visibilidade";
import type { AgenteId, EstadoAgente } from "../../tipos";
import "./ilha.css";

const ICONE_ABA: Record<AbaIlha, LucideIcon> = {
  hoje: CalendarDays,
  midia: Music,
  foco: Timer,
  chat: MessageCircle,
  conexoes: Plug,
  avisos: Bell,
  claude: CodeXml,
};

const VISAO_ABA: Record<VisaoIlha, () => React.JSX.Element | null> = {
  hoje: VisaoHoje,
  captura: VisaoCaptura,
  midia: VisaoMidia,
  foco: VisaoFoco,
  chat: VisaoChat,
  conexoes: VisaoConexoes,
  avisos: VisaoAvisos,
  claude: VisaoClaude,
};

const ALTURA_ABA: Record<Exclude<VisaoIlha, "hoje">, number> = {
  captura: 168,
  midia: 184,
  foco: 176,
  chat: 300,
  conexoes: 350,
  avisos: 178,
  claude: 296,
};

const ALTURA_DO_HOJE: Record<SecaoHoje, number> = { agenda: 318, tarefas: 258, habitos: 238 };

function alturaDaVisao(visao: VisaoIlha, secaoHoje: SecaoHoje) {
  return visao === "hoje" ? ALTURA_DO_HOJE[secaoHoje] : ALTURA_ABA[visao];
}

// Abas mais largas que o padrão: a de IAs é larga e baixa, com o uso de cada ferramenta numa faixa.
const LARGURA_ABA: Partial<Record<VisaoIlha, number>> = { claude: 820 };

const ESCALA = { pequena: 0.85, media: 1, grande: 1.15 };

function estadoCalmo(e: EstadoAgente): EstadoAgente {
  return e === "alerta" || e === "erro" ? "ocioso" : e;
}
const LARGURA_EXPANDIDA = 660;
const SAUDACAO_VENCE_EM_MS = 15 * 60_000;
const ALTURA_COMPACTA = 30;
const ALTURA_COMPACTA_MIDIA = 34;
const TAMANHO_DA_CAPA_COMPACTA = 28;
const AGENTE_DA_ABA: Partial<Record<VisaoIlha, AgenteId>> = { hoje: "organizador", foco: "tutor", conexoes: "java", claude: "java" };
const RODIZIO_MS = 8 * 60_000;
const ABAS_SEM_LATERAL: VisaoIlha[] = ["chat", "midia"];
const LIMIAR_DA_ROLAGEM = 40;
const INTERVALO_ENTRE_TROCAS_MS = 180;

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
  const preferenciaDeMovimento = useReducedMotion();
  const animacoesDesligadas = useConfig((s) => s.reduzirAnimacoes);
  const reduzirAnimacoes = animacoesDesligadas || preferenciaDeMovimento;
  const estado = useIlha((s) => s.estado);
  const aba = useIlha((s) => s.aba);
  const secaoHoje = useIlha((s) => s.secaoHoje);
  const revelacao = useIlha((s) => s.revelacao);
  const saudacao = useIlha((s) => s.saudacao);
  const encerrarSaudacao = useIlha((s) => s.encerrarSaudacao);
  const saudando = saudacao !== null;
  usarSaudacaoDiaria(cfg.ativa);
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
  usarClaudeCode(cfg.ativa && cfg.blocos.claude);
  const pedidosClaude = useClaudeCode((s) => s.pedidos);
  const minuto = useAgora(60_000, true);
  const agenteDaVez = agenteDoRodizio(favorito, minuto);
  const claudeAtivo = useClaudeCode(sessaoAtiva);
  const sessaoLateral = useClaudeCode((s) => s.sessoes[s.focada ?? ""] ?? s.sessoes[s.ordem[0]]);
  const estadoLateral = sessaoLateral && pedidosClaude.some((p) => p.sessao === sessaoLateral.id) ? "aprovacao" : sessaoLateral?.estado ?? "terminou";
  const raiz = useRef<HTMLDivElement>(null);
  const corpoIlha = useRef<HTMLDivElement>(null);
  const [sobre, setSobre] = useState(false);
  const atualizacao = useAtualizacao();
  useEffect(() => {
    const primeira = window.setTimeout(() => void useAtualizacao.getState().verificar(), 15000);
    const sempre = window.setInterval(() => void useAtualizacao.getState().verificar(), 6 * 3600000);
    return () => {
      window.clearTimeout(primeira);
      window.clearInterval(sempre);
    };
  }, []);
  usarAreaInterativa([".ilha-raiz:not(.ilha-raiz-oculta) .ilha", ".ilha-gatilho", ".ilha-barra-aba", ".ilha-pop"]);
  usarCursorFora(useCallback(() => setSobre(false), []));
  useEffect(() => {
    let ativo = true;
    let desligar: () => void = () => undefined;
    void ouvirEvento(EVENTO_DA_SAUDACAO, () => useIlha.getState().saudar()).then((f) => {
      if (ativo) desligar = f;
      else f();
    });
    return () => {
      ativo = false;
      desligar();
    };
  }, []);
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

  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const comAvisos = agentes.alertas.length > 0 || (estado === "expandida" && aba === "avisos");
  const abas = cfg.ordemAbas.filter((a) => cfg.blocos[a] && (a !== "avisos" || comAvisos) && abaLigada(a, desligadas));
  const capturaDisponivel = tiposDeCapturaLigados(desligadas).length > 0;
  const abaAtual: VisaoIlha = aba === "captura" && capturaDisponivel ? "captura" : abas.includes(aba as AbaIlha) ? aba : abas[0] ?? "hoje";
  const abaAntesDaCaptura = useRef<AbaIlha>("hoje");
  const rolagemDasAbas = useRef({ acumulado: 0, ultimaTroca: 0 });
  const [fixada, setFixada] = useState(false);
  const paraOAtalho = useRef({ abas, abaAtual, estado });
  paraOAtalho.current = { abas, abaAtual, estado };
  useEffect(() => {
    let vivo = true;
    let desligar: () => void = () => undefined;
    void ouvirAtalho((acao) => {
      if (acao !== "proximaAba") return;
      const { abas: lista, abaAtual: atual, estado: agora } = paraOAtalho.current;
      if (lista.length === 0) return;
      const indice = lista.indexOf(atual as AbaIlha);
      void tocarSom("blip");
      abrir(agora === "expandida" ? lista[(indice + 1) % lista.length] : lista[Math.max(0, indice)]);
    }).then((f) => {
      if (vivo) desligar = f;
      else f();
    });
    return () => {
      vivo = false;
      desligar();
    };
  }, [abrir]);
  const frente = usarEstadoDaFrente(cfg.ativa);
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
  const estadoEfetivo = saudando ? "compacta" : coberta && estado !== "expandida" && !revelacao && !pedidoPendente ? "escondida" : (cfg.modo === "fixo" || pedidoPendente) && estado === "escondida" ? "compacta" : estadoComAviso(estado, Boolean(revelacao));
  const oculta = coberta && estadoEfetivo === "escondida";
  const movimentoDeVisibilidade = movimentoDaVisibilidade(oculta, Boolean(reduzirAnimacoes));

  useEffect(() => {
    if (cfg.modo !== "esconder" || estadoEfetivo !== "compacta" || sobre || barraEmUso || revelacao || frescos > 0 || pomodoro.rodando || atualizacao.fase !== "nada" || pedidoPendente) return;
    const t = window.setTimeout(() => definirEstado("escondida"), cfg.esconderSeg * 1000);
    return () => window.clearTimeout(t);
  }, [cfg.modo, cfg.esconderSeg, estadoEfetivo, sobre, barraEmUso, revelacao, frescos, pomodoro.rodando, definirEstado, atualizacao.fase, pedidoPendente]);

  useEffect(() => {
    if (estado === "expandida" && abaAtual === "avisos") useAgentes.getState().marcarVistos();
  }, [estado, abaAtual, alertas.length]);

  useEffect(() => {
    if (estadoEfetivo !== "expandida") setFixada(false);
  }, [estadoEfetivo]);

  useEffect(() => {
    if (estadoEfetivo !== "expandida" || sobre || cfg.fechamentoSeg === 0 || abaAtual === "claude" || fixada) {
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
  }, [estadoEfetivo, sobre, cfg.fechamentoSeg, recolher, abaAtual, fixada]);

  useEffect(() => {
    if (estadoEfetivo !== "expandida") return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        recolher();
        void tocarSom("close");
      }
    };
    const aoClicarFora = (e: PointerEvent) => {
      if (!fixada && raiz.current && !raiz.current.contains(e.target as Node)) recolher();
    };
    window.addEventListener("keydown", aoTeclar);
    window.addEventListener("pointerdown", aoClicarFora, true);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("pointerdown", aoClicarFora, true);
    };
  }, [estadoEfetivo, recolher, fixada]);

  const claudeIndisponivel = !cfg.ativa || !cfg.blocos.claude;
  useEffect(() => {
    if (claudeIndisponivel && pedidosClaude.length > 0) devolverPendentesAoTerminal();
  }, [claudeIndisponivel, pedidosClaude.length]);

  useEffect(() => {
    if (!saudacao) return;
    if (frente.telaCheia) {
      void liberarSistemaInicial();
      return;
    }
    if (Date.now() - saudacao.id > SAUDACAO_VENCE_EM_MS) encerrarSaudacao();
  }, [saudacao, frente.telaCheia, encerrarSaudacao]);

  useEffect(() => {
    if (!frente.telaCheia) return;
    window.clearTimeout(relogioHover.current);
    setRevelada(false);
    if (useIlha.getState().estado === "expandida") recolher();
  }, [frente.telaCheia, recolher]);

  const compacta = useMemo(() => {
    if (revelacao) return { tipo: "revelacao" as const, largura: 380 };
    if (atualizacao.fase !== "nada") return { tipo: "atualizacao" as const, largura: 350 };
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

  if (!cfg.ativa || frente.telaCheia) return null;

  const escala = ESCALA[cfg.tamanho];
  const alvo = saudando
    ? { w: LARGURA_DA_SAUDACAO, h: ALTURA_DA_SAUDACAO, r: 40 }
    : estadoEfetivo === "escondida"
      ? { w: 120, h: 6, r: 6 }
      : estadoEfetivo === "compacta"
        ? { w: compacta.largura, h: compacta.tipo === "revelacao" ? 56 : compacta.tipo === "midia" ? ALTURA_COMPACTA_MIDIA : ALTURA_COMPACTA, r: compacta.tipo === "midia" || compacta.tipo === "revelacao" ? 14 : 12 }
        : { w: LARGURA_ABA[abaAtual] ?? LARGURA_EXPANDIDA, h: alturaDaVisao(abaAtual, secaoHoje), r: 30 };
  const crescendo = alvo.w * alvo.h >= anterior.current.w * anterior.current.h;
  anterior.current = { w: alvo.w, h: alvo.h };
  const transicao = crescendo ? MOLA : FECHAR;

  const VisaoAtual = VISAO_ABA[abaAtual];
  const agenteLateral: AgenteId = abaAtual === "avisos" && alertas[0] ? alertas[0].agenteId : AGENTE_DA_ABA[abaAtual] ?? (trabalhando[0] as AgenteId | undefined) ?? agenteDaVez;
  const agenteCompacto = ["agente", "pomodoro", "relogio", "nada"].includes(compacta.tipo) ? agenteDaVez : compacta.tipo === "trabalho" ? trabalhando[0] : compacta.tipo === "revelacao" && !revelacao?.marca ? revelacao?.agente : undefined;
  const agenteContinuo = estadoEfetivo === "expandida" ? agenteLateral : agenteCompacto ?? agenteDaVez;
  const restantePomodoro = restanteAtual(pomodoro, agora);
  const barraVisivel = cfg.laterais && estadoEfetivo !== "escondida" && lateraisLivres && !saudando;

  const abaDaCompacta = (): VisaoIlha | undefined =>
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
            <span className="ilha-compacta-texto privado" role="status">{revelacao?.texto}</span>
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
              <span className="ilha-capa ilha-capa-compacta" style={{ width: TAMANHO_DA_CAPA_COMPACTA, height: TAMANHO_DA_CAPA_COMPACTA, background: fundoDaCapa(midia.faixa) }} />
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
              <Marca marca={MARCA_DA_FERRAMENTA[pedidosClaude[0]?.ferramentaDeCodigo ?? "claude"]} tamanho={16} />
            </div>
            <span className="ilha-compacta-texto ilha-claude-compacta" data-estado="aprovacao">
              {T.ilha.claude.permissaoCompacta(nomeDaFerramenta(pedidosClaude[0]?.ferramentaDeCodigo), pedidosClaude[0]?.projeto ?? "")}
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
              <Marca marca={MARCA_DA_FERRAMENTA[claudeAtivo?.ferramenta ?? "claude"]} tamanho={16} />
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
      {cfg.laterais && (
        <BarraDoTopo
          visivel={barraVisivel}
          escala={escala}
          larguraDaIlha={alvo.w * escala}
          aparencia={aparencia}
          aoAbrirAba={(a, secao) => alternarAbaDaBarra(abas.includes(a) ? a : abas[0] ?? "hoje", secao)}
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
      <motion.div
        ref={raiz}
        className={`ilha-raiz${oculta ? " ilha-raiz-oculta" : ""}`}
        data-privacidade={privacidade ? "sim" : "nao"}
        {...atributosDoFundo(aparencia)}
        initial={false}
        animate={movimentoDeVisibilidade.animate}
        transition={movimentoDeVisibilidade.transition}
        style={{
          ...variaveisDaBorda(aparencia),
          x: "-50%",
          scale: escala,
          transformOrigin: "top center",
          pointerEvents: oculta ? "none" : "auto",
          ["--topo-orelhas" as string]: `${barraVisivel ? ALTURA_DA_FAIXA : 0}px`,
          ["--raio-orelha" as string]: barraVisivel ? "10px" : "14px",
        }}
        onPointerEnter={() => {
          setSobre(true);
          window.clearTimeout(relogioRevelada.current);
        }}
        onDragEnter={(e) => {
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
          transition={transicao}
        >
          <AnimatePresence>
            {revelacao && !saudando && <motion.div key={revelacao.texto} className="ilha-sinal-aviso" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: reduzirAnimacoes ? 0.45 : [0, 0.7, 0.25, 0.6, 0.25] }} exit={{ opacity: 0 }} transition={{ duration: reduzirAnimacoes ? 0.12 : 1.2 }} />}
          </AnimatePresence>
          <AnimatePresence>
            {revelacao && estadoEfetivo === "expandida" && !saudando && <motion.button key={revelacao.texto} type="button" className="ilha-aviso-aberta" initial={{ opacity: 0, y: reduzirAnimacoes ? 0 : -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={() => { abrir(revelacao.aba); useIlha.getState().dispensarRevelacao(); }}>
              <Bell size={16} /><span className="privado" role="status">{revelacao.texto}</span>
            </motion.button>}
          </AnimatePresence>
          <div className="ilha-recorte">
            <AnimatePresence mode="popLayout" initial={false}>
              {saudacao && <Saudacao key={`saudacao-${saudacao.id}`} versaoNova={saudacao.versaoNova} aoTerminar={encerrarSaudacao} />}
              {estadoEfetivo === "compacta" && !saudando && (
                <motion.div
                  key={`c-${compacta.tipo}`}
                  className="ilha-compacta"
                  data-tipo={compacta.tipo}
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
                  <div
                    className="ilha-cabecalho"
                    onWheel={(e) => {
                      const r = rolagemDasAbas.current;
                      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
                      const agoraMs = Date.now();
                      if (agoraMs - r.ultimaTroca < INTERVALO_ENTRE_TROCAS_MS) return;
                      r.acumulado += delta;
                      if (Math.abs(r.acumulado) < LIMIAR_DA_ROLAGEM) return;
                      const passo = r.acumulado > 0 ? 1 : -1;
                      r.acumulado = 0;
                      r.ultimaTroca = agoraMs;
                      const proxima = abaVizinha(abas, abaAtual === "captura" ? abaAntesDaCaptura.current : abaAtual, passo);
                      if (!proxima || proxima === abaAtual) return;
                      void tocarSom("blip");
                      abrir(proxima);
                    }}
                  >
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
                            title={T.ilha.abas[a]}
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0, transition: { delay: 0.3 + i * 0.035 } }}
                            onClick={() => {
                              if (a !== abaAtual) void tocarSom("blip");
                              abrir(a);
                            }}
                          >
                            <Icone size={14} />
                            {a === abaAtual && <span className="ilha-aba-nome">{T.ilha.abas[a]}</span>}
                            {a === "claude" && pedidosClaude.length > 0 && <span className="ilha-aba-selo">{pedidosClaude.length}</span>}
                            {a === "avisos" && naoVistos > 0 && <span className="ilha-aba-selo">{naoVistos}</span>}
                          </motion.button>
                        );
                      })}
                    </div>
                    <div className="ilha-acoes">
                      {capturaDisponivel && (
                        <button
                          type="button"
                          className="ilha-acao"
                          aria-label={T.ilha.capturar}
                          aria-pressed={abaAtual === "captura"}
                          data-dica={T.ilha.capturar}
                          onClick={() => {
                            void tocarSom("blip");
                            if (abaAtual === "captura") {
                              abrir(abas.includes(abaAntesDaCaptura.current) ? abaAntesDaCaptura.current : abas[0] ?? "hoje");
                              return;
                            }
                            abaAntesDaCaptura.current = abaAtual;
                            abrir("captura");
                          }}
                        >
                          <Plus size={15} />
                        </button>
                      )}
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
                          const rota = { hoje: secaoHoje === "agenda" ? "calendario" : "journal", captura: "inicio", midia: "inicio", foco: "estudos", chat: "chat", conexoes: "conexoes", avisos: "inicio", claude: "configuracoes" } as const;
                          irPara(rota[abaAtual]);
                          recolher();
                          void tocarSom("open");
                        }}
                      >
                        <AppWindow size={14} />
                      </button>
                      <button
                        type="button"
                        className="ilha-acao"
                        aria-label={fixada ? T.ilha.desafixar : T.ilha.fixar}
                        data-dica={fixada ? T.ilha.desafixar : T.ilha.fixar}
                        aria-pressed={fixada}
                        data-ativa={fixada || undefined}
                        onClick={() => {
                          void tocarSom("blip");
                          setFixada((f) => !f);
                        }}
                      >
                        {fixada ? <PinOff size={14} /> : <Pin size={14} />}
                      </button>
                      <button type="button" className="ilha-acao" aria-label={T.ilha.fecharIlha} data-dica={T.ilha.fecharIlha} onClick={() => recolher()}>
                        <ChevronUp size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="ilha-miolo">
                  {!ABAS_SEM_LATERAL.includes(abaAtual) && <motion.div className="ilha-lateral" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.2, duration: 0.2 } }}>
                    <EspacoDoPersonagem agente={agenteLateral} tamanho={alturaDaVisao(abaAtual, secaoHoje) < 200 ? 50 : 70} posicao="expandida" />
                    <span className="ilha-lateral-nome cortar">{nomes[agenteLateral]}</span>
                    {abaAtual === "claude" && sessaoLateral ? (
                      <>
                        <span className="ilha-lateral-cargo cortar" title={sessaoLateral.cwd}>{sessaoLateral.projeto}</span>
                        {sessaoLateral.modelo && <span className="ilha-lateral-modelo cortar" title={sessaoLateral.modelo}>{nomeDoModelo(sessaoLateral.modelo)}</span>}
                        <span className="ilha-lateral-estado" data-estado={estadoLateral}>{T.ilha.claude.estados[estadoLateral]}</span>
                      </>
                    ) : (
                      <span className="ilha-lateral-cargo" title={cargos[agenteLateral]}>{cargos[agenteLateral]}</span>
                    )}
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
          <PersonagemContinuo ilha={corpoIlha} posicao={estadoEfetivo === "expandida" ? "expandida" : "compacta"} ativo={estadoEfetivo !== "escondida" && !saudando} escala={escala} agente={agenteContinuo} estado={estadoEfetivo === "compacta" ? estadoCalmo(estadoDoAgente(agentes, agenteContinuo)) : estadoDoAgente(agentes, agenteContinuo)} rotulo={nomes[agenteContinuo]} destinoKey={estadoEfetivo === "expandida" ? abaAtual : compacta.tipo} />
          {restanteFechar != null && restanteFechar <= 10000 && (
            <span className="ilha-contagem" style={{ width: (restanteFechar / 10000) * 160 }} aria-hidden="true" />
          )}
        </motion.div>
      </motion.div>
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
