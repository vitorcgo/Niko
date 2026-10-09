import type { EstadoSessao } from "../estado/claudeCode";

/** Somente transições observadas, sem inferir atividade de resultados ou subagentes. */
export function estadoDoEvento(evento: string, dados: Record<string, unknown>, pedidoId?: string): EstadoSessao | undefined {
  switch (evento) {
    case "NikoPensando":
    case "UserPromptSubmit": return "pensando";
    case "PreToolUse": return "trabalhando";
    case "PermissionRequest": return pedidoId ? "aprovacao" : undefined;
    case "Stop": return "terminou";
    case "StopFailure": return "erro";
    case "Notification":
      if (typeof dados.message === "string" && /rate limit|limite de uso|usage limit/i.test(dados.message)) return "limite";
      if (["idle_prompt", "agent_needs_input", "elicitation_dialog", "elicitation_url_dialog"].includes(String(dados.notification_type ?? ""))) return "esperando";
  }
  return undefined;
}
