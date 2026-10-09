import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { readUsage, readUsageOfficial, type UsageTool } from "../../../bridge/localBridge";
import { useConfig } from "../../../state/settings";
import { missingTo, levelUsage, labelWindow } from "../../../utils/usage";
import { Brand, type BrandId } from "../../../brands/Brand";
import { T } from "../../../i18n/ptBR";

const C = T.ilha.claude;
const INTERVAL_MS = 60_000;
const WINDOWS = ["sessao", "semanal"] as const;
const BRAND_USAGE: Record<string, BrandId> = { claude: "claudecode", codex: "codex" };
const COLOR_USAGE: Record<string, string> = { claude: "#d97757", codex: "#7a9dff" };
const SIZE = 28;
const RADIUS = 12;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function hintUsage(f: UsageTool) {
  const lines = WINDOWS.map((id) => f.janelas.find((j) => j.id === id))
    .filter((j): j is NonNullable<typeof j> => Boolean(j))
    .map((j) => C.uso.linha(labelWindow(j.rotulo), Math.round(j.usado), missingTo(j.reiniciaEm)));
  return [C.uso.nomes[f.id] ?? f.nome, ...lines].join("\n");
}

function RingUsage({ ferramenta: tool, indice: index }: { ferramenta: UsageTool; indice: number }) {
  const session = tool.janelas.find((j) => j.id === "sessao") ?? tool.janelas[0];
  const used = Math.max(0, Math.min(100, session?.usado ?? 0));
  const level = levelUsage(used);
  const color = level === "erro" ? "var(--i-vermelho)" : level === "alerta" ? "var(--i-ambar)" : COLOR_USAGE[tool.id] ?? "var(--i-verde)";
  const hint = hintUsage(tool);
  return (
    <motion.span
      className="ias-anel"
      data-nivel={level}
      data-dica={hint}
      tabIndex={0}
      role="img"
      aria-label={hint.replace(/\n/g, ". ")}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.1 + index * 0.08, type: "spring", visualDuration: 0.4, bounce: 0.35 }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        <circle className="ias-anel-trilho" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} />
        <motion.circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          initial={{ strokeDashoffset: CIRCUMFERENCE }}
          animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - used / 100) }}
          transition={{ delay: 0.25 + index * 0.08, duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </svg>
      <span className="ias-anel-logo">
        <Brand marca={BRAND_USAGE[tool.id] ?? "claudecode"} tamanho={13} />
      </span>
    </motion.span>
  );
}

export function AiUsage() {
  const readPlans = useConfig((s) => s.consumo.lerPlanos);
  const [tools, setTools] = useState<UsageTool[]>([]);

  useEffect(() => {
    let alive = true;
    const read = () => {
      if (document.hidden) return;
      (readPlans ? readUsage() : readUsageOfficial())
        .then((r) => alive && setTools(r.ferramentas.filter((f) => f.situacao === "ok" && f.janelas.length > 0)))
        .catch(() => undefined);
    };
    read();
    const t = window.setInterval(read, INTERVAL_MS);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [readPlans]);

  if (tools.length === 0) return null;

  return (
    <span className="ias-aneis" aria-label={C.uso.titulo}>
      {tools.map((f, i) => (
        <RingUsage key={f.id} ferramenta={f} indice={i} />
      ))}
    </span>
  );
}
