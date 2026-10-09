import { useEffect, useState } from "react";
import { useConfig } from "../../state/settings";
import { withAlpha, hexValid, textSobre } from "../../utils/colors";

export const ACCENT_DEFAULT = { claro: "#7c5ce0", escuro: "#a78bfa" };

export function useTheme() {
  const theme = useConfig((s) => s.tema);
  const palette = useConfig((s) => s.paleta);
  const accent = useConfig((s) => s.destaque);
  const scale = useConfig((s) => s.escala);
  const reduce = useConfig((s) => s.reduzirAnimacoes);
  const privacy = useConfig((s) => s.privacidade);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const effective = theme === "sistema" ? (systemDark ? "escuro" : "claro") : theme;
    const root = document.documentElement;
    root.dataset.tema = effective;
    root.dataset.paleta = palette;
    root.dataset.reduzirAnimacoes = reduce ? "sim" : "nao";
    root.dataset.privacidade = privacy ? "sim" : "nao";
    const color = accent && hexValid(accent) ? accent : ACCENT_DEFAULT[effective];
    root.style.setProperty("--destaque", color);
    root.style.setProperty("--destaque-texto", textSobre(color));
    root.style.setProperty("--destaque-suave", withAlpha(color, effective === "escuro" ? 0.18 : 0.12));
    root.style.setProperty("--foco", withAlpha(color, 0.32));
    root.style.setProperty("--escala", String(scale));
  }, [theme, palette, accent, scale, reduce, privacy, systemDark]);
}
