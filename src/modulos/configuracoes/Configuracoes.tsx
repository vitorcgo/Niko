import { useEffect, useMemo, useState } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  User, Palette, PanelTop, PanelBottom, CircleDot, Timer, Users, Volume2, Gauge, Maximize, Keyboard, EyeOff, Database, Terminal, Info, Code,
  GripVertical, Download, Upload, RotateCcw, Trash2, DatabaseBackup, Hand, Search, ArrowUpRight,
} from "lucide-react";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { Botao, Campo, Modal, Segmentado, AvisoFaixa, LinhaAlternador, Alternador, ConfirmarModal } from "../../componentes/basicos";
import { Personagem } from "../../personagens/Personagem";
import { useConfig, BARRA_PADRAO, CATEGORIAS_DE_AVISO, type ModoBorda, type Paleta, type Tema, type RepousoIlha, type AbaIlha, CONFIG_PADRAO } from "../../estado/configuracoes";
import { useAgentes, AGENTES } from "../../estado/agentes";
import { useComunicacao } from "../../estado/comunicacao";
import { useInterface } from "../../estado/interface";
import { usePomodoro } from "../../estado/pomodoro";
import { T } from "../../textos/textos";
import { contraste, hexValido, FUNDO_DESTAQUE } from "../../utilitarios/cores";
import { baixarArquivo, lerArquivoTexto, normalizarTexto } from "../../utilitarios/basicos";
import { abaLigada, rotaLigada } from "../../utilitarios/funcoes";
import { hojeISO } from "../../utilitarios/datas";
import { validarBackup } from "../../utilitarios/backupValido";
import { listarChaves, lerChave, gravarChave, salvarAgora, modoArmazenamento, zerarTudo, tamanhoGuardado, PREFIXO } from "../../ponte/armazenamento";
import { TODOS_OS_SONS, tocarSom, type CategoriaSom } from "../../ponte/sons";
import { DESTAQUE_SISTEMA } from "../../janelas/area-de-trabalho/usarTema";
import { mudarTema } from "../../janelas/area-de-trabalho/mudarTema";
import { EditorFoto } from "../../componentes/FotoPerfil";
import { SeletorDeFundo } from "./SeletorDeFundo";
import { SecaoClaudeCode } from "./SecaoClaudeCode";
import { SecaoAssistive } from "./SecaoAssistive";
import { EditorDeAtalhos } from "./EditorDeAtalhos";
import { AlternadorAjuste, FaixaAjuste, GrupoAjuste, LinhaAjuste, NotaAjuste, Teclas } from "./LinhaAjuste";
import { NATIVO } from "../../desktop/desktop";
import { pedirSaudacao } from "../../janelas/ilha/animacoes/pedirSaudacao";
import type { EstadoAgente, Rota } from "../../tipos";

type Secao = keyof typeof T.configuracoes.secoes;

const ICONES: Record<Secao, React.ReactNode> = {
  geral: <User size={13} />,
  aparencia: <Palette size={13} />,
  ilha: <PanelTop size={13} />,
  dock: <PanelBottom size={13} />,
  assistive: <CircleDot size={13} />,
  pomodoro: <Timer size={13} />,
  agentes: <Users size={13} />,
  sons: <Volume2 size={13} />,
  consumo: <Gauge size={13} />,
  tela: <Maximize size={13} />,
  atalhos: <Keyboard size={13} />,
  privacidade: <EyeOff size={13} />,
  dados: <Database size={13} />,
  claude: <Terminal size={13} />,
  sobre: <Info size={13} />,
  desenvolvedor: <Code size={13} />,
};

const AMOSTRAS_PALETA: Record<Paleta, { escuro: [string, string]; claro: [string, string] }> = {
  padrao: { escuro: ["#0e0e10", "#161618"], claro: ["#f6f5f2", "#ffffff"] },
  areia: { escuro: ["#14110d", "#1c1814"], claro: ["#f5f1ea", "#fffdf9"] },
  grafite: { escuro: ["#0b0c0e", "#131418"], claro: ["#eeeff1", "#fbfbfc"] },
  floresta: { escuro: ["#0c110d", "#131a14"], claro: ["#f1f4f0", "#fcfdfb"] },
  oceano: { escuro: ["#0a0f13", "#11181e"], claro: ["#eff3f6", "#fbfdfe"] },
};

const CORES_DESTAQUE: [keyof typeof T.configuracoes.coresDestaque, string][] = [
  ["vermelho", DESTAQUE_SISTEMA],
  ["roxo", "#7c5ce0"],
  ["verde", "#2f9e6b"],
  ["azul", "#3b82f6"],
  ["laranja", "#d9922b"],
];

const ESCALAS = [0.9, 1, 1.1, 1.2];

function ItemBarraOrdenavel({ rota, nome, visivel, aoMudarNome, aoMudarVisivel }: { rota: Rota; nome?: string; visivel: boolean; aoMudarNome: (n: string) => void; aoMudarVisivel: (v: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rota });
  return (
    <div ref={setNodeRef} className="ajuste-ordenavel" data-arrastando={isDragging ? "sim" : undefined} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <button type="button" className="ajuste-alca" aria-label={T.rotas[rota]} {...attributes} {...listeners}>
        <GripVertical size={14} />
      </button>
      <input className="campo ajuste-valor ajuste-ordenavel-campo" value={nome ?? ""} placeholder={T.rotas[rota]} maxLength={24} aria-label={T.rotas[rota]} onChange={(e) => aoMudarNome(e.target.value)} />
      <Alternador ligado={visivel} aoMudar={aoMudarVisivel} rotulo={T.rotas[rota]} />
    </div>
  );
}

const CHAVES_VISUAL = ["tema", "paleta", "destaque", "escala", "barraLateral", "ilha", "dock"] as const;

function fundoValido(valor: unknown): valor is string {
  return valor === FUNDO_DESTAQUE || (typeof valor === "string" && hexValido(valor));
}

function opacidadeValida(valor: unknown): valor is number {
  return typeof valor === "number" && valor >= 0.3 && valor <= 1;
}

function validarVisual(dados: unknown): Partial<ReturnType<typeof useConfig.getState>> | null {
  if (!dados || typeof dados !== "object") return null;
  const d = dados as Record<string, unknown>;
  if (d.tipo !== "niko-visual") return null;
  const v = d.visual as Record<string, unknown> | undefined;
  if (!v) return null;
  const saida: Record<string, unknown> = {};
  if (["claro", "escuro", "sistema"].includes(v.tema as string)) saida.tema = v.tema;
  if (Object.keys(AMOSTRAS_PALETA).includes(v.paleta as string)) saida.paleta = v.paleta;
  if (v.destaque === null || (typeof v.destaque === "string" && hexValido(v.destaque))) saida.destaque = v.destaque;
  if (typeof v.escala === "number" && v.escala >= 0.8 && v.escala <= 1.3) saida.escala = v.escala;
  if (Array.isArray(v.barraLateral)) {
    const validos = v.barraLateral.filter((i: unknown) => i && typeof i === "object" && BARRA_PADRAO.some((b) => b.rota === (i as { rota: string }).rota)).map((i: { rota: Rota; nome?: unknown; visivel?: unknown }) => ({ rota: i.rota, nome: typeof i.nome === "string" ? i.nome.slice(0, 24) : undefined, visivel: i.visivel !== false }));
    if (validos.length) saida.barraLateral = [...validos, ...BARRA_PADRAO.filter((b) => !validos.some((x: { rota: Rota }) => x.rota === b.rota))];
  }
  if (v.ilha && typeof v.ilha === "object") {
    const i = v.ilha as Record<string, unknown>;
    saida.ilha = {
      ...CONFIG_PADRAO.ilha,
      modo: ["fixo", "esconder", "inteligente"].includes(i.modo as string) ? i.modo : CONFIG_PADRAO.ilha.modo,
      tamanho: ["pequena", "media", "grande"].includes(i.tamanho as string) ? i.tamanho : "media",
      fundo: fundoValido(i.fundo) ? i.fundo : CONFIG_PADRAO.ilha.fundo,
      opacidade: opacidadeValida(i.opacidade) ? i.opacidade : 1,
      repouso: ["nada", "relogio", "midia", "agente"].includes(i.repouso as string) ? i.repouso : "agente",
      fechamentoSeg: typeof i.fechamentoSeg === "number" && i.fechamentoSeg >= 0 && i.fechamentoSeg <= 120 ? i.fechamentoSeg : 15,
      abrirHover: i.abrirHover === true,
      laterais: i.laterais !== false,
    };
  }
  if (v.dock && typeof v.dock === "object") {
    const k = v.dock as Record<string, unknown>;
    saida.dock = {
      ...useConfig.getState().dock,
      ativo: k.ativo !== false,
      modo: ["fixo", "esconder", "inteligente"].includes(k.modo as string) ? (k.modo as ModoBorda) : "inteligente",
      fundo: fundoValido(k.fundo) ? k.fundo : CONFIG_PADRAO.dock.fundo,
      opacidade: opacidadeValida(k.opacidade) ? k.opacidade : 1,
    };
  }
  return saida as Partial<ReturnType<typeof useConfig.getState>>;
}


function SecaoDados() {
  const avisar = useInterface((s) => s.avisar);
  const [previa, setPrevia] = useState<{ dados: Record<string, string>; resumo: string[] } | null>(null);
  const [erro, setErro] = useState("");
  const [apagar, setApagar] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [apagarChaves, setApagarChaves] = useState(false);
  const [zerando, setZerando] = useState(false);
  const comBanco = modoArmazenamento() === "banco";

  const exportar = (nome = `niko-backup-${hojeISO()}.json`) => {
    const dados: Record<string, string> = {};
    for (const k of listarChaves()) {
      const v = lerChave(k);
      if (v != null) dados[k] = v;
    }
    baixarArquivo(nome, JSON.stringify({ tipo: "niko-backup", versao: 1, criadoEm: new Date().toISOString(), dados }, null, 1));
  };

  const ler = async (arquivo: File) => {
    setPrevia(null);
    try {
      const texto = await lerArquivoTexto(arquivo, 20 * 1024 * 1024);
      const dados = validarBackup(JSON.parse(texto));
      const resumo: string[] = [];
      for (const [k, v] of Object.entries(dados)) {
        const nome = k.replace(PREFIXO, "");
        const estado = (JSON.parse(v) as { state?: Record<string, unknown> }).state ?? {};
        const contagens = Object.entries(estado).filter(([, x]) => Array.isArray(x)).map(([c, x]) => `${c}: ${(x as unknown[]).length}`);
        resumo.push(`${nome}${contagens.length ? ` (${contagens.slice(0, 4).join(", ")})` : ""}`);
      }
      if (Object.keys(dados).length === 0) throw new Error("vazio");
      setPrevia({ dados, resumo });
      setErro("");
    } catch (e) {
      setErro((e as Error).message === "arquivo_grande" ? T.validacao.arquivoGrande : T.validacao.arquivoInvalido);
    }
  };

  return (
    <>
      <LinhaAjuste rotulo={T.configuracoes.backupBanco} dica={comBanco ? T.configuracoes.backupBancoDica : T.configuracoes.semBanco}>
        <Botao
          variante="primario"
          icone={<DatabaseBackup size={13} />}
          disabled={!comBanco}
          onClick={async () => {
            try {
              await salvarAgora();
              const r = await fetch("/ponte/dados/backup", { method: "POST", headers: { "x-niko": "1" } });
              const j = (await r.json()) as { pasta?: string; erro?: string };
              avisar(j.pasta ? T.configuracoes.backupFeito(j.pasta) : T.configuracoes.backupFalhou);
            } catch {
              avisar(T.configuracoes.backupFalhou);
            }
          }}
        >
          {T.configuracoes.backupBanco}
        </Botao>
      </LinhaAjuste>
      <LinhaAjuste rotulo={T.configuracoes.backup} dica={T.configuracoes.backupDica}>
        <Botao icone={<Download size={13} />} onClick={() => exportar()}>{T.geral.exportar}</Botao>
      </LinhaAjuste>
      <LinhaAjuste rotulo={T.configuracoes.restaurar} dica={erro ? <span className="ajuste-dica-erro" role="alert">{erro}</span> : undefined}>
        <label className="botao botao-secundario" style={{ cursor: "pointer" }}>
          <Upload size={13} />
          {T.geral.importar}
          <input type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void ler(f); e.target.value = ""; }} />
        </label>
      </LinhaAjuste>
      <LinhaAjuste rotulo={T.configuracoes.importarOutroApp} dica={T.configuracoes.importarOutroAppDica}>
        <Botao disabled>{T.configuracoes.somenteDesktop}</Botao>
      </LinhaAjuste>
      <LinhaAjuste rotulo={T.configuracoes.apagarTudo} dica={T.configuracoes.apagarTudoAviso}>
        <Botao variante="perigo" icone={<Trash2 size={13} />} onClick={() => { setConfirmacao(""); setApagar(true); }}>{T.configuracoes.apagarTudo}</Botao>
      </LinhaAjuste>
      <Modal aberto={!!previa} titulo={T.configuracoes.restaurarPrevia} aoFechar={() => setPrevia(null)}>
        {previa && (
          <div className="formulario">
            <AvisoFaixa tipo="alerta">{T.configuracoes.restaurarAviso}</AvisoFaixa>
            <ul className="texto-2" style={{ paddingLeft: 16, fontSize: 12 }}>{previa.resumo.map((r) => <li key={r}>{r}</li>)}</ul>
            <div className="formulario-acoes">
              <Botao onClick={() => setPrevia(null)}>{T.geral.cancelar}</Botao>
              <Botao
                variante="primario"
                onClick={() => {
                  exportar(`niko-antes-de-restaurar-${hojeISO()}.json`);
                  for (const [k, v] of Object.entries(previa.dados)) gravarChave(k, v);
                  avisar(T.configuracoes.restaurado);
                  void salvarAgora().then(() => window.setTimeout(() => window.location.reload(), 400));
                }}
              >
                {T.configuracoes.restaurar}
              </Botao>
            </div>
          </div>
        )}
      </Modal>
      <Modal aberto={apagar} titulo={T.configuracoes.apagarTudo} aoFechar={() => setApagar(false)}>
        <form
          className="formulario"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (confirmacao !== "APAGAR" || zerando) return;
            setZerando(true);
            exportar(`niko-antes-de-zerar-${hojeISO()}.json`);
            zerarTudo(apagarChaves)
              .then(() => window.location.reload())
              .catch(() => {
                setZerando(false);
                avisar(T.configuracoes.zerarFalhou);
              });
          }}
        >
          <AvisoFaixa tipo="erro">{T.configuracoes.apagarTudoAviso}</AvisoFaixa>
          <Campo id="ap-conf" rotulo={T.configuracoes.apagarConfirmar}>
            <input id="ap-conf" className="campo" value={confirmacao} autoComplete="off" onChange={(e) => setConfirmacao(e.target.value)} />
          </Campo>
          <LinhaAlternador rotulo={T.configuracoes.apagarChaves} dica={T.configuracoes.apagarChavesDica} ligado={apagarChaves} aoMudar={setApagarChaves} />
          <div className="formulario-acoes">
            <Botao onClick={() => setApagar(false)}>{T.geral.cancelar}</Botao>
            <Botao type="submit" variante="perigo" disabled={confirmacao !== "APAGAR" || zerando}>{zerando ? T.configuracoes.zerando : T.configuracoes.apagarTudo}</Botao>
          </div>
        </form>
      </Modal>
    </>
  );
}

function numeroLimitado(texto: string, min: number, max: number, padrao: number) {
  return Math.max(min, Math.min(max, Math.round(Number(texto) || padrao)));
}

export default function Configuracoes() {
  const cfg = useConfig();
  const avisar = useInterface((s) => s.avisar);
  const irPara = useInterface((s) => s.irPara);
  const agentes = useAgentes();
  const memoria = useComunicacao((s) => s.memoria);
  const lembrar = useComunicacao((s) => s.lembrar);
  const esquecer = useComunicacao((s) => s.esquecer);
  const limparConversas = useComunicacao((s) => s.limparConversas);
  const parametros = useInterface((s) => s.parametros);
  const [secao, setSecao] = useState<Secao>(parametros.secao && parametros.secao in T.configuracoes.secoes ? (parametros.secao as Secao) : "geral");
  useEffect(() => {
    if (parametros.secao && parametros.secao in T.configuracoes.secoes) setSecao(parametros.secao as Secao);
  }, [parametros]);
  const [busca, setBusca] = useState("");
  const secoesVisiveis = useMemo(() => {
    const termo = normalizarTexto(busca.trim());
    const todas = Object.keys(T.configuracoes.secoes) as Secao[];
    if (!termo) return todas;
    return todas.filter((s) => normalizarTexto(`${T.configuracoes.secoes[s]} ${T.configuracoes.palavrasChave[s]}`).includes(termo));
  }, [busca]);
  useEffect(() => {
    if (secoesVisiveis.length > 0 && !secoesVisiveis.includes(secao)) setSecao(secoesVisiveis[0]);
  }, [secoesVisiveis, secao]);
  const [previaVisual, setPreviaVisual] = useState<ReturnType<typeof validarVisual>>(null);
  const [erroVisual, setErroVisual] = useState("");
  const [novoFato, setNovoFato] = useState("");
  const [corTexto, setCorTexto] = useState(cfg.destaque ?? "");
  const [limparChat, setLimparChat] = useState(false);
  const fundo = getComputedStyle(document.documentElement).getPropertyValue("--superficie").trim() || "#ffffff";
  const corAtual = cfg.destaque ?? DESTAQUE_SISTEMA;
  const razao = useMemo(() => contraste(corAtual, fundo.startsWith("#") ? fundo : "#ffffff"), [corAtual, fundo]);
  const temaEfetivo = document.documentElement.dataset.tema === "claro" ? "claro" : "escuro";
  const razaoTexto = razao.toFixed(1).replace(".", ",");

  const aoArrastarBarra = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const de = cfg.barraLateral.findIndex((b) => b.rota === e.active.id);
    const para = cfg.barraLateral.findIndex((b) => b.rota === e.over?.id);
    cfg.definir({ barraLateral: arrayMove(cfg.barraLateral, de, para) });
  };

  const aoArrastarAbas = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const de = cfg.ilha.ordemAbas.indexOf(e.active.id as AbaIlha);
    const para = cfg.ilha.ordemAbas.indexOf(e.over.id as AbaIlha);
    cfg.definirIlha({ ordemAbas: arrayMove(cfg.ilha.ordemAbas, de, para) });
  };

  const segModo = (valor: ModoBorda, aoMudar: (m: ModoBorda) => void) => (
    <Segmentado<ModoBorda> rotulo={T.configuracoes.modo} valor={valor} aoMudar={aoMudar} opcoes={(["fixo", "esconder", "inteligente"] as ModoBorda[]).map((m) => ({ valor: m, rotulo: T.configuracoes.modos[m] }))} />
  );

  const escolherDestaque = (cor: string) => {
    cfg.definir({ destaque: cor });
    setCorTexto(cor);
  };

  const conteudo: Record<Secao, React.ReactNode> = {
    geral: (
      <>
        <div className="ajuste-perfil">
          <EditorFoto tamanho={96}>
            <label className="ajuste-perfil-rotulo" htmlFor="cf-nome">{T.configuracoes.nomePerfil}</label>
            <input id="cf-nome" className="campo ajuste-perfil-nome" value={cfg.nome} maxLength={40} placeholder={T.barraLateral.perfil} onChange={(e) => cfg.definir({ nome: e.target.value })} />
          </EditorFoto>
        </div>
        <AlternadorAjuste rotulo={T.configuracoes.viradaDia} dica={T.configuracoes.viradaDiaDica} ligado={cfg.viradaAs4h} aoMudar={(v) => cfg.definir({ viradaAs4h: v })} />
        <AlternadorAjuste rotulo={T.configuracoes.iniciarComWindows} dica={T.configuracoes.iniciarComWindowsDica} ligado={cfg.iniciarComWindows} aoMudar={(v) => cfg.definir({ iniciarComWindows: v })} />
        <AlternadorAjuste rotulo={T.configuracoes.manterSegundoPlano} dica={`${T.configuracoes.manterDica} ${T.configuracoes.somenteDesktop}.`} ligado={false} desativado aoMudar={() => undefined} />
        <AlternadorAjuste rotulo={T.configuracoes.conquistasAtivas} ligado={cfg.conquistasAtivas} aoMudar={(v) => cfg.definir({ conquistasAtivas: v })} />
        <AlternadorAjuste rotulo={T.calendario.integracaoMostrar} ligado={cfg.sugestaoAgendaGoogle} aoMudar={(v) => cfg.definir({ sugestaoAgendaGoogle: v })} />
      </>
    ),
    aparencia: (
      <>
        <LinhaAjuste rotulo={T.configuracoes.tema} dica={T.configuracoes.temaDica}>
          <Segmentado<Tema> rotulo={T.configuracoes.tema} valor={cfg.tema} aoMudar={mudarTema} opcoes={[{ valor: "claro", rotulo: T.barraLateral.temaClaro }, { valor: "escuro", rotulo: T.barraLateral.temaEscuro }, { valor: "sistema", rotulo: T.barraLateral.temaSistema }]} />
        </LinhaAjuste>
        <LinhaAjuste
          rotulo={T.configuracoes.destaque}
          dica={
            <>
              {T.configuracoes.destaqueDica}
              {cfg.destaque && (
                <span className={razao < 4.5 ? "ajuste-dica-erro" : undefined}>
                  {" "}
                  {razao < 4.5 ? T.configuracoes.contrasteBaixo(razaoTexto) : T.configuracoes.contrasteOk(razaoTexto)}
                </span>
              )}
            </>
          }
        >
          <div className="ajuste-cores" role="group" aria-label={T.configuracoes.destaque}>
            {CORES_DESTAQUE.map(([nome, cor]) => (
              <button
                key={nome}
                type="button"
                className="ajuste-cor"
                style={{ color: cor }}
                aria-pressed={corAtual.toLowerCase() === cor}
                aria-label={T.configuracoes.coresDestaque[nome]}
                title={T.configuracoes.coresDestaque[nome]}
                onClick={() => escolherDestaque(cor)}
              />
            ))}
            <input
              type="color"
              className="ajuste-cor-seletor"
              value={hexValido(corAtual) ? corAtual : DESTAQUE_SISTEMA}
              aria-label={T.configuracoes.corPersonalizada}
              title={T.configuracoes.corPersonalizada}
              onChange={(e) => escolherDestaque(e.target.value)}
            />
          </div>
          <input
            className="campo ajuste-valor ajuste-valor-hex"
            value={corTexto}
            maxLength={7}
            placeholder={DESTAQUE_SISTEMA}
            aria-label={T.configuracoes.corHex}
            aria-invalid={!!corTexto && !hexValido(corTexto)}
            onChange={(e) => {
              setCorTexto(e.target.value);
              if (hexValido(e.target.value)) cfg.definir({ destaque: e.target.value });
            }}
          />
          <Botao pequeno soIcone variante="fantasma" icone={<RotateCcw size={13} />} aria-label={T.geral.restaurarPadrao} title={T.geral.restaurarPadrao} onClick={() => { cfg.definir({ destaque: null }); setCorTexto(""); }} />
        </LinhaAjuste>
        <LinhaAjuste rotulo={T.configuracoes.paleta} dica={T.configuracoes.paletaDica}>
          <div className="ajuste-paletas" role="group" aria-label={T.configuracoes.paleta}>
            {(Object.keys(AMOSTRAS_PALETA) as Paleta[]).map((p) => {
              const [a, b] = AMOSTRAS_PALETA[p][temaEfetivo];
              return (
                <button key={p} type="button" className="ajuste-paleta" aria-pressed={cfg.paleta === p} onClick={() => cfg.definir({ paleta: p })}>
                  <span className="ajuste-paleta-amostra" style={{ background: `linear-gradient(135deg, ${a} 50%, ${b} 50%)` }} />
                  <span className="ajuste-paleta-nome">{T.configuracoes.paletas[p]}</span>
                </button>
              );
            })}
          </div>
        </LinhaAjuste>
        <LinhaAjuste rotulo={T.configuracoes.escala} dica={T.configuracoes.escalaDica} para="cf-escala" esticar>
          <FaixaAjuste
            id="cf-escala"
            rotulo={T.configuracoes.escala}
            valor={Math.max(0, ESCALAS.indexOf(cfg.escala))}
            min={0}
            max={ESCALAS.length - 1}
            passo={1}
            texto={`${Math.round(cfg.escala * 100)}%`}
            aoMudar={(i) => cfg.definir({ escala: ESCALAS[i] ?? 1 })}
          />
        </LinhaAjuste>
        <AlternadorAjuste rotulo={T.configuracoes.reduzirAnimacoes} dica={T.configuracoes.reduzirAnimacoesDica} ligado={cfg.reduzirAnimacoes} aoMudar={(v) => cfg.definir({ reduzirAnimacoes: v })} />
        <AlternadorAjuste rotulo={T.configuracoes.modoLeveEscritorio} ligado={cfg.modoLeveEscritorio} aoMudar={(v) => cfg.definir({ modoLeveEscritorio: v })} />
        <GrupoAjuste
          titulo={T.configuracoes.barraLateral}
          dica={T.configuracoes.barraDica}
          acoes={<Botao pequeno variante="fantasma" icone={<RotateCcw size={12} />} onClick={() => cfg.definir({ barraLateral: BARRA_PADRAO })}>{T.geral.restaurarPadrao}</Botao>}
        />
        <div className="ajuste-bloco">
          <DndContext collisionDetection={closestCenter} onDragEnd={aoArrastarBarra}>
            <SortableContext items={cfg.barraLateral.map((b) => b.rota)} strategy={verticalListSortingStrategy}>
              <div className="ajuste-ordenaveis">
                {cfg.barraLateral.filter((b) => rotaLigada(b.rota, cfg.funcoesDesligadas)).map((b) => (
                  <ItemBarraOrdenavel
                    key={b.rota}
                    rota={b.rota}
                    nome={b.nome}
                    visivel={b.visivel}
                    aoMudarNome={(n) => cfg.definir({ barraLateral: cfg.barraLateral.map((x) => (x.rota === b.rota ? { ...x, nome: n || undefined } : x)) })}
                    aoMudarVisivel={(v) => cfg.definir({ barraLateral: cfg.barraLateral.map((x) => (x.rota === b.rota ? { ...x, visivel: v } : x)) })}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
        <LinhaAjuste rotulo={T.configuracoes.arquivoVisual} dica={erroVisual ? <span className="ajuste-dica-erro" role="alert">{erroVisual}</span> : T.configuracoes.arquivoVisualDica}>
          <Botao
            icone={<Download size={13} />}
            onClick={() => {
              const visual = Object.fromEntries(CHAVES_VISUAL.map((k) => [k, cfg[k]]));
              baixarArquivo(`visual-${hojeISO()}.niko-visual`, JSON.stringify({ tipo: "niko-visual", versao: 1, visual }, null, 2));
            }}
          >
            {T.configuracoes.exportarVisual}
          </Botao>
          <label className="botao botao-secundario" style={{ cursor: "pointer" }}>
            <Upload size={13} />
            {T.configuracoes.importarVisual}
            <input
              type="file"
              accept=".niko-visual,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  const v = validarVisual(JSON.parse(await lerArquivoTexto(f, 200 * 1024)));
                  if (!v) throw new Error();
                  setPreviaVisual(v);
                  setErroVisual("");
                } catch {
                  setErroVisual(T.validacao.arquivoInvalido);
                }
              }}
            />
          </label>
        </LinhaAjuste>
      </>
    ),
    ilha: (
      <>
        <AlternadorAjuste rotulo={T.configuracoes.ilhaAtiva} ligado={cfg.ilha.ativa} aoMudar={(v) => cfg.definirIlha({ ativa: v })} />
        <LinhaAjuste rotulo={T.configuracoes.verSaudacao} dica={T.configuracoes.verSaudacaoDica}>
          <Botao icone={<Hand size={13} />} disabled={!cfg.ilha.ativa} onClick={() => void pedirSaudacao()}>{T.configuracoes.verSaudacao}</Botao>
        </LinhaAjuste>
        <LinhaAjuste rotulo={T.configuracoes.modo} dica={T.configuracoes.modosDica[cfg.ilha.modo]}>
          {segModo(cfg.ilha.modo, (modo) => cfg.definirIlha({ modo }))}
        </LinhaAjuste>
        <LinhaAjuste rotulo={T.configuracoes.tamanhoIlha}>
          <Segmentado<"pequena" | "media" | "grande"> rotulo={T.configuracoes.tamanhoIlha} valor={cfg.ilha.tamanho} aoMudar={(tamanho) => cfg.definirIlha({ tamanho })} opcoes={(["pequena", "media", "grande"] as const).map((t) => ({ valor: t, rotulo: T.configuracoes.tamanhos[t] }))} />
        </LinhaAjuste>
        <LinhaAjuste rotulo={T.configuracoes.repousoIlha}>
          <Segmentado<RepousoIlha> rotulo={T.configuracoes.repousoIlha} valor={cfg.ilha.repouso} aoMudar={(repouso) => cfg.definirIlha({ repouso })} opcoes={(Object.keys(T.configuracoes.repousos) as RepousoIlha[]).map((r) => ({ valor: r, rotulo: T.configuracoes.repousos[r] }))} />
        </LinhaAjuste>
        <LinhaAjuste rotulo={T.configuracoes.agenteFavorito} para="il-fav">
          <select id="il-fav" className="seletor ajuste-valor" value={cfg.agentes.favorito} onChange={(e) => cfg.definir({ agentes: { ...cfg.agentes, favorito: e.target.value as typeof cfg.agentes.favorito } })}>
            {AGENTES.map((a) => <option key={a} value={a}>{cfg.agentes.nomes[a]}</option>)}
          </select>
        </LinhaAjuste>
        <SeletorDeFundo id="il-fundo" fundo={cfg.ilha.fundo} opacidade={cfg.ilha.opacidade} aoMudar={(m) => cfg.definirIlha(m)} />
        <LinhaAjuste rotulo={T.configuracoes.fechamentoAuto} para="il-fech">
          <select id="il-fech" className="seletor ajuste-valor" value={cfg.ilha.fechamentoSeg} onChange={(e) => cfg.definirIlha({ fechamentoSeg: Number(e.target.value) })}>
            {[5, 10, 15, 30, 60, 120].map((s) => <option key={s} value={s}>{T.conexoes.segundos(s)}</option>)}
            <option value={0}>{T.configuracoes.nunca}</option>
          </select>
        </LinhaAjuste>
        <LinhaAjuste rotulo={T.configuracoes.esconderCompacta} dica={cfg.ilha.modo !== "esconder" ? T.configuracoes.modosDica.esconder : undefined} para="il-esc">
          <select id="il-esc" className="seletor ajuste-valor" value={cfg.ilha.esconderSeg} disabled={cfg.ilha.modo !== "esconder"} onChange={(e) => cfg.definirIlha({ esconderSeg: Number(e.target.value) })}>
            {[10, 30, 60, 120, 300].map((s) => <option key={s} value={s}>{T.conexoes.segundos(s)}</option>)}
          </select>
        </LinhaAjuste>
        <AlternadorAjuste rotulo={T.configuracoes.abrirHover} ligado={cfg.ilha.abrirHover} aoMudar={(v) => cfg.definirIlha({ abrirHover: v })} />
        <AlternadorAjuste rotulo={T.configuracoes.lateraisIlha} dica={T.configuracoes.lateraisDica} ligado={cfg.ilha.laterais} aoMudar={(v) => cfg.definirIlha({ laterais: v })} />
        <LinhaAjuste rotulo={T.configuracoes.notificacoesIlha} dica={T.configuracoes.notificacoesDica[cfg.ilha.notificacoes]}>
          <Segmentado rotulo={T.configuracoes.notificacoesIlha} valor={cfg.ilha.notificacoes} aoMudar={(v) => cfg.definirIlha({ notificacoes: v })} opcoes={(["importantes", "todas", "nenhuma"] as const).map((v) => ({ valor: v, rotulo: T.configuracoes.notificacoesOpcoes[v] }))} />
        </LinhaAjuste>
        <GrupoAjuste titulo={T.configuracoes.blocosIlha} dica={T.configuracoes.blocosDica} />
        <div className="ajuste-bloco">
          <DndContext collisionDetection={closestCenter} onDragEnd={aoArrastarAbas}>
            <SortableContext items={cfg.ilha.ordemAbas} strategy={verticalListSortingStrategy}>
              <div className="ajuste-ordenaveis">
                {cfg.ilha.ordemAbas.filter((a) => abaLigada(a, cfg.funcoesDesligadas)).map((a) => <AbaIlhaOrdenavel key={a} aba={a} />)}
              </div>
            </SortableContext>
          </DndContext>
        </div>
        <GrupoAjuste titulo={T.configuracoes.avisosPorTipo} dica={T.configuracoes.avisosPorTipoDica} />
        {CATEGORIAS_DE_AVISO.map((c) => (
          <AlternadorAjuste
            key={c}
            rotulo={T.configuracoes.categoriasDeAviso[c]}
            ligado={!cfg.avisosDesligados.includes(c)}
            aoMudar={(v) => cfg.definir({ avisosDesligados: v ? cfg.avisosDesligados.filter((x) => x !== c) : [...cfg.avisosDesligados, c] })}
          />
        ))}
      </>
    ),
    dock: (
      <>
        <AlternadorAjuste rotulo={T.configuracoes.dockAtivo} ligado={cfg.dock.ativo} aoMudar={(v) => cfg.definir({ dock: { ...cfg.dock, ativo: v } })} />
        <LinhaAjuste rotulo={T.configuracoes.modo} dica={T.configuracoes.modosDica[cfg.dock.modo]}>
          {segModo(cfg.dock.modo, (modo) => cfg.definir({ dock: { ...cfg.dock, modo } }))}
        </LinhaAjuste>
        <AlternadorAjuste rotulo={T.configuracoes.ampliarDock} ligado={cfg.dock.ampliar} aoMudar={(v) => cfg.definir({ dock: { ...cfg.dock, ampliar: v } })} />
        <SeletorDeFundo id="dk-fundo" fundo={cfg.dock.fundo} opacidade={cfg.dock.opacidade} aoMudar={(m) => cfg.definir({ dock: { ...cfg.dock, ...m } })} />
        <NotaAjuste>
          <AvisoFaixa>{T.configuracoes.appsWindowsDock}</AvisoFaixa>
        </NotaAjuste>
      </>
    ),
    pomodoro: (
      <>
        <LinhaAjuste rotulo={T.configuracoes.duracoes} dica={T.validacao.entre(1, 180)}>
          {(["foco", "curta", "longa"] as const).map((k) => (
            <label key={k} className="ajuste-rotulado">
              <span>{k === "foco" ? T.pomodoro.etapas.foco : k === "curta" ? T.pomodoro.etapas.pausa_curta : T.pomodoro.etapas.pausa_longa}</span>
              <input
                id={`pm-${k}`}
                className="campo ajuste-valor ajuste-valor-numero"
                type="number"
                min={1}
                max={180}
                value={cfg.pomodoro[k]}
                onChange={(e) => {
                  cfg.definir({ pomodoro: { ...cfg.pomodoro, [k]: numeroLimitado(e.target.value, 1, 180, 1) } });
                  usePomodoro.getState().reiniciar();
                }}
              />
            </label>
          ))}
        </LinhaAjuste>
        <LinhaAjuste rotulo={T.configuracoes.ciclos} dica={T.validacao.entre(1, 12)} para="pm-ciclos">
          <input id="pm-ciclos" className="campo ajuste-valor ajuste-valor-numero" type="number" min={1} max={12} value={cfg.pomodoro.ciclos} onChange={(e) => cfg.definir({ pomodoro: { ...cfg.pomodoro, ciclos: numeroLimitado(e.target.value, 1, 12, 1) } })} />
        </LinhaAjuste>
        <AlternadorAjuste rotulo={T.configuracoes.autoProxima} ligado={cfg.pomodoro.autoProxima} aoMudar={(v) => cfg.definir({ pomodoro: { ...cfg.pomodoro, autoProxima: v } })} />
        <AlternadorAjuste rotulo={T.configuracoes.tiquePomodoro} dica={T.configuracoes.tiquePomodoroDica} ligado={cfg.pomodoro.tique} aoMudar={(v) => cfg.definir({ pomodoro: { ...cfg.pomodoro, tique: v } })} />
      </>
    ),
    agentes: (
      <>
        <NotaAjuste><Botao icone={<Users size={14} />} onClick={() => useInterface.getState().irPara("agentes")}>{T.agentes.personalizacao.abrir}</Botao></NotaAjuste>
        <LinhaAjuste rotulo={T.configuracoes.inatividade} para="ag-ina">
          <input id="ag-ina" className="campo ajuste-valor ajuste-valor-numero" type="number" min={1} max={240} value={cfg.agentes.inatividadeMin} onChange={(e) => cfg.definir({ agentes: { ...cfg.agentes, inatividadeMin: numeroLimitado(e.target.value, 1, 240, 10) } })} />
        </LinhaAjuste>
        <LinhaAjuste rotulo={T.configuracoes.semprePermitido} dica={cfg.ia.autoAprovar.length === 0 ? T.configuracoes.semprePermitidoVazio : undefined}>
          {cfg.ia.autoAprovar.length > 0 && (
            <div className="pilulas">
              {cfg.ia.autoAprovar.map((tipo) => (
                <button key={tipo} type="button" className="pilula" title={T.geral.excluir} onClick={() => cfg.definir({ ia: { ...cfg.ia, autoAprovar: cfg.ia.autoAprovar.filter((x) => x !== tipo) } })}>
                  <code>{T.chat.permissao.acoes[tipo]}</code>
                  <Trash2 size={12} />
                </button>
              ))}
            </div>
          )}
        </LinhaAjuste>
        <GrupoAjuste titulo={T.configuracoes.memoria} dica={memoria.length === 0 ? T.configuracoes.semMemoria : undefined} />
        <div className="ajuste-bloco">
          {memoria.length > 0 && (
            <div className="lista">
              {memoria.map((m) => (
                <div key={m.id} className="lista-item">
                  <span className="lista-item-principal">{m.texto}</span>
                  <span className="etiqueta">{cfg.agentes.nomes[m.agenteId]}</span>
                  <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => esquecer(m.id)} />
                </div>
              ))}
            </div>
          )}
          <form className="ajuste-fato" noValidate onSubmit={(e) => { e.preventDefault(); if (!novoFato.trim()) return; lembrar(novoFato, "organizador", "manual"); setNovoFato(""); }}>
            <input className="campo" value={novoFato} maxLength={300} placeholder={T.configuracoes.novoFato} aria-label={T.configuracoes.novoFato} onChange={(e) => setNovoFato(e.target.value)} />
            <Botao type="submit">{T.geral.adicionar}</Botao>
          </form>
        </div>
      </>
    ),
    sons: (
      <>
        <AlternadorAjuste rotulo={T.configuracoes.sonsAtivos} ligado={cfg.sons.ligado} aoMudar={(v) => cfg.definir({ sons: { ...cfg.sons, ligado: v } })} />
        <LinhaAjuste rotulo={T.configuracoes.volume} para="sn-volume" esticar>
          <FaixaAjuste id="sn-volume" rotulo={T.configuracoes.volume} valor={cfg.sons.volume} min={0} max={0.5} passo={0.01} texto={`${Math.round(cfg.sons.volume * 100)}%`} aoMudar={(volume) => cfg.definir({ sons: { ...cfg.sons, volume } })} aoSoltar={() => void tocarSom("blip")} />
        </LinhaAjuste>
        {(Object.keys(T.configuracoes.categoriasSom) as CategoriaSom[]).map((c) => (
          <AlternadorAjuste key={c} rotulo={T.configuracoes.categoriasSom[c]} ligado={cfg.sons.categorias[c]} aoMudar={(v) => cfg.definir({ sons: { ...cfg.sons, categorias: { ...cfg.sons.categorias, [c]: v } } })} />
        ))}
      </>
    ),
    consumo: (
      <>
        {(["precoEntrada", "precoSaida", "limiteMensal"] as const).map((k) => (
          <LinhaAjuste key={k} rotulo={T.configuracoes[k]} para={`cs-${k}`}>
            <input id={`cs-${k}`} className="campo ajuste-valor ajuste-valor-numero" type="number" min={0} max={10000} step="0.01" value={cfg.consumo[k]} onChange={(e) => cfg.definir({ consumo: { ...cfg.consumo, [k]: Math.max(0, Math.min(10000, Number(e.target.value) || 0)) } })} />
          </LinhaAjuste>
        ))}
        <AlternadorAjuste rotulo={T.consumo.ligarParte2} dica={T.consumo.parte2Aviso.join(" ")} ligado={cfg.consumo.lerPlanos} aoMudar={(v) => cfg.definir({ consumo: { ...cfg.consumo, lerPlanos: v } })} />
      </>
    ),
    tela: (
      <>
        <NotaAjuste>
          <AvisoFaixa>{T.configuracoes.telaNavegador}</AvisoFaixa>
        </NotaAjuste>
        <AlternadorAjuste rotulo={T.configuracoes.esconderTelaCheia} ligado={cfg.esconderTelaCheia} aoMudar={(v) => cfg.definir({ esconderTelaCheia: v })} />
        <LinhaAjuste rotulo={T.configuracoes.appsEsconder} dica={T.configuracoes.appsDica} para="tc-apps" bloco>
          <textarea id="tc-apps" className="area-texto ajuste-area" value={cfg.appsEsconder} maxLength={1000} onChange={(e) => cfg.definir({ appsEsconder: e.target.value })} />
        </LinhaAjuste>
      </>
    ),
    atalhos: (
      <>
        <NotaAjuste>
          <AvisoFaixa>{NATIVO ? T.configuracoes.atalhosGlobais.dica : T.configuracoes.atalhosDica}</AvisoFaixa>
        </NotaAjuste>
        <EditorDeAtalhos />
        <GrupoAjuste titulo={T.configuracoes.atalhosGlobais.internos} />
        {T.configuracoes.listaAtalhos.map(([tecla, acao]) => (
          <LinhaAjuste key={tecla} rotulo={acao}>
            <Teclas teclas={tecla} />
          </LinhaAjuste>
        ))}
      </>
    ),
    privacidade: (
      <>
        <AlternadorAjuste rotulo={T.configuracoes.privacidade} dica={T.configuracoes.privacidadeDica} ligado={cfg.privacidade} aoMudar={(v) => cfg.definir({ privacidade: v })} />
        <AlternadorAjuste rotulo={T.configuracoes.pausarConexoes} ligado={cfg.pausarConexoes} aoMudar={(v) => cfg.definir({ pausarConexoes: v })} />
        <AlternadorAjuste rotulo={T.configuracoes.nuncaFinanceiro} ligado={cfg.nuncaFinanceiro} aoMudar={(v) => cfg.definir({ nuncaFinanceiro: v })} />
        <LinhaAjuste rotulo={T.configuracoes.limparChat}>
          <Botao variante="perigo" icone={<Trash2 size={13} />} onClick={() => setLimparChat(true)}>{T.geral.limpar}</Botao>
        </LinhaAjuste>
      </>
    ),
    dados: <SecaoDados />,
    claude: <SecaoClaudeCode />,
    assistive: <SecaoAssistive />,
    sobre: (
      <>
        <NotaAjuste>
          <p className="ajuste-nota-texto">{T.configuracoes.sobreTexto}</p>
        </NotaAjuste>
        <LinhaAjuste rotulo={T.configuracoes.versao}>
          <span className="ajuste-valor-fixo">{T.app.versao}</span>
        </LinhaAjuste>
        <LinhaAjuste rotulo={T.rotas.atualizacao}>
          <Botao icone={<ArrowUpRight size={13} />} onClick={() => irPara("atualizacao")}>{T.configuracoes.verAtualizacoes}</Botao>
        </LinhaAjuste>
        <LinhaAjuste rotulo={T.configuracoes.licencaRotulo} dica={T.configuracoes.licenca} />
        <LinhaAjuste rotulo={T.configuracoes.diagnostico} dica={T.configuracoes.itensGuardados(listarChaves().length, (tamanhoGuardado() / 1024).toFixed(0))} />
        <LinhaAjuste rotulo={T.configuracoes.primeiraExecucao}>
          <Botao variante="primario" onClick={() => cfg.definir({ primeiraExecucaoFeita: false })}>{T.configuracoes.refazerPrimeira}</Botao>
        </LinhaAjuste>
      </>
    ),
    desenvolvedor: (
      <>
        <NotaAjuste>
          <p className="ajuste-nota-texto">{T.configuracoes.devDica}</p>
        </NotaAjuste>
        {AGENTES.map((a) => (
          <LinhaAjuste key={a} rotulo={cfg.agentes.nomes[a]} inicio={<span className="ajuste-personagem"><Personagem agente={a} tamanho={32} /></span>}>
            <select className="seletor ajuste-valor" aria-label={T.configuracoes.forcarEstado} value={agentes.forcado[a] ?? ""} onChange={(e) => agentes.forcar(a, (e.target.value || null) as EstadoAgente | null)}>
              <option value="">{T.configuracoes.estadoReal}</option>
              {(Object.keys(T.agentes.estados) as EstadoAgente[]).map((s) => <option key={s} value={s}>{T.agentes.estados[s]}</option>)}
            </select>
            <Botao pequeno onClick={() => agentes.alertar(a, T.configuracoes.alertaTeste, "inicio")}>{T.configuracoes.dispararAlerta}</Botao>
            <Botao pequeno onClick={() => void agentes.trabalhar(a, T.configuracoes.tarefaTeste, 2500)}>{T.configuracoes.simularTrabalho}</Botao>
          </LinhaAjuste>
        ))}
        <LinhaAjuste rotulo={T.configuracoes.secoes.pomodoro}>
          <Botao
            onClick={() => {
              const p = usePomodoro.getState();
              if (!p.rodando) p.iniciar();
              usePomodoro.setState({ terminaEm: Date.now() - 10 });
            }}
          >
            {T.configuracoes.simularFimPomodoro}
          </Botao>
        </LinhaAjuste>
        <GrupoAjuste titulo={T.configuracoes.tocarSom} />
        <div className="ajuste-bloco">
          <div className="pilulas">
            {TODOS_OS_SONS.map((s) => <button key={s} type="button" className="pilula mono" onClick={() => void tocarSom(s)}>{s}</button>)}
          </div>
        </div>
      </>
    ),
  };

  return (
    <>
      <CabecalhoAba
        titulo={T.rotas.configuracoes}
        subtitulo={T.configuracoes.subtitulo}
        acoes={
          <label className="ajustes-busca">
            <Search size={14} />
            <input type="search" value={busca} placeholder={T.configuracoes.buscarSecao} aria-label={T.configuracoes.buscarSecao} onChange={(e) => setBusca(e.target.value)} />
          </label>
        }
      />
      <nav className="ajustes-secoes" aria-label={T.rotas.configuracoes}>
        {secoesVisiveis.length === 0 && <span className="ajustes-sem-secao">{T.configuracoes.semSecao}</span>}
        {secoesVisiveis.map((s) => (
          <button key={s} type="button" className="ajustes-secao" aria-current={secao === s} onClick={() => setSecao(s)}>
            {ICONES[s]}
            {T.configuracoes.secoes[s]}
          </button>
        ))}
      </nav>
      <section key={secao} className="ajustes-cartao" aria-labelledby="ajustes-cartao-titulo">
        <header className="ajustes-cartao-cabecalho">
          <h2 id="ajustes-cartao-titulo" className="ajustes-cartao-titulo">{T.configuracoes.secoes[secao]}</h2>
          <span className="ajustes-cartao-sub">{T.configuracoes.subtitulosSecoes[secao]}</span>
        </header>
        <div className="ajustes-corpo">{conteudo[secao]}</div>
      </section>
      <Modal aberto={!!previaVisual} titulo={T.configuracoes.previaVisual} aoFechar={() => setPreviaVisual(null)}>
        {previaVisual && (
          <div className="formulario">
            <ul className="texto-2" style={{ paddingLeft: 16, fontSize: 12 }}>
              {Object.keys(previaVisual).map((k) => <li key={k}>{k}</li>)}
            </ul>
            <div className="formulario-acoes">
              <Botao onClick={() => setPreviaVisual(null)}>{T.geral.cancelar}</Botao>
              <Botao variante="primario" onClick={() => { cfg.definir(previaVisual); setPreviaVisual(null); avisar(T.configuracoes.visualImportado); }}>{T.configuracoes.aplicar}</Botao>
            </div>
          </div>
        )}
      </Modal>
      <ConfirmarModal aberto={limparChat} titulo={T.configuracoes.limparChat} texto={T.geral.confirmarExclusaoTexto} aoFechar={() => setLimparChat(false)} aoConfirmar={limparConversas} />
    </>
  );
}

function AbaIlhaOrdenavel({ aba }: { aba: AbaIlha }) {
  const ligado = useConfig((s) => s.ilha.blocos[aba]);
  const definirIlha = useConfig((s) => s.definirIlha);
  const blocos = useConfig((s) => s.ilha.blocos);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: aba });
  const ativos = Object.values(blocos).filter(Boolean).length;
  return (
    <div ref={setNodeRef} className="ajuste-ordenavel" data-arrastando={isDragging ? "sim" : undefined} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <button type="button" className="ajuste-alca" aria-label={T.ilha.abas[aba]} {...attributes} {...listeners}>
        <GripVertical size={14} />
      </button>
      <span className="ajuste-ordenavel-nome">{T.ilha.abas[aba]}</span>
      <Alternador ligado={ligado} rotulo={T.ilha.abas[aba]} desativado={ligado && ativos <= 1} aoMudar={(v) => definirIlha({ blocos: { ...blocos, [aba]: v } })} />
    </div>
  );
}
