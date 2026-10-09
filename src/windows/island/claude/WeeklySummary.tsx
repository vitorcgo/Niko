import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, Copy, EyeOff, Trash2 } from "lucide-react";
import { gravarPendente, useCodeHistory } from "../../../state/codeHistory";
import { startWeek, summaryWeek, weekPassada, type WeeklySummary as Summary } from "../../../utils/weeklySummary";
import { fromISO } from "../../../utils/dates";
import { playSound } from "../../../bridge/sounds";
import { Brand } from "../../../brands/Brand";
import { T } from "../../../i18n/ptBR";
import { BRAND_TOOL, nameTool } from "./tools";
import type { CodingTool } from "../../../bridge/claudeCode";

const R = T.ilha.claude.resumo;
const WIDTH_IMAGE = 1080;
const HEIGHT_IMAGE = 1920;

export function duration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return R.minutos(minutes);
  const hours = Math.floor(minutes / 60);
  return R.horas(hours, minutes % 60);
}

function nameDay(iso: string): string {
  return fromISO(iso).toLocaleDateString("pt-BR", { weekday: "long" });
}

function period(start: string): string {
  const comeco = fromISO(start);
  const end = new Date(comeco.getFullYear(), comeco.getMonth(), comeco.getDate() + 6);
  const f = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  return `${f(comeco)} a ${f(end)}`;
}

function linesSummary(r: Summary, hide: boolean): [string, string][] {
  return [
    [R.tempo, duration(r.tempoMs)],
    [R.sessoes, String(r.sessoes)],
    [R.arquivos, String(r.arquivos)],
    [R.linhas, `+${r.mais} -${r.menos}`],
    [R.comandos, String(r.comandos)],
    [R.pedidos, `${r.pedidos} · ${r.perguntas}`],
    ...(r.agente ? [[R.agente, nameTool(r.agente.ferramenta as CodingTool)] as [string, string]] : []),
    ...(r.projeto ? [[R.projeto, hide ? R.escondido : r.projeto.nome] as [string, string]] : []),
    ...(r.diaMaisCheio ? [[R.diaMaisCheio, `${nameDay(r.diaMaisCheio.dia)} · ${duration(r.diaMaisCheio.tempoMs)}`] as [string, string]] : []),
    ...(r.maisLonga ? [[R.maisLonga, `${hide ? R.escondido : r.maisLonga.projeto} · ${duration(r.maisLonga.tempoMs)}`] as [string, string]] : []),
  ];
}

async function imageSummary(r: Summary, hide: boolean): Promise<Blob | null> {
  const screenValue = document.createElement("canvas");
  screenValue.width = WIDTH_IMAGE;
  screenValue.height = HEIGHT_IMAGE;
  const c = screenValue.getContext("2d");
  if (!c) return null;
  const source = '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';
  c.fillStyle = "#111114";
  c.fillRect(0, 0, WIDTH_IMAGE, HEIGHT_IMAGE);
  c.fillStyle = "#8b8b93";
  c.font = `500 40px ${source}`;
  c.fillText(R.titulo, 96, 200);
  c.fillStyle = "#f2f2f4";
  c.font = `700 150px ${source}`;
  c.fillText(duration(r.tempoMs), 96, 380);
  c.fillStyle = "#8b8b93";
  c.font = `400 40px ${source}`;
  c.fillText(period(r.inicio), 96, 450);
  let y = 610;
  for (const [label, value] of linesSummary(r, hide).slice(1)) {
    c.fillStyle = "#8b8b93";
    c.font = `400 36px ${source}`;
    c.fillText(label, 96, y);
    c.fillStyle = "#f2f2f4";
    c.font = `600 56px ${source}`;
    c.fillText(value.length > 30 ? `${value.slice(0, 29)}…` : value, 96, y + 66);
    y += 128;
  }
  c.fillStyle = "#5c5c66";
  c.font = `500 34px ${source}`;
  c.fillText(R.feitoCom, 96, HEIGHT_IMAGE - 110);
  return new Promise((resolve) => screenValue.toBlob(resolve, "image/png"));
}

export function WeeklySummary({ aoFechar: onClose }: { aoFechar: () => void }) {
  const historyValue = useCodeHistory((s) => s.historico);
  const hide = useCodeHistory((s) => s.esconderProjetos);
  const set = useCodeHistory((s) => s.set);
  const clear = useCodeHistory((s) => s.clear);
  const [qual, setQual] = useState<"passada" | "atual">("passada");
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => gravarPendente(), []);
  const summary = useMemo(() => summaryWeek(historyValue, qual === "passada" ? weekPassada(new Date()) : startWeek(new Date())), [historyValue, qual]);

  const copy = async () => {
    try {
      const image = await imageSummary(summary, hide);
      if (!image) throw new Error();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": image })]);
      void playSound("blip");
      setNotice(R.copiado);
    } catch {
      setNotice(R.naoCopiou);
    }
  };

  return (
    <motion.div className="cfg resumo-semana" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1, transition: { duration: 0.2 } }} exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.14 } }}>
      <div className="cfg-topo">
        <button type="button" className="vsc-icone-botao" aria-label={T.ilha.claude.config.voltar} title={T.ilha.claude.config.voltar} onClick={onClose}>
          <ChevronLeft size={15} />
        </button>
        <span className="cfg-titulo">{R.titulo}</span>
        <span className="vsc-dim cfg-dica">{period(summary.inicio)}</span>
        <span className="resumo-semana-seletor" role="tablist">
          {(["passada", "atual"] as const).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={qual === s} className="vsc-painel" onClick={() => setQual(s)}>
              {R.semanas[s]}
            </button>
          ))}
        </span>
      </div>
      {summary.sessoes === 0 ? (
        <div className="vsc-vazio">
          <span className="vsc-dim">{R.vazio}</span>
        </div>
      ) : (
        <div className="resumo-semana-corpo">
          <div className="resumo-semana-destaque">
            {summary.agente && <Brand marca={BRAND_TOOL[summary.agente.ferramenta as CodingTool] ?? "claudecode"} tamanho={22} />}
            <span className="resumo-semana-tempo">{duration(summary.tempoMs)}</span>
            <span className="vsc-dim">{R.tempoDica}</span>
          </div>
          <dl className="resumo-semana-grade">
            {linesSummary(summary, hide)
              .slice(1)
              .map(([label, value]) => (
                <div key={label} className="resumo-semana-item">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
        </div>
      )}
      <div className="vsc-permissao-rodape resumo-semana-rodape">
        <span className="vsc-dim" aria-live="polite">{notice ?? R.soNestePc}</span>
        <button type="button" className="vsc-botao" aria-pressed={hide} onClick={() => set({ esconderProjetos: !hide })}>
          <EyeOff size={13} />
          {R.esconderProjetos}
        </button>
        {confirmClear ? (
          <button
            type="button"
            className="vsc-botao"
            onClick={() => {
              clear();
              setConfirmClear(false);
              setNotice(R.limpo);
            }}
          >
            <Trash2 size={13} />
            {R.confirmarLimpar}
          </button>
        ) : (
          <button type="button" className="vsc-botao" onClick={() => setConfirmClear(true)}>
            <Trash2 size={13} />
            {R.limpar}
          </button>
        )}
        <button type="button" className="vsc-botao vsc-botao-primario" disabled={summary.sessoes === 0} onClick={() => void copy()}>
          <Copy size={13} />
          {R.copiarImagem}
        </button>
      </div>
    </motion.div>
  );
}
