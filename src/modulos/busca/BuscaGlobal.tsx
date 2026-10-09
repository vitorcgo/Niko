import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Search, ListTodo, FileText, Wallet, Link2, CalendarDays, MessageSquare, Zap, Timer, SunMoon, EyeOff, Plus, CornerDownLeft, ArrowUp, ArrowDown } from "lucide-react";
import { useInterface } from "../../estado/interface";
import { useRotina } from "../../estado/rotina";
import { useEstudos } from "../../estado/estudos";
import { useFinancas, moedaDaConta } from "../../estado/financas";
import { useOrganizacao } from "../../estado/organizacao";
import { useComunicacao } from "../../estado/comunicacao";
import { useConfig } from "../../estado/configuracoes";
import { usePomodoro } from "../../estado/pomodoro";
import { T } from "../../textos/textos";
import { contem } from "../../utilitarios/basicos";
import { htmlParaTexto } from "../../utilitarios/sanitizar";
import { formatarDinheiro } from "../../utilitarios/dinheiro";
import { formatar } from "../../utilitarios/datas";
import { ICONE_ROTA } from "../../janelas/sistema/rotas";
import type { Rota } from "../../tipos";
import { funcaoLigada, rotaLigada } from "../../utilitarios/funcoes";
import { formatarTeclas, type AcaoGlobal } from "../../utilitarios/atalhos";

const ATALHO_DA_ACAO: Record<string, AcaoGlobal> = { "a-pomodoro": "pomodoro", "a-priv": "privacidade", "a-captura": "captura" };

interface Resultado {
  id: string;
  grupo: keyof typeof T.busca.grupos;
  titulo: string;
  sub?: string;
  icone: React.ReactNode;
  executar: () => void;
}

const CHAVE_RECENTES = "niko:busca-recentes";

function lerRecentes(): string[] {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE_RECENTES) ?? "[]") as unknown;
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string").slice(0, 12) : [];
  } catch {
    return [];
  }
}

function guardarRecente(id: string) {
  try {
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify([id, ...lerRecentes().filter((x) => x !== id)].slice(0, 12)));
  } catch {
    return;
  }
}

export function BuscaGlobal() {
  const aberta = useInterface((s) => s.buscaAberta);
  const abrir = useInterface((s) => s.abrirBusca);
  const irPara = useInterface((s) => s.irPara);
  const abrirCaptura = useInterface((s) => s.abrirCaptura);
  const [termo, setTermo] = useState("");
  const [ativo, setAtivo] = useState(0);
  const campo = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (aberta) {
      setTermo("");
      setAtivo(0);
      window.setTimeout(() => campo.current?.focus(), 20);
    }
  }, [aberta]);

  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const atalhosGlobais = useConfig((s) => s.atalhosGlobais);
  const resultados = useMemo<Resultado[]>(() => {
    if (!aberta) return [];
    const t = termo.trim();
    const fechar = () => abrir(false);
    const acoes: Resultado[] = [
      { id: "a-tarefa", grupo: "acoes", titulo: T.busca.acoes.novaTarefa, icone: <Plus size={15} />, executar: () => { fechar(); abrirCaptura(true); } },
      { id: "a-pomodoro", grupo: "acoes", titulo: T.busca.acoes.iniciarPomodoro, icone: <Timer size={15} />, executar: () => { usePomodoro.getState().alternar(); fechar(); } },
      {
        id: "a-tema",
        grupo: "acoes",
        titulo: T.busca.acoes.alternarTema,
        icone: <SunMoon size={15} />,
        executar: () => {
          const c = useConfig.getState();
          c.definir({ tema: document.documentElement.dataset.tema === "escuro" ? "claro" : "escuro" });
          fechar();
        },
      },
      { id: "a-priv", grupo: "acoes", titulo: T.busca.acoes.privacidade, icone: <EyeOff size={15} />, executar: () => { const c = useConfig.getState(); c.definir({ privacidade: !c.privacidade }); fechar(); } },
      { id: "a-captura", grupo: "acoes", titulo: T.busca.acoes.captura, icone: <Zap size={15} />, executar: () => { fechar(); abrirCaptura(true); } },
    ];
    const abas: Resultado[] = (Object.keys(T.rotas) as Rota[]).filter((r) => rotaLigada(r, desligadas)).map((r) => {
      const Icone = ICONE_ROTA[r];
      return { id: `r-${r}`, grupo: "abas", titulo: T.rotas[r], icone: <Icone size={15} />, executar: () => { irPara(r); fechar(); } };
    });
    const recentes = lerRecentes();
    const ok = (id: string, ...campos: (string | undefined)[]) => (!t ? recentes.includes(id) : campos.some((c) => c !== undefined && contem(c, t)));
    const r: Resultado[] = [];
    if (t) r.push(...acoes.filter((a) => contem(a.titulo, t)), ...abas.filter((a) => contem(a.titulo, t)));
    const comTarefas = funcaoLigada("journal", desligadas);
    const comEstudos = funcaoLigada("estudos", desligadas);
    for (const x of comTarefas ? useRotina.getState().tarefas : []) {
      if (ok(x.id, x.titulo, x.descricao))
        r.push({ id: x.id, grupo: "tarefas", titulo: x.titulo, sub: x.data ? formatar(x.data, "d 'de' MMM") : T.geral.semData, icone: <ListTodo size={15} />, executar: () => { irPara("journal", x.data ? { data: x.data } : {}); fechar(); } });
    }
    const est = useEstudos.getState();
    for (const p of comEstudos ? est.paginas : []) {
      if (ok(p.id, p.titulo, t ? htmlParaTexto(p.conteudo) : ""))
        r.push({ id: p.id, grupo: "paginas", titulo: p.titulo || T.estudos.semTitulo, sub: est.materias.find((m) => m.id === p.materiaId)?.nome, icone: <FileText size={15} />, executar: () => { irPara("estudos", { materia: p.materiaId, pagina: p.id, aba: "anotacoes" }); fechar(); } });
    }
    for (const l of comEstudos ? est.links : []) {
      if (ok(l.id, l.titulo, l.url, ...l.tags))
        r.push({ id: l.id, grupo: "links", titulo: l.titulo, sub: l.url, icone: <Link2 size={15} />, executar: () => { irPara("estudos", { aba: "links", materia: l.materiaId ?? "" }); fechar(); } });
    }
    for (const x of funcaoLigada("financas", desligadas) ? useFinancas.getState().transacoes : []) {
      if (ok(x.id, x.descricao))
        r.push({ id: x.id, grupo: "transacoes", titulo: x.descricao, sub: `${formatarDinheiro(x.valor, moedaDaConta(useFinancas.getState().contas, x.contaId))} .${formatar(x.data, "d 'de' MMM")}`, icone: <Wallet size={15} />, executar: () => { irPara("financas", { aba: "transacoes", busca: x.descricao }); fechar(); } });
    }
    for (const e of funcaoLigada("calendario", desligadas) ? useOrganizacao.getState().eventos : []) {
      if (ok(e.id, e.titulo))
        r.push({ id: e.id, grupo: "eventos", titulo: e.titulo, sub: formatar(e.data, "d 'de' MMM"), icone: <CalendarDays size={15} />, executar: () => { irPara("calendario", { data: e.data }); fechar(); } });
    }
    for (const c of useComunicacao.getState().conversas) {
      if (ok(c.id, c.titulo, ...(t ? c.mensagens.map((m) => m.texto) : [])))
        r.push({ id: c.id, grupo: "conversas", titulo: c.titulo || T.chat.novaConversa, icone: <MessageSquare size={15} />, executar: () => { irPara("chat", { conversa: c.id }); fechar(); } });
    }
    const comRecentes = r.map((x) => {
      const executar = x.executar;
      return { ...x, executar: () => { guardarRecente(x.id); executar(); } };
    });
    if (!t) {
      const vistos = recentes.map((id) => comRecentes.find((x) => x.id === id)).filter((x): x is Resultado => !!x).slice(0, 6).map((x) => ({ ...x, grupo: "recentes" as const }));
      return [...vistos, ...acoes, ...abas.slice(0, 6)];
    }
    return comRecentes.slice(0, 60);
  }, [aberta, termo, abrir, irPara, abrirCaptura, desligadas]);

  useEffect(() => {
    setAtivo(0);
  }, [termo]);

  useEffect(() => {
    lista.current?.querySelector(`[data-indice="${ativo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [ativo]);

  const grupos = resultados.reduce<{ grupo: Resultado["grupo"]; itens: { r: Resultado; i: number }[] }[]>((acc, r, i) => {
    const g = acc.find((x) => x.grupo === r.grupo);
    if (g) g.itens.push({ r, i });
    else acc.push({ grupo: r.grupo, itens: [{ r, i }] });
    return acc;
  }, []);

  const atalhoDe = (id: string) => {
    const acao = ATALHO_DA_ACAO[id];
    const teclas = acao ? atalhosGlobais[acao] : "";
    return teclas ? formatarTeclas(teclas).split(" + ").join(" ") : "";
  };

  return (
    <AnimatePresence>
      {aberta && (
        <motion.div
          className="estilo-sistema busca-fundo"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onPointerDown={(e) => e.target === e.currentTarget && abrir(false)}
        >
          <motion.div
            className="busca-caixa"
            role="dialog"
            aria-modal="true"
            aria-label={T.busca.placeholder}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="busca-campo">
              <Search size={17} />
              <input
                ref={campo}
                value={termo}
                maxLength={120}
                placeholder={T.busca.placeholder}
                aria-label={T.busca.placeholder}
                role="combobox"
                aria-expanded="true"
                aria-controls="paleta-lista"
                aria-activedescendant={resultados[ativo] ? `paleta-${resultados[ativo].id}` : undefined}
                onChange={(e) => setTermo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") abrir(false);
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setAtivo((a) => Math.min(resultados.length - 1, a + 1));
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setAtivo((a) => Math.max(0, a - 1));
                  }
                  if (e.key === "Enter") resultados[ativo]?.executar();
                }}
              />
              <kbd className="busca-tecla">Esc</kbd>
            </div>
            <div className="busca-lista" id="paleta-lista" role="listbox" ref={lista}>
              {resultados.length === 0 ? (
                <div className="vazio">{termo ? T.busca.vazio : T.busca.dica}</div>
              ) : (
                grupos.map((g) => (
                  <div key={g.grupo} className="busca-grupo" role="group" aria-label={T.busca.grupos[g.grupo]}>
                    <div className="busca-grupo-nome">{T.busca.grupos[g.grupo]}</div>
                    {g.itens.map(({ r, i }) => {
                      const atalho = atalhoDe(r.id);
                      return (
                        <button
                          key={r.id}
                          id={`paleta-${r.id}`}
                          type="button"
                          role="option"
                          aria-selected={i === ativo}
                          data-indice={i}
                          className="busca-item"
                          onPointerMove={() => setAtivo(i)}
                          onClick={r.executar}
                        >
                          <span className="busca-icone">{r.icone}</span>
                          <span className="busca-item-texto">
                            <span className="busca-item-titulo">{r.titulo}</span>
                            {r.sub && <span className="busca-item-sub privado">{r.sub}</span>}
                          </span>
                          {atalho ? <span className="busca-atalho">{atalho}</span> : i === ativo && <CornerDownLeft size={13} className="busca-enter" />}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
            <div className="busca-rodape">
              <span><b><ArrowUp size={11} /><ArrowDown size={11} /></b> {T.busca.navegar}</span>
              <span><b>Enter</b> {T.busca.abrir}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
