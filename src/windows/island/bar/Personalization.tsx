import { motion } from "motion/react";
import { Check, ExternalLink, Image, MonitorX, Paintbrush, PanelBottom, PanelTop, Settings2, SunMoon, type LucideIcon } from "lucide-react";
import { ICONS_BAR, useConfig, type RestIsland, type Theme } from "../../../state/settings";
import { useInterface } from "../../../state/interface";
import { useIsland } from "../../../state/island";
import { control } from "../../../bridge/localBridge";
import { playSound } from "../../../bridge/sounds";
import { ACCENT_DEFAULT } from "../../desktop/useTheme";
import { BACKGROUNDS_READY } from "../../../features/settings/BackgroundPicker";
import { BACKGROUND_ACCENT, hexValid, mix, textSobre } from "../../../utils/colors";
import { T } from "../../../i18n/ptBR";
import { useMonitors } from "../../../desktop/desktop";
import { ALL_THE_MONITORS } from "../../dock/monitors";
import { SEARCHENGINES, type SearchEngine } from "../../../utils/appSearch";

const MONITOR_PRIMARY = "principal";

const P = T.ilha.barra.personalizacao;
const ACCENTS_READY = ["#a78bfa", "#3b82f6", "#10b981", "#f59e0b", "#f4505e", "#ec4899"];

function SelectionValue<V extends string>({ rotulo: label, valor: value, opcoes: options, aoMudar: onChange, grade: grid = false, desativada: disabled = false }: { rotulo: string; valor: V; opcoes: { valor: V; rotulo: string }[]; aoMudar: (v: V) => void; grade?: boolean; desativada?: boolean }) {
  return (
    <div className="ilha-escolha" data-grade={grid || undefined} data-desativada={disabled || undefined} role="radiogroup" aria-label={label} aria-disabled={disabled || undefined}>
      {options.map((o) => (
        <button key={o.valor} type="button" role="radio" aria-checked={value === o.valor} className="ilha-escolha-opcao" disabled={disabled} onClick={() => onChange(o.valor)}>
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

function Sample({ cor: color, rotulo: label, ativa: active, aoClicar: onClick }: { cor: string; rotulo: string; ativa: boolean; aoClicar: () => void }) {
  return (
    <button type="button" className="ilha-amostra" style={{ background: color }} aria-label={label} title={label} aria-pressed={active} onClick={onClick}>
      {active && <Check size={12} color={textSobre(color)} />}
    </button>
  );
}

function ColorFree({ rotulo: label, valor: value, aoMudar: onChange }: { rotulo: string; valor: string; aoMudar: (color: string) => void }) {
  return (
    <label className="ilha-amostra ilha-amostra-livre" title={label}>
      <input type="color" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Group({ icone: Icon, titulo: title, children }: { icone: LucideIcon; titulo: string; children: React.ReactNode }) {
  return (
    <section className="ilha-personalizar-grupo" aria-label={title}>
      <span className="ilha-personalizar-titulo">
        <Icon size={13} />
        {title}
      </span>
      {children}
    </section>
  );
}

function Line({ rotulo: label, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="ilha-personalizar-secao">
      <span className="ilha-personalizar-rotulo">{label}</span>
      {children}
    </div>
  );
}

export function Personalization({ topo: topValue, aoFechar: onClose }: { topo: number; aoFechar: () => void }) {
  const cfg = useConfig();
  const navigateTo = useInterface((s) => s.navigateTo);
  const colorAccent = cfg.destaque && hexValid(cfg.destaque) ? cfg.destaque : ACCENT_DEFAULT.escuro;
  const sampleBackground = (value: string) => (value === BACKGROUND_ACCENT ? mix(colorAccent, "#000000", 0.82) : value);
  const source = cfg.ilha;
  const percentage = Math.round(source.opacidade * 100);
  const monitors = useMonitors();
  const multipleMonitors = monitors.length >= 2;
  const selectionSalva = cfg.dock.monitores ?? ALL_THE_MONITORS;
  const selectionDock = !multipleMonitors ? MONITOR_PRIMARY : selectionSalva === ALL_THE_MONITORS || monitors.some((m) => m.nome === selectionSalva) ? selectionSalva : monitors.find((m) => m.principal)?.nome ?? ALL_THE_MONITORS;
  const optionsMonitor = multipleMonitors
    ? [
        { valor: ALL_THE_MONITORS, rotulo: monitors.length === 2 ? P.monitores.osDois : P.monitores.todos },
        ...monitors.map((m) => ({ valor: m.nome, rotulo: monitors.length === 2 ? (m.principal ? P.monitores.principal : P.monitores.secundario) : P.monitores.numero(m.numero, m.principal) })),
      ]
    : [
        { valor: ALL_THE_MONITORS, rotulo: P.monitores.osDois },
        { valor: MONITOR_PRIMARY, rotulo: P.monitores.principal },
        { valor: "secundario", rotulo: P.monitores.secundario },
      ];

  const monitorPrimary = monitors.find((m) => m.principal);
  const monitorIsland = multipleMonitors && monitors.some((m) => m.nome === cfg.ilha.monitor && !m.principal) ? cfg.ilha.monitor : MONITOR_PRIMARY;
  const optionsIsland = multipleMonitors
    ? [
        { valor: MONITOR_PRIMARY, rotulo: monitors.length === 2 ? P.monitores.principal : P.monitores.numero(monitorPrimary?.numero ?? 1, true) },
        ...monitors.filter((m) => !m.principal).map((m) => ({ valor: m.nome, rotulo: monitors.length === 2 ? P.monitores.secundario : P.monitores.numero(m.numero, false) })),
      ]
    : [
        { valor: MONITOR_PRIMARY, rotulo: P.monitores.principal },
        { valor: "secundario", rotulo: P.monitores.secundario },
      ];

  const applyColor = (change: { fundo?: string; opacidade?: number }) => {
    cfg.setIsland(change);
    cfg.set({ dock: { ...useConfig.getState().dock, ...change } });
  };

  return (
    <motion.div
      className="ilha-pop ilha-personalizar"
      style={{ top: topValue, maxHeight: `calc(100vh - ${topValue + 12}px)` }}
      role="dialog"
      aria-label={T.ilha.barra.personalizar}
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.12 } }}
      transition={{ type: "spring", visualDuration: 0.28, bounce: 0.15 }}
    >
      <Group icone={SunMoon} titulo={P.grupos.aparencia}>
        <Line rotulo={P.temaDoNiko}>
          <SelectionValue<Theme> rotulo={P.temaDoNiko} valor={cfg.tema} aoMudar={(theme) => cfg.set({ tema: theme })} opcoes={(["claro", "escuro", "sistema"] as Theme[]).map((t) => ({ valor: t, rotulo: P.temas[t] }))} />
        </Line>
        <Line rotulo={P.destaque}>
          <div className="ilha-amostras">
            {ACCENTS_READY.map((color) => (
              <Sample key={color} cor={color} rotulo={color} ativa={colorAccent.toLowerCase() === color} aoClicar={() => cfg.set({ destaque: color })} />
            ))}
            <ColorFree rotulo={T.configuracoes.outraCor} valor={colorAccent} aoMudar={(accent) => cfg.set({ destaque: accent })} />
          </div>
        </Line>
      </Group>

      <Group icone={Paintbrush} titulo={P.cores}>
        <div className="ilha-amostras">
          {BACKGROUNDS_READY.map((f) => (
            <Sample key={f.valor} cor={sampleBackground(f.valor)} rotulo={f.rotulo} ativa={source.fundo === f.valor} aoClicar={() => applyColor({ fundo: f.valor })} />
          ))}
          <ColorFree rotulo={T.configuracoes.outraCor} valor={hexValid(source.fundo) ? source.fundo : sampleBackground(source.fundo)} aoMudar={(background) => applyColor({ fundo: background })} />
        </div>
        <div className="ilha-rapido-linha">
          <span className="ilha-personalizar-rotulo">{T.configuracoes.opacidade}</span>
          <input
            type="range"
            className="ilha-rapido-deslizante"
            min={30}
            max={100}
            step={5}
            value={percentage}
            aria-label={T.configuracoes.opacidade}
            style={{ ["--preenchido" as string]: `${((percentage - 30) / 70) * 100}%` }}
            onChange={(e) => applyColor({ opacidade: Number(e.target.value) / 100 })}
          />
          <span className="ilha-rapido-valor numero">{percentage}%</span>
        </div>
        <p className="ilha-personalizar-dica">{T.configuracoes.textoAutomatico}</p>
      </Group>

      <Group icone={PanelTop} titulo={P.grupos.ilha}>
        <Line rotulo={P.tamanhoDaIlha}>
          <SelectionValue rotulo={P.tamanhoDaIlha} valor={cfg.ilha.tamanho} aoMudar={(size) => cfg.setIsland({ tamanho: size })} opcoes={(["pequena", "media", "grande"] as const).map((t) => ({ valor: t, rotulo: T.configuracoes.tamanhos[t] }))} />
        </Line>
        <Line rotulo={P.monitorDaIlha}>
          <SelectionValue desativada={!multipleMonitors} rotulo={P.monitorDaIlha} valor={monitorIsland} aoMudar={(monitor) => cfg.setIsland({ monitor: monitor === MONITOR_PRIMARY ? "" : monitor })} opcoes={optionsIsland} />
        </Line>
        <Line rotulo={P.repouso}>
          <SelectionValue<RestIsland> grade rotulo={P.repouso} valor={cfg.ilha.repouso} aoMudar={(rest) => cfg.setIsland({ repouso: rest })} opcoes={(Object.keys(T.configuracoes.repousos) as RestIsland[]).map((r) => ({ valor: r, rotulo: T.configuracoes.repousos[r] }))} />
        </Line>
        <Line rotulo={P.iconesDaBarra}>
          <div className="ilha-escolha" role="group" aria-label={P.iconesDaBarra}>
            {ICONS_BAR.map((icon) => (
              <button
                key={icon}
                type="button"
                role="checkbox"
                aria-checked={cfg.ilha.iconesDaBarra[icon]}
                className="ilha-escolha-opcao"
                onClick={() => cfg.setIsland({ iconesDaBarra: { ...cfg.ilha.iconesDaBarra, [icon]: !cfg.ilha.iconesDaBarra[icon] } })}
              >
                {P.icones[icon]}
              </button>
            ))}
          </div>
        </Line>
      </Group>

      <Group icone={PanelBottom} titulo={P.grupos.dock}>
        <Line rotulo={P.monitores.titulo}>
          <SelectionValue desativada={!multipleMonitors} rotulo={P.monitores.titulo} valor={selectionDock} aoMudar={(selection) => cfg.set({ dock: { ...useConfig.getState().dock, monitores: selection } })} opcoes={optionsMonitor} />
          {!multipleMonitors && (
            <span className="ilha-personalizar-aviso">
              <MonitorX size={13} />
              {P.monitores.naoReconhecido}
            </span>
          )}
        </Line>
        <Line rotulo={P.buscador}>
          <SelectionValue<SearchEngine> rotulo={P.buscador} valor={cfg.dock.buscador} aoMudar={(searchEngine) => cfg.set({ dock: { ...useConfig.getState().dock, buscador: searchEngine } })} opcoes={SEARCHENGINES.map((b) => ({ valor: b, rotulo: P.buscadores[b] }))} />
        </Line>
      </Group>
      <div className="ilha-personalizar-rodape">
        <button
          type="button"
          className="ilha-rapido-texto"
          onClick={() => {
            void playSound("open");
            onClose();
            void control.ferramenta("papelDeParede").catch(() => useIsland.getState().notifyFailure(T.ilha.barra.indisponivel));
          }}
        >
          <Image size={14} />
          {P.papelDeParede}
          <ExternalLink size={12} />
        </button>
        <button
          type="button"
          className="ilha-rapido-texto"
          onClick={() => {
            void playSound("open");
            onClose();
            navigateTo("configuracoes", { secao: "aparencia" });
          }}
        >
          <Settings2 size={14} />
          {P.maisOpcoes}
        </button>
      </div>
    </motion.div>
  );
}
