import { useSyncExternalStore } from "react";

function ouvir(fn: () => void) {
  document.addEventListener("visibilitychange", fn);
  return () => document.removeEventListener("visibilitychange", fn);
}

const visivel = () => !document.hidden;

export function usarVisibilidadeDocumento(): boolean {
  return useSyncExternalStore(ouvir, visivel, () => true);
}
