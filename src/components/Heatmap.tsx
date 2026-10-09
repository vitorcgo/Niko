import { useMemo, useState } from "react";
import { getDay } from "date-fns";
import { useRoutine } from "../state/routine";
import { useStudies } from "../state/studies";
import { usePomodoro } from "../state/pomodoro";
import { useCommunication } from "../state/communication";
import { useInterface } from "../state/interface";
import { valuesMap, type SourceMap } from "../utils/statistics";
import { fromISO, formatDateString } from "../utils/dates";
import { Pills } from "./basics";
import { T } from "../i18n/ptBR";

export function Heatmap({ fonteInicial: sourceInitial = "tudo", compacto: compact }: { fonteInicial?: SourceMap; compacto?: boolean }) {
  const [source, setSource] = useState<SourceMap>(sourceInitial);
  const [hint, setHint] = useState<{ x: number; y: number; texto: string } | null>(null);
  const tasks = useRoutine((s) => s.tarefas);
  const habits = useRoutine((s) => s.habitos);
  const records = useRoutine((s) => s.registros);
  const recordReviews = useStudies((s) => s.registroRevisoes);
  const sessions = usePomodoro((s) => s.sessoes);
  const connections = useCommunication((s) => s.conexoes);
  const navigateTo = useInterface((s) => s.navigateTo);

  const days = useMemo(
    () => valuesMap({ tarefas: tasks, habitos: habits, registros: records, registroRevisoes: recordReviews, sessoes: sessions, conexoes: connections }, source),
    [tasks, habits, records, recordReviews, sessions, connections, source],
  );

  const offset = (getDay(fromISO(days[0].data)) + 6) % 7;
  const cells = [...Array.from({ length: offset }, () => null), ...days];
  const weeks = Math.ceil(cells.length / 7);
  const months = Array.from({ length: weeks }, (_, c) => {
    const day = cells.slice(c * 7, c * 7 + 7).find((x) => x);
    const previous = c > 0 ? cells.slice((c - 1) * 7, c * 7).find((x) => x) : undefined;
    if (!day) return "";
    return !previous || day.data.slice(5, 7) !== previous.data.slice(5, 7) ? formatDateString(day.data, "MMM") : "";
  });

  const describe = (d: (typeof days)[number]) => {
    const parts = [];
    if (source === "tudo" || source === "estudo") parts.push(`${d.minutos} min, ${d.cartoes} cartões`);
    if (source === "tudo" || source === "habitos") parts.push(`${Math.round(d.pctHabitos * 100)}% hábitos`);
    if (source === "tudo" || source === "tarefas") parts.push(`${d.tarefas} tarefas`);
    if (source === "tudo" || source === "commits") parts.push(`${d.commits} commits`);
    return T.conquistas.diaDica(formatDateString(d.data, "d 'de' MMM"), parts.join(", "));
  };

  return (
    <div className="mapa-calor">
      {!compact && (
        <Pills
          rotulo={T.conquistas.mapa}
          valor={source}
          aoMudar={setSource}
          opcoes={(Object.keys(T.conquistas.fontes) as SourceMap[]).map((f) => ({ valor: f, rotulo: T.conquistas.fontes[f] }))}
        />
      )}
      <div className="mapa-calor-rolagem">
        <div className="mapa-calor-corpo">
        <div className="mapa-calor-meses" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }} aria-hidden="true">
          {months.map((m, i) => <span key={i}>{m}</span>)}
        </div>
        <div className="mapa-calor-linha">
        <div className="mapa-calor-semana" aria-hidden="true">
          {T.calendario.diasSemana.map((d, i) => <span key={d}>{i % 2 === 0 ? d : ""}</span>)}
        </div>
        <div className="mapa-calor-grade" role="grid" aria-label={T.conquistas.mapa} style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}>
          {cells.map((d, i) =>
            d ? (
              <button
                key={d.data}
                type="button"
                className="mapa-celula"
                data-nivel={d.nivel}
                aria-label={describe(d)}
                onPointerEnter={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setHint({ x: r.left + r.width / 2, y: r.top, texto: describe(d) });
                }}
                onPointerLeave={() => setHint(null)}
                onClick={() => navigateTo("journal", { data: d.data })}
              />
            ) : (
              <span key={`v-${i}`} className="mapa-celula mapa-celula-vazia" />
            ),
          )}
        </div>
        </div>
        </div>
      </div>
      <div className="mapa-legenda">
        <span>{T.conquistas.menos}</span>
        {[0, 1, 2, 3, 4].map((n) => (
          <span key={n} className="mapa-celula" data-nivel={n} />
        ))}
        <span>{T.conquistas.mais}</span>
      </div>
      {hint && (
        <span className="dica-flutuante" style={{ left: hint.x, top: hint.y }}>
          {hint.texto}
        </span>
      )}
    </div>
  );
}
