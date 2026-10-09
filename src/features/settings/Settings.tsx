import { useEffect, useMemo, useState } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Settings, Palette, PanelTop, PanelBottom, Timer, Users, Volume2, Gauge, Maximize, Keyboard, ShieldCheck, Database, Info, Wrench,
  GripVertical, Download, Upload, RotateCcw, Trash2, DatabaseBackup, SquareTerminal, Hand,
} from "lucide-react";
import { TabHeader } from "../../components/TabHeader";
import { Card, Button, Field, Modal, Segmented, NoticeBanner, LineToggle, Toggle, Key, ConfirmModal } from "../../components/basics";
import { Character } from "../../characters/Character";
import { useConfig, BAR_DEFAULT, CATEGORIES_NOTICE, type ModeBorder, type ColorPalette, type Theme, type RestIsland, type TabIsland, CONFIG_DEFAULT } from "../../state/settings";
import { useAgents, AGENTS } from "../../state/agents";
import { useCommunication } from "../../state/communication";
import { useInterface } from "../../state/interface";
import { usePomodoro } from "../../state/pomodoro";
import { T } from "../../i18n/ptBR";
import { contrast, hexValid, BACKGROUND_ACCENT } from "../../utils/colors";
import { downloadFile, readFileText, normalizeText } from "../../utils/basics";
import { tabEnabled, routeEnabled } from "../../utils/features";
import { todayISO } from "../../utils/dates";
import { listKeys, readKey, writeKey, saveNow, modeStorage, resetAll, storedSize, PREFIX } from "../../bridge/storage";
import { ALL_THE_SOUNDS, playSound, type CategorySound } from "../../bridge/sounds";
import { ACCENT_DEFAULT } from "../../windows/desktop/useTheme";
import { EditorPhoto } from "../../components/ProfilePhoto";
import { BackgroundPicker } from "./BackgroundPicker";
import { ClaudeCodeSection } from "./ClaudeCodeSection";
import { AssistiveSection } from "./AssistiveSection";
import { ShortcutEditor } from "./ShortcutEditor";
import { NATIVE } from "../../desktop/desktop";
import { requestGreeting } from "../../windows/island/animations/requestGreeting";
import type { AgentState, Route } from "../../types";

type Section = keyof typeof T.configuracoes.secoes;

const ICONS: Record<Section, React.ReactNode> = {
  geral: <Settings size={15} />,
  aparencia: <Palette size={15} />,
  ilha: <PanelTop size={15} />,
  dock: <PanelBottom size={15} />,
  assistive: <Hand size={15} />,
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

const COLORS_PALETTE: Record<ColorPalette, string> = { padrao: "#f6f6f5", areia: "#f5f1ea", grafite: "#eeeff1", floresta: "#f1f4f0", oceano: "#eff3f6" };

function ItemBarSortable({ rota: route, nome: nameValue, visivel: visible, aoMudarNome: onChangeName, aoMudarVisivel: onChangeVisible }: { rota: Route; nome?: string; visivel: boolean; aoMudarNome: (n: string) => void; aoMudarVisivel: (v: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: route });
  return (
    <div ref={setNodeRef} className="lista-item" style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, background: "var(--superficie)" }}>
      <button type="button" className="botao botao-fantasma botao-pequeno botao-icone" aria-label={T.rotas[route]} style={{ cursor: "grab" }} {...attributes} {...listeners}>
        <GripVertical size={14} />
      </button>
      <input className="campo" style={{ height: 30 }} value={nameValue ?? ""} placeholder={T.rotas[route]} maxLength={24} aria-label={T.rotas[route]} onChange={(e) => onChangeName(e.target.value)} />
      <Toggle ligado={visible} aoMudar={onChangeVisible} rotulo={T.rotas[route]} />
    </div>
  );
}

const KEYS_VISUAL = ["tema", "paleta", "destaque", "escala", "barraLateral", "ilha", "dock"] as const;

function backgroundValid(value: unknown): value is string {
  return value === BACKGROUND_ACCENT || (typeof value === "string" && hexValid(value));
}

function opacityValid(value: unknown): value is number {
  return typeof value === "number" && value >= 0.3 && value <= 1;
}

function validateVisual(payload: unknown): Partial<ReturnType<typeof useConfig.getState>> | null {
  if (!payload || typeof payload !== "object") return null;
  const d = payload as Record<string, unknown>;
  if (d.tipo !== "niko-visual") return null;
  const v = d.visual as Record<string, unknown> | undefined;
  if (!v) return null;
  const output: Record<string, unknown> = {};
  if (["claro", "escuro", "sistema"].includes(v.tema as string)) output.tema = v.tema;
  if (Object.keys(COLORS_PALETTE).includes(v.paleta as string)) output.paleta = v.paleta;
  if (v.destaque === null || (typeof v.destaque === "string" && hexValid(v.destaque))) output.destaque = v.destaque;
  if (typeof v.escala === "number" && v.escala >= 0.8 && v.escala <= 1.3) output.escala = v.escala;
  if (Array.isArray(v.barraLateral)) {
    const valid = v.barraLateral.filter((i: unknown) => i && typeof i === "object" && BAR_DEFAULT.some((b) => b.rota === (i as { rota: string }).rota)).map((i: { rota: Route; nome?: unknown; visivel?: unknown }) => ({ rota: i.rota, nome: typeof i.nome === "string" ? i.nome.slice(0, 24) : undefined, visivel: i.visivel !== false }));
    if (valid.length) output.barraLateral = [...valid, ...BAR_DEFAULT.filter((b) => !valid.some((x: { rota: Route }) => x.rota === b.rota))];
  }
  if (v.ilha && typeof v.ilha === "object") {
    const i = v.ilha as Record<string, unknown>;
    output.ilha = {
      ...CONFIG_DEFAULT.ilha,
      modo: ["fixo", "esconder", "inteligente"].includes(i.modo as string) ? i.modo : CONFIG_DEFAULT.ilha.modo,
      tamanho: ["pequena", "media", "grande"].includes(i.tamanho as string) ? i.tamanho : "media",
      fundo: backgroundValid(i.fundo) ? i.fundo : CONFIG_DEFAULT.ilha.fundo,
      opacidade: opacityValid(i.opacidade) ? i.opacidade : 1,
      repouso: ["nada", "relogio", "midia", "agente"].includes(i.repouso as string) ? i.repouso : "agente",
      fechamentoSeg: typeof i.fechamentoSeg === "number" && i.fechamentoSeg >= 0 && i.fechamentoSeg <= 120 ? i.fechamentoSeg : 15,
      abrirHover: i.abrirHover === true,
      laterais: i.laterais !== false,
    };
  }
  if (v.dock && typeof v.dock === "object") {
    const k = v.dock as Record<string, unknown>;
    output.dock = {
      ...useConfig.getState().dock,
      ativo: k.ativo !== false,
      modo: ["fixo", "esconder", "inteligente"].includes(k.modo as string) ? (k.modo as ModeBorder) : "inteligente",
      fundo: backgroundValid(k.fundo) ? k.fundo : CONFIG_DEFAULT.dock.fundo,
      opacidade: opacityValid(k.opacidade) ? k.opacidade : 1,
    };
  }
  return output as Partial<ReturnType<typeof useConfig.getState>>;
}

const COLLECTIONS = ["configuracoes", "rotina", "estudos", "financas", "organizacao", "comunicacao", "pomodoro", "conquistas", "agentes"];

function SectionData() {
  const notify = useInterface((s) => s.notify);
  const [preview, setPreview] = useState<{ dados: Record<string, string>; resumo: string[] } | null>(null);
  const [error, setError] = useState("");
  const [remove, setDelete] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleteKeys, setDeleteKeys] = useState(false);
  const [resetting, setResetting] = useState(false);

  const exportData = (nameValue = `niko-backup-${todayISO()}.json`) => {
    const payload: Record<string, string> = {};
    for (const k of listKeys()) {
      const v = readKey(k);
      if (v != null) payload[k] = v;
    }
    downloadFile(nameValue, JSON.stringify({ tipo: "niko-backup", versao: 1, criadoEm: new Date().toISOString(), dados: payload }, null, 1));
  };

  const read = async (file: File) => {
    try {
      const text = await readFileText(file, 20 * 1024 * 1024);
      const json = JSON.parse(text) as { tipo?: string; dados?: Record<string, unknown> };
      if (json.tipo !== "niko-backup" || !json.dados || typeof json.dados !== "object") throw new Error("formato");
      const payload: Record<string, string> = {};
      const summary: string[] = [];
      for (const [k, v] of Object.entries(json.dados)) {
        const nameValue = k.replace(PREFIX, "");
        if (!k.startsWith(PREFIX) || !(COLLECTIONS.includes(nameValue) || nameValue === "janela") || typeof v !== "string") continue;
        JSON.parse(v);
        payload[k] = v;
        const state = (JSON.parse(v) as { state?: Record<string, unknown> }).state ?? {};
        const counts = Object.entries(state).filter(([, x]) => Array.isArray(x)).map(([c, x]) => `${c}: ${(x as unknown[]).length}`);
        summary.push(`${nameValue}${counts.length ? ` (${counts.slice(0, 4).join(", ")})` : ""}`);
      }
      if (Object.keys(payload).length === 0) throw new Error("vazio");
      setPreview({ dados: payload, resumo: summary });
      setError("");
    } catch (e) {
      setError((e as Error).message === "arquivo_grande" ? T.validacao.arquivoGrande : T.validacao.arquivoInvalido);
    }
  };

  return (
    <div className="coluna" style={{ gap: 16 }}>
      <div className="linha-entre linha-config">
        <div className="coluna" style={{ gap: 2 }}><span>{T.configuracoes.backup}</span><span className="campo-dica">{T.configuracoes.backupDica}</span></div>
        <Button icone={<Download size={14} />} onClick={() => exportData()}>{T.geral.exportar}</Button>
      </div>
      <div className="linha-entre linha-config">
        <div className="coluna" style={{ gap: 2 }}><span>{T.configuracoes.restaurar}</span>{error && <span className="campo-erro">{error}</span>}</div>
        <label className="botao botao-secundario" style={{ cursor: "pointer" }}>
          <Upload size={14} />
          {T.geral.importar}
          <input type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ""; }} />
        </label>
      </div>
      <div className="linha-entre linha-config">
        <div className="coluna" style={{ gap: 2 }}><span>{T.configuracoes.backupBanco}</span><span className="campo-dica">{modeStorage() === "banco" ? T.configuracoes.backupBancoDica : T.configuracoes.semBanco}</span></div>
        <Button
          icone={<DatabaseBackup size={14} />}
          disabled={modeStorage() !== "banco"}
          onClick={async () => {
            try {
              await saveNow();
              const r = await fetch("/ponte/dados/backup", { method: "POST", headers: { "x-niko": "1" } });
              const j = (await r.json()) as { pasta?: string; erro?: string };
              notify(j.pasta ? T.configuracoes.backupFeito(j.pasta) : T.configuracoes.backupFalhou);
            } catch {
              notify(T.configuracoes.backupFalhou);
            }
          }}
        >
          {T.configuracoes.backupBanco}
        </Button>
      </div>
      <div className="linha-entre linha-config">
        <div className="coluna" style={{ gap: 2 }}><span>{T.configuracoes.importarOutroApp}</span><span className="campo-dica">{T.configuracoes.importarOutroAppDica}</span></div>
        <Button disabled>{T.configuracoes.somenteDesktop}</Button>
      </div>
      <div className="linha-entre linha-config">
        <div className="coluna" style={{ gap: 2 }}><span>{T.configuracoes.apagarTudo}</span><span className="campo-dica">{T.configuracoes.apagarTudoAviso}</span></div>
        <Button variante="perigo" icone={<Trash2 size={14} />} onClick={() => { setConfirmation(""); setDelete(true); }}>{T.configuracoes.apagarTudo}</Button>
      </div>
      <Modal aberto={!!preview} titulo={T.configuracoes.restaurarPrevia} aoFechar={() => setPreview(null)}>
        {preview && (
          <div className="formulario">
            <NoticeBanner tipo="alerta">{T.configuracoes.restaurarAviso}</NoticeBanner>
            <ul className="texto-2" style={{ paddingLeft: 16, fontSize: 12 }}>{preview.resumo.map((r) => <li key={r}>{r}</li>)}</ul>
            <div className="formulario-acoes">
              <Button onClick={() => setPreview(null)}>{T.geral.cancelar}</Button>
              <Button
                variante="primario"
                onClick={() => {
                  exportData(`niko-antes-de-restaurar-${todayISO()}.json`);
                  for (const [k, v] of Object.entries(preview.dados)) writeKey(k, v);
                  notify(T.configuracoes.restaurado);
                  void saveNow().then(() => window.setTimeout(() => window.location.reload(), 400));
                }}
              >
                {T.configuracoes.restaurar}
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <Modal aberto={remove} titulo={T.configuracoes.apagarTudo} aoFechar={() => setDelete(false)}>
        <form
          className="formulario"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (confirmation !== "APAGAR" || resetting) return;
            setResetting(true);
            exportData(`niko-antes-de-zerar-${todayISO()}.json`);
            resetAll(deleteKeys)
              .then(() => window.location.reload())
              .catch(() => {
                setResetting(false);
                notify(T.configuracoes.zerarFalhou);
              });
          }}
        >
          <NoticeBanner tipo="erro">{T.configuracoes.apagarTudoAviso}</NoticeBanner>
          <Field id="ap-conf" rotulo={T.configuracoes.apagarConfirmar}>
            <input id="ap-conf" className="campo" value={confirmation} autoComplete="off" onChange={(e) => setConfirmation(e.target.value)} />
          </Field>
          <LineToggle rotulo={T.configuracoes.apagarChaves} dica={T.configuracoes.apagarChavesDica} ligado={deleteKeys} aoMudar={setDeleteKeys} />
          <div className="formulario-acoes">
            <Button onClick={() => setDelete(false)}>{T.geral.cancelar}</Button>
            <Button type="submit" variante="perigo" disabled={confirmation !== "APAGAR" || resetting}>{resetting ? T.configuracoes.zerando : T.configuracoes.apagarTudo}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function SettingsValue() {
  const cfg = useConfig();
  const notify = useInterface((s) => s.notify);
  const agents = useAgents();
  const memory = useCommunication((s) => s.memoria);
  const remind = useCommunication((s) => s.remind);
  const forget = useCommunication((s) => s.forget);
  const clearConversations = useCommunication((s) => s.clearConversations);
  const parameters = useInterface((s) => s.parametros);
  const [section, setSection] = useState<Section>(parameters.secao && parameters.secao in T.configuracoes.secoes ? (parameters.secao as Section) : "geral");
  useEffect(() => {
    if (parameters.secao && parameters.secao in T.configuracoes.secoes) setSection(parameters.secao as Section);
  }, [parameters]);
  const [search, setSearch] = useState("");
  const sectionsVisible = useMemo(() => {
    const term = normalizeText(search.trim());
    const all = Object.keys(T.configuracoes.secoes) as Section[];
    if (!term) return all;
    return all.filter((s) => normalizeText(`${T.configuracoes.secoes[s]} ${T.configuracoes.palavrasChave[s]}`).includes(term));
  }, [search]);
  useEffect(() => {
    if (sectionsVisible.length > 0 && !sectionsVisible.includes(section)) setSection(sectionsVisible[0]);
  }, [sectionsVisible, section]);
  const [previewVisual, setPreviewVisual] = useState<ReturnType<typeof validateVisual>>(null);
  const [errorVisual, setErrorVisual] = useState("");
  const [newFact, setNewFact] = useState("");
  const [colorText, setColorText] = useState(cfg.destaque ?? "");
  const [clearChat, setClearChat] = useState(false);
  const background = getComputedStyle(document.documentElement).getPropertyValue("--superficie").trim() || "#ffffff";
  const colorCurrent = cfg.destaque ?? ACCENT_DEFAULT.claro;
  const reason = useMemo(() => contrast(colorCurrent, background.startsWith("#") ? background : "#ffffff"), [colorCurrent, background]);

  const onDragBar = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = cfg.barraLateral.findIndex((b) => b.rota === e.active.id);
    const to = cfg.barraLateral.findIndex((b) => b.rota === e.over?.id);
    cfg.set({ barraLateral: arrayMove(cfg.barraLateral, from, to) });
  };

  const onDragTabs = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = cfg.ilha.ordemAbas.indexOf(e.active.id as TabIsland);
    const to = cfg.ilha.ordemAbas.indexOf(e.over.id as TabIsland);
    cfg.setIsland({ ordemAbas: arrayMove(cfg.ilha.ordemAbas, from, to) });
  };

  const segMode = (value: ModeBorder, onChange: (m: ModeBorder) => void) => (
    <Segmented<ModeBorder> rotulo={T.configuracoes.modo} valor={value} aoMudar={onChange} opcoes={(["fixo", "esconder", "inteligente"] as ModeBorder[]).map((m) => ({ valor: m, rotulo: T.configuracoes.modos[m] }))} />
  );

  const content: Record<Section, React.ReactNode> = {
    geral: (
      <>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.perfil.foto}</span>
          <EditorPhoto />
        </div>
        <Field id="cf-nome" rotulo={T.configuracoes.nomePerfil}>
          <input id="cf-nome" className="campo" value={cfg.nome} maxLength={40} onChange={(e) => cfg.set({ nome: e.target.value })} />
        </Field>
        <LineToggle rotulo={T.configuracoes.viradaDia} dica={T.configuracoes.viradaDiaDica} ligado={cfg.viradaAs4h} aoMudar={(v) => cfg.set({ viradaAs4h: v })} />
        <LineToggle rotulo={T.configuracoes.iniciarComWindows} dica={T.configuracoes.iniciarComWindowsDica} ligado={cfg.iniciarComWindows} aoMudar={(v) => cfg.set({ iniciarComWindows: v })} />
        <LineToggle rotulo={T.configuracoes.manterSegundoPlano} dica={`${T.configuracoes.manterDica} ${T.configuracoes.somenteDesktop}.`} ligado={false} desativado aoMudar={() => undefined} />
        <LineToggle rotulo={T.configuracoes.conquistasAtivas} ligado={cfg.conquistasAtivas} aoMudar={(v) => cfg.set({ conquistasAtivas: v })} />
        <LineToggle rotulo={T.calendario.integracaoMostrar} ligado={cfg.sugestaoAgendaGoogle} aoMudar={(v) => cfg.set({ sugestaoAgendaGoogle: v })} />
      </>
    ),
    aparencia: (
      <>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.tema}</span>
          <Segmented<Theme> rotulo={T.configuracoes.tema} valor={cfg.tema} aoMudar={(theme) => cfg.set({ tema: theme })} opcoes={[{ valor: "claro", rotulo: T.barraLateral.temaClaro }, { valor: "escuro", rotulo: T.barraLateral.temaEscuro }, { valor: "sistema", rotulo: T.barraLateral.temaSistema }]} />
        </div>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.paleta}</span>
          <div className="pilulas">
            {(Object.keys(COLORS_PALETTE) as ColorPalette[]).map((p) => (
              <button key={p} type="button" className="pilula" aria-pressed={cfg.paleta === p} onClick={() => cfg.set({ paleta: p })}>
                <span className="ponto-cor" style={{ background: COLORS_PALETTE[p], border: "1px solid var(--borda-forte)" }} />
                {T.configuracoes.paletas[p]}
              </button>
            ))}
          </div>
        </div>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.destaque}</span>
          <div className="linha">
            <input type="color" className="seletor-cor" value={colorCurrent} aria-label={T.configuracoes.destaque} onChange={(e) => { cfg.set({ destaque: e.target.value }); setColorText(e.target.value); }} />
            <input
              className="campo"
              style={{ width: 120 }}
              value={colorText}
              maxLength={7}
              placeholder={ACCENT_DEFAULT.claro}
              aria-label={T.configuracoes.destaque}
              aria-invalid={!!colorText && !hexValid(colorText)}
              onChange={(e) => {
                setColorText(e.target.value);
                if (hexValid(e.target.value)) cfg.set({ destaque: e.target.value });
              }}
            />
            <Button pequeno variante="fantasma" icone={<RotateCcw size={13} />} onClick={() => { cfg.set({ destaque: null }); setColorText(""); }}>{T.geral.restaurarPadrao}</Button>
          </div>
          {cfg.destaque && <span className={reason < 4.5 ? "campo-erro" : "campo-dica"}>{reason < 4.5 ? T.configuracoes.contrasteBaixo(reason.toFixed(1).replace(".", ",")) : T.configuracoes.contrasteOk(reason.toFixed(1).replace(".", ","))}</span>}
        </div>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.escala}</span>
          <Segmented rotulo={T.configuracoes.escala} valor={String(cfg.escala)} aoMudar={(v) => cfg.set({ escala: Number(v) })} opcoes={[{ valor: "0.9", rotulo: "90%" }, { valor: "1", rotulo: "100%" }, { valor: "1.1", rotulo: "110%" }, { valor: "1.2", rotulo: "120%" }]} />
        </div>
        <LineToggle rotulo={T.configuracoes.reduzirAnimacoes} ligado={cfg.reduzirAnimacoes} aoMudar={(v) => cfg.set({ reduzirAnimacoes: v })} />
        <LineToggle rotulo={T.configuracoes.modoLeveEscritorio} ligado={cfg.modoLeveEscritorio} aoMudar={(v) => cfg.set({ modoLeveEscritorio: v })} />
        <div className="campo-grupo">
          <div className="linha-entre">
            <span className="campo-rotulo">{T.configuracoes.barraLateral}</span>
            <Button pequeno variante="fantasma" icone={<RotateCcw size={13} />} onClick={() => cfg.set({ barraLateral: BAR_DEFAULT })}>{T.geral.restaurarPadrao}</Button>
          </div>
          <span className="campo-dica">{T.configuracoes.barraDica}</span>
          <DndContext collisionDetection={closestCenter} onDragEnd={onDragBar}>
            <SortableContext items={cfg.barraLateral.map((b) => b.rota)} strategy={verticalListSortingStrategy}>
              <div className="lista">
                {cfg.barraLateral.filter((b) => routeEnabled(b.rota, cfg.funcoesDesligadas)).map((b) => (
                  <ItemBarSortable
                    key={b.rota}
                    rota={b.rota}
                    nome={b.nome}
                    visivel={b.visivel}
                    aoMudarNome={(n) => cfg.set({ barraLateral: cfg.barraLateral.map((x) => (x.rota === b.rota ? { ...x, nome: n || undefined } : x)) })}
                    aoMudarVisivel={(v) => cfg.set({ barraLateral: cfg.barraLateral.map((x) => (x.rota === b.rota ? { ...x, visivel: v } : x)) })}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
        <div className="linha">
          <Button
            icone={<Download size={14} />}
            onClick={() => {
              const visual = Object.fromEntries(KEYS_VISUAL.map((k) => [k, cfg[k]]));
              downloadFile(`visual-${todayISO()}.niko-visual`, JSON.stringify({ tipo: "niko-visual", versao: 1, visual }, null, 2));
            }}
          >
            {T.configuracoes.exportarVisual}
          </Button>
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
                  const v = validateVisual(JSON.parse(await readFileText(f, 200 * 1024)));
                  if (!v) throw new Error();
                  setPreviewVisual(v);
                  setErrorVisual("");
                } catch {
                  setErrorVisual(T.validacao.arquivoInvalido);
                }
              }}
            />
          </label>
          {errorVisual && <span className="campo-erro">{errorVisual}</span>}
        </div>
      </>
    ),
    ilha: (
      <>
        <LineToggle rotulo={T.configuracoes.ilhaAtiva} ligado={cfg.ilha.ativa} aoMudar={(v) => cfg.setIsland({ ativa: v })} />
        <div className="linha-entre" style={{ gap: 12 }}>
          <span className="campo-dica">{T.configuracoes.verSaudacaoDica}</span>
          <Button pequeno icone={<Hand size={13} />} disabled={!cfg.ilha.ativa} onClick={() => void requestGreeting()}>{T.configuracoes.verSaudacao}</Button>
        </div>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.modo}</span>
          {segMode(cfg.ilha.modo, (mode) => cfg.setIsland({ modo: mode }))}
          <span className="campo-dica">{T.configuracoes.modosDica[cfg.ilha.modo]}</span>
        </div>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.blocosIlha}</span>
          <span className="campo-dica">{T.configuracoes.blocosDica}</span>
          <DndContext collisionDetection={closestCenter} onDragEnd={onDragTabs}>
            <SortableContext items={cfg.ilha.ordemAbas} strategy={verticalListSortingStrategy}>
              <div className="lista">
                {cfg.ilha.ordemAbas.filter((a) => tabEnabled(a, cfg.funcoesDesligadas)).map((a) => <TabIslandSortable key={a} aba={a} />)}
              </div>
            </SortableContext>
          </DndContext>
        </div>
        <div className="formulario-linha">
          <Field id="il-rep" rotulo={T.configuracoes.repousoIlha}>
            <select id="il-rep" className="seletor" value={cfg.ilha.repouso} onChange={(e) => cfg.setIsland({ repouso: e.target.value as RestIsland })}>
              {(Object.keys(T.configuracoes.repousos) as RestIsland[]).map((r) => <option key={r} value={r}>{T.configuracoes.repousos[r]}</option>)}
            </select>
          </Field>
          <Field id="il-tam" rotulo={T.configuracoes.tamanhoIlha}>
            <select id="il-tam" className="seletor" value={cfg.ilha.tamanho} onChange={(e) => cfg.setIsland({ tamanho: e.target.value as "pequena" | "media" | "grande" })}>
              {(["pequena", "media", "grande"] as const).map((t) => <option key={t} value={t}>{T.configuracoes.tamanhos[t]}</option>)}
            </select>
          </Field>
        </div>
        <BackgroundPicker id="il-fundo" fundo={cfg.ilha.fundo} opacidade={cfg.ilha.opacidade} aoMudar={(m) => cfg.setIsland(m)} />
        <div className="formulario-linha">
          <Field id="il-fech" rotulo={T.configuracoes.fechamentoAuto}>
            <select id="il-fech" className="seletor" value={cfg.ilha.fechamentoSeg} onChange={(e) => cfg.setIsland({ fechamentoSeg: Number(e.target.value) })}>
              {[5, 10, 15, 30, 60, 120].map((s) => <option key={s} value={s}>{T.conexoes.segundos(s)}</option>)}
              <option value={0}>{T.configuracoes.nunca}</option>
            </select>
          </Field>
          <Field id="il-esc" rotulo={T.configuracoes.esconderCompacta}>
            <select id="il-esc" className="seletor" value={cfg.ilha.esconderSeg} disabled={cfg.ilha.modo !== "esconder"} onChange={(e) => cfg.setIsland({ esconderSeg: Number(e.target.value) })}>
              {[10, 30, 60, 120, 300].map((s) => <option key={s} value={s}>{T.conexoes.segundos(s)}</option>)}
            </select>
          </Field>
        </div>
        <LineToggle rotulo={T.configuracoes.lateraisIlha} dica={T.configuracoes.lateraisDica} ligado={cfg.ilha.laterais} aoMudar={(v) => cfg.setIsland({ laterais: v })} />
        <LineToggle rotulo={T.configuracoes.abrirHover} ligado={cfg.ilha.abrirHover} aoMudar={(v) => cfg.setIsland({ abrirHover: v })} />
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.notificacoesIlha}</span>
          <Segmented rotulo={T.configuracoes.notificacoesIlha} valor={cfg.ilha.notificacoes} aoMudar={(v) => cfg.setIsland({ notificacoes: v })} opcoes={(["importantes", "todas", "nenhuma"] as const).map((v) => ({ valor: v, rotulo: T.configuracoes.notificacoesOpcoes[v] }))} />
          <span className="campo-dica">{T.configuracoes.notificacoesDica[cfg.ilha.notificacoes]}</span>
        </div>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.avisosPorTipo}</span>
          <span className="campo-dica">{T.configuracoes.avisosPorTipoDica}</span>
          {CATEGORIES_NOTICE.map((c) => (
            <LineToggle
              key={c}
              rotulo={T.configuracoes.categoriasDeAviso[c]}
              ligado={!cfg.avisosDesligados.includes(c)}
              aoMudar={(v) => cfg.set({ avisosDesligados: v ? cfg.avisosDesligados.filter((x) => x !== c) : [...cfg.avisosDesligados, c] })}
            />
          ))}
        </div>
        <Field id="il-fav" rotulo={T.configuracoes.agenteFavorito}>
          <select id="il-fav" className="seletor" value={cfg.agentes.favorito} onChange={(e) => cfg.set({ agentes: { ...cfg.agentes, favorito: e.target.value as typeof cfg.agentes.favorito } })}>
            {AGENTS.map((a) => <option key={a} value={a}>{cfg.agentes.nomes[a]}</option>)}
          </select>
        </Field>
      </>
    ),
    dock: (
      <>
        <LineToggle rotulo={T.configuracoes.dockAtivo} ligado={cfg.dock.ativo} aoMudar={(v) => cfg.set({ dock: { ...cfg.dock, ativo: v } })} />
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.modo}</span>
          {segMode(cfg.dock.modo, (mode) => cfg.set({ dock: { ...cfg.dock, modo: mode } }))}
          <span className="campo-dica">{T.configuracoes.modosDica[cfg.dock.modo]}</span>
        </div>
        <LineToggle rotulo={T.configuracoes.ampliarDock} ligado={cfg.dock.ampliar} aoMudar={(v) => cfg.set({ dock: { ...cfg.dock, ampliar: v } })} />
        <BackgroundPicker id="dk-fundo" fundo={cfg.dock.fundo} opacidade={cfg.dock.opacidade} aoMudar={(m) => cfg.set({ dock: { ...cfg.dock, ...m } })} />
        <NoticeBanner>{T.configuracoes.appsWindowsDock}</NoticeBanner>
      </>
    ),
    pomodoro: (
      <>
        <span className="campo-rotulo">{T.configuracoes.duracoes}</span>
        <div className="formulario-linha">
          {(["foco", "curta", "longa"] as const).map((k) => (
            <Field key={k} id={`pm-${k}`} rotulo={k === "foco" ? T.pomodoro.etapas.foco : k === "curta" ? T.pomodoro.etapas.pausa_curta : T.pomodoro.etapas.pausa_longa} dica={T.validacao.entre(1, 180)}>
              <input id={`pm-${k}`} className="campo" type="number" min={1} max={180} value={cfg.pomodoro[k]} onChange={(e) => { const n = Math.max(1, Math.min(180, Math.round(Number(e.target.value) || 1))); cfg.set({ pomodoro: { ...cfg.pomodoro, [k]: n } }); usePomodoro.getState().restart(); }} />
            </Field>
          ))}
          <Field id="pm-ciclos" rotulo={T.configuracoes.ciclos} dica={T.validacao.entre(1, 12)}>
            <input id="pm-ciclos" className="campo" type="number" min={1} max={12} value={cfg.pomodoro.ciclos} onChange={(e) => cfg.set({ pomodoro: { ...cfg.pomodoro, ciclos: Math.max(1, Math.min(12, Math.round(Number(e.target.value) || 1))) } })} />
          </Field>
        </div>
        <LineToggle rotulo={T.configuracoes.autoProxima} ligado={cfg.pomodoro.autoProxima} aoMudar={(v) => cfg.set({ pomodoro: { ...cfg.pomodoro, autoProxima: v } })} />
        <LineToggle rotulo={T.configuracoes.tiquePomodoro} dica={T.configuracoes.tiquePomodoroDica} ligado={cfg.pomodoro.tique} aoMudar={(v) => cfg.set({ pomodoro: { ...cfg.pomodoro, tique: v } })} />
      </>
    ),
    agentes: (
      <>
        <div className="grade">
          {AGENTS.map((a) => (
            <Card key={a} className="col-3">
              <div className="coluna" style={{ alignItems: "center" }}>
                <Character agente={a} tamanho={56} />
                <Field id={`ag-${a}`} rotulo={T.configuracoes.nomeAgente}>
                  <input id={`ag-${a}`} className="campo" value={cfg.agentes.nomes[a]} maxLength={20} onChange={(e) => cfg.set({ agentes: { ...cfg.agentes, nomes: { ...cfg.agentes.nomes, [a]: e.target.value.slice(0, 20) } } })} onBlur={(e) => !e.target.value.trim() && cfg.set({ agentes: { ...cfg.agentes, nomes: { ...cfg.agentes.nomes, [a]: CONFIG_DEFAULT.agentes.nomes[a] } } })} />
                </Field>
                <Field id={`cg-${a}`} rotulo={T.configuracoes.cargoAgente}>
                  <input id={`cg-${a}`} className="campo" value={cfg.agentes.cargos[a]} maxLength={32} onChange={(e) => cfg.set({ agentes: { ...cfg.agentes, cargos: { ...cfg.agentes.cargos, [a]: e.target.value.slice(0, 32) } } })} onBlur={(e) => !e.target.value.trim() && cfg.set({ agentes: { ...cfg.agentes, cargos: { ...cfg.agentes.cargos, [a]: CONFIG_DEFAULT.agentes.cargos[a] } } })} />
                </Field>
                <span className="texto-3" style={{ fontSize: 11, textAlign: "center" }}>{T.agentes.areas[a]}</span>
              </div>
            </Card>
          ))}
        </div>
        <Field id="ag-ina" rotulo={T.configuracoes.inatividade}>
          <input id="ag-ina" className="campo" type="number" min={1} max={240} style={{ width: 120 }} value={cfg.agentes.inatividadeMin} onChange={(e) => cfg.set({ agentes: { ...cfg.agentes, inatividadeMin: Math.max(1, Math.min(240, Math.round(Number(e.target.value) || 10))) } })} />
        </Field>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.semprePermitido}</span>
          {cfg.ia.autoAprovar.length === 0 ? <span className="campo-dica">{T.configuracoes.semprePermitidoVazio}</span> : (
            <div className="pilulas">
              {cfg.ia.autoAprovar.map((type) => (
                <button key={type} type="button" className="pilula" title={T.geral.excluir} onClick={() => cfg.set({ ia: { ...cfg.ia, autoAprovar: cfg.ia.autoAprovar.filter((x) => x !== type) } })}>
                  <code>{T.chat.permissao.acoes[type]}</code>
                  <Trash2 size={12} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.memoria}</span>
          {memory.length === 0 ? <span className="campo-dica">{T.configuracoes.semMemoria}</span> : (
            <div className="lista">
              {memory.map((m) => (
                <div key={m.id} className="lista-item">
                  <span className="lista-item-principal">{m.texto}</span>
                  <span className="etiqueta">{cfg.agentes.nomes[m.agenteId]}</span>
                  <Button pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => forget(m.id)} />
                </div>
              ))}
            </div>
          )}
          <form className="linha" noValidate onSubmit={(e) => { e.preventDefault(); if (!newFact.trim()) return; remind(newFact, "organizador", "manual"); setNewFact(""); }}>
            <input className="campo" value={newFact} maxLength={300} placeholder={T.configuracoes.novoFato} aria-label={T.configuracoes.novoFato} onChange={(e) => setNewFact(e.target.value)} />
            <Button type="submit">{T.geral.adicionar}</Button>
          </form>
        </div>
      </>
    ),
    sons: (
      <>
        <LineToggle rotulo={T.configuracoes.sonsAtivos} ligado={cfg.sons.ligado} aoMudar={(v) => cfg.set({ sons: { ...cfg.sons, ligado: v } })} />
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.volume} <span className="numero">{Math.round(cfg.sons.volume * 100)}%</span></span>
          <input type="range" className="faixa" min={0} max={0.5} step={0.01} value={cfg.sons.volume} aria-label={T.configuracoes.volume} onChange={(e) => cfg.set({ sons: { ...cfg.sons, volume: Number(e.target.value) } })} onPointerUp={() => void playSound("blip")} />
        </div>
        {(Object.keys(T.configuracoes.categoriasSom) as CategorySound[]).map((c) => (
          <LineToggle key={c} rotulo={T.configuracoes.categoriasSom[c]} ligado={cfg.sons.categorias[c]} aoMudar={(v) => cfg.set({ sons: { ...cfg.sons, categorias: { ...cfg.sons.categorias, [c]: v } } })} />
        ))}
      </>
    ),
    consumo: (
      <>
      <LineToggle rotulo={T.consumo.ligarParte2} dica={T.consumo.parte2Aviso.join(" ")} ligado={cfg.consumo.lerPlanos} aoMudar={(v) => cfg.set({ consumo: { ...cfg.consumo, lerPlanos: v } })} />
      <div className="formulario-linha">
        {(["precoEntrada", "precoSaida", "limiteMensal"] as const).map((k) => (
          <Field key={k} id={`cs-${k}`} rotulo={T.configuracoes[k]}>
            <input id={`cs-${k}`} className="campo" type="number" min={0} max={10000} step="0.01" value={cfg.consumo[k]} onChange={(e) => cfg.set({ consumo: { ...cfg.consumo, [k]: Math.max(0, Math.min(10000, Number(e.target.value) || 0)) } })} />
          </Field>
        ))}
      </div>
      </>
    ),
    tela: (
      <>
        <NoticeBanner>{T.configuracoes.telaNavegador}</NoticeBanner>
        <LineToggle rotulo={T.configuracoes.esconderTelaCheia} ligado={cfg.esconderTelaCheia} aoMudar={(v) => cfg.set({ esconderTelaCheia: v })} />
        <Field id="tc-apps" rotulo={T.configuracoes.appsEsconder} dica={T.configuracoes.appsDica}>
          <textarea id="tc-apps" className="area-texto" value={cfg.appsEsconder} maxLength={1000} onChange={(e) => cfg.set({ appsEsconder: e.target.value })} />
        </Field>
      </>
    ),
    atalhos: (
      <>
        <NoticeBanner>{NATIVE ? T.configuracoes.atalhosGlobais.dica : T.configuracoes.atalhosDica}</NoticeBanner>
        <h3 className="titulo-secao">{T.configuracoes.atalhosGlobais.titulo}</h3>
        <ShortcutEditor />
        <h3 className="titulo-secao">{T.configuracoes.atalhosGlobais.internos}</h3>
        <div className="lista">
          {T.configuracoes.listaAtalhos.map(([key, action]) => (
            <div key={key} className="lista-item">
              <span className="lista-item-principal">{action}</span>
              <Key>{key}</Key>
            </div>
          ))}
        </div>
      </>
    ),
    privacidade: (
      <>
        <LineToggle rotulo={T.configuracoes.privacidade} dica={T.configuracoes.privacidadeDica} ligado={cfg.privacidade} aoMudar={(v) => cfg.set({ privacidade: v })} />
        <LineToggle rotulo={T.configuracoes.pausarConexoes} ligado={cfg.pausarConexoes} aoMudar={(v) => cfg.set({ pausarConexoes: v })} />
        <LineToggle rotulo={T.configuracoes.nuncaFinanceiro} ligado={cfg.nuncaFinanceiro} aoMudar={(v) => cfg.set({ nuncaFinanceiro: v })} />
        <div className="linha-entre linha-config">
          <span>{T.configuracoes.limparChat}</span>
          <Button variante="perigo" onClick={() => setClearChat(true)}>{T.geral.limpar}</Button>
        </div>
      </>
    ),
    dados: <SectionData />,
    claude: <ClaudeCodeSection />,
    assistive: <AssistiveSection />,
    sobre: (
      <>
        <p>{T.configuracoes.sobreTexto}</p>
        <p className="texto-2">{T.app.versao}</p>
        <p className="texto-2">{T.configuracoes.licenca}</p>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.diagnostico}</span>
          <span className="texto-2">{T.configuracoes.itensGuardados(listKeys().length, (storedSize() / 1024).toFixed(0))}</span>
        </div>
        <Button onClick={() => cfg.set({ primeiraExecucaoFeita: false })}>{T.configuracoes.refazerPrimeira}</Button>
      </>
    ),
    desenvolvedor: (
      <>
        <p className="campo-dica">{T.configuracoes.devDica}</p>
        {AGENTS.map((a) => (
          <div key={a} className="linha" style={{ flexWrap: "wrap" }}>
            <Character agente={a} tamanho={32} />
            <b style={{ minWidth: 100 }}>{cfg.agentes.nomes[a]}</b>
            <select className="seletor" style={{ width: 170, height: 30 }} aria-label={T.configuracoes.forcarEstado} value={agents.forcado[a] ?? ""} onChange={(e) => agents.force(a, (e.target.value || null) as AgentState | null)}>
              <option value="">{T.configuracoes.estadoReal}</option>
              {(Object.keys(T.agentes.estados) as AgentState[]).map((s) => <option key={s} value={s}>{T.agentes.estados[s]}</option>)}
            </select>
            <Button pequeno onClick={() => agents.alertar(a, T.configuracoes.alertaTeste, "inicio")}>{T.configuracoes.dispararAlerta}</Button>
            <Button pequeno onClick={() => void agents.trabalhar(a, T.configuracoes.tarefaTeste, 2500)}>{T.configuracoes.simularTrabalho}</Button>
          </div>
        ))}
        <div className="linha" style={{ flexWrap: "wrap" }}>
          <Button
            pequeno
            onClick={() => {
              const p = usePomodoro.getState();
              if (!p.rodando) p.start();
              usePomodoro.setState({ terminaEm: Date.now() - 10 });
            }}
          >
            {T.configuracoes.simularFimPomodoro}
          </Button>
        </div>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.configuracoes.tocarSom}</span>
          <div className="pilulas">
            {ALL_THE_SOUNDS.map((s) => <button key={s} type="button" className="pilula" onClick={() => void playSound(s)}>{s}</button>)}
          </div>
        </div>
      </>
    ),
  };

  return (
    <>
      <TabHeader titulo={T.configuracoes.titulo} subtitulo={T.configuracoes.subtitulo} />
      <div className="duas-colunas">
        <Card>
          <input className="campo" type="search" value={search} placeholder={T.configuracoes.buscarSecao} aria-label={T.configuracoes.buscarSecao} style={{ marginBottom: 8 }} onChange={(e) => setSearch(e.target.value)} />
          <nav className="lista-lateral" aria-label={T.configuracoes.titulo}>
            {sectionsVisible.length === 0 && <span className="campo-dica">{T.configuracoes.semSecao}</span>}
            {sectionsVisible.map((s) => (
              <button key={s} type="button" className="lista-lateral-item" aria-current={section === s} onClick={() => setSection(s)}>
                {ICONS[s]}
                {T.configuracoes.secoes[s]}
              </button>
            ))}
          </nav>
        </Card>
        <Card titulo={T.configuracoes.secoes[section]} icone={ICONS[section]}>
          <div className="formulario">{content[section]}</div>
        </Card>
      </div>
      <Modal aberto={!!previewVisual} titulo={T.configuracoes.previaVisual} aoFechar={() => setPreviewVisual(null)}>
        {previewVisual && (
          <div className="formulario">
            <ul className="texto-2" style={{ paddingLeft: 16, fontSize: 12 }}>
              {Object.keys(previewVisual).map((k) => <li key={k}>{k}</li>)}
            </ul>
            <div className="formulario-acoes">
              <Button onClick={() => setPreviewVisual(null)}>{T.geral.cancelar}</Button>
              <Button variante="primario" onClick={() => { cfg.set(previewVisual); setPreviewVisual(null); notify(T.configuracoes.visualImportado); }}>{T.configuracoes.aplicar}</Button>
            </div>
          </div>
        )}
      </Modal>
      <ConfirmModal aberto={clearChat} titulo={T.configuracoes.limparChat} texto={T.geral.confirmarExclusaoTexto} aoFechar={() => setClearChat(false)} aoConfirmar={clearConversations} />
    </>
  );
}

function TabIslandSortable({ aba: tab }: { aba: TabIsland }) {
  const enabled = useConfig((s) => s.ilha.blocos[tab]);
  const setIsland = useConfig((s) => s.setIsland);
  const blocks = useConfig((s) => s.ilha.blocos);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab });
  const active = Object.values(blocks).filter(Boolean).length;
  return (
    <div ref={setNodeRef} className="lista-item" style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, background: "var(--superficie)" }}>
      <button type="button" className="botao botao-fantasma botao-pequeno botao-icone" aria-label={T.ilha.abas[tab]} style={{ cursor: "grab" }} {...attributes} {...listeners}>
        <GripVertical size={14} />
      </button>
      <span className="lista-item-principal">{T.ilha.abas[tab]}</span>
      <Toggle ligado={enabled} rotulo={T.ilha.abas[tab]} desativado={enabled && active <= 1} aoMudar={(v) => setIsland({ blocos: { ...blocks, [tab]: v } })} />
    </div>
  );
}
