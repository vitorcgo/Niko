import { T } from "../i18n/ptBR";

export function missingTo(iso?: string): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return T.consumo.reiniciando;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 24) return T.consumo.reiniciaDias(Math.floor(h / 24), h % 24);
  return T.consumo.reiniciaHoras(h, m);
}

export function levelUsage(p: number): "erro" | "alerta" | "sucesso" {
  return p >= 90 ? "erro" : p >= 70 ? "alerta" : "sucesso";
}

export function labelWindow(label: string): string {
  return T.consumo.janelas[label as keyof typeof T.consumo.janelas] ?? label;
}
