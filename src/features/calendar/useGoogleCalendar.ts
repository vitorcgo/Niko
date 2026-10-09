import { useCallback, useEffect, useRef, useState } from "react";
import { connectionsBridge, type EventGoogle } from "../../bridge/liveConnections";
import { useCommunication } from "../../state/communication";

export const INTERVAL_AGENDA_MS = 30_000;
const INTERVAL_MINIMUM_MS = 5_000;
const cache = new Map<string, { quando: number; eventos: EventGoogle[] }>();

export type StatusAgendaGoogle = "desligada" | "carregando" | "ok" | "semPermissao" | "apiDesativada" | "erro";

export function useGoogleCalendar(periods: [string, string][]): { eventos: EventGoogle[]; situacao: StatusAgendaGoogle; atualizar: () => void } {
  const agenda = useCommunication((s) => s.conexoes.find((c) => c.id === "agenda"));
  const enabled = Boolean(agenda?.ligada && agenda.chaveSalva);
  const key = periods.map(([from, until]) => `${from}_${until}`).join("|");
  const [state, setState] = useState<{ chave: string; eventos: EventGoogle[]; situacao: StatusAgendaGoogle }>({ chave: "", eventos: [], situacao: "desligada" });
  const readNow = useRef<(force: boolean) => void>(() => undefined);

  useEffect(() => {
    if (!enabled) {
      setState({ chave: key, eventos: [], situacao: "desligada" });
      return;
    }
    let alive = true;
    let reading = false;
    const join = () => {
      const all = new Map<string, EventGoogle>();
      for (const [from, until] of periods) for (const e of cache.get(`${from}_${until}`)?.eventos ?? []) all.set(e.id, e);
      return [...all.values()];
    };
    const read = async (force: boolean) => {
      if (reading || (!force && document.hidden)) return;
      const now = Date.now();
      const validity = force ? INTERVAL_MINIMUM_MS : INTERVAL_AGENDA_MS - 1000;
      const missing = periods.filter(([from, until]) => (cache.get(`${from}_${until}`)?.quando ?? 0) < now - validity);
      if (missing.length === 0) {
        setState({ chave: key, eventos: join(), situacao: "ok" });
        return;
      }
      reading = true;
      setState((e) => ({ chave: key, eventos: e.chave === key ? e.eventos : join(), situacao: e.chave === key && e.situacao === "ok" ? "ok" : "carregando" }));
      try {
        for (const [from, until] of missing) cache.set(`${from}_${until}`, { quando: Date.now(), eventos: await connectionsBridge.lerAgendaGoogle(from, until) });
        if (alive) setState({ chave: key, eventos: join(), situacao: "ok" });
      } catch (e) {
        const m = (e as Error).message;
        if (alive) setState({ chave: key, eventos: join(), situacao: m === "agenda_sem_permissao" ? "semPermissao" : m === "agenda_api_desativada" ? "apiDesativada" : "erro" });
      } finally {
        reading = false;
      }
    };
    readNow.current = (force) => void read(force);
    void read(false);
    const clock = window.setInterval(() => void read(false), INTERVAL_AGENDA_MS);
    const onBack = () => !document.hidden && void read(true);
    const onFocus = () => void read(true);
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      readNow.current = () => undefined;
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, key]);

  const update = useCallback(() => readNow.current(true), []);
  return { eventos: state.chave === key ? state.eventos : [], situacao: state.situacao, atualizar: update };
}
