import { useMemo } from "react";
import { useConfig } from "../state/settings";
import { appearanceBorder, hexValid, type AppearanceBorder } from "../utils/colors";
import { ACCENT_DEFAULT } from "./desktop/useTheme";

export function useAppearanceBorder(background: string, opacity: number): AppearanceBorder {
  const accent = useConfig((s) => s.destaque);
  return useMemo(() => appearanceBorder(background, opacity, accent && hexValid(accent) ? accent : ACCENT_DEFAULT.escuro), [background, opacity, accent]);
}

export function attributesBackground(a: AppearanceBorder) {
  return { "data-fundo-claro": a.claro || undefined, "data-fundo-escuro": !a.claro || undefined };
}

export function variablesBorder(a: AppearanceBorder): Record<string, string> {
  return {
    "--borda-fundo": a.fundo,
    "--borda-fundo-solido": a.fundoSolido,
    "--borda-fundo-elevado": a.fundoElevado,
    "--borda-rgb": a.rgbDaTinta,
  };
}
