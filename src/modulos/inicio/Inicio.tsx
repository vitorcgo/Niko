import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PainelFuncoes } from "./PainelFuncoes";
import { blocoLigado, conquistaLigada, funcaoLigada } from "../../utilitarios/funcoes";
import { Plus, Timer, Wallet, Plug, Layers, Gauge, Trophy, CalendarDays, Users, ListTodo, SlidersHorizontal, ToggleRight, GripVertical, ArrowUpRight, Cpu, Play, Pause, RotateCcw, SkipForward } from "lucide-react";
import { useMosaico } from "../../componentes/useMosaico";
import { resumoPorAgente } from "../../utilitarios/contextoIa";
import { lerConsumo, type Consumo } from "../../ponte/ponteLocal";
import { faltaPara, nivelDoUso, rotuloJanela } from "../../utilitarios/consumo";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Botao, Modal, Alternador, Progresso, Vazio } from "../../componentes/basicos";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { ItemTarefa } from "../../componentes/ItemTarefa";
import { MapaDeCalor } from "../../componentes/MapaDeCalor";
import { BarrasHorizontais, BarrasVerticais, Anel } from "../../componentes/Graficos";
import { Personagem } from "../../personagens/Personagem";
import { Marca } from "../../marcas/Marca";
import { useConfig, type BlocoInicio } from "../../estado/configuracoes";
import { useRotina, tarefasDoDia, habitoCumprido } from "../../estado/rotina";
import { useEstudos, revisoesParaHoje, cartoesVencidos } from "../../estado/estudos";
import { usePomodoro, restanteAtual, formatarRelogio } from "../../estado/pomodoro";
import type { EtapaPomodoro } from "../../tipos";
import { useFinancas, gastoPorCategoria, receitasDoMes, gastosDoMes, parteDoUsuario, saldoDaConta, moedaDaConta, valorEmReais } from "../../estado/financas";
import { useComunicacao } from "../../estado/comunicacao";
import { useAgentes, AGENTES, estadoDoAgente } from "../../estado/agentes";
import { useConquistas, CONQUISTAS } from "../../estado/conquistas";
import { useInterface } from "../../estado/interface";
import { T } from "../../textos/textos";
import { hojeISO, saudacao, formatarData, agoraDoNiko, descreverDistancia, paraISO, formatar, horarioRelativo, diaDoMomento } from "../../utilitarios/datas";
import { formatarDinheiro } from "../../utilitarios/dinheiro";
import { somar } from "../../utilitarios/basicos";
import { minutosEstudoPorDia, sequenciaDias } from "../../utilitarios/estatisticas";
import { addDays } from "date-fns";

function extra(i: number, base: number) {
  return i >= base ? "inicio-item-extra" : "";
}

const numeroCurto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const dolar = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });

const ICONES: Record<BlocoInicio, ReactNode> = {
  time: <Users size={15} />,
  hoje: <ListTodo size={15} />,
  foco: <Timer size={15} />,
  financas: <Wallet size={15} />,
  conexoes: <Plug size={15} />,
  revisoes: <Layers size={15} />,
  consumo: <Gauge size={15} />,
  mapa: <CalendarDays size={15} />,
  conquistas: <Trophy size={15} />,
};

const TITULO: Record<BlocoInicio, string> = {
  time: T.inicio.time,
  hoje: T.inicio.hoje,
  foco: T.inicio.foco,
  financas: T.inicio.financas,
  conexoes: T.inicio.conexoes,
  revisoes: T.inicio.revisoes,
  consumo: T.inicio.consumo,
  mapa: T.inicio.mapa,
  conquistas: T.inicio.conquistas,
};

const BLOCOS_LARGOS: BlocoInicio[] = ["mapa", "conquistas"];

function CabecalhoBloco({ numero, id, children }: { numero: string; id: BlocoInicio; children?: ReactNode }) {
  return (
    <header className="secao-cabecalho">
      <span className="secao-numero">{numero}</span>
      <span className="secao-titulo">{TITULO[id]}</span>
      <span className="tracejado" aria-hidden="true" />
      {children}
    </header>
  );
}

function BotaoIrPara({ rotulo, aoClicar }: { rotulo: string; aoClicar: () => void }) {
  return (
    <Botao pequeno variante="fantasma" className="inicio-ir" onClick={aoClicar}>
      {rotulo}
      <ArrowUpRight size={12} />
    </Botao>
  );
}

function SecaoTime() {
  const agentes = useAgentes();
  const nomes = useConfig((s) => s.agentes.nomes);
  const cargos = useConfig((s) => s.agentes.cargos);
  const irPara = useInterface((s) => s.irPara);
  const tarefas = useRotina((s) => s.tarefas);
  const estudos = useEstudos();
  const fin = useFinancas();
  const hoje = hojeISO();
  const abertas = tarefasDoDia(tarefas, hoje).filter((t) => t.status !== "concluida" && t.status !== "cancelada").length;
  const revisoes = revisoesParaHoje(estudos);
  const prova = estudos.datas.filter((d) => !d.concluida && d.data >= hoje).sort((a, b) => a.data.localeCompare(b.data))[0];
  const gasto = somar(gastosDoMes(fin, hoje.slice(0, 7)), (t) => valorEmReais(t, fin, parteDoUsuario(t, fin.divisoes)));
  const falha = agentes.alertas.find((a) => a.agenteId === "operador");

  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const comTarefas = funcaoLigada("journal", desligadas);
  const comEstudos = funcaoLigada("estudos", desligadas);
  const comFinancas = funcaoLigada("financas", desligadas);
  const falas = {
    organizador: comTarefas && abertas > 0 ? T.falas.organizador.bomDia(abertas) : T.falas.organizador.livre,
    tutor: !comEstudos ? T.falas.tutor.semFuncao : revisoes > 0 ? T.falas.tutor.revisoes(revisoes) : prova ? T.falas.tutor.prova(prova.titulo, descreverDistancia(prova.data)) : T.falas.tutor.livre,
    operador: falha ? falha.texto : !comFinancas ? T.falas.operador.semFuncao : gasto > 0 ? T.falas.operador.gasto(formatarDinheiro(gasto)) : T.falas.operador.livre,
    java: resumoPorAgente().java,
  };

  return (
    <section className="inicio-time" aria-label={T.inicio.time}>
      {AGENTES.map((a) => {
        const estado = estadoDoAgente(agentes, a);
        return (
          <button key={a} type="button" className="inicio-agente" data-estado={estado} onClick={() => irPara("chat", { agente: a })}>
            <span className="inicio-agente-retrato">
              <Personagem agente={a} tamanho={76} interativo={false} halo={false} />
            </span>
            <span className="inicio-agente-texto">
              <span className="inicio-agente-topo">
                <b className="inicio-agente-nome cortar">{nomes[a]}</b>
                <span className="inicio-agente-estado">{T.agentes.estados[estado]}</span>
              </span>
              <span className="inicio-agente-cargo cortar">{cargos[a]}</span>
              <span className="inicio-agente-fala privado">{falas[a]}</span>
            </span>
          </button>
        );
      })}
    </section>
  );
}

function BlocoHoje({ numero }: { numero: string }) {
  const tarefas = useRotina((s) => s.tarefas);
  const habitos = useRotina((s) => s.habitos);
  const registros = useRotina((s) => s.registros);
  const datas = useEstudos((s) => s.datas);
  const abrirCaptura = useInterface((s) => s.abrirCaptura);
  const irPara = useInterface((s) => s.irPara);
  const hoje = hojeISO();
  const doDia = tarefasDoDia(tarefas, hoje).filter((t) => t.status !== "cancelada");
  const pendentes = habitos.filter((h) => !h.arquivado && !habitoCumprido(h, registros[hoje]?.[h.id]));
  const proximas = datas.filter((d) => !d.concluida && d.data >= hoje).sort((a, b) => a.data.localeCompare(b.data)).slice(0, 8);
  const fimSemana = paraISO(addDays(new Date(), 7));
  const proximosDias = tarefas
    .filter((t) => t.data && t.data > hoje && t.data <= fimSemana && t.status !== "concluida" && t.status !== "cancelada")
    .sort((a, b) => `${a.data}${a.hora ?? ""}`.localeCompare(`${b.data}${b.hora ?? ""}`))
    .slice(0, 8);
  const vazio = doDia.length === 0 && pendentes.length === 0 && proximas.length === 0;

  return (
    <>
      <CabecalhoBloco numero={numero} id="hoje">
        <Botao pequeno variante="fantasma" icone={<Plus size={12} />} onClick={() => abrirCaptura(true)}>{T.inicio.novaTarefa}</Botao>
      </CabecalhoBloco>
      {vazio ? (
        <Vazio titulo={T.inicio.nadaHoje} acao={<Botao variante="primario" icone={<Plus size={13} />} onClick={() => abrirCaptura(true)}>{T.inicio.novaTarefa}</Botao>} />
      ) : (
        <>
          {doDia.length > 0 && (
            <div className="inicio-grupo inicio-hoje-tarefas">
              <span className="rotulo-secao">{T.inicio.tarefasHoje}</span>
              {doDia.map((t) => <ItemTarefa key={t.id} tarefa={t} />)}
            </div>
          )}
          {pendentes.length > 0 && (
            <div className="inicio-grupo">
              <span className="rotulo-secao">{T.inicio.habitosPendentes}</span>
              <div className="inicio-habitos">
                {pendentes.map((h) => (
                  <button key={h.id} type="button" className="inicio-habito" onClick={() => irPara("journal")}>{h.nome}</button>
                ))}
              </div>
            </div>
          )}
          {proximas.length > 0 && (
            <div className="inicio-grupo">
              <span className="rotulo-secao">{T.inicio.proximasDatas}</span>
              {proximas.map((d, i) => (
                <button key={d.id} type="button" className={`inicio-linha inicio-linha-botao inicio-linha-solta ${extra(i, 3)}`} onClick={() => irPara("estudos", { materia: d.materiaId, aba: "datas" })}>
                  <span className="cortar">{d.titulo}</span>
                  <span className="etiqueta etiqueta-alerta">{descreverDistancia(d.data)}</span>
                </button>
              ))}
            </div>
          )}
          {proximosDias.length > 0 && (
            <div className="inicio-grupo inicio-secao-extra">
              <span className="rotulo-secao">{T.inicio.proximosDias}</span>
              {proximosDias.map((t) => (
                <button key={t.id} type="button" className="inicio-linha inicio-linha-botao inicio-linha-solta inicio-item-extra" onClick={() => irPara("journal", { data: t.data ?? hoje })}>
                  <span className="cortar">{t.titulo}</span>
                  <span className="inicio-valor-apagado">{[descreverDistancia(t.data!), t.hora].filter(Boolean).join(" . ")}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function BlocoFoco({ numero }: { numero: string }) {
  const sessoes = usePomodoro((s) => s.sessoes);
  const materias = useEstudos((s) => s.materias);
  const comEstudos = useConfig((s) => funcaoLigada("estudos", s.funcoesDesligadas));
  const hoje = hojeISO();
  const doDia = sessoes.filter((s) => s.etapa === "foco" && s.situacao === "concluida" && diaDoMomento(s.inicio) === hoje);
  const minutos = somar(doDia, (s) => s.minutos);
  const porMateria = new Map<string, number>();
  for (const s of doDia) porMateria.set(s.materiaId ?? "", (porMateria.get(s.materiaId ?? "") ?? 0) + s.minutos);
  const semana = Array.from({ length: 7 }, (_, i) => paraISO(addDays(new Date(), i - 6)));
  const minutosDia = new Map<string, number>();
  for (const s of sessoes) if (s.etapa === "foco" && s.situacao === "concluida") minutosDia.set(diaDoMomento(s.inicio), (minutosDia.get(diaDoMomento(s.inicio)) ?? 0) + s.minutos);

  return (
    <>
      <CabecalhoBloco numero={numero} id="foco" />
      <Cronometro />
      <div className="inicio-par inicio-par-linhas">
        <div className="inicio-numero">
          <span className="numero-grande">{doDia.length}</span>
          <span className="inicio-legenda">{T.inicio.pomodorosHoje}</span>
        </div>
        <div className="inicio-numero">
          <span className="numero-grande">{minutos}</span>
          <span className="inicio-legenda">{T.inicio.minutosFoco}</span>
        </div>
      </div>
      {comEstudos && porMateria.size > 0 && (
        <BarrasHorizontais
          formatar={(v) => `${v} min`}
          barras={[...porMateria].map(([id, v]) => ({ rotulo: materias.find((m) => m.id === id)?.nome ?? T.pomodoro.semMateria, valor: v }))}
        />
      )}
      <div className="inicio-grupo inicio-secao-extra">
        <span className="rotulo-secao">{T.inicio.focoSemana}</span>
        <div className="inicio-item-extra inicio-semana">
          <BarrasVerticais
            altura={72}
            formatar={(v) => `${v} min`}
            barras={semana.map((d) => ({ rotulo: formatar(d, "EEEEE"), valor: minutosDia.get(d) ?? 0, cor: d === hoje ? "var(--destaque)" : "var(--borda-hover)" }))}
          />
        </div>
      </div>
    </>
  );
}

const ETAPAS: EtapaPomodoro[] = ["foco", "pausa_curta", "pausa_longa"];

function Cronometro() {
  const p = usePomodoro();
  const materias = useEstudos((s) => s.materias);
  const comEstudos = useConfig((s) => funcaoLigada("estudos", s.funcoesDesligadas));
  const ciclos = useConfig((s) => s.pomodoro.ciclos);
  const [agora, setAgora] = useState(() => Date.now());
  const iniciado = p.rodando || p.restanteMs != null;

  useEffect(() => {
    if (!p.rodando) return;
    const t = window.setInterval(() => setAgora(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [p.rodando]);

  const restante = restanteAtual(p, agora);
  const progresso = p.duracaoMs > 0 ? 1 - restante / p.duracaoMs : 0;
  const cor = p.etapa === "foco" ? "var(--destaque)" : "var(--sucesso)";

  return (
    <div className="inicio-foco" data-rodando={p.rodando ? "sim" : "nao"}>
      <div className="inicio-foco-anel">
        <Anel progresso={iniciado ? progresso : 0} tamanho={150} espessura={8} cor={cor} fundo="var(--borda-suave)" />
        <div className="inicio-foco-centro">
          <span className="inicio-foco-relogio">{formatarRelogio(restante)}</span>
          <span className="inicio-foco-etapa">{T.pomodoro.etapas[p.etapa]}</span>
          {p.etapa === "foco" && <span className="inicio-foco-ciclo">{T.pomodoro.ciclo(p.ciclo, ciclos)}</span>}
        </div>
      </div>
      <div className="inicio-foco-lado">
        <div className="segmentado inicio-foco-etapas" role="tablist">
          {ETAPAS.map((e) => (
            <button key={e} type="button" role="tab" aria-selected={p.etapa === e} disabled={iniciado && p.etapa !== e} onClick={() => p.escolherEtapa(e)}>
              {T.pomodoro.etapasCurtas[e]}
            </button>
          ))}
        </div>
        {p.etapa === "foco" && comEstudos && (
          <select className="seletor inicio-foco-materia" aria-label={T.pomodoro.materia} value={p.materiaId ?? ""} onChange={(e) => p.definirVinculo(e.target.value || undefined, p.tarefaId)}>
            <option value="">{T.pomodoro.semMateria}</option>
            {materias.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        )}
        <div className="inicio-foco-botoes">
          <Botao variante={p.rodando ? "secundario" : "primario"} className="inicio-foco-principal" icone={p.rodando ? <Pause size={13} /> : <Play size={13} />} onClick={p.alternar}>
            {p.rodando ? T.pomodoro.pausar : p.restanteMs != null ? T.pomodoro.continuar : T.pomodoro.iniciar}
          </Botao>
          {iniciado && <Botao soIcone className="inicio-foco-icone" icone={<RotateCcw size={13} />} aria-label={T.pomodoro.reiniciar} title={T.pomodoro.reiniciar} onClick={p.reiniciar} />}
          <Botao soIcone className="inicio-foco-icone" icone={<SkipForward size={13} />} aria-label={T.pomodoro.pular} title={T.pomodoro.pular} onClick={p.pular} />
        </div>
      </div>
    </div>
  );
}

function BlocoFinancas({ numero }: { numero: string }) {
  const fin = useFinancas();
  const irPara = useInterface((s) => s.irPara);
  const mes = hojeISO().slice(0, 7);
  const gastos = gastoPorCategoria(fin, mes);
  const entradas = somar(receitasDoMes(fin, mes), (t) => valorEmReais(t, fin));
  const saidas = somar([...gastos.values()], (v) => v);
  const comOrcamento = fin.categorias
    .filter((c) => c.tipo === "despesa" && c.orcamento > 0)
    .map((c) => ({ c, gasto: gastos.get(c.id) ?? 0 }))
    .sort((x, y) => y.gasto / y.c.orcamento - x.gasto / x.c.orcamento)
    .slice(0, 8);
  const ultimas = [...fin.transacoes].filter((t) => t.data <= hojeISO()).sort((x, y) => y.data.localeCompare(x.data) || y.criadaEm.localeCompare(x.criadaEm)).slice(0, 14);
  const hojeDia = new Date().getDate();
  const proximas = fin.recorrentes.filter((r) => r.ativa).map((r) => ({ ...r, falta: (r.dia - hojeDia + 31) % 31 })).sort((x, y) => x.falta - y.falta).slice(0, 6);
  const saldo = entradas - saidas;

  return (
    <>
      <CabecalhoBloco numero={numero} id="financas" />
      <div className="inicio-numero">
        <span className="numero-enorme privado" data-sinal={saldo >= 0 ? "positivo" : "negativo"}>{formatarDinheiro(saldo)}</span>
        <span className="inicio-legenda">{T.inicio.saldoMes}</span>
      </div>
      <div className="inicio-caixas">
        <div className="inicio-caixa">
          <span className="inicio-caixa-valor privado">{formatarDinheiro(entradas)}</span>
          <span className="inicio-legenda">{T.financas.entradas}</span>
        </div>
        <div className="inicio-caixa">
          <span className="inicio-caixa-valor privado">{formatarDinheiro(saidas)}</span>
          <span className="inicio-legenda">{T.financas.saidas}</span>
        </div>
      </div>
      {fin.contas.length > 0 && (
        <div className="inicio-grupo">
          <span className="rotulo-secao">{T.financas.abas.contas}</span>
          {fin.contas.filter((c) => !c.arquivada).slice(0, 8).map((c, i) => {
            const s = saldoDaConta(fin, c.id);
            return (
              <div key={c.id} className={`inicio-linha ${extra(i, 4)}`}>
                <span className="inicio-linha-nome cortar"><span className="ponto-cor" style={{ background: c.cor }} />{c.nome}</span>
                <span className="inicio-valor privado" data-negativo={s < 0 || undefined}>{formatarDinheiro(s, moedaDaConta(fin.contas, c.id))}</span>
              </div>
            );
          })}
        </div>
      )}
      {comOrcamento.length > 0 && (
        <div className="inicio-grupo inicio-orcamentos">
          <span className="rotulo-secao">{T.financas.abas.orcamento}</span>
          {comOrcamento.map(({ c, gasto }, i) => {
            const p = gasto / c.orcamento;
            return (
              <div key={c.id} className={`inicio-orcamento ${extra(i, 3)}`}>
                <div className="inicio-orcamento-topo">
                  <span className="cortar">{c.nome}</span>
                  <span className="inicio-valor-apagado privado">{formatarDinheiro(gasto)} / {formatarDinheiro(c.orcamento)}</span>
                </div>
                <Progresso valor={p} nivel={p >= 1 ? "erro" : p >= 0.8 ? "alerta" : "sucesso"} rotulo={c.nome} />
              </div>
            );
          })}
        </div>
      )}
      {ultimas.length > 0 && (
        <div className="inicio-grupo">
          <span className="rotulo-secao">{T.inicio.ultimosLancamentos}</span>
          {ultimas.map((x, i) => (
            <div key={x.id} className={`inicio-linha ${extra(i, 4)}`}>
              <span className="cortar">{x.descricao}</span>
              <span className="inicio-valor privado" data-receita={x.tipo === "receita" || undefined}>{x.tipo === "receita" ? "+" : x.tipo === "despesa" ? "-" : ""}{formatarDinheiro(x.valor, moedaDaConta(fin.contas, x.contaId))}</span>
            </div>
          ))}
        </div>
      )}
      {proximas.length > 0 && (
        <div className="inicio-grupo">
          <span className="rotulo-secao">{T.inicio.proximasContas}</span>
          {proximas.map((r, i) => (
            <div key={r.id} className={`inicio-linha ${extra(i, 2)}`}>
              <span className="cortar">{r.descricao}</span>
              <span className="inicio-valor-apagado privado">{formatarDinheiro(r.valor, moedaDaConta(fin.contas, r.contaId))} . {r.falta === 0 ? T.datas.hoje : T.datas.emDias(r.falta)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="inicio-rodape">
        <BotaoIrPara rotulo={T.rotas.financas} aoClicar={() => irPara("financas")} />
      </div>
    </>
  );
}

function BlocoConexoes({ numero }: { numero: string }) {
  const conexoes = useComunicacao((s) => s.conexoes);
  const abrirJanela = useInterface((s) => s.abrirJanelaConexao);
  const irPara = useInterface((s) => s.irPara);
  const eventos = useComunicacao((s) => s.eventosConexao).slice(0, 8);
  const ativas = conexoes.filter((c) => c.ligada);

  return (
    <>
      <CabecalhoBloco numero={numero} id="conexoes" />
      {ativas.length === 0 ? (
        <Vazio titulo={T.ilha.semConexoes} acao={<Botao onClick={() => irPara("conexoes")}>{T.rotas.conexoes}</Botao>} />
      ) : (
        <>
          <div className="inicio-conexoes">
            {ativas.map((c) => (
              <button key={c.id} type="button" className="inicio-conexao" onClick={() => abrirJanela(c.id)}>
                <span className="inicio-conexao-marca"><Marca marca={c.id} tamanho={16} /></span>
                <span className="inicio-conexao-texto">
                  <span className="inicio-conexao-nome cortar">{T.conexoes.servicos[c.id].nome}</span>
                  <span className="inicio-conexao-resumo cortar privado">{c.resumo || T.conexoes.status[c.status]}</span>
                </span>
                <span className={`etiqueta ${c.status === "conectado" ? "etiqueta-sucesso" : c.status === "erro" ? "etiqueta-erro" : ""}`}>{T.conexoes.status[c.status]}</span>
              </button>
            ))}
          </div>
          {eventos.length > 0 && (
            <div className="inicio-grupo inicio-secao-extra">
              <span className="rotulo-secao">{T.conexoes.eventos}</span>
              {eventos.map((e) => (
                <div key={e.id} className="inicio-evento inicio-item-extra" data-tipo={e.tipo}>
                  <span className="inicio-evento-ponto" />
                  <span className="inicio-evento-texto cortar privado">{e.texto}</span>
                  <span className="inicio-evento-hora">{horarioRelativo(e.data)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function BlocoRevisoes({ numero }: { numero: string }) {
  const estudos = useEstudos();
  const sessoes = usePomodoro((s) => s.sessoes);
  const irPara = useInterface((s) => s.irPara);
  const n = revisoesParaHoje(estudos);
  const vencidos = cartoesVencidos(estudos.cartoes);
  const porMateria = estudos.materias.map((m) => ({ m, q: vencidos.filter((c) => c.materiaId === m.id).length })).filter((x) => x.q > 0).sort((a, b) => b.q - a.q).slice(0, 10);
  const hoje = hojeISO();
  const conteudo = estudos.revisoesConteudo.filter((r) => !r.feita && r.data <= hoje).length;
  const prova = estudos.datas.filter((d) => !d.concluida && d.data >= hoje).sort((a, b) => a.data.localeCompare(b.data))[0];
  const ultimos = Array.from({ length: 7 }, (_, i) => paraISO(addDays(new Date(), i - 6)));
  const minutos = minutosEstudoPorDia(sessoes);
  const sequencia = sequenciaDias(new Set([...minutos.keys(), ...estudos.registroRevisoes.filter((r) => r.quantidade > 0).map((r) => r.data)]));

  return (
    <>
      <CabecalhoBloco numero={numero} id="revisoes" />
      <div className="inicio-par">
        <div className="inicio-numero">
          <span className="numero-enorme">{n}</span>
          <span className="inicio-legenda">{T.inicio.revisoesHoje}</span>
        </div>
        <div className="inicio-numero">
          <span className="numero-enorme">{sequencia}</span>
          <span className="inicio-legenda">{T.inicio.diasSeguidos}</span>
        </div>
      </div>
      {porMateria.length > 0 && (
        <div className="inicio-grupo">
          <span className="rotulo-secao">{T.inicio.porMateria}</span>
          {porMateria.map(({ m, q }, i) => (
            <button key={m.id} type="button" className={`inicio-linha inicio-linha-botao ${extra(i, 4)}`} onClick={() => irPara("estudos", { materia: m.id, aba: "revisoes" })}>
              <span className="cortar">{m.nome}</span>
              <span className="inicio-contagem">{q}</span>
            </button>
          ))}
        </div>
      )}
      {conteudo > 0 && <span className="inicio-nota">{T.inicio.conteudoPendente(conteudo)}</span>}
      {prova && (
        <div className="inicio-linha inicio-linha-solta">
          <span className="cortar">{prova.titulo}</span>
          <span className="etiqueta etiqueta-alerta">{descreverDistancia(prova.data)}</span>
        </div>
      )}
      <div className="inicio-grupo inicio-revisoes-grafico">
        <span className="rotulo-secao">{T.inicio.ultimos7}</span>
        <BarrasVerticais altura="auto" formatar={(v) => `${v}`} barras={ultimos.map((d) => ({ rotulo: formatar(d, "EEEEE"), valor: (estudos.registroRevisoes.find((r) => r.data === d)?.quantidade ?? 0) + Math.round((minutos.get(d) ?? 0) / 25), cor: d === hoje ? "var(--destaque)" : "var(--borda-hover)", detalhe: `${estudos.registroRevisoes.find((r) => r.data === d)?.quantidade ?? 0} cartões, ${minutos.get(d) ?? 0} min` }))} />
      </div>
      <Botao variante={n > 0 ? "primario" : "secundario"} className="inicio-revisar" disabled={n === 0} onClick={() => irPara("estudos", { aba: "revisoes", sessao: "1" })}>{T.inicio.revisar}</Botao>
    </>
  );
}

function LimitesDosPlanos() {
  const [dados, setDados] = useState<Consumo | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let vivo = true;
    const ler = () => {
      if (document.hidden) return;
      lerConsumo()
        .then((d) => vivo && (setDados(d), setFalhou(false)))
        .catch(() => vivo && setFalhou(true));
    };
    ler();
    const t = window.setInterval(ler, 5 * 60000);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, []);

  if (falhou && !dados) return <span className="inicio-nota">{T.consumo.ponteFora}</span>;
  if (!dados) return <span className="inicio-nota">{T.geral.carregando}</span>;
  const ferramentas = dados.ferramentas.filter((f) => f.situacao === "ok" && f.janelas.length > 0);

  return (
    <>
      {dados.sessao && <span className="inicio-nota cortar">{T.inicio.sessaoAgora(dados.sessao.projeto, dados.sessao.mensagens)}</span>}
      {ferramentas.map((f) => (
        <div key={f.id} className="inicio-plano">
          <div className="inicio-plano-topo">
            <span className="inicio-plano-nome">{f.id === "claude" ? <Marca marca="anthropic" tamanho={14} /> : <Cpu size={14} />}<b>{f.nome}</b></span>
            {f.plano && <span className="etiqueta">{f.plano}</span>}
          </div>
          {f.janelas.slice(0, 2).map((j) => (
            <div key={j.id} className="inicio-plano-janela">
              <div className="inicio-plano-linha">
                <span className="cortar">{rotuloJanela(j.rotulo)}</span>
                <b>{Math.round(j.usado)}%</b>
              </div>
              <Progresso valor={j.usado / 100} nivel={nivelDoUso(j.usado)} rotulo={rotuloJanela(j.rotulo)} />
              <span className="inicio-legenda">{faltaPara(j.reiniciaEm)}</span>
            </div>
          ))}
        </div>
      ))}
      {ferramentas.length === 0 && <span className="inicio-nota">{T.consumo.semJanelas}</span>}
    </>
  );
}

function BlocoConsumo({ numero }: { numero: string }) {
  const uso = useComunicacao((s) => s.usoIa);
  const consumo = useConfig((s) => s.consumo);
  const nomes = useConfig((s) => s.agentes.nomes);
  const irPara = useInterface((s) => s.irPara);
  const mes = hojeISO().slice(0, 7);
  const doMes = uso.filter((u) => u.data.startsWith(mes));
  const tokens = somar(doMes, (u) => u.entrada + u.saida);
  const temPreco = consumo.precoEntrada + consumo.precoSaida > 0;
  const custo = somar(doMes, (u) => (u.entrada * consumo.precoEntrada + u.saida * consumo.precoSaida) / 1e6);
  const porModeloMapa = new Map<string, number>();
  for (const u of doMes) porModeloMapa.set(u.modelo, (porModeloMapa.get(u.modelo) ?? 0) + u.entrada + u.saida);
  const porModelo = [...porModeloMapa].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const porAgente = AGENTES.map((a) => ({ rotulo: nomes[a], valor: somar(doMes.filter((u) => u.agenteId === a), (u) => u.entrada + u.saida) })).filter((b) => b.valor > 0);

  return (
    <>
      <CabecalhoBloco numero={numero} id="consumo" />
      {consumo.lerPlanos ? (
        <div className="inicio-grupo inicio-planos">
          <span className="rotulo-secao">{T.inicio.limitesPlanos}</span>
          <LimitesDosPlanos />
        </div>
      ) : (
        <div className="inicio-plano">
          <span className="inicio-nota">{T.inicio.limitesDesligados}</span>
          <Botao pequeno onClick={() => irPara("consumo")}>{T.consumo.ligarParte2}</Botao>
        </div>
      )}
      {doMes.length > 0 ? (
        <>
          <div className="inicio-par">
            <div className="inicio-numero">
              <span className="numero-grande">{numeroCurto.format(tokens)}</span>
              <span className="inicio-legenda">{T.inicio.tokensMes}</span>
            </div>
            {temPreco && (
              <div className="inicio-numero">
                <span className="numero-grande">{dolar.format(custo)}</span>
                <span className="inicio-legenda">{T.inicio.custoMes}</span>
              </div>
            )}
          </div>
          {porAgente.length > 0 && (
            <div className="inicio-grupo">
              <span className="rotulo-secao">{T.inicio.porAgente}</span>
              <BarrasHorizontais formatar={(v) => numeroCurto.format(v)} barras={porAgente} />
            </div>
          )}
          {porModelo.length > 0 && (
            <div className="inicio-grupo inicio-secao-extra">
              <span className="rotulo-secao">{T.inicio.porModelo}</span>
              {porModelo.map(([m, v]) => (
                <div key={m} className="inicio-linha inicio-item-extra">
                  <span className="cortar">{m}</span>
                  <span className="inicio-valor-apagado">{numeroCurto.format(v)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <span className="inicio-nota">{T.inicio.semUsoInicio}</span>
      )}
      <div className="inicio-rodape">
        <BotaoIrPara rotulo={T.rotas.consumo} aoClicar={() => irPara("consumo")} />
      </div>
    </>
  );
}

function BlocoMapa({ numero }: { numero: string }) {
  return (
    <>
      <CabecalhoBloco numero={numero} id="mapa" />
      <MapaDeCalor />
    </>
  );
}

function BlocoConquistas({ numero }: { numero: string }) {
  const todasAlcancadas = useConquistas((s) => s.alcancadas);
  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const alcancadas = todasAlcancadas.filter((a) => conquistaLigada(a.codigo, desligadas));
  const irPara = useInterface((s) => s.irPara);
  const recentes = [...alcancadas].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 10);
  const proximas = CONQUISTAS.filter((c) => conquistaLigada(c.codigo, desligadas) && !alcancadas.some((a) => a.codigo === c.codigo)).slice(0, 10);

  const rotuloNivel = (codigo: string, nivel: number) => {
    const niveis = CONQUISTAS.find((c) => c.codigo === codigo)?.niveis ?? [];
    return niveis.length > 1 ? T.conquistas.nivel(niveis.filter((n) => n <= nivel).length) : T.conquistas.unico;
  };

  return (
    <>
      <CabecalhoBloco numero={numero} id="conquistas">
        <BotaoIrPara rotulo={T.rotas.conquistas} aoClicar={() => irPara("conquistas")} />
      </CabecalhoBloco>
      <div className="inicio-conquistas">
        {recentes.map((a, i) => (
          <div key={`${a.codigo}-${a.nivel}`} className={`inicio-conquista ${extra(i, 3)}`} data-alcancada="sim">
            <Trophy size={16} />
            <span className="inicio-conquista-nome cortar">{T.conquistas.itens[a.codigo]?.nome}</span>
            <span className="inicio-conquista-nivel">{rotuloNivel(a.codigo, a.nivel)}</span>
          </div>
        ))}
        {proximas.map((c, i) => (
          <div key={c.codigo} className={`inicio-conquista ${extra(i, 6)}`} data-alcancada="nao" title={T.conquistas.itens[c.codigo]?.regra}>
            <Trophy size={16} />
            <span className="inicio-conquista-texto">
              <span className="inicio-conquista-nome cortar">{T.conquistas.itens[c.codigo]?.nome}</span>
              <span className="inicio-conquista-regra cortar">{T.conquistas.itens[c.codigo]?.regra}</span>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

const COMPONENTE: Record<Exclude<BlocoInicio, "time">, (p: { numero: string }) => React.JSX.Element> = {
  hoje: BlocoHoje,
  foco: BlocoFoco,
  financas: BlocoFinancas,
  conexoes: BlocoConexoes,
  revisoes: BlocoRevisoes,
  consumo: BlocoConsumo,
  mapa: BlocoMapa,
  conquistas: BlocoConquistas,
};

type BlocoDoBento = Exclude<BlocoInicio, "time">;
type Trecho = { tipo: "time" } | { tipo: "bento"; blocos: { id: BlocoDoBento; numero: string }[] };

function GradeDoInicio({ blocos }: { blocos: { id: BlocoDoBento; numero: string }[] }) {
  const grade = useRef<HTMLDivElement>(null);
  useMosaico(grade, blocos.map((b) => b.id).join());
  return (
    <div className="inicio-bento">
      <div className="inicio-bento-grade" ref={grade}>
        {blocos.map(({ id, numero }) => {
          const Componente = COMPONENTE[id];
          return (
            <article key={id} className="inicio-bloco" data-bloco={id} data-largo={BLOCOS_LARGOS.includes(id) || undefined} aria-label={TITULO[id]}>
              <Componente numero={numero} />
            </article>
          );
        })}
      </div>
    </div>
  );
}

function LinhaOrdenavel({ id, visivel, aoMudar }: { id: BlocoInicio; visivel: boolean; aoMudar: (v: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} className="inicio-opcao" data-desligada={!visivel || undefined} data-arrastando={isDragging || undefined} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <button type="button" className="inicio-opcao-alca" aria-label={T.inicio.arrastar(TITULO[id])} {...attributes} {...listeners}>
        <GripVertical size={14} />
      </button>
      <span className="inicio-opcao-icone">{ICONES[id]}</span>
      <span className="inicio-opcao-titulo">{TITULO[id]}</span>
      <Alternador ligado={visivel} aoMudar={aoMudar} rotulo={TITULO[id]} />
    </div>
  );
}

export default function Inicio() {
  const todosOsBlocos = useConfig((s) => s.blocosInicio);
  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const blocos = useMemo(() => todosOsBlocos.filter((b) => blocoLigado(b.id, desligadas)), [todosOsBlocos, desligadas]);
  const definir = useConfig((s) => s.definir);
  const nome = useConfig((s) => s.nome);
  const [personalizando, setPersonalizando] = useState(false);
  const [escolhendoFuncoes, setEscolhendoFuncoes] = useState(false);

  const dataTexto = formatarData(agoraDoNiko(), "EEEE, d 'de' MMMM");
  const data = dataTexto.charAt(0).toUpperCase() + dataTexto.slice(1);

  const trechos = useMemo(() => {
    const lista: Trecho[] = [];
    let contador = 1;
    for (const b of blocos) {
      if (!b.visivel) continue;
      if (b.id === "time") {
        lista.push({ tipo: "time" });
        continue;
      }
      contador += 1;
      const item = { id: b.id, numero: String(contador).padStart(2, "0") };
      const ultimo = lista[lista.length - 1];
      if (ultimo?.tipo === "bento") ultimo.blocos.push(item);
      else lista.push({ tipo: "bento", blocos: [item] });
    }
    return lista;
  }, [blocos]);

  const aoArrastar = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const de = todosOsBlocos.findIndex((b) => b.id === e.active.id);
    const para = todosOsBlocos.findIndex((b) => b.id === e.over?.id);
    definir({ blocosInicio: arrayMove(todosOsBlocos, de, para) });
  };

  return (
    <>
      <CabecalhoAba
        rotulo={T.inicio.rotulo}
        titulo={<>{T.inicio.saudacao(saudacao())}<em className="inicio-nome" title={nome || undefined}>{nome.trim().split(/\s+/)[0] || T.barraLateral.perfil}</em></>}
        subtitulo={data}
        acoes={
          <>
            <Botao icone={<ToggleRight size={13} />} onClick={() => setEscolhendoFuncoes(true)}>{T.funcoes.botao}</Botao>
            <Botao icone={<SlidersHorizontal size={13} />} onClick={() => setPersonalizando(true)}>{T.inicio.personalizar}</Botao>
          </>
        }
      />
      {trechos.map((t, i) => (
        <Fragment key={t.tipo === "time" ? `time-${i}` : `bento-${t.blocos[0].id}`}>
          {t.tipo === "time" ? <SecaoTime /> : <GradeDoInicio blocos={t.blocos} />}
        </Fragment>
      ))}
      <Modal aberto={personalizando} titulo={T.inicio.personalizarTitulo} aoFechar={() => setPersonalizando(false)}>
        <p className="inicio-modal-dica">{T.inicio.personalizarDica}</p>
        <DndContext collisionDetection={closestCenter} onDragEnd={aoArrastar}>
          <SortableContext items={blocos.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <div className="inicio-opcoes">
              {blocos.map((b) => (
                <LinhaOrdenavel key={b.id} id={b.id} visivel={b.visivel} aoMudar={(v) => definir({ blocosInicio: todosOsBlocos.map((x) => (x.id === b.id ? { ...x, visivel: v } : x)) })} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <div className="formulario-acoes">
          <Botao variante="primario" onClick={() => setPersonalizando(false)}>{T.inicio.pronto}</Botao>
        </div>
      </Modal>
      <PainelFuncoes aberto={escolhendoFuncoes} aoFechar={() => setEscolhendoFuncoes(false)} />
    </>
  );
}
