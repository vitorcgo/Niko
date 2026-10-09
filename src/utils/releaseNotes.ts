import { T } from "../i18n/ptBR";
import { versionMaisNew } from "./versions";

export type VersionWithUpdates = (typeof T.atualizacao.historico)[number];

const sameVersion = (a: string, b: string) => !versionMaisNew(a, b) && !versionMaisNew(b, a);

export function updatesUntil(versionCurrent: string | null | undefined, historyValue: readonly VersionWithUpdates[] = T.atualizacao.historico): VersionWithUpdates[] {
  if (!versionCurrent) return [];
  return historyValue.filter((v) => !versionMaisNew(v.versao, versionCurrent)).sort((a, b) => (versionMaisNew(a.versao, b.versao) ? -1 : versionMaisNew(b.versao, a.versao) ? 1 : 0));
}

export function hasUpdates(version: string): boolean {
  return T.atualizacao.historico.some((v) => sameVersion(v.versao, version));
}
