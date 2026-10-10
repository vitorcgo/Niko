import { useCallback, useEffect, useRef, useState } from "react";
import { conexoesPonte, type EventoGoogle } from "../../ponte/conexoesReais";
import { useComunicacao } from "../../estado/comunicacao";
import { conexaoEmTestes } from "../../utilitarios/disponibilidadeConexoes";

export const INTERVALO_DA_AGENDA_MS = 30_000;
const INTERVALO_MINIMO_MS = 5_000;
const cache = new Map<string, { quando: number; eventos: EventoGoogle[] }>();

export type SituacaoDaAgendaGoogle = "desligada" | "carregando" | "ok" | "semPermissao" | "apiDesativada" | "erro";

export function usarAgendaGoogle(periodos: [string, string][]): { eventos: EventoGoogle[]; situacao: SituacaoDaAgendaGoogle; atualizar: () => void } {
  const agenda = useComunicacao((s) => s.conexoes.find((c) => c.id === "google"));
  const ligada = !conexaoEmTestes("google") && Boolean(agenda?.ligada && agenda.chaveSalva);
  const chave = periodos.map(([de, ate]) => `${de}_${ate}`).join("|");
  const [estado, setEstado] = useState<{ chave: string; eventos: EventoGoogle[]; situacao: SituacaoDaAgendaGoogle }>({ chave: "", eventos: [], situacao: "desligada" });
  const lerAgora = useRef<(forcar: boolean) => void>(() => undefined);

  useEffect(() => {
    if (!ligada) {
      setEstado({ chave, eventos: [], situacao: "desligada" });
      return;
    }
    let vivo = true;
    let lendo = false;
    const juntar = () => {
      const todos = new Map<string, EventoGoogle>();
      for (const [de, ate] of periodos) for (const e of cache.get(`${de}_${ate}`)?.eventos ?? []) todos.set(e.id, e);
      return [...todos.values()];
    };
    const ler = async (forcar: boolean) => {
      if (lendo || (!forcar && document.hidden)) return;
      const agora = Date.now();
      const validade = forcar ? INTERVALO_MINIMO_MS : INTERVALO_DA_AGENDA_MS - 1000;
      const faltando = periodos.filter(([de, ate]) => (cache.get(`${de}_${ate}`)?.quando ?? 0) < agora - validade);
      if (faltando.length === 0) {
        setEstado({ chave, eventos: juntar(), situacao: "ok" });
        return;
      }
      lendo = true;
      setEstado((e) => ({ chave, eventos: e.chave === chave ? e.eventos : juntar(), situacao: e.chave === chave && e.situacao === "ok" ? "ok" : "carregando" }));
      try {
        for (const [de, ate] of faltando) cache.set(`${de}_${ate}`, { quando: Date.now(), eventos: await conexoesPonte.lerAgendaGoogle(de, ate) });
        if (vivo) setEstado({ chave, eventos: juntar(), situacao: "ok" });
      } catch (e) {
        const m = (e as Error).message;
        if (vivo) setEstado({ chave, eventos: juntar(), situacao: m === "agenda_sem_permissao" ? "semPermissao" : m === "agenda_api_desativada" ? "apiDesativada" : "erro" });
      } finally {
        lendo = false;
      }
    };
    lerAgora.current = (forcar) => void ler(forcar);
    void ler(false);
    const relogio = window.setInterval(() => void ler(false), INTERVALO_DA_AGENDA_MS);
    const aoVoltar = () => !document.hidden && void ler(true);
    const aoFocar = () => void ler(true);
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoFocar);
    return () => {
      vivo = false;
      lerAgora.current = () => undefined;
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoFocar);
    };
  }, [ligada, chave]);

  const atualizar = useCallback(() => lerAgora.current(true), []);
  return { eventos: estado.chave === chave ? estado.eventos : [], situacao: estado.situacao, atualizar };
}
