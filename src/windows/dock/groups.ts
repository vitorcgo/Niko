import type { AppOpen } from "../../desktop/desktop";

function keyApp(a: AppOpen) {
  return a.app === "ApplicationFrameHost" ? `uwp-${a.titulo}` : (a.caminho ?? a.app);
}

export function groupApps(apps: AppOpen[]): Map<string, AppOpen[]> {
  const groupsByApp = new Map<string, Set<string>>();
  for (const a of apps) {
    if (!a.grupo) continue;
    const key = keyApp(a);
    groupsByApp.set(key, (groupsByApp.get(key) ?? new Set()).add(a.grupo));
  }
  const groups = new Map<string, AppOpen[]>();
  for (const a of apps) {
    const base = keyApp(a);
    const separate = a.grupo && (groupsByApp.get(base)?.size ?? 0) > 1;
    const key = separate ? `${base}|${a.grupo}` : base;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  return groups;
}

export function nameGroup(primary: AppOpen): string {
  if (primary.app === "ApplicationFrameHost") return primary.titulo;
  return primary.nomeDoGrupo || primary.nome || primary.app;
}
