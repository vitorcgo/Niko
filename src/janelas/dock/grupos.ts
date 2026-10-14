import type { AppAberto } from "../../desktop/desktop";
import type { AppFixado } from "../../estado/configuracoes";

export function chaveDoApp(a: AppAberto) {
  return a.app === "ApplicationFrameHost" ? `uwp-${a.titulo}` : (a.caminho ?? a.app);
}

export function agruparApps(apps: AppAberto[]): Map<string, AppAberto[]> {
  const gruposPorApp = new Map<string, Set<string>>();
  for (const a of apps) {
    if (!a.grupo) continue;
    const chave = chaveDoApp(a);
    gruposPorApp.set(chave, (gruposPorApp.get(chave) ?? new Set()).add(a.grupo));
  }
  const grupos = new Map<string, AppAberto[]>();
  for (const a of apps) {
    const base = chaveDoApp(a);
    const separar = a.grupo && (gruposPorApp.get(base)?.size ?? 0) > 1;
    const chave = separar ? `${base}|${a.grupo}` : base;
    grupos.set(chave, [...(grupos.get(chave) ?? []), a]);
  }
  return grupos;
}

export interface EntradaDoDock {
  chave: string;
  lista: AppAberto[];
  fixado?: AppFixado;
}

export function ordenarComFixados(grupos: Map<string, AppAberto[]>, fixados: AppFixado[]): EntradaDoDock[] {
  const usadas = new Set<string>();
  const entradas: EntradaDoDock[] = [];
  for (const fixado of fixados) {
    const chaves = [...grupos.keys()].filter((k) => !usadas.has(k) && (k === fixado.chave || k.startsWith(`${fixado.chave}|`)));
    if (chaves.length === 0) entradas.push({ chave: `fixado:${fixado.id}`, lista: [], fixado });
    chaves.forEach((chave, i) => {
      usadas.add(chave);
      entradas.push({ chave, lista: grupos.get(chave) ?? [], fixado: i === 0 ? fixado : undefined });
    });
  }
  for (const [chave, lista] of grupos) if (!usadas.has(chave)) entradas.push({ chave, lista });
  return entradas;
}

export function nomeDoGrupo(principal: AppAberto): string {
  if (principal.app === "ApplicationFrameHost") return principal.titulo;
  return principal.nomeDoGrupo || principal.nome || principal.app;
}
