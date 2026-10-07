import { useEffect, useMemo, useState } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Settings, SlidersHorizontal, Palette, PanelTop, PanelBottom, Timer, Users, Volume2, Gauge, Maximize, Keyboard, ShieldCheck, Database, Info, Wrench,
  GripVertical, Download, Upload, RotateCcw, Trash2, DatabaseBackup, SquareTerminal,
} from "lucide-react";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { Cartao, Botao, Campo, Modal, Segmentado, AvisoFaixa, LinhaAlternador, Alternador, Tecla, ConfirmarModal } from "../../componentes/basicos";
import { Personagem } from "../../personagens/Personagem";
import { useConfig, BARRA_PADRAO, type ModoBorda, type Paleta, type Tema, type RepousoIlha, type AbaIlha, CONFIG_PADRAO } from "../../estado/configuracoes";
import { useAgentes, AGENTES } from "../../estado/agentes";
import { useComunicacao } from "../../estado/comunicacao";
import { useInterface } from "../../estado/interface";
import { usePomodoro } from "../../estado/pomodoro";
import { T } from "../../textos/textos";
import { contraste, hexValido, FUNDO_DESTAQUE } from "../../utilitarios/cores";
import { baixarArquivo, lerArquivoTexto, normalizarTexto } from "../../utilitarios/basicos";
import { abaLigada, rotaLigada } from "../../utilitarios/funcoes";
import { hojeISO } from "../../utilitarios/datas";
import { listarChaves, lerChave, gravarChave, salvarAgora, modoArmazenamento, zerarTudo, tamanhoGuardado, PREFIXO } from "../../ponte/armazenamento";
import { TODOS_OS_SONS, tocarSom, type CategoriaSom } from "../../ponte/sons";
import { DESTAQUE_PADRAO } from "../../janelas/area-de-trabalho/usarTema";
import { EditorFoto } from "../../componentes/FotoPerfil";
import { SeletorDeFundo } from "./SeletorDeFundo";
import { SecaoClaudeCode } from "./SecaoClaudeCode";
import type { EstadoAgente, Rota } from "../../tipos";
import { LINUX } from "../../desktop/desktop";
import { invoke } from "@tauri-apps/api/core";
import { PainelRapido } from "../../janelas/ilha/barra/PainelRapido";
import { Bandeja } from "../../janelas/ilha/barra/Bandeja";
import { usarAudio, usarRede } from "../../estado/controleRapido";
import "../../janelas/ilha/barra/barra.css";
import { integracaoIlhaGnome } from "../../ponte/ponteLocal";

type Secao = keyof typeof T.configuracoes.secoes;

const ICONES: Record<Secao, React.ReactNode> = {
  geral: <Settings size={15} />,
  sistema: <SlidersHorizontal size={15} />,
  aparencia: <Palette size={15} />,
  ilha: <PanelTop size={15} />,
  dock: <PanelBottom size={15} />,
  pomodoro: <Timer size={15} />,
  agentes: <Users size={15} />,
  sons: <Volume2 size={15} />,
  consumo: <Gauge size={15} />,
  tela: <Maximize size={15} />,
  atalhos: <Keyboard size={15} />,
  privacidade: <ShieldCheck size={15} />,
  dados: <Database size={15} />,
  claude: <SquareTerminal size={15} />,
  sobre: <Info size={15} />,
  desenvolvedor: <Wrench size={15} />,
};

const CORES_PALETA: Record<Paleta, string> = { padrao: "#f6f6f5", areia: "#f5f1ea", grafite: "#eeeff1", floresta: "#f1f4f0", oceano: "#eff3f6" };

function ItemBarraOrdenavel({ rota, nome, visivel, aoMudarNome, aoMudarVisivel }: { rota: Rota; nome?: string; visivel: boolean; aoMudarNome: (n: string) => void; aoMudarVisivel: (v: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rota });
  return (
    <div ref={setNodeRef} className="lista-item" style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, background: "var(--superficie)" }}>
      <button type="button" className="botao botao-fantasma botao-pequeno botao-icone" aria-label={T.rotas[rota]} style={{ cursor: "grab" }} {...attributes} {...listeners}>
        <GripVertical size={14} />
      </button>
      <input className="campo" style={{ height: 30 }} value={nome ?? ""} placeholder={T.rotas[rota]} maxLength={24} aria-label={T.rotas[rota]} onChange={(e) => aoMudarNome(e.target.value)} />
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
  if (Object.keys(CORES_PALETA).includes(v.paleta as string)) saida.paleta = v.paleta;
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

const COLECOES = ["configuracoes", "rotina", "estudos", "financas", "organizacao", "comunicacao", "pomodoro", "conquistas", "agentes"];

function SecaoDados() {
  const avisar = useInterface((s) => s.avisar);
  const [previa, setPrevia] = useState<{ dados: Record<string, string>; resumo: string[] } | null>(null);
  const [erro, setErro] = useState("");
  const [apagar, setApagar] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [apagarChaves, setApagarChaves] = useState(false);
  const [zerando, setZerando] = useState(false);

  const exportar = (nome = `niko-backup-${hojeISO()}.json`) => {
    const dados: Record<string, string> = {};
    for (const k of listarChaves()) {
      const v = lerChave(k);
      if (v != null) dados[k] = v;
    }
    baixarArquivo(nome, JSON.stringify({ tipo: "niko-backup", versao: 1, criadoEm: new Date().toISOString(), dados }, null, 1));
  };

  const ler = async (arquivo: File) => {
    try {
      const texto = await lerArquivoTexto(arquivo, 20 * 1024 * 1024);
      const json = JSON.parse(texto) as { tipo?: string; dados?: Record<string, unknown> };
      if (json.tipo !== "niko-backup" || !json.dados || typeof json.dados !== "object") throw new Error("formato");
      const dados: Record<string, string> = {};
      const resumo: string[] = [];
      for (const [k, v] of Object.entries(json.dados)) {
        const nome = k.replace(PREFIXO, "");
        if (!k.startsWith(PREFIXO) || !(COLECOES.includes(nome) || nome === "janela") || typeof v !== "string") continue;
        JSON.parse(v);
        dados[k] = v;
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
    <div className="coluna" style={{ gap: 16 }}>
      <div className="linha-entre linha-config">
        <div className="coluna" style={{ gap: 2 }}><span>{T.configuracoes.backup}</span><span className="campo-dica">{T.configuracoes.backupDica}</span></div>
        <Botao icone={<Download size={14} />} onClick={() => exportar()}>{T.geral.exportar}</Botao>
      </div>
      <div className="linha-entre linha-config">
        <div className="coluna" style={{ gap: 2 }}><span>{T.configuracoes.restaurar}</span>{erro && <span className="campo-erro">{erro}</span>}</div>
        <label className="botao botao-secundario" style={{ cursor: "pointer" }}>
          <Upload size={14} />
          {T.geral.importar}
          <input type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void ler(f); e.target.value = ""; }} />
        </label>
      </div>
      <div className="linha-entre linha-config">
        <div className="coluna" style={{ gap: 2 }}><span>{T.configuracoes.backupBanco}</span><span className="campo-dica">{modoArmazenamento() === "banco" ? T.configuracoes.backupBancoDica : T.configuracoes.semBanco}</span></div>
        <Botao
          icone={<DatabaseBackup size={14} />}
          disabled={modoArmazenamento() !== "banco"}
          onClick={async () => {
            try {
              if (!(await salvarAgora())) throw new Error("salvamento_falhou");
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
      </div>
      <div className="linha-entre linha-config">
        <div className="coluna" style={{ gap: 2 }}><span>{T.configuracoes.importarOutroApp}</span><span className="campo-dica">{T.configuracoes.importarOutroAppDica}</span></div>
        <Botao disabled>{T.configuracoes.somenteDesktop}</Botao>
      </div>
      <div className="linha-entre linha-config">
        <div className="coluna" style={{ gap: 2 }}><span>{T.configuracoes.apagarTudo}</span><span className="campo-dica">{T.configuracoes.apagarTudoAviso}</span></div>
        <Botao variante="perigo" icone={<Trash2 size={14} />} onClick={() => { setConfirmacao(""); setApagar(true); }}>{T.configuracoes.apagarTudo}</Botao>
      </div>
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
                  void salvarAgora().then((salvo) => {
                    if (salvo) window.location.reload();
                    else avisar(T.configuracoes.backupFalhou);
                  });
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
    </div>
  );
}

export default function Configuracoes() {
  const cfg = useConfig();
  const avisar = useInterface((s) => s.avisar);
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
    const todas = (Object.keys(T.configuracoes.secoes) as Secao[]).filter(s => LINUX || s !== "sistema");
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
  const corAtual = cfg.destaque ?? DESTAQUE_PADRAO.claro;
  const razao = useMemo(() => contraste(corAtual, fundo.startsWith("#") ? fundo : "#ffffff"), [corAtual, fundo]);

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

  const conteudo: Record<Secao, React.ReactNode> = {
    sistema: <ControlesSistemaLinux />,
    geral: (
      <>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.perfil.foto}</span>
          <EditorFoto />
        </div>
        <Campo id="cf-nome" rotulo={T.configuracoes.nomePerfil}>
          <input id="cf-nome" className="campo" value={cfg.nome} maxLength={40} onChange={(e) => cfg.definir({ nome: e.target.value })} />
        </Campo>
        <LinhaAlternador rotulo={T.configuracoes.viradaDia} dica={T.configuracoes.viradaDiaDica} ligado={cfg.viradaAs4h} aoMudar={(v) => cfg.definir({ viradaAs4h: v })} />
        <LinhaAlternador rotulo={LINUX ? "Iniciar com a sessão" : T.configuracoes.iniciarComWindows} dica={LINUX ? "Abre o Niko automaticamente ao entrar na sessão, com a ilha e o dock conforme suas preferências." : T.configuracoes.iniciarComWindowsDica} ligado={cfg.iniciarComWindows} aoMudar={(v) => cfg.definir({ iniciarComWindows: v })} />
        <LinhaAlternador rotulo={T.configuracoes.manterSegundoPlano} dica={`${T.configuracoes.manterDica} ${T.configuracoes.somenteDesktop}.`} ligado={false} desativado aoMudar={() => undefined} />
        <LinhaAlternador rotulo={T.configuracoes.conquistasAtivas} ligado={cfg.conquistasAtivas} aoMudar={(v) => cfg.definir({ conquistasAtivas: v })} />
      </>
    ),
    aparencia: (
      <>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.tema}</span>
          <Segmentado<Tema> rotulo={T.configuracoes.tema} valor={cfg.tema} aoMudar={(tema) => cfg.definir({ tema })} opcoes={[{ valor: "claro", rotulo: T.barraLateral.temaClaro }, { valor: "escuro", rotulo: T.barraLateral.temaEscuro }, { valor: "sistema", rotulo: T.barraLateral.temaSistema }]} />
        </div>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.paleta}</span>
          <div className="pilulas">
            {(Object.keys(CORES_PALETA) as Paleta[]).map((p) => (
              <button key={p} type="button" className="pilula" aria-pressed={cfg.paleta === p} onClick={() => cfg.definir({ paleta: p })}>
                <span className="ponto-cor" style={{ background: CORES_PALETA[p], border: "1px solid var(--borda-forte)" }} />
                {T.configuracoes.paletas[p]}
              </button>
            ))}
          </div>
        </div>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.destaque}</span>
          <div className="linha">
            <input type="color" className="seletor-cor" value={corAtual} aria-label={T.configuracoes.destaque} onChange={(e) => { cfg.definir({ destaque: e.target.value }); setCorTexto(e.target.value); }} />
            <input
              className="campo"
              style={{ width: 120 }}
              value={corTexto}
              maxLength={7}
              placeholder={DESTAQUE_PADRAO.claro}
              aria-label={T.configuracoes.destaque}
              aria-invalid={!!corTexto && !hexValido(corTexto)}
              onChange={(e) => {
                setCorTexto(e.target.value);
                if (hexValido(e.target.value)) cfg.definir({ destaque: e.target.value });
              }}
            />
            <Botao pequeno variante="fantasma" icone={<RotateCcw size={13} />} onClick={() => { cfg.definir({ destaque: null }); setCorTexto(""); }}>{T.geral.restaurarPadrao}</Botao>
          </div>
          {cfg.destaque && <span className={razao < 4.5 ? "campo-erro" : "campo-dica"}>{razao < 4.5 ? T.configuracoes.contrasteBaixo(razao.toFixed(1).replace(".", ",")) : T.configuracoes.contrasteOk(razao.toFixed(1).replace(".", ","))}</span>}
        </div>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.escala}</span>
          <Segmentado rotulo={T.configuracoes.escala} valor={String(cfg.escala)} aoMudar={(v) => cfg.definir({ escala: Number(v) })} opcoes={[{ valor: "0.9", rotulo: "90%" }, { valor: "1", rotulo: "100%" }, { valor: "1.1", rotulo: "110%" }, { valor: "1.2", rotulo: "120%" }]} />
        </div>
        <LinhaAlternador rotulo={T.configuracoes.reduzirAnimacoes} ligado={cfg.reduzirAnimacoes} aoMudar={(v) => cfg.definir({ reduzirAnimacoes: v })} />
        <LinhaAlternador rotulo={T.configuracoes.modoLeveEscritorio} ligado={cfg.modoLeveEscritorio} aoMudar={(v) => cfg.definir({ modoLeveEscritorio: v })} />
        <div className="campo-grupo">
          <div className="linha-entre">
            <span className="campo-rotulo">{T.configuracoes.barraLateral}</span>
            <Botao pequeno variante="fantasma" icone={<RotateCcw size={13} />} onClick={() => cfg.definir({ barraLateral: BARRA_PADRAO })}>{T.geral.restaurarPadrao}</Botao>
          </div>
          <span className="campo-dica">{T.configuracoes.barraDica}</span>
          <DndContext collisionDetection={closestCenter} onDragEnd={aoArrastarBarra}>
            <SortableContext items={cfg.barraLateral.map((b) => b.rota)} strategy={verticalListSortingStrategy}>
              <div className="lista">
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
        <div className="linha">
          <Botao
            icone={<Download size={14} />}
            onClick={() => {
              const visual = Object.fromEntries(CHAVES_VISUAL.map((k) => [k, cfg[k]]));
              baixarArquivo(`visual-${hojeISO()}.niko-visual`, JSON.stringify({ tipo: "niko-visual", versao: 1, visual }, null, 2));
            }}
          >
            {T.configuracoes.exportarVisual}
          </Botao>
          <label className="botao botao-secundario" style={{ cursor: "pointer" }}>
            <Upload size={14} />
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
          {erroVisual && <span className="campo-erro">{erroVisual}</span>}
        </div>
      </>
    ),
    ilha: (
      <>
        <LinhaAlternador rotulo={T.configuracoes.ilhaAtiva} ligado={cfg.ilha.ativa} aoMudar={(v) => cfg.definirIlha({ ativa: v })} />
        {LINUX && cfg.ilha.ativa && <AvisoFaixa>{T.configuracoes.ilhaGnomeSessao}</AvisoFaixa>}
        {LINUX && cfg.ilha.ativa && <IntegracaoIlhaGnome />}
        {LINUX && <AtalhoIlhaLinux />}
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.modo}</span>
          {segModo(cfg.ilha.modo, (modo) => cfg.definirIlha({ modo }))}
          <span className="campo-dica">{T.configuracoes.modosDica[cfg.ilha.modo]}</span>
        </div>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.blocosIlha}</span>
          <span className="campo-dica">{T.configuracoes.blocosDica}</span>
          <DndContext collisionDetection={closestCenter} onDragEnd={aoArrastarAbas}>
            <SortableContext items={cfg.ilha.ordemAbas} strategy={verticalListSortingStrategy}>
              <div className="lista">
                {cfg.ilha.ordemAbas.filter((a) => abaLigada(a, cfg.funcoesDesligadas)).map((a) => <AbaIlhaOrdenavel key={a} aba={a} />)}
              </div>
            </SortableContext>
          </DndContext>
        </div>
        <div className="formulario-linha">
          <Campo id="il-rep" rotulo={T.configuracoes.repousoIlha}>
            <select id="il-rep" className="seletor" value={cfg.ilha.repouso} onChange={(e) => cfg.definirIlha({ repouso: e.target.value as RepousoIlha })}>
              {(Object.keys(T.configuracoes.repousos) as RepousoIlha[]).map((r) => <option key={r} value={r}>{T.configuracoes.repousos[r]}</option>)}
            </select>
          </Campo>
          <Campo id="il-tam" rotulo={T.configuracoes.tamanhoIlha}>
            <select id="il-tam" className="seletor" value={cfg.ilha.tamanho} onChange={(e) => cfg.definirIlha({ tamanho: e.target.value as "pequena" | "media" | "grande" })}>
              {(["pequena", "media", "grande"] as const).map((t) => <option key={t} value={t}>{T.configuracoes.tamanhos[t]}</option>)}
            </select>
          </Campo>
        </div>
        <SeletorDeFundo id="il-fundo" fundo={cfg.ilha.fundo} opacidade={cfg.ilha.opacidade} aoMudar={(m) => cfg.definirIlha(m)} />
        <div className="formulario-linha">
          <Campo id="il-fech" rotulo={T.configuracoes.fechamentoAuto}>
            <select id="il-fech" className="seletor" value={cfg.ilha.fechamentoSeg} onChange={(e) => cfg.definirIlha({ fechamentoSeg: Number(e.target.value) })}>
              {[5, 10, 15, 30, 60, 120].map((s) => <option key={s} value={s}>{T.conexoes.segundos(s)}</option>)}
              <option value={0}>{T.configuracoes.nunca}</option>
            </select>
          </Campo>
          <Campo id="il-esc" rotulo={T.configuracoes.esconderCompacta}>
            <select id="il-esc" className="seletor" value={cfg.ilha.esconderSeg} disabled={cfg.ilha.modo !== "esconder"} onChange={(e) => cfg.definirIlha({ esconderSeg: Number(e.target.value) })}>
              {[10, 30, 60, 120, 300].map((s) => <option key={s} value={s}>{T.conexoes.segundos(s)}</option>)}
            </select>
          </Campo>
        </div>
        <LinhaAlternador rotulo={T.configuracoes.lateraisIlha} dica={T.configuracoes.lateraisDica} ligado={cfg.ilha.laterais} aoMudar={(v) => cfg.definirIlha({ laterais: v })} />
        <LinhaAlternador rotulo={T.configuracoes.abrirHover} ligado={cfg.ilha.abrirHover} aoMudar={(v) => cfg.definirIlha({ abrirHover: v })} />
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.notificacoesIlha}</span>
          <Segmentado rotulo={T.configuracoes.notificacoesIlha} valor={cfg.ilha.notificacoes} aoMudar={(v) => cfg.definirIlha({ notificacoes: v })} opcoes={(["importantes", "todas", "nenhuma"] as const).map((v) => ({ valor: v, rotulo: T.configuracoes.notificacoesOpcoes[v] }))} />
          <span className="campo-dica">{T.configuracoes.notificacoesDica[cfg.ilha.notificacoes]}</span>
        </div>
        <Campo id="il-fav" rotulo={T.configuracoes.agenteFavorito}>
          <select id="il-fav" className="seletor" value={cfg.agentes.favorito} onChange={(e) => cfg.definir({ agentes: { ...cfg.agentes, favorito: e.target.value as typeof cfg.agentes.favorito } })}>
            {AGENTES.map((a) => <option key={a} value={a}>{cfg.agentes.nomes[a]}</option>)}
          </select>
        </Campo>
      </>
    ),
    dock: (
      <>
        <>{LINUX && <AvisoFaixa>Dock Linux experimental para GNOME 46. Prévia indisponível para janelas minimizadas ou fora da área de trabalho atual. Requer a integração GNOME 46 ativa.</AvisoFaixa>}</>
        {LINUX && <IntegracaoIlhaGnome />}
        <LinhaAlternador rotulo={T.configuracoes.dockAtivo} ligado={cfg.dock.ativo} aoMudar={(v) => cfg.definir({ dock: { ...cfg.dock, ativo: v } })} />
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.modo}</span>
          {segModo(cfg.dock.modo, (modo) => cfg.definir({ dock: { ...cfg.dock, modo } }))}
          <span className="campo-dica">{T.configuracoes.modosDica[cfg.dock.modo]}</span>
        </div>
        <LinhaAlternador rotulo={T.configuracoes.ampliarDock} ligado={cfg.dock.ampliar} aoMudar={(v) => cfg.definir({ dock: { ...cfg.dock, ampliar: v } })} />
        <SeletorDeFundo id="dk-fundo" fundo={cfg.dock.fundo} opacidade={cfg.dock.opacidade} aoMudar={(m) => cfg.definir({ dock: { ...cfg.dock, ...m } })} />
        <AvisoFaixa>{T.configuracoes.appsWindowsDock}</AvisoFaixa>
      </>
    ),
    pomodoro: (
      <>
        <span className="campo-rotulo">{T.configuracoes.duracoes}</span>
        <div className="formulario-linha">
          {(["foco", "curta", "longa"] as const).map((k) => (
            <Campo key={k} id={`pm-${k}`} rotulo={k === "foco" ? T.pomodoro.etapas.foco : k === "curta" ? T.pomodoro.etapas.pausa_curta : T.pomodoro.etapas.pausa_longa} dica={T.validacao.entre(1, 180)}>
              <input id={`pm-${k}`} className="campo" type="number" min={1} max={180} value={cfg.pomodoro[k]} onChange={(e) => { const n = Math.max(1, Math.min(180, Math.round(Number(e.target.value) || 1))); cfg.definir({ pomodoro: { ...cfg.pomodoro, [k]: n } }); usePomodoro.getState().reiniciar(); }} />
            </Campo>
          ))}
          <Campo id="pm-ciclos" rotulo={T.configuracoes.ciclos} dica={T.validacao.entre(1, 12)}>
            <input id="pm-ciclos" className="campo" type="number" min={1} max={12} value={cfg.pomodoro.ciclos} onChange={(e) => cfg.definir({ pomodoro: { ...cfg.pomodoro, ciclos: Math.max(1, Math.min(12, Math.round(Number(e.target.value) || 1))) } })} />
          </Campo>
        </div>
        <LinhaAlternador rotulo={T.configuracoes.autoProxima} ligado={cfg.pomodoro.autoProxima} aoMudar={(v) => cfg.definir({ pomodoro: { ...cfg.pomodoro, autoProxima: v } })} />
        <LinhaAlternador rotulo={T.configuracoes.tiquePomodoro} dica={T.configuracoes.tiquePomodoroDica} ligado={cfg.pomodoro.tique} aoMudar={(v) => cfg.definir({ pomodoro: { ...cfg.pomodoro, tique: v } })} />
      </>
    ),
    agentes: (
      <>
        <div className="grade">
          {AGENTES.map((a) => (
            <Cartao key={a} className="col-3">
              <div className="coluna" style={{ alignItems: "center" }}>
                <Personagem agente={a} tamanho={56} />
                <Campo id={`ag-${a}`} rotulo={T.configuracoes.nomeAgente}>
                  <input id={`ag-${a}`} className="campo" value={cfg.agentes.nomes[a]} maxLength={20} onChange={(e) => cfg.definir({ agentes: { ...cfg.agentes, nomes: { ...cfg.agentes.nomes, [a]: e.target.value.slice(0, 20) } } })} onBlur={(e) => !e.target.value.trim() && cfg.definir({ agentes: { ...cfg.agentes, nomes: { ...cfg.agentes.nomes, [a]: CONFIG_PADRAO.agentes.nomes[a] } } })} />
                </Campo>
                <Campo id={`cg-${a}`} rotulo={T.configuracoes.cargoAgente}>
                  <input id={`cg-${a}`} className="campo" value={cfg.agentes.cargos[a]} maxLength={32} onChange={(e) => cfg.definir({ agentes: { ...cfg.agentes, cargos: { ...cfg.agentes.cargos, [a]: e.target.value.slice(0, 32) } } })} onBlur={(e) => !e.target.value.trim() && cfg.definir({ agentes: { ...cfg.agentes, cargos: { ...cfg.agentes.cargos, [a]: CONFIG_PADRAO.agentes.cargos[a] } } })} />
                </Campo>
                <span className="texto-3" style={{ fontSize: 11, textAlign: "center" }}>{T.agentes.areas[a]}</span>
              </div>
            </Cartao>
          ))}
        </div>
        <Campo id="ag-ina" rotulo={T.configuracoes.inatividade}>
          <input id="ag-ina" className="campo" type="number" min={1} max={240} style={{ width: 120 }} value={cfg.agentes.inatividadeMin} onChange={(e) => cfg.definir({ agentes: { ...cfg.agentes, inatividadeMin: Math.max(1, Math.min(240, Math.round(Number(e.target.value) || 10))) } })} />
        </Campo>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.semprePermitido}</span>
          {cfg.ia.autoAprovar.length === 0 ? <span className="campo-dica">{T.configuracoes.semprePermitidoVazio}</span> : (
            <div className="pilulas">
              {cfg.ia.autoAprovar.map((tipo) => (
                <button key={tipo} type="button" className="pilula" title={T.geral.excluir} onClick={() => cfg.definir({ ia: { ...cfg.ia, autoAprovar: cfg.ia.autoAprovar.filter((x) => x !== tipo) } })}>
                  <code>{T.chat.permissao.acoes[tipo]}</code>
                  <Trash2 size={12} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.memoria}</span>
          {memoria.length === 0 ? <span className="campo-dica">{T.configuracoes.semMemoria}</span> : (
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
          <form className="linha" noValidate onSubmit={(e) => { e.preventDefault(); if (!novoFato.trim()) return; lembrar(novoFato, "organizador", "manual"); setNovoFato(""); }}>
            <input className="campo" value={novoFato} maxLength={300} placeholder={T.configuracoes.novoFato} aria-label={T.configuracoes.novoFato} onChange={(e) => setNovoFato(e.target.value)} />
            <Botao type="submit">{T.geral.adicionar}</Botao>
          </form>
        </div>
      </>
    ),
    sons: (
      <>
        <LinhaAlternador rotulo={T.configuracoes.sonsAtivos} ligado={cfg.sons.ligado} aoMudar={(v) => cfg.definir({ sons: { ...cfg.sons, ligado: v } })} />
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.volume} <span className="numero">{Math.round(cfg.sons.volume * 100)}%</span></span>
          <input type="range" className="faixa" min={0} max={0.5} step={0.01} value={cfg.sons.volume} aria-label={T.configuracoes.volume} onChange={(e) => cfg.definir({ sons: { ...cfg.sons, volume: Number(e.target.value) } })} onPointerUp={() => void tocarSom("blip")} />
        </div>
        {(Object.keys(T.configuracoes.categoriasSom) as CategoriaSom[]).map((c) => (
          <LinhaAlternador key={c} rotulo={T.configuracoes.categoriasSom[c]} ligado={cfg.sons.categorias[c]} aoMudar={(v) => cfg.definir({ sons: { ...cfg.sons, categorias: { ...cfg.sons.categorias, [c]: v } } })} />
        ))}
      </>
    ),
    consumo: (
      <>
      <LinhaAlternador rotulo={T.consumo.ligarParte2} dica={T.consumo.parte2Aviso.join(" ")} ligado={cfg.consumo.lerPlanos} aoMudar={(v) => cfg.definir({ consumo: { ...cfg.consumo, lerPlanos: v } })} />
      <div className="formulario-linha">
        {(["precoEntrada", "precoSaida", "limiteMensal"] as const).map((k) => (
          <Campo key={k} id={`cs-${k}`} rotulo={T.configuracoes[k]}>
            <input id={`cs-${k}`} className="campo" type="number" min={0} max={10000} step="0.01" value={cfg.consumo[k]} onChange={(e) => cfg.definir({ consumo: { ...cfg.consumo, [k]: Math.max(0, Math.min(10000, Number(e.target.value) || 0)) } })} />
          </Campo>
        ))}
      </div>
      </>
    ),
    tela: (
      <>
        <AvisoFaixa>{T.configuracoes.telaNavegador}</AvisoFaixa>
        <LinhaAlternador rotulo={T.configuracoes.esconderTelaCheia} ligado={cfg.esconderTelaCheia} aoMudar={(v) => cfg.definir({ esconderTelaCheia: v })} />
        <Campo id="tc-apps" rotulo={T.configuracoes.appsEsconder} dica={T.configuracoes.appsDica}>
          <textarea id="tc-apps" className="area-texto" value={cfg.appsEsconder} maxLength={1000} onChange={(e) => cfg.definir({ appsEsconder: e.target.value })} />
        </Campo>
      </>
    ),
    atalhos: (
      <>
        <AvisoFaixa>{T.configuracoes.atalhosDica}</AvisoFaixa>
        <div className="lista">
          {T.configuracoes.listaAtalhos.map(([tecla, acao]) => (
            <div key={tecla} className="lista-item">
              <span className="lista-item-principal">{acao}</span>
              <Tecla>{tecla}</Tecla>
            </div>
          ))}
        </div>
      </>
    ),
    privacidade: (
      <>
        <LinhaAlternador rotulo={T.configuracoes.privacidade} dica={T.configuracoes.privacidadeDica} ligado={cfg.privacidade} aoMudar={(v) => cfg.definir({ privacidade: v })} />
        <LinhaAlternador rotulo={T.configuracoes.pausarConexoes} ligado={cfg.pausarConexoes} aoMudar={(v) => cfg.definir({ pausarConexoes: v })} />
        <LinhaAlternador rotulo={T.configuracoes.nuncaFinanceiro} ligado={cfg.nuncaFinanceiro} aoMudar={(v) => cfg.definir({ nuncaFinanceiro: v })} />
        <div className="linha-entre linha-config">
          <span>{T.configuracoes.limparChat}</span>
          <Botao variante="perigo" onClick={() => setLimparChat(true)}>{T.geral.limpar}</Botao>
        </div>
      </>
    ),
    dados: <SecaoDados />,
    claude: <SecaoClaudeCode />,
    sobre: (
      <>
        <p>{T.configuracoes.sobreTexto}</p>
        <p className="texto-2">{T.app.versao}</p>
        <p className="texto-2">{T.configuracoes.licenca}</p>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.diagnostico}</span>
          <span className="texto-2">{T.configuracoes.itensGuardados(listarChaves().length, (tamanhoGuardado() / 1024).toFixed(0))}</span>
        </div>
        <Botao onClick={() => cfg.definir({ primeiraExecucaoFeita: false })}>{T.configuracoes.refazerPrimeira}</Botao>
      </>
    ),
    desenvolvedor: (
      <>
        <p className="campo-dica">{T.configuracoes.devDica}</p>
        {AGENTES.map((a) => (
          <div key={a} className="linha" style={{ flexWrap: "wrap" }}>
            <Personagem agente={a} tamanho={32} />
            <b style={{ minWidth: 100 }}>{cfg.agentes.nomes[a]}</b>
            <select className="seletor" style={{ width: 170, height: 30 }} aria-label={T.configuracoes.forcarEstado} value={agentes.forcado[a] ?? ""} onChange={(e) => agentes.forcar(a, (e.target.value || null) as EstadoAgente | null)}>
              <option value="">{T.configuracoes.estadoReal}</option>
              {(Object.keys(T.agentes.estados) as EstadoAgente[]).map((s) => <option key={s} value={s}>{T.agentes.estados[s]}</option>)}
            </select>
            <Botao pequeno onClick={() => agentes.alertar(a, T.configuracoes.alertaTeste, "inicio")}>{T.configuracoes.dispararAlerta}</Botao>
            <Botao pequeno onClick={() => void agentes.trabalhar(a, T.configuracoes.tarefaTeste, 2500)}>{T.configuracoes.simularTrabalho}</Botao>
          </div>
        ))}
        <div className="linha" style={{ flexWrap: "wrap" }}>
          <Botao
            pequeno
            onClick={() => {
              const p = usePomodoro.getState();
              if (!p.rodando) p.iniciar();
              usePomodoro.setState({ terminaEm: Date.now() - 10 });
            }}
          >
            {T.configuracoes.simularFimPomodoro}
          </Botao>
        </div>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.tocarSom}</span>
          <div className="pilulas">
            {TODOS_OS_SONS.map((s) => <button key={s} type="button" className="pilula" onClick={() => void tocarSom(s)}>{s}</button>)}
          </div>
        </div>
      </>
    ),
  };

  return (
    <>
      <CabecalhoAba titulo={T.configuracoes.titulo} subtitulo={T.configuracoes.subtitulo} />
      <div className="duas-colunas">
        <Cartao>
          <input className="campo" type="search" value={busca} placeholder={T.configuracoes.buscarSecao} aria-label={T.configuracoes.buscarSecao} style={{ marginBottom: 8 }} onChange={(e) => setBusca(e.target.value)} />
          <nav className="lista-lateral" aria-label={T.configuracoes.titulo}>
            {secoesVisiveis.length === 0 && <span className="campo-dica">{T.configuracoes.semSecao}</span>}
            {secoesVisiveis.map((s) => (
              <button key={s} type="button" className="lista-lateral-item" aria-current={secao === s} onClick={() => setSecao(s)}>
                {ICONES[s]}
                {T.configuracoes.secoes[s]}
              </button>
            ))}
          </nav>
        </Cartao>
        <Cartao titulo={T.configuracoes.secoes[secao]} icone={ICONES[secao]}>
          <div className="formulario">{conteudo[secao]}</div>
        </Cartao>
      </div>
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
    <div ref={setNodeRef} className="lista-item" style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, background: "var(--superficie)" }}>
      <button type="button" className="botao botao-fantasma botao-pequeno botao-icone" aria-label={T.ilha.abas[aba]} style={{ cursor: "grab" }} {...attributes} {...listeners}>
        <GripVertical size={14} />
      </button>
      <span className="lista-item-principal">{T.ilha.abas[aba]}</span>
      <Alternador ligado={ligado} rotulo={T.ilha.abas[aba]} desativado={ligado && ativos <= 1} aoMudar={(v) => definirIlha({ blocos: { ...blocos, [aba]: v } })} />
    </div>
  );
}

const COMBINACOES_ILHA = [
  ["<Control><Alt>", "Ctrl + Alt"],
  ["<Control><Shift>", "Ctrl + Shift"],
  ["<Super><Alt>", "Super + Alt"],
  ["<Super><Shift>", "Super + Shift"],
] as const;

function IntegracaoIlhaGnome() {
  const [estado, setEstado] = useState<keyof typeof T.configuracoes.gnomeIlhaEstados | null>(null);
  const [ocupado, setOcupado] = useState(true);
  useEffect(() => {
    let vivo = true;
    void integracaoIlhaGnome().then(r => { if (vivo) setEstado(r.estado); })
      .catch(() => { if (vivo) setEstado("erro"); })
      .finally(() => { if (vivo) setOcupado(false); });
    return () => { vivo = false; };
  }, []);
  const verificar = async (instalar: boolean) => {
    setOcupado(true);
    try { setEstado((await integracaoIlhaGnome(instalar)).estado); }
    catch { setEstado("erro"); }
    finally { setOcupado(false); }
  };
  return (
    <div className="campo-grupo">
      <span className="campo-rotulo">{T.configuracoes.gnomeIlhaTitulo}</span>
      <span className="campo-dica" role="status">{estado ? T.configuracoes.gnomeIlhaEstados[estado] : T.geral.carregando}</span>
      <div className="linha">
        {(estado === "instalar" || estado === "habilitar" || estado === "recuperar" || estado === "recuperada") && <Botao disabled={ocupado} onClick={() => void verificar(true)}>{estado === "recuperar" ? T.configuracoes.gnomeIlhaRecuperar : T.configuracoes.gnomeIlhaAtivar}</Botao>}
        <Botao disabled={ocupado} onClick={() => void verificar(false)}>{T.configuracoes.gnomeIlhaVerificar}</Botao>
      </div>
    </div>
  );
}

function AtalhoIlhaLinux() {
  const [salvo, setSalvo] = useState<string | null>(null);
  const [modificadores, setModificadores] = useState<string>("<Control><Alt>");
  const [tecla, setTecla] = useState("i");
  const [ocupado, setOcupado] = useState(true);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  useEffect(() => {
    let vivo = true;
    void invoke<string>("atalho_ilha_linux").then((valor) => {
      if (!vivo) return;
      setSalvo(valor);
      const combo = COMBINACOES_ILHA.find(([m]) => valor.startsWith(m));
      if (combo && /^[a-z0-9]$/.test(valor.slice(combo[0].length))) {
        setModificadores(combo[0]);
        setTecla(valor.slice(combo[0].length));
      }
    }).catch((e) => { if (vivo) setErro(String(e)); })
      .finally(() => { if (vivo) setOcupado(false); });
    return () => { vivo = false; };
  }, []);
  const salvar = async () => {
    setOcupado(true);
    setErro("");
    setMensagem("");
    try {
      const valor = await invoke<string>("atalho_ilha_linux", { atalho: modificadores + tecla });
      setSalvo(valor);
      setMensagem("Atalho salvo no Ubuntu. Teste com outro aplicativo em foco.");
    } catch (e) { setErro(String(e)); }
    finally { setOcupado(false); }
  };
  const apresentar = (valor: string) => valor.replaceAll("<Control>", "Ctrl + ").replaceAll("<Alt>", "Alt + ").replaceAll("<Shift>", "Shift + ").replaceAll("<Super>", "Super + ").toUpperCase();
  return (
    <div className="campo-grupo">
      <span className="campo-rotulo">Atalho global para abrir a ilha</span>
      <span className="campo-dica">{salvo === null ? (ocupado ? "Lendo atalho do Ubuntu…" : "Atalho indisponível") : `Atual: ${salvo ? apresentar(salvo) : "desativado"}`}</span>
      <div className="formulario-linha">
        <select className="seletor" aria-label="Modificadores do atalho da ilha" value={modificadores} disabled={ocupado || salvo === null} onChange={(e) => { setModificadores(e.target.value); setMensagem(""); }}>
          {COMBINACOES_ILHA.map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}
        </select>
        <select className="seletor" aria-label="Tecla do atalho da ilha" value={tecla} disabled={ocupado || salvo === null} onChange={(e) => { setTecla(e.target.value); setMensagem(""); }}>
          {Array.from("abcdefghijklmnopqrstuvwxyz0123456789").map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
        </select>
        <Botao disabled={ocupado || salvo === null} onClick={() => void salvar()}>{ocupado ? "Aguarde…" : "Salvar atalho"}</Botao>
      </div>
      <span className="campo-dica">Requer o Niko aberto. Escolha uma combinação livre; o Ubuntu pode reservar atalhos para outras ações.</span>
      {mensagem && <span role="status" className="campo-dica">{mensagem}</span>}
      {erro && <span role="alert" className="campo-erro">{erro}</span>}
    </div>
  );
}

function ControlesSistemaLinux() {
  usarAudio(true, 3000);
  usarRede(true, 8000);
  return <>
    <p className="campo-dica">Controles do GNOME. O brilho depende do hardware; o teclado virtual precisa estar habilitado no GNOME.</p>
    <PainelRapido embutido topo={0} aoFechar={() => undefined} />
    <span className="campo-rotulo">Aplicativos da bandeja</span>
    <Bandeja embutido topo={0} direita={0} aoFechar={() => undefined} />
  </>;
}
