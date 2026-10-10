import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Check, Play, Pause, SkipBack, SkipForward, RotateCcw, FastForward, Plus, Minus, ArrowUpRight, CornerDownLeft,
  Bell, ChevronLeft, ChevronRight, Music,
} from "lucide-react";
import { useRotina, tarefasDoDia, habitoCumprido } from "../../estado/rotina";
import { useMidia, posicaoAtual, capaDaFaixa, fundoDaCapa } from "../../estado/midia";
import { usePomodoro, restanteAtual, formatarRelogio } from "../../estado/pomodoro";
import { useEstudos } from "../../estado/estudos";
import { useOrganizacao } from "../../estado/organizacao";
import { falhasNaoVistas, useComunicacao } from "../../estado/comunicacao";
import { useAgentes } from "../../estado/agentes";
import { useConfig, type SecaoHoje } from "../../estado/configuracoes";
import { useInterface } from "../../estado/interface";
import { useIlha } from "../../estado/ilha";
import { Marca, MARCAS, marcaDoApp } from "../../marcas/Marca";
import { Anel } from "../../componentes/Graficos";
import { T } from "../../textos/textos";
import { deISO, formatarData, hojeISO, paraISO, horarioRelativo } from "../../utilitarios/datas";
import { itemFeito, itensDoCalendario, podeMarcarFeito, repeteTodoDia, type ItemDoCalendario } from "../../utilitarios/itensDoCalendario";
import { marcarItemFeito } from "../../utilitarios/marcarFeito";
import { usarAgendaGoogle } from "../../modulos/calendario/usarAgendaGoogle";
import { ConexaoNaIlha } from "./ConexaoNaIlha";
import { conexaoEmTestes } from "../../utilitarios/disponibilidadeConexoes";
import { VolumeDoPlayer } from "./VolumeDoPlayer";
import { EspacoDoPersonagem } from "./animacoes/PersonagemContinuo";
import { funcaoLigada, secoesDoHojeLigadas } from "../../utilitarios/funcoes";
import { useFinancas } from "../../estado/financas";
import { interpretarQuando } from "../../utilitarios/linguagem";
import { capturar, tiposDeCapturaLigados, type TipoCaptura } from "../../utilitarios/captura";
import { confirmarComando, faltaCategoria, tipoDeCategoriaDoCartao } from "../../utilitarios/comandos";
import { SeletorDeCategoria } from "../../componentes/SeletorDeCategoria";
import { formatarDinheiro } from "../../utilitarios/dinheiro";
import { tocarSom } from "../../ponte/sons";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import type { CartaoConfirmacao, EtapaPomodoro, ServicoId } from "../../tipos";

function Cartao({ veu, children }: { veu?: string; children: React.ReactNode }) {
  return (
    <div className="ilha-cartao" style={{ ["--veu" as string]: veu ? `${veu}55` : "transparent" }}>
      <div className="ilha-veu" />
      <div className="ilha-cartao-corpo">{children}</div>
    </div>
  );
}

function Marcador({ marcado, aoMudar, rotulo }: { marcado: boolean; aoMudar: () => void; rotulo: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={marcado} aria-label={rotulo} className="ilha-marca" onClick={aoMudar}>
      {marcado && <Check size={11} strokeWidth={3} />}
    </button>
  );
}

export function VisaoHoje() {
  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const secoes = secoesDoHojeLigadas(desligadas);
  const escolhida = useIlha((s) => s.secaoHoje);
  const definirSecao = useIlha((s) => s.definirSecaoHoje);
  const secao = secoes.includes(escolhida) ? escolhida : secoes[0];
  const tarefas = useRotina((s) => s.tarefas);
  const habitos = useRotina((s) => s.habitos);
  const registros = useRotina((s) => s.registros);
  const hoje = hojeISO();
  const doDia = tarefasDoDia(tarefas, hoje).filter((t) => t.status !== "cancelada");
  const habitosAtivos = habitos.filter((h) => !h.arquivado);
  const contagem: Record<SecaoHoje, { feitos: number; total: number } | null> = {
    agenda: null,
    tarefas: { feitos: doDia.filter((t) => t.status === "concluida").length, total: doDia.length },
    habitos: { feitos: habitosAtivos.filter((h) => habitoCumprido(h, registros[hoje]?.[h.id])).length, total: habitosAtivos.length },
  };
  const atual = secao ? contagem[secao] : null;
  const tudoFeito = Boolean(atual && atual.total > 0 && atual.feitos === atual.total);

  return (
    <Cartao veu={tudoFeito ? "#34d399" : undefined}>
      <div className="ilha-chips" role="tablist" aria-label={T.ilha.abas.hoje}>
        {secoes.map((s) => {
          const c = contagem[s];
          return (
            <button
              key={s}
              type="button"
              role="tab"
              className="ilha-chip"
              aria-pressed={s === secao}
              aria-selected={s === secao}
              onClick={() => {
                if (s !== secao) void tocarSom("blip");
                definirSecao(s);
              }}
            >
              {T.ilha.secoesHoje[s]}
              {c && c.total > 0 && <span className="ilha-chip-numero numero">{T.ilha.feitosDoTotal(c.feitos, c.total)}</span>}
            </button>
          );
        })}
      </div>
      {secao === "agenda" ? <SecaoAgenda /> : secao === "tarefas" ? <SecaoTarefas /> : secao === "habitos" ? <SecaoHabitos /> : null}
    </Cartao>
  );
}

function SecaoTarefas() {
  const tarefas = useRotina((s) => s.tarefas);
  const criar = useRotina((s) => s.criarTarefa);
  const mudarStatus = useRotina((s) => s.mudarStatus);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const hoje = hojeISO();
  const lista = tarefasDoDia(tarefas, hoje).filter((t) => t.status !== "cancelada");

  const adicionar = () => {
    const limpo = texto.trim();
    if (!limpo) {
      setErro(T.validacao.obrigatorio);
      return;
    }
    const quando = interpretarQuando(limpo);
    criar({ titulo: quando.resto || limpo, data: quando.data ?? hoje, hora: quando.hora });
    void tocarSom("pop");
    setTexto("");
    setErro("");
  };

  return (
    <div className="ilha-hoje-secao">
      <div className="ilha-rolagem">
        {lista.length === 0 ? (
          <span className="ilha-sub">{T.ilha.semTarefasHoje}</span>
        ) : (
          lista.map((t) => (
            <div key={t.id} className="ilha-linha">
              <Marcador
                marcado={t.status === "concluida"}
                rotulo={t.titulo}
                aoMudar={() => {
                  const concluir = t.status !== "concluida";
                  mudarStatus(t.id, concluir ? "concluida" : "a_fazer");
                  if (concluir) void tocarSom("finish", "personagens");
                }}
              />
              <span className={`cortar privado ${t.status === "concluida" ? "ilha-riscado" : ""}`}>{t.titulo}</span>
              {t.hora && <span className="ilha-mini numero">{t.hora}</span>}
            </div>
          ))
        )}
      </div>
      <div className="ilha-campo" data-erro={erro ? "sim" : "nao"}>
        <Plus size={14} color="#8e939c" />
        <input
          value={texto}
          maxLength={200}
          aria-label={T.ilha.novaTarefaHoje}
          placeholder={T.ilha.novaTarefaHoje}
          onChange={(e) => {
            setTexto(e.target.value);
            if (erro) setErro("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") adicionar();
          }}
        />
        <button type="button" className="ilha-botao ilha-botao-icone" aria-label={T.geral.adicionar} onClick={adicionar}>
          <CornerDownLeft size={13} />
        </button>
      </div>
    </div>
  );
}

export function VisaoCaptura() {
  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const tipos = tiposDeCapturaLigados(desligadas);
  const [tipoEscolhido, setTipo] = useState<TipoCaptura>("tarefa");
  const tipo = tipos.includes(tipoEscolhido) ? tipoEscolhido : tipos[0];
  const [texto, setTexto] = useState("");
  const [retorno, setRetorno] = useState<{ ok: boolean; texto: string } | null>(null);
  const [confirmacao, setConfirmacao] = useState<CartaoConfirmacao | null>(null);

  if (!tipo) {
    return (
      <Cartao>
        <span className="ilha-sub">{T.funcoes.semCaptura}</span>
      </Cartao>
    );
  }

  const enviar = () => {
    const r = capturar(tipo, texto);
    if (r.confirmacao) {
      setConfirmacao(r.confirmacao);
      setRetorno(null);
      return;
    }
    setRetorno({ ok: r.ok, texto: r.resposta });
    if (r.ok) {
      setTexto("");
      void tocarSom("pop");
    }
  };

  return (
    <Cartao>
      <div className="ilha-chips" role="tablist" aria-label={T.ilha.abas.captura}>
        {tipos.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            className="ilha-chip"
            aria-pressed={tipo === t}
            aria-selected={tipo === t}
            onClick={() => {
              setTipo(t);
              setRetorno(null);
              setConfirmacao(null);
            }}
          >
            {T.ilha.tiposCaptura[t]}
          </button>
        ))}
      </div>
      {confirmacao ? (
        <ConfirmacaoIlha
          confirmacao={confirmacao}
          aoMudar={(dados) => setConfirmacao({ ...confirmacao, dados: { ...confirmacao.dados, ...dados } })}
          aoFim={(texto) => {
            setConfirmacao(null);
            if (texto) {
              setRetorno({ ok: true, texto });
              setTexto("");
            }
          }}
        />
      ) : (
        <>
          <div className="ilha-campo" data-erro={retorno && !retorno.ok ? "sim" : "nao"}>
            <input
              value={texto}
              maxLength={300}
              autoFocus
              aria-label={T.ilha.tiposCaptura[tipo]}
              placeholder={T.ilha.exemplosCaptura[tipo]}
              onChange={(e) => {
                setTexto(e.target.value);
                setRetorno(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") enviar();
              }}
            />
            <button type="button" className="ilha-botao ilha-botao-primario" onClick={enviar}>
              {T.geral.salvar}
            </button>
          </div>
          {retorno && <span className={retorno.ok ? "ilha-ok" : "ilha-erro"} role="status">{retorno.texto}</span>}
        </>
      )}
    </Cartao>
  );
}

function ConfirmacaoIlha({ confirmacao, aoMudar, aoFim }: { confirmacao: CartaoConfirmacao; aoMudar: (dados: CartaoConfirmacao["dados"]) => void; aoFim: (texto?: string) => void }) {
  const d = confirmacao.dados;
  const tipoCategoria = tipoDeCategoriaDoCartao(confirmacao);
  const semCategoria = faltaCategoria(confirmacao);
  return (
    <div className="coluna" style={{ gap: 8 }}>
      <div className="ilha-confirmacao">
        <span>{T.chat.rotulos.valor}: <b className="privado">{formatarDinheiro(Number(d.valor))}</b></span>
        <span>{T.chat.rotulos.descricao}: <b>{String(d.descricao)}</b></span>
        {Array.isArray(d.pessoas) && <span>{T.chat.rotulos.pessoas}: <b>{d.pessoas.join(", ")}</b></span>}
      </div>
      {tipoCategoria && (
        <div className="permissao-categoria" data-falta={semCategoria || undefined}>
          {semCategoria && T.financas.categoriaObrigatoria}
          <SeletorDeCategoria
            tipo={tipoCategoria}
            categoriaId={String(d.categoriaId ?? "")}
            novaCategoria={String(d.novaCategoria ?? "")}
            invalido={semCategoria}
            aoMudar={(categoriaId, novaCategoria) => aoMudar({ categoriaId, novaCategoria })}
          />
        </div>
      )}
      <div className="linha">
        <button type="button" className="ilha-botao ilha-botao-primario" disabled={semCategoria} onClick={() => void Promise.resolve(confirmarComando(confirmacao)).then((texto) => aoFim(texto))}>
          {T.chat.confirmar}
        </button>
        <button type="button" className="ilha-botao" onClick={() => aoFim()}>
          {T.chat.cancelar}
        </button>
      </div>
    </div>
  );
}

export function VisaoMidia() {
  const midia = useMidia();
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    setAgora(Date.now());
    if (!midia.tocando) return;
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [midia.tocando, midia.lidoEm]);
  const faixa = midia.faixa;
  const [c1] = capaDaFaixa(midia.faixa);
  const pos = posicaoAtual(midia, agora);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  if (!faixa) {
    return (
      <Cartao>
        <div className="linha" style={{ gap: 12, flex: 1 }}>
          <Music size={18} color="#8e939c" />
          <div className="coluna" style={{ gap: 2 }}>
            <span className="ilha-titulo">{T.ilha.semMidia}</span>
            <span className="ilha-sub">{midia.disponivel ? T.ilha.semMidiaDica : T.ilha.midiaSemPonte}</span>
          </div>
        </div>
      </Cartao>
    );
  }

  const marcaApp = marcaDoApp(faixa.app);

  return (
    <Cartao veu={c1}>
      <div className="ilha-player" style={{ ["--cor-capa" as string]: c1 }}>
        <div className="ilha-capa-com-personagem">
          <div className="ilha-capa" style={{ width: 96, height: 96, borderRadius: 10, background: fundoDaCapa(faixa), boxShadow: `0 8px 24px ${c1}55` }} />
          <EspacoDoPersonagem tamanho={38} posicao="expandida" flutuar className="ilha-capa-personagem" />
        </div>
        <div className="coluna" style={{ gap: 6, flex: 1, minWidth: 0 }}>
          <div className="coluna" style={{ gap: 0 }}>
            <span className="ilha-titulo cortar privado">{faixa.titulo}</span>
            <span className="linha ilha-midia-origem">
              {marcaApp && (
                <span className="ilha-midia-app" title={faixa.app} aria-label={faixa.app}>
                  <Marca marca={marcaApp} tamanho={12} />
                </span>
              )}
              <span className="ilha-sub cortar privado">{faixa.artista}</span>
              {!marcaApp && faixa.app && <span className="ilha-mini cortar">{faixa.app}</span>}
            </span>
          </div>
          <div
            className="ilha-trilho"
            role="slider"
            tabIndex={0}
            aria-label={T.ilha.midia}
            aria-valuemin={0}
            aria-valuemax={faixa.duracao}
            aria-valuenow={Math.round(pos)}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              if (midia.podeBuscar && faixa.duracao > 0) midia.buscar(((e.clientX - r.left) / r.width) * faixa.duracao);
            }}
            onKeyDown={(e) => {
              if (!midia.podeBuscar || faixa.duracao <= 0) return;
              if (e.key === "ArrowRight") midia.buscar(Math.min(faixa.duracao, pos + 5));
              if (e.key === "ArrowLeft") midia.buscar(Math.max(0, pos - 5));
            }}
          >
            <span style={{ width: `${faixa.duracao > 0 ? (pos / faixa.duracao) * 100 : 0}%` }} />
          </div>
          <div className="linha-entre ilha-mini numero">
            <span>{fmt(pos)}</span>
            <span>{fmt(faixa.duracao)}</span>
          </div>
        </div>
        <div className="ilha-player-controles">
        <div className="linha" style={{ gap: 4, justifyContent: "center" }}>
          <button type="button" className="ilha-botao ilha-botao-redondo" aria-label={T.ilha.anterior} disabled={!midia.podeVoltar} onClick={midia.anterior}>
            <SkipBack size={15} />
          </button>
          <button type="button" className="ilha-botao ilha-botao-primario ilha-botao-grande" aria-label={midia.tocando ? T.ilha.pausar : T.ilha.tocar} onClick={midia.alternar}>
            {midia.tocando ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button type="button" className="ilha-botao ilha-botao-redondo" aria-label={T.ilha.proxima} disabled={!midia.podeAvancar} onClick={midia.proxima}>
            <SkipForward size={15} />
          </button>
        </div>
        <VolumeDoPlayer />
        </div>
      </div>
    </Cartao>
  );
}

export function VisaoFoco() {
  const p = usePomodoro();
  const materias = useEstudos((s) => s.materias);
  const comEstudos = useConfig((s) => funcaoLigada("estudos", s.funcoesDesligadas));
  const ciclos = useConfig((s) => s.pomodoro.ciclos);
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    setAgora(Date.now());
    if (!p.rodando) return;
    const t = window.setInterval(() => setAgora(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [p.rodando]);
  const restante = restanteAtual(p, agora);
  const progresso = 1 - restante / p.duracaoMs;
  const cor = p.etapa === "foco" ? undefined : "#34d399";
  const iniciado = p.rodando || p.restanteMs != null;

  return (
    <Cartao veu={p.rodando ? (p.etapa === "foco" ? "#f4505e" : "#34d399") : undefined}>
      <div className="linha" style={{ gap: 16, flex: 1 }}>
        <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
          <Anel progresso={progresso} tamanho={96} espessura={5} cor={cor} />
          <span className="ilha-tempo" style={{ position: "absolute", fontSize: 20 }}>{formatarRelogio(restante)}</span>
        </div>
        <div className="coluna" style={{ gap: 8, flex: 1, minWidth: 0 }}>
          <div className="ilha-chips" role="tablist" aria-label={T.ilha.foco}>
            {(["foco", "pausa_curta", "pausa_longa"] as EtapaPomodoro[]).map((e) => (
              <button key={e} type="button" role="tab" className="ilha-chip" aria-pressed={p.etapa === e} aria-selected={p.etapa === e} disabled={iniciado} onClick={() => p.escolherEtapa(e)}>
                {T.pomodoro.etapas[e]}
              </button>
            ))}
          </div>
          <div className="linha">
            {comEstudos && (
              <select
                className="ilha-select"
                aria-label={T.pomodoro.materia}
                value={p.materiaId ?? ""}
                onChange={(e) => p.definirVinculo(e.target.value || undefined, p.tarefaId)}
              >
                <option value="">{T.pomodoro.semMateria}</option>
                {materias.map((m) => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
                ))}
              </select>
            )}
            <span className="ilha-mini numero">{T.pomodoro.ciclo(p.ciclo, ciclos)}</span>
          </div>
          <div className="linha">
            <button type="button" className="ilha-botao ilha-botao-primario" onClick={p.alternar}>
              {p.rodando ? <Pause size={13} /> : <Play size={13} />}
              {p.rodando ? T.pomodoro.pausar : iniciado ? T.pomodoro.continuar : T.pomodoro.iniciar}
            </button>
            <button type="button" className="ilha-botao ilha-botao-icone" aria-label={T.pomodoro.reiniciar} title={T.pomodoro.reiniciar} onClick={p.reiniciar}>
              <RotateCcw size={13} />
            </button>
            <button type="button" className="ilha-botao ilha-botao-icone" aria-label={T.pomodoro.pular} title={T.pomodoro.pular} onClick={p.pular}>
              <FastForward size={13} />
            </button>
          </div>
        </div>
      </div>
    </Cartao>
  );
}

function SecaoHabitos() {
  const habitos = useRotina((s) => s.habitos).filter((h) => !h.arquivado);
  const registros = useRotina((s) => s.registros);
  const registrar = useRotina((s) => s.registrarHabito);
  const hoje = hojeISO();

  return (
    <div className="ilha-hoje-secao">
      <div className="ilha-rolagem">
        {habitos.length === 0 ? (
          <span className="ilha-sub">{T.ilha.semHabitos}</span>
        ) : (
          habitos.map((h) => {
            const valor = registros[hoje]?.[h.id] ?? 0;
            const cumprido = habitoCumprido(h, valor);
            return (
              <div key={h.id} className="ilha-linha">
                {h.tipo === "sim_nao" ? (
                  <Marcador
                    marcado={cumprido}
                    rotulo={h.nome}
                    aoMudar={() => {
                      registrar(hoje, h.id, cumprido ? 0 : 1);
                      if (!cumprido) void tocarSom("pop");
                    }}
                  />
                ) : (
                  <span className="ilha-ponto" style={{ background: cumprido ? "#34d399" : "#4b5059" }} />
                )}
                <span className={`cortar ${cumprido ? "ilha-riscado" : ""}`}>{h.nome}</span>
                {h.tipo === "quantidade" && (
                  <div className="linha" style={{ gap: 4 }}>
                    <button type="button" className="ilha-botao ilha-botao-icone" aria-label={`${T.geral.limpar} 1`} onClick={() => registrar(hoje, h.id, valor - 1)} disabled={valor <= 0}>
                      <Minus size={12} />
                    </button>
                    <span className="ilha-mini numero" style={{ minWidth: 48, textAlign: "center" }}>
                      {valor}/{h.meta} {h.unidade}
                    </span>
                    <button
                      type="button"
                      className="ilha-botao ilha-botao-icone"
                      aria-label={`${T.geral.adicionar} 1`}
                      onClick={() => {
                        registrar(hoje, h.id, valor + 1);
                        if (valor + 1 === h.meta) void tocarSom("proud", "personagens");
                      }}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function VisaoConexoes({ aberta, aoSelecionar }: { aberta: ServicoId | null; aoSelecionar: (servico: ServicoId | null) => void }) {
  const conexoes = useComunicacao((s) => s.conexoes);
  const eventos = useComunicacao((s) => s.eventosConexao);
  const marcarFalhasVistas = useComunicacao((s) => s.marcarFalhasVistas);
  const abrirJanela = useInterface((s) => s.abrirJanelaConexao);
  const irPara = useInterface((s) => s.irPara);
  const lista = [...conexoes].sort((a, b) => Number(b.ligada) - Number(a.ligada) || Number(b.fixadaNaIlha) - Number(a.fixadaNaIlha));
  const ligadas = conexoes.filter((c) => c.ligada).length;
  const atual = conexoes.find((c) => c.id === aberta);

  return (
    <Cartao veu={atual ? `#${MARCAS[atual.id].hex}` : undefined}>
      <AnimatePresence mode="wait" initial={false}>
        {!atual ? (
          <motion.div key="grade" className="coluna" style={{ gap: 8, minHeight: 0, flex: 1 }} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
            <div className="linha-entre">
              <span className="ilha-titulo">{T.ilha.abas.conexoes}</span>
              <span className="ilha-mini numero">{T.ilha.conexoesLigadas(ligadas, conexoes.length)}</span>
            </div>
            <div className="ilha-rolagem">
              <div className="ilha-conexoes-grade">
                {lista.map((c, i) => {
                  const cor = `#${MARCAS[c.id].hex}`;
                  const falhas = falhasNaoVistas(c, eventos);
                  return (
                    <motion.button
                      key={c.id}
                      type="button"
                      className="ilha-conexao-bloco"
                      data-ligada={c.ligada ? "sim" : "nao"}
                      style={{ ["--marca" as string]: cor }}
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: i * 0.03, type: "spring", visualDuration: 0.3, bounce: 0.3 } }}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.96 }}
                      title={conexaoEmTestes(c.id) ? T.conexoes.emTestesDica : undefined}
                      disabled={conexaoEmTestes(c.id)}
                      onClick={() => {
                        void tocarSom("blip");
                        if (falhas > 0) marcarFalhasVistas(c.id);
                        aoSelecionar(c.id);
                      }}
                    >
                      <span className="ilha-conexao-logo"><Marca marca={c.id} tamanho={17} /></span>
                      <span className="ilha-conexao-textos">
                        <span className="ilha-conexao-nome" title={T.conexoes.servicos[c.id].nome}>
                          <span className="ilha-conexao-nome-texto">{T.conexoes.servicos[c.id].nome}</span>
                          <span className="ilha-conexao-estado" data-status={c.ligada ? c.status : "desligada"} />
                        </span>
                        <span className="ilha-conexao-resumo cortar privado">{conexaoEmTestes(c.id) ? T.conexoes.emTestes : c.ligada ? c.resumo || T.conexoes.status[c.status] : T.ilha.conexaoDesligada}</span>
                      </span>
                      {c.ligada && falhas > 0 && <span className="ilha-conexao-selo">{falhas}</span>}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div key={atual.id} className="coluna" style={{ gap: 8, minHeight: 0, flex: 1 }} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0, transition: { type: "spring", visualDuration: 0.28, bounce: 0.2 } }} exit={{ opacity: 0, x: 18, transition: { duration: 0.15 } }}>
            <div className="linha" style={{ gap: 8 }}>
              <button type="button" className="ilha-botao ilha-botao-icone" aria-label={T.geral.voltar} title={T.geral.voltar} onClick={() => aoSelecionar(null)}>
                <ChevronLeft size={14} />
              </button>
              <span className="ilha-conexao-logo" style={{ ["--marca" as string]: `#${MARCAS[atual.id].hex}` }}><Marca marca={atual.id} tamanho={17} /></span>
              <span className="coluna" style={{ gap: 0, minWidth: 0, flex: 1 }}>
                <span className="ilha-titulo">{T.conexoes.servicos[atual.id].nome}</span>
                <span className="ilha-mini cortar">{atual.ligada ? `${T.conexoes.status[atual.status]} . ${atual.ultimaAtualizacao ? T.conexoes.atualizado(horarioRelativo(atual.ultimaAtualizacao)) : T.conexoes.nunca}` : T.ilha.conexaoDesligada}</span>
              </span>
              {conexaoEmTestes(atual.id) ? <span className="ilha-mini">{T.conexoes.emTestes}</span> : atual.ligada ? (
                <button type="button" className="ilha-botao" onClick={() => abrirJanela(atual.id)}>
                  <ArrowUpRight size={13} />
                  {T.ilha.abrirConexao}
                </button>
              ) : (
                <button type="button" className="ilha-botao ilha-botao-primario" onClick={() => irPara("conexoes", { servico: atual.id, aberto: String(Date.now()) })}>
                  {T.ilha.ligarConexao}
                </button>
              )}
            </div>
            {conexaoEmTestes(atual.id) ? <span className="ilha-sub">{T.conexoes.emTestesDica}</span> : atual.ligada && <ConexaoNaIlha servico={atual.id} />}
          </motion.div>
        )}
      </AnimatePresence>
    </Cartao>
  );
}
function SecaoAgenda() {
  const eventos = useOrganizacao((s) => s.eventos);
  const metas = useOrganizacao((s) => s.metas);
  const tarefas = useRotina((s) => s.tarefas);
  const habitos = useRotina((s) => s.habitos);
  const datas = useEstudos((s) => s.datas);
  const revisoes = useEstudos((s) => s.revisoesConteudo);
  const recorrentes = useFinancas((s) => s.recorrentes);
  const irPara = useInterface((i) => i.irPara);
  const recolher = useIlha((i) => i.recolher);
  const hoje = hojeISO();
  const [agora, setAgora] = useState(() => new Date());
  const [mes, setMes] = useState(() => startOfMonth(deISO(hoje)));
  const dias = useMemo(() => eachDayOfInterval({ start: startOfWeek(mes, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(mes), { weekStartsOn: 1 }) }), [mes]);
  const inicio = paraISO(dias[0]);
  const fim = paraISO(dias[dias.length - 1]);
  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const dados = useMemo(() => ({ eventos, metas, tarefas, habitos, datas, revisoes, recorrentes }), [eventos, metas, tarefas, habitos, datas, revisoes, recorrentes, desligadas]);
  const google = usarAgendaGoogle(funcaoLigada("calendario", desligadas) ? [[inicio, fim], [hoje, hoje]] : []);
  const comCompromisso = useMemo(
    () => new Set([...itensDoCalendario(dados, inicio, fim).filter((i) => !repeteTodoDia(i)).map((i) => i.data), ...google.eventos.map((e) => e.data)]),
    [dados, inicio, fim, google.eventos],
  );
  const deHoje = useMemo(() => {
    const doGoogle: ItemDoCalendario[] = google.eventos.filter((e) => e.data === hoje).map((e) => ({ id: `google-${e.id}`, titulo: e.titulo, data: e.data, hora: e.hora, fonte: "google", link: e.link }));
    return [...itensDoCalendario(dados, hoje, hoje), ...doGoogle].sort((a, b) => (a.hora ?? "99").localeCompare(b.hora ?? "99"));
  }, [dados, hoje, google.eventos]);
  const C = T.ilha.calendario;
  const registros = useRotina((s) => s.registros);
  const deHojeOrdenado = [...deHoje].sort((a, b) => Number(itemFeito(a, registros)) - Number(itemFeito(b, registros)));

  useEffect(() => {
    const t = window.setInterval(() => setAgora(new Date()), 15000);
    return () => window.clearInterval(t);
  }, []);

  const abrirDia = (iso: string) => {
    void tocarSom("open");
    irPara("calendario", { data: iso });
    recolher();
  };

  return (
    <div className="ilha-calendario-corpo">
      <div className="ilha-calendario-relogio">
        <span className="ilha-calendario-hora numero">{formatarData(agora, "HH:mm")}</span>
        <span className="ilha-calendario-data">{formatarData(agora, "EEEE, d 'de' MMMM")}</span>
        <div className="ilha-calendario-hoje">
          {deHoje.length === 0 ? (
            <span className="ilha-sub">{C.semNadaHoje}</span>
          ) : (
            <>
              {deHojeOrdenado.slice(0, 3).map((item) => {
                const feito = itemFeito(item, registros);
                return (
                  <div key={item.id} className="ilha-calendario-item" data-feito={feito || undefined}>
                    {podeMarcarFeito(item) && (
                      <button
                        type="button"
                        className="ilha-calendario-check"
                        aria-pressed={feito}
                        aria-label={feito ? T.calendario.desmarcarFeito(item.titulo) : T.calendario.marcarFeito(item.titulo)}
                        title={feito ? T.calendario.desmarcarFeito(item.titulo) : T.calendario.marcarFeito(item.titulo)}
                        onClick={() => {
                          void tocarSom(feito ? "blip" : "approve");
                          marcarItemFeito(item, !feito);
                        }}
                      >
                        {feito && <Check size={10} strokeWidth={3} />}
                      </button>
                    )}
                    <button type="button" className="ilha-calendario-item-abrir" onClick={() => abrirDia(hoje)}>
                      <span className="ilha-calendario-item-hora numero">{item.hora ?? C.diaTodo}</span>
                      <span className="cortar privado">{item.titulo}</span>
                    </button>
                  </div>
                );
              })}
              {deHoje.length > 3 && <span className="ilha-mini">{C.maisHoje(deHoje.length - 3)}</span>}
            </>
          )}
        </div>
      </div>
      <div className="ilha-calendario-mes-bloco">
        <div className="linha-entre">
          <span className="ilha-titulo ilha-calendario-mes">{formatarData(mes, "MMMM 'de' yyyy")}</span>
          <div className="linha" style={{ gap: 2 }}>
            {!isSameMonth(mes, deISO(hoje)) && (
              <button type="button" className="ilha-botao-texto" onClick={() => setMes(startOfMonth(deISO(hoje)))}>{C.hoje}</button>
            )}
            <button type="button" className="ilha-acao" aria-label={C.anterior} title={C.anterior} onClick={() => setMes((m) => addMonths(m, -1))}><ChevronLeft size={14} /></button>
            <button type="button" className="ilha-acao" aria-label={C.proximo} title={C.proximo} onClick={() => setMes((m) => addMonths(m, 1))}><ChevronRight size={14} /></button>
          </div>
        </div>
        <div className="ilha-calendario" role="grid" aria-label={formatarData(mes, "MMMM 'de' yyyy")}>
          {dias.slice(0, 7).map((d) => (
            <span key={`s-${d.getDay()}`} className="ilha-calendario-semana" aria-hidden="true">{formatarData(d, "EEEEE")}</span>
          ))}
          {dias.map((d) => {
            const iso = paraISO(d);
            const marcado = comCompromisso.has(iso);
            const rotulo = formatarData(d, "d 'de' MMMM");
            return (
              <button
                key={iso}
                type="button"
                role="gridcell"
                className="ilha-calendario-dia numero"
                data-hoje={iso === hoje || undefined}
                data-fora={!isSameMonth(d, mes) || undefined}
                aria-label={marcado ? C.diaComCompromisso(rotulo) : C.abrirDia(rotulo)}
                title={marcado ? C.diaComCompromisso(rotulo) : C.abrirDia(rotulo)}
                onClick={() => abrirDia(iso)}
              >
                {d.getDate()}
                {marcado && <span className="ilha-calendario-ponto" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function VisaoAvisos() {
  const alertas = useAgentes((s) => s.alertas);
  const resolver = useAgentes((s) => s.resolverAlerta);
  const nomes = useConfig((c) => c.agentes.nomes);
  const irPara = useInterface((i) => i.irPara);
  const abrirJanela = useInterface((i) => i.abrirJanelaConexao);
  const recolher = useIlha((i) => i.recolher);
  const atual = alertas[0];

  if (!atual) {
    return (
      <Cartao>
        <div className="linha" style={{ gap: 10 }}>
          <Bell size={16} color="#8e939c" />
          <span className="ilha-sub">{T.ilha.semAvisos}</span>
        </div>
      </Cartao>
    );
  }

  return (
    <Cartao veu="#f5a524">
      <div className="linha" style={{ gap: 12, flex: 1 }}>
        <div className="coluna" style={{ gap: 4, flex: 1, minWidth: 0 }}>
          <span className="ilha-mini">{nomes[atual.agenteId]}</span>
          <span className="ilha-titulo privado" style={{ fontWeight: 500 }}>{atual.texto}</span>
          {alertas.length > 1 && <span className="ilha-mini numero">{T.ilha.fila(alertas.length - 1)}</span>}
        </div>
      </div>
      <div className="linha">
        {(atual.rota || atual.servico) && (
          <button
            type="button"
            className="ilha-botao ilha-botao-primario"
            onClick={() => {
              if (atual.servico) abrirJanela(atual.servico);
              else if (atual.rota) irPara(atual.rota);
              resolver(atual.id);
              recolher();
            }}
          >
            <ArrowUpRight size={13} />
            {T.ilha.verAviso}
          </button>
        )}
        <button
          type="button"
          className="ilha-botao"
          onClick={() => {
            resolver(atual.id);
            void tocarSom("approve");
          }}
        >
          {T.ilha.dispensar}
        </button>
      </div>
    </Cartao>
  );
}
