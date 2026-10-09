import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GlassWater, Minus, Plus, Check, Settings2 } from "lucide-react";
import { Button, Card, Field } from "../../components/basics";
import { useRoutine, DAY_EMPTY } from "../../state/routine";
import { useConfig } from "../../state/settings";
import { playSound } from "../../bridge/sounds";
import { T } from "../../i18n/ptBR";

const BASE = 168;
const TOP = 36;
const BODY = "M64 36 L156 36 L144 168 Q143 176 135 176 L85 176 Q77 176 76 168 Z";

function liters(ml: number) {
  return (ml / 1000).toLocaleString("pt-BR", { minimumFractionDigits: ml % 1000 === 0 ? 0 : 1, maximumFractionDigits: 2 });
}

export function WaterGlass({ data }: { data: string }) {
  const day = useRoutine((s) => s.dias[data] ?? DAY_EMPTY);
  const updateDay = useRoutine((s) => s.updateDay);
  const water = useConfig((s) => s.agua);
  const set = useConfig((s) => s.set);
  const [pouring, setPouring] = useState(0);
  const [adjusting, setAdjusting] = useState(false);
  const [goal, setGoal] = useState(String(water.meta));
  const [glass, setGlass] = useState(String(water.copo));
  const timer = useRef<number | undefined>(undefined);
  const ml = day.agua ?? 0;
  const p = Math.min(1, ml / Math.max(1, water.meta));
  const level = BASE - (BASE - TOP - 8) * p;
  const complete = ml >= water.meta;

  const pending = useRef(0);

  const writePending = () => {
    window.clearTimeout(timer.current);
    if (!pending.current) return;
    const current = useRoutine.getState().dias[data]?.agua ?? 0;
    const newItem = Math.min(10000, current + pending.current);
    pending.current = 0;
    updateDay(data, { agua: newItem });
    if (newItem >= useConfig.getState().agua.meta && current < useConfig.getState().agua.meta) void playSound("proud", "personagens");
  };

  useEffect(() => () => writePending(), [data]);

  const add = (quantity: number) => {
    if (quantity > 0) {
      setPouring((n) => n + 1);
      void playSound("gulp", "interface");
      pending.current += quantity;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(writePending, 520);
      return;
    }
    writePending();
    const current = useRoutine.getState().dias[data]?.agua ?? 0;
    updateDay(data, { agua: Math.max(0, current + quantity) });
  };

  const saveAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    const m = Math.round(Number(goal));
    const c = Math.round(Number(glass));
    if (!(m >= 250 && m <= 10000) || !(c >= 50 && c <= 2000)) return;
    set({ agua: { meta: m, copo: c } });
    setAdjusting(false);
  };

  const glasses = Math.ceil(water.meta / water.copo);
  const drunk = Math.floor(ml / water.copo);

  return (
    <Card
      className="col-4 cartao-agua"
      titulo={T.journal.agua}
      icone={<GlassWater size={16} />}
      acoes={<Button pequeno soIcone variante="fantasma" icone={<Settings2 size={13} />} aria-label={T.journal.aguaAjustar} title={T.journal.aguaAjustar} onClick={() => setAdjusting((a) => !a)} />}
    >
      <div className="agua">
        <svg className="agua-cena" viewBox="0 0 220 186" role="img" aria-label={T.journal.aguaRotulo(liters(ml), liters(water.meta))}>
          <defs>
            <clipPath id="agua-corpo">
              <path d={BODY} />
            </clipPath>
            <linearGradient id="agua-liquido" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={complete ? "#5eead4" : "#7dd3fc"} />
              <stop offset="1" stopColor={complete ? "#14b8a6" : "#2563eb"} />
            </linearGradient>
          </defs>

          <AnimatePresence>
            {pouring > 0 && (
              <motion.g key={pouring} initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 1, 0] }} transition={{ duration: 1.2, times: [0, 0.08, 0.78, 1] }} onAnimationComplete={() => setPouring(0)}>
                <motion.rect
                  x={106.5}
                  width={7}
                  rx={3.5}
                  fill="url(#agua-liquido)"
                  initial={{ y: -4, height: 0 }}
                  animate={{ y: [-4, -4, -4, level - 6], height: [0, level + 2, level + 2, 4] }}
                  transition={{ duration: 1.2, times: [0, 0.28, 0.7, 1], ease: "easeIn" }}
                />
                {[0, 1, 2].map((i) => (
                  <motion.circle
                    key={i}
                    cx={104 + i * 6}
                    r={2.4}
                    fill="#93c5fd"
                    initial={{ cy: -4, opacity: 0 }}
                    animate={{ cy: [-4, level - 4], opacity: [0, 1, 0] }}
                    transition={{ duration: 0.55, delay: 0.15 + i * 0.18, ease: "easeIn" }}
                  />
                ))}
                {[0, 1].map((i) => (
                  <motion.ellipse
                    key={`o-${i}`}
                    cx={110}
                    cy={level - 2}
                    fill="none"
                    stroke="#bae6fd"
                    strokeWidth={2}
                    initial={{ rx: 3, ry: 1.2, opacity: 0 }}
                    animate={{ rx: [3, 30], ry: [1.2, 5], opacity: [0.9, 0] }}
                    transition={{ duration: 0.7, delay: 0.3 + i * 0.3, ease: "easeOut" }}
                  />
                ))}
              </motion.g>
            )}
          </AnimatePresence>
          <g clipPath="url(#agua-corpo)">
            <motion.g initial={false} animate={{ y: level - TOP }} transition={{ type: "spring", visualDuration: 0.9, bounce: 0.25 }}>
              <g className="agua-onda">
                <path d={`M-60 ${TOP} q 20 -7 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 V 400 H -60 Z`} fill="url(#agua-liquido)" />
              </g>
              <g className="agua-onda agua-onda-2">
                <path d={`M-80 ${TOP + 3} q 20 -6 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 V 400 H -80 Z`} fill="url(#agua-liquido)" opacity="0.5" />
              </g>
              {p > 0.05 && [0, 1, 2].map((i) => <circle key={i} className="agua-bolha" cx={90 + i * 22} cy={TOP + 60 + i * 18} r={2.5 + i} style={{ animationDelay: `${i * 0.9}s` }} />)}
            </motion.g>
          </g>
          <path d={BODY} className="agua-vidro" />
          <path d="M74 48 L82 160" className="agua-brilho" />
          {[0.25, 0.5, 0.75].map((m) => (
            <line key={m} x1="140" x2="148" y1={BASE - (BASE - TOP - 8) * m} y2={BASE - (BASE - TOP - 8) * m} className="agua-marca" />
          ))}
        </svg>

        <div className="agua-info">
          <div className="agua-total">
            <span className="numero-grande">{liters(ml)} L</span>
            <span className="texto-3">{T.journal.aguaDe(liters(water.meta))}</span>
          </div>
          {complete ? (
            <span className="etiqueta etiqueta-sucesso"><Check size={11} />{T.journal.aguaCompleta}</span>
          ) : (
            <span className="texto-2" style={{ fontSize: 12 }}>{T.journal.aguaFalta(liters(water.meta - ml))}</span>
          )}
          <div className="agua-copos" aria-hidden="true">
            {Array.from({ length: Math.min(glasses, 16) }, (_, i) => <span key={i} data-cheio={i < drunk ? "sim" : "nao"} />)}
          </div>
          <div className="linha" style={{ gap: 6, flexWrap: "wrap" }}>
            <Button pequeno variante="primario" icone={<Plus size={13} />} onClick={() => add(water.copo)}>{T.journal.aguaCopo(water.copo)}</Button>
            <Button pequeno icone={<Plus size={13} />} onClick={() => add(500)}>{T.journal.aguaGarrafa}</Button>
            <Button pequeno soIcone variante="fantasma" icone={<Minus size={13} />} aria-label={T.journal.aguaTirar} title={T.journal.aguaTirar} disabled={ml === 0} onClick={() => add(-water.copo)} />
          </div>
        </div>
      </div>
      {adjusting && (
        <form className="formulario-linha" style={{ marginTop: 12, alignItems: "end" }} onSubmit={saveAdjustment} noValidate>
          <Field id="ag-meta" rotulo={T.journal.aguaMeta} dica={T.journal.aguaMetaDica}>
            <input id="ag-meta" className="campo" inputMode="numeric" value={goal} onChange={(e) => setGoal(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field id="ag-copo" rotulo={T.journal.aguaTamanhoCopo}>
            <input id="ag-copo" className="campo" inputMode="numeric" value={glass} onChange={(e) => setGlass(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Button type="submit" pequeno variante="primario">{T.geral.salvar}</Button>
        </form>
      )}
    </Card>
  );
}
