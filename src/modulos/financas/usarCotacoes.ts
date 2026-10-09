import { useEffect, useState } from "react";
import { useFinancas, contasEmOutraMoeda } from "../../estado/financas";

const VALIDADE_MS = 6 * 3600_000;

/** Busca a cotação só quando existe conta em outra moeda, a cotação não é manual e a guardada já está velha (ou a pessoa pediu). */
export function usarCotacoes() {
  const precisa = useFinancas((s) => contasEmOutraMoeda(s.contas).length > 0);
  const manual = useFinancas((s) => Boolean(s.cotacoes?.manual));
  const [falhou, setFalhou] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [pedido, setPedido] = useState(0);

  useEffect(() => {
    if (!precisa || (manual && pedido === 0)) return;
    const atualizadaEm = useFinancas.getState().cotacoes?.atualizadaEm;
    const idade = atualizadaEm ? Date.now() - Date.parse(atualizadaEm) : Infinity;
    if (pedido === 0 && idade < VALIDADE_MS) return;
    let vivo = true;
    setBuscando(true);
    fetch("/ponte/cotacoes", { headers: { "x-niko": "1" } })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as { USD: number; EUR: number; atualizadaEm: string };
        if (!vivo) return;
        useFinancas.getState().definirCotacoes({ USD: d.USD, EUR: d.EUR, atualizadaEm: d.atualizadaEm, manual: false });
        setFalhou(false);
      })
      .catch(() => {
        if (vivo) setFalhou(true);
      })
      .finally(() => {
        if (vivo) setBuscando(false);
      });
    return () => {
      vivo = false;
    };
  }, [precisa, manual, pedido]);

  return { precisa, falhou, buscando, atualizar: () => setPedido((n) => n + 1) };
}
