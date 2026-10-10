import { useEffect, useState } from "react";
import type { AgenteId } from "../tipos";
import { carregarRosto, type Rosto } from "./olhar";

export function MoldePersonagem({ agente, tamanho = 34 }: { agente: AgenteId; tamanho?: number }) {
  const [molde, setMolde] = useState<{ agente: AgenteId; rosto: Rosto } | null>(null);
  useEffect(() => {
    let presente = true;
    void carregarRosto(agente).then((rosto) => { if (presente && rosto) setMolde({ agente, rosto }); });
    return () => { presente = false; };
  }, [agente]);
  return (
    <svg viewBox="66 78 380 380" width={tamanho} height={tamanho} aria-hidden="true" data-molde={agente}>
      {molde?.agente === agente && <path d={molde.rosto.corpo.d} transform={molde.rosto.corpo.transform} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}
