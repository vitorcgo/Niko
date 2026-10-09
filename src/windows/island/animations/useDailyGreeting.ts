import { useEffect } from "react";
import { NATIVE, releaseSystemInitial, timeIdleMs, versionApp } from "../../../desktop/desktop";
import { useConfig, type Settings } from "../../../state/settings";
import { useIsland } from "../../../state/island";
import { useClaudeCode } from "../../../state/claudeCode";
import { todayISO } from "../../../utils/dates";
import { T } from "../../../i18n/ptBR";

const ABSENCE_MS = 30 * 60_000;
const ACTIVE_NOW_MS = 60_000;
const INTERVAL_CHECK_MS = 60_000;
const WAIT_BEFORE_GREET_MS = 700;
export const ABSENCE_TO_BOAS_VINDAS_MS = 2 * 60 * 60_000;

type LastGreeting = Settings["ultimaSaudacao"];

export function decideGreetingOnOpen(last: LastGreeting, today: string, version: string): { saudar: boolean; versaoNova?: string } {
  if (!last) return { saudar: true };
  if (last.versao !== version) return { saudar: true, versaoNova: version };
  return { saudar: last.dia !== today };
}

export function returnedAfterAbsence(gapMs: number, idleMs: number, alreadyAbsent: boolean): { ausente: boolean; voltou: boolean } {
  const absent = alreadyAbsent || gapMs >= ABSENCE_MS || idleMs >= ABSENCE_MS;
  return absent && idleMs <= ACTIVE_NOW_MS ? { ausente: false, voltou: true } : { ausente: absent, voltou: false };
}

export type ReactionAReturn = "saudar" | "boasVindas" | "nada" | "esperar";

/** Greet on the first daily return, briefly report long absences, and avoid interrupting an active island. */
export function reactAReturn(p: { jaSaudouHoje: boolean; ausenciaMs: number; naoPerturbe: boolean; ilhaEmUso: boolean }): ReactionAReturn {
  if (p.naoPerturbe) return "nada";
  if (p.ilhaEmUso) return "esperar";
  if (!p.jaSaudouHoje) return "saudar";
  return p.ausenciaMs >= ABSENCE_TO_BOAS_VINDAS_MS ? "boasVindas" : "nada";
}

function waitSettings(): Promise<void> {
  if (useConfig.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const disable = useConfig.persist.onFinishHydration(() => {
      disable();
      resolve();
    });
  });
}

function islandAtUsage() {
  return useIsland.getState().estado === "expandida" || useClaudeCode.getState().pedidos.length > 0;
}

export function useDailyGreeting(enabled: boolean) {
  useEffect(() => {
    let alive = true;
    let version = "";
    let absent = false;
    let absentSince = 0;
    let lastCheck = Date.now();
    let wait: number | undefined;
    let interval: number | undefined;

    const greetNow = (versionNew?: string) => {
      useConfig.getState().set({ ultimaSaudacao: { dia: todayISO(), versao: version } });
      useIsland.getState().greet(versionNew);
    };

    const checkReturn = async () => {
      const now = Date.now();
      const gap = now - lastCheck;
      lastCheck = now;
      const idle = NATIVE ? (await timeIdleMs()) ?? 0 : 0;
      if (!alive) return;
      const r = returnedAfterAbsence(gap, idle, absent);
      if (r.ausente && !absent) absentSince = gap >= ABSENCE_MS ? now - gap : now - idle;
      absent = r.ausente;
      if (!r.voltou) return;
      const cfg = useConfig.getState();
      const reaction = reactAReturn({ jaSaudouHoje: cfg.ultimaSaudacao?.dia === todayISO(), ausenciaMs: now - absentSince, naoPerturbe: cfg.naoPerturbe, ilhaEmUso: islandAtUsage() });
      if (reaction === "esperar") {
        absent = true;
        return;
      }
      if (reaction === "saudar") greetNow();
      if (reaction === "boasVindas") useIsland.getState().revelar({ texto: T.ilha.saudacao.deVolta(cfg.nome.trim().split(/\s+/)[0] ?? ""), tipo: "info", agente: cfg.agentes.favorito }, 4500);
    };

    void (async () => {
      await waitSettings();
      version = await versionApp();
      if (!alive) return;
      if (!enabled) {
        void releaseSystemInitial();
        return;
      }
      const decision = decideGreetingOnOpen(useConfig.getState().ultimaSaudacao, todayISO(), version);
      if (decision.saudar) wait = window.setTimeout(() => alive && greetNow(decision.versaoNova), WAIT_BEFORE_GREET_MS);
      else void releaseSystemInitial();
      interval = window.setInterval(() => void checkReturn(), INTERVAL_CHECK_MS);
    })();

    return () => {
      alive = false;
      window.clearTimeout(wait);
      window.clearInterval(interval);
    };
  }, [enabled]);
}
