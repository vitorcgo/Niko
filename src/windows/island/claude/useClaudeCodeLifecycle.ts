import { useEffect } from "react";
import { claudeCode, listenClaudeCode, type EventClaude } from "../../../bridge/claudeCode";
import { frontCoversAIsland, frontAtScreenFull, notifyWindows } from "../../../desktop/desktop";
import { useClaudeCode } from "../../../state/claudeCode";
import { useCodeHistory } from "../../../state/codeHistory";
import { summaryWeek, weekPassada } from "../../../utils/weeklySummary";
import { toISO } from "../../../utils/dates";
import { noticeEnabled, useIsland } from "../../../state/island";
import { useConfig } from "../../../state/settings";
import { playSound } from "../../../bridge/sounds";
import { T } from "../../../i18n/ptBR";
import { BRAND_TOOL, nameTool } from "./tools";

const TOLERANCE_MS = 1500;

function tabEnabled() {
  const { ilha: island } = useConfig.getState();
  return island.ativa && island.blocos.claude;
}

async function notifyIfHidden(body: string) {
  const cfg = useConfig.getState();
  if (!cfg.notificarClaude || cfg.naoPerturbe || !noticeEnabled("codigo")) return;
  const island = useIsland.getState();
  if (island.estado === "expandida" && island.aba === "claude") return;
  if (island.estado !== "escondida" && !(await frontCoversAIsland())) return;
  await notifyWindows(T.app.nome, body);
}

function returnOnTerminal(requestId: string) {
  useClaudeCode.getState().removeRequest(requestId);
  void claudeCode.decidir(requestId, "terminal").catch(() => undefined);
}

export function closeSession(id: string) {
  for (const p of useClaudeCode.getState().pedidos) if (p.sessao === id) returnOnTerminal(p.pedidoId);
  useClaudeCode.getState().close(id);
}

export function returnPendingOnTerminal() {
  for (const p of useClaudeCode.getState().pedidos) returnOnTerminal(p.pedidoId);
}

function notifySummaryWeek() {
  if (!useCodeHistory.persist.hasHydrated()) return;
  const historyValue = useCodeHistory.getState();
  const week = toISO(weekPassada(new Date()));
  if (historyValue.ultimoResumoVisto === week || useConfig.getState().naoPerturbe || !noticeEnabled("codigo") || !tabEnabled()) return;
  if (summaryWeek(historyValue.historico, weekPassada(new Date())).sessoes === 0) return;
  historyValue.set({ ultimoResumoVisto: week });
  useIsland.getState().revelar({ texto: T.ilha.claude.resumo.aviso, tipo: "info", marca: "claudecode", aba: "claude" }, 6000, "normal");
}

function react(e: EventClaude) {
  const state = useClaudeCode.getState();
  const session = state.sessoes[e.sessao];
  const project = session?.projeto ?? "";
  const tool = session?.ferramenta ?? e.ferramenta ?? "claude";
  const nameValue = nameTool(tool);
  const brand = BRAND_TOOL[tool];
  const silence = useConfig.getState().naoPerturbe || !noticeEnabled("codigo");
  const island = useIsland.getState();
  switch (e.evento) {
    case "PermissionRequest": {
      const requestId = e.pedidoId;
      if (!requestId) return;
      if (!tabEnabled()) {
        returnOnTerminal(requestId);
        return;
      }
      void frontAtScreenFull().then((full) => {
        if (full) {
          returnOnTerminal(requestId);
          return;
        }
        if (!useClaudeCode.getState().pedidos.some((p) => p.pedidoId === requestId)) return;
        useClaudeCode.getState().focus(e.sessao);
        const isPergunta = e.dados.tool_name === "AskUserQuestion";
        void playSound(isPergunta ? "question" : "approval", "avisos");
        void notifyIfHidden(isPergunta ? T.ilha.claude.notificacao.pergunta(nameValue, project) : T.ilha.claude.notificacao.permissao(nameValue, project));
        const islandNow = useIsland.getState();
        if (islandNow.estado === "escondida") islandNow.setState("compacta");
      });
      return;
    }
    case "Stop": {
      if (silence || !tabEnabled()) return;
      state.focus(e.sessao);
      if (island.revelar({ texto: T.ilha.claude.terminouAviso(nameValue, project), tipo: "sucesso", marca: brand, aba: "claude" }, 7000)) void playSound("finish", "avisos");
      void notifyIfHidden(T.ilha.claude.notificacao.terminou(nameValue, project));
      return;
    }
    case "StopFailure":
      if (silence || !tabEnabled()) return;
      if (island.revelar({ texto: T.ilha.claude.erroAviso(nameValue, project), tipo: "alerta", marca: brand, aba: "claude" }, 6000)) void playSound("error", "avisos");
      void notifyIfHidden(T.ilha.claude.notificacao.erro(nameValue, project));
      return;
    case "NikoPedidoEncerrado": {
      const reason = e.dados.motivo;
      if (!tabEnabled() || (reason !== "expirou" && reason !== "cancelado")) return;
      island.revelar({ texto: T.ilha.claude.pedidoEncerrado[reason], tipo: "alerta", marca: brand, aba: "claude" }, 6000);
      return;
    }
    case "Notification":
      if (silence || !tabEnabled()) return;
      if (session?.estado === "esperando") {
        if (island.revelar({ texto: T.ilha.claude.esperandoAviso(nameValue, project), tipo: "info", marca: brand, aba: "claude" }, 6000)) void playSound("question", "avisos");
      } else if (session?.estado === "limite") {
        if (island.revelar({ texto: T.ilha.claude.limiteAviso(nameValue, project), tipo: "alerta", marca: brand, aba: "claude" }, 6000)) void playSound("rate", "avisos");
      }
      return;
    default:
      return;
  }
}

function markInstalled(installed: boolean) {
  const cfg = useConfig.getState();
  if (cfg.claudeInstalado !== installed) cfg.set({ claudeInstalado: installed });
}

export function useClaudeCodeLifecycle(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    claudeCode
      .instalacao()
      .then((e) => markInstalled(e.instalado || e.parcial || e.desatualizado))
      .catch(() => undefined);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      useClaudeCode.getState().setConnected(false);
      return;
    }
    let connectedAt = Date.now();
    return listenClaudeCode(
      (e) => {
        if (e.sessao) markInstalled(true);
        useClaudeCode.getState().apply(e);
        useCodeHistory.getState().register(e);
        if (e.evento === "UserPromptSubmit") notifySummaryWeek();
        if (Date.parse(e.recebidoEm) >= connectedAt - TOLERANCE_MS) react(e);
      },
      (connected) => {
        if (connected) connectedAt = Date.now();
        useClaudeCode.getState().setConnected(connected);
      },
    );
  }, [enabled]);
}
