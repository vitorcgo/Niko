import { useEffect } from "react";
import { useConfig, type CategoriaDeAviso } from "../estado/configuracoes";
import { usePomodoro } from "../estado/pomodoro";
import { useAgentes } from "../estado/agentes";
import { avisoLigado, useIlha } from "../estado/ilha";
import { useMidia } from "../estado/midia";
import { useInterface } from "../estado/interface";
import { limparExemplos, limparSimulacoes } from "../dados/limparExemplos";
import { useOrganizacao } from "../estado/organizacao";
import { useFinancas, gastoPorCategoria, saldosComPessoas } from "../estado/financas";
import { useComunicacao, SERVICOS } from "../estado/comunicacao";
import { useRotina, habitoCumprido } from "../estado/rotina";
import { useEstudos } from "../estado/estudos";
import { useConquistas, CONQUISTAS } from "../estado/conquistas";
import { tocarSom } from "../ponte/sons";
import { usarPreferenciasDaJanela } from "./usarPreferenciasDaJanela";
import { hojeISO, paraISO, descreverDistancia } from "../utilitarios/datas";
import { minutosEstudoPorDia, sequenciaDias, sequenciaHabito } from "../utilitarios/estatisticas";
import { conexoesPonte, resumoDe, ocorrenciasDe, type DadosGithub } from "../ponte/conexoesReais";
import { guardarCommits } from "../utilitarios/estatisticas";
import { marcarSeNovo } from "../ponte/armazenamento";
import { lerConsumo } from "../ponte/ponteLocal";
import { rotuloJanela } from "../utilitarios/consumo";
import { T } from "../textos/textos";
import { conexaoEmTestes } from "../utilitarios/disponibilidadeConexoes";
import type { Evento, Habito, ServicoId } from "../tipos";
import { addDays, addMonths, addWeeks } from "date-fns";
import { conquistaLigada, funcaoLigada } from "../utilitarios/funcoes";

function notificar(titulo: string, corpo: string, categoria?: CategoriaDeAviso) {
  if (useConfig.getState().naoPerturbe || !avisoLigado(categoria)) return;
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) new Notification(titulo, { body: corpo });
  } catch {
    return;
  }
}

export function eventoDisparaEm(e: Evento, agora: Date): string | null {
  if (e.tipo !== "lembrete" || !e.hora) return null;
  let data = new Date(`${e.data}T${e.hora}:00`);
  if (e.repeticao !== "nenhuma") {
    const proxima = (d: Date) => (e.repeticao === "diaria" ? addDays(d, 1) : e.repeticao === "semanal" ? addWeeks(d, 1) : addMonths(d, 1));
    let protecao = 0;
    while (data < new Date(agora.getTime() - 86400000) && protecao < 2000) {
      data = proxima(data);
      protecao++;
    }
    const pular = new Set(e.excecoes ?? []);
    while (pular.has(paraISO(data)) && data <= agora && protecao < 2100) {
      data = proxima(data);
      protecao++;
    }
  }
  if (data > agora) return null;
  if ((e.feitos ?? []).includes(paraISO(data))) return null;
  if (agora.getTime() - data.getTime() > 6 * 3600000) return null;
  const chave = data.toISOString();
  if (e.ultimoDisparo && e.ultimoDisparo >= chave) return null;
  return chave;
}

function verificarPomodoro() {
  const p = usePomodoro.getState();
  if (!p.rodando || !p.terminaEm) return;
  const falta = p.terminaEm - Date.now();
  if (falta > 0 && falta <= 10000 && !document.hidden && useConfig.getState().pomodoro.tique) void tocarSom("tick", "pomodoro");
  if (falta > 0) return;
  const atrasoMs = Date.now() - p.terminaEm;
  const situacao = atrasoMs > 120000 ? "interrompida" : "concluida";
  const etapa = p.concluirEtapa(situacao);
  const texto = etapa === "foco" ? T.pomodoro.fimFoco : T.pomodoro.fimPausa;
  void tocarSom("finish", "pomodoro");
  useIlha.getState().revelar({ texto, tipo: "sucesso", agente: "organizador", aba: "foco" }, 4500, "alta");
  useAgentes.getState().registrar("organizador", texto);
  notificar(T.app.nome, texto);
}

function verificarLembretes() {
  if (!funcaoLigada("calendario")) return;
  const agora = new Date();
  const org = useOrganizacao.getState();
  for (const e of org.eventos) {
    const disparo = eventoDisparaEm(e, agora);
    if (!disparo) continue;
    org.atualizarEvento(e.id, { ultimoDisparo: disparo });
    const texto = T.calendario.lembreteDisparado(e.titulo);
    useAgentes.getState().alertar("organizador", texto, "calendario", "wink", undefined, true);
    notificar(T.app.nome, texto, "lembretes");
  }
}

function verificarDatas() {
  if (!funcaoLigada("estudos")) return;
  const hoje = hojeISO();
  const base = new Date(`${hoje}T00:00:00`).getTime();
  for (const d of useEstudos.getState().datas) {
    if (d.concluida || d.data < hoje) continue;
    const faltam = Math.round((new Date(`${d.data}T00:00:00`).getTime() - base) / 86400000);
    const nivel = [0, 1, 3, 7].find((n) => faltam <= n);
    if (nivel === undefined || !marcarSeNovo(`data-${d.id}-${nivel}`)) continue;
    const texto = T.falas.tutor.prova(`${T.estudos.tiposData[d.tipo]}: ${d.titulo}`, descreverDistancia(d.data));
    useAgentes.getState().alertar("tutor", texto, "estudos", "question");
    notificar(T.app.nome, texto, "estudos");
  }
}

async function verificarLimitesPlanos() {
  if (!useConfig.getState().consumo.lerPlanos || document.hidden) return;
  try {
    const dados = await lerConsumo();
    for (const f of dados.ferramentas) {
      if (f.situacao !== "ok") continue;
      for (const j of f.janelas) {
        if (j.usado < 80) continue;
        const nivel = j.usado >= 100 ? 100 : 80;
        const reinicio = j.reiniciaEm ? Math.round(new Date(j.reiniciaEm).getTime() / 3600000) : hojeISO();
        if (!marcarSeNovo(`limite-${f.id}-${j.id}-${reinicio}-${nivel}`)) continue;
        const texto = T.consumo.alertaLimite(f.nome, rotuloJanela(j.rotulo), Math.round(j.usado));
        if (useAgentes.getState().alertas.some((a) => a.texto === texto)) continue;
        useAgentes.getState().alertar("operador", texto, "consumo", "rate");
      }
    }
  } catch {
    return;
  }
}

function verificarOrcamento() {
  if (!funcaoLigada("financas")) return;
  const fin = useFinancas.getState();
  const mes = hojeISO().slice(0, 7);
  const gastos = gastoPorCategoria(fin, mes);
  for (const c of fin.categorias) {
    if (c.tipo !== "despesa" || c.orcamento <= 0) continue;
    const gasto = gastos.get(c.id) ?? 0;
    const nivel = gasto >= c.orcamento ? "100" : gasto >= c.orcamento * 0.8 ? "80" : null;
    if (!nivel) continue;
    if (!marcarSeNovo(`orcamento-${mes}-${c.id}-${nivel}`)) continue;
    const ja = useAgentes.getState().alertas.some((a) => a.texto === T.financas.estourou(c.nome) || a.texto === T.financas.perto(c.nome));
    if (ja && nivel === "80") continue;
    useAgentes.getState().alertar("operador", nivel === "100" ? T.financas.estourou(c.nome) : T.financas.perto(c.nome), "financas", nivel === "100" ? "annoyed" : "question");
  }
}

function verificarConquistas() {
  if (!useConfig.getState().conquistasAtivas) return;
  const registrar = useConquistas.getState().registrar;
  const rotina = useRotina.getState();
  const estudos = useEstudos.getState();
  const pomodoro = usePomodoro.getState();
  const fin = useFinancas.getState();
  const org = useOrganizacao.getState();
  const alcancadas: { codigo: string; nivel: number }[] = [];
  const nivelPor = (codigo: string, valor: number) => {
    const def = CONQUISTAS.find((c) => c.codigo === codigo);
    if (!def) return;
    if (!conquistaLigada(codigo)) return;
    const nivel = [...def.niveis].reverse().find((n) => valor >= n);
    if (nivel && registrar(codigo, nivel)) alcancadas.push({ codigo, nivel });
  };

  nivelPor("primeira_semana", sequenciaDias(new Set(rotina.diasAbertos)));
  nivelPor("sequencia_habito", Math.max(0, ...rotina.habitos.filter((h) => !h.arquivado).map((h) => sequenciaHabito(h, rotina.registros))));
  nivelPor("foco", pomodoro.sessoes.filter((s) => s.etapa === "foco" && s.situacao === "concluida").length);
  nivelPor("revisor", estudos.registroRevisoes.reduce((a, r) => a + r.quantidade, 0));
  nivelPor("maratona", minutosEstudoPorDia(pomodoro.sessoes).get(hojeISO()) ?? 0);
  nivelPor("prova_vencida", estudos.datas.filter((d) => d.tipo === "prova" && d.concluida).length);
  nivelPor("meta_economia", fin.metasEconomia.filter((m) => m.alvo > 0 && m.guardado >= m.alvo).length);
  const saldos = saldosComPessoas(fin);
  if (fin.divisoes.length > 0 && [...saldos.values()].every((v) => v === 0)) nivelPor("sem_pendencias", 1);
  nivelPor("meta_vida", org.metas.filter((m) => m.tipo === "manual" && m.alvo > 0 && m.atual >= m.alvo).length);
  const mesPassado = paraISO(addMonths(new Date(), -1)).slice(0, 7);
  const comOrcamento = fin.categorias.filter((c) => c.tipo === "despesa" && c.orcamento > 0);
  if (comOrcamento.length > 0 && fin.transacoes.some((t) => t.data.startsWith(mesPassado))) {
    const gastos = gastoPorCategoria(fin, mesPassado);
    if (comOrcamento.every((c) => (gastos.get(c.id) ?? 0) <= c.orcamento)) nivelPor("orcamento_em_dia", 1);
  }

  for (const a of alcancadas) {
    const def = CONQUISTAS.find((c) => c.codigo === a.codigo);
    if (!def) continue;
    const nome = T.conquistas.itens[a.codigo]?.nome ?? a.codigo;
    if (avisoLigado("conquistas")) void tocarSom("proud", "personagens");
    useIlha.getState().revelar({ texto: T.conquistas.comemoracao(nome), tipo: "sucesso", agente: def.agente, categoria: "conquistas" }, 4200);
    useAgentes.getState().registrar(def.agente, T.conquistas.comemoracao(nome));
  }
}

export function habitosNaHora(habitos: Habito[], registrosDeHoje: Record<string, number> | undefined, agora: Date): Habito[] {
  const minutos = agora.getHours() * 60 + agora.getMinutes();
  return habitos.filter((h) => {
    if (h.arquivado || !h.hora || habitoCumprido(h, registrosDeHoje?.[h.id])) return false;
    const [hh, mm] = h.hora.split(":").map(Number);
    const atraso = minutos - (hh * 60 + mm);
    return atraso >= 0 && atraso <= 6 * 60;
  });
}

function avisarHabitosNaHora() {
  if (!funcaoLigada("journal")) return;
  const hoje = hojeISO();
  const rotina = useRotina.getState();
  for (const h of habitosNaHora(rotina.habitos, rotina.registros[hoje], new Date())) {
    if (!marcarSeNovo(`habito-hora-${h.id}-${hoje}`)) continue;
    const texto = T.journal.habitoNaHora(h.nome);
    useAgentes.getState().alertar("organizador", texto, "journal", "wink", undefined, true);
    notificar(T.app.nome, texto, "habitos");
  }
}

function lembrarHabitos() {
  if (!funcaoLigada("journal")) return;
  const agora = new Date();
  if (agora.getHours() < 21) return;
  const hoje = hojeISO();
  const rotina = useRotina.getState();
  const pendentes = rotina.habitos.filter((h) => !h.arquivado && !habitoCumprido(h, rotina.registros[hoje]?.[h.id]));
  if (pendentes.length === 0 || !marcarSeNovo(`habitos-${hoje}`)) return;
  useAgentes.getState().alertar("organizador", T.falas.organizador.habitos(pendentes.length), "journal", "question");
}

async function acertarConexoes() {
  try {
    const estado = await conexoesPonte.estado();
    const com = useComunicacao.getState();
    for (const c of com.conexoes) {
      const real = estado[c.id]?.temChave ?? false;
      if (c.chaveSalva && !real) com.atualizarConexao(c.id, { chaveSalva: false, ligada: false, status: "sem_chave", resumo: "" });
      if (!c.chaveSalva && real) com.atualizarConexao(c.id, { chaveSalva: true, ligada: true, status: "conectado" });
    }
  } catch {
    const com = useComunicacao.getState();
    for (const c of com.conexoes) if (c.chaveSalva) com.atualizarConexao(c.id, { status: "sem_internet" });
  }
}

const proximaLeitura = new Map<ServicoId, number>();
const LEITURA_COM_CI_RODANDO_MS = 60_000;
const emLeitura = new Set<ServicoId>();
const vistas = new Map<ServicoId, Set<string>>();

export async function atualizarConexaoAgora(id: ServicoId, forcar = true) {
  if (conexaoEmTestes(id)) return;
  if (emLeitura.has(id)) return;
  emLeitura.add(id);
  const com = useComunicacao.getState();
  try {
    const dados = await conexoesPonte.ler(id, forcar);
    com.atualizarConexao(id, { ultimaAtualizacao: new Date().toISOString(), resumo: resumoDe(id, dados), status: "conectado" });
    if (id === "github") {
      const g = dados as DadosGithub;
      guardarCommits(g.commitsPorDia ?? {});
      if (g.actions.some((a) => a.status === "rodando") || g.prs.some((p) => p.ci === "rodando")) {
        proximaLeitura.set(id, Math.min(proximaLeitura.get(id) ?? Infinity, Date.now() + LEITURA_COM_CI_RODANDO_MS));
      }
    }
    const ocorrencias = ocorrenciasDe(id, dados);
    const conhecidas = vistas.get(id);
    if (!conhecidas) {
      vistas.set(id, new Set(ocorrencias.map((o) => o.chave)));
      return;
    }
    for (const o of [...ocorrencias].reverse()) {
      if (conhecidas.has(o.chave)) continue;
      conhecidas.add(o.chave);
      com.registrarEventoConexao({ servico: id, texto: o.texto, tipo: o.tipo });
      if (o.tipo === "falha") useAgentes.getState().alertar("java", o.texto, "conexoes", "error", id);
      else {
        useAgentes.getState().registrar("java", o.texto);
        useIlha.getState().revelar({ texto: o.texto, tipo: "sucesso", marca: id, aba: "conexoes" }, 3800, "normal");
      }
    }
  } catch (e) {
    const mensagem = (e as Error).message;
    com.atualizarConexao(id, { status: /sem_chave/.test(mensagem) ? "sem_chave" : /fetch|rede|ENOTFOUND|timeout/i.test(mensagem) ? "sem_internet" : "erro", ultimaAtualizacao: new Date().toISOString() });
  } finally {
    emLeitura.delete(id);
  }
}

function lerConexoes() {
  if (useConfig.getState().pausarConexoes) return;
  const com = useComunicacao.getState();
  const agora = Date.now();
  for (const id of SERVICOS) {
    const c = com.conexoes.find((x) => x.id === id);
    if (!c || !c.ligada || !c.chaveSalva) continue;
    const proxima = proximaLeitura.get(id) ?? 0;
    if (agora < proxima) continue;
    proximaLeitura.set(id, agora + Math.max(30, c.intervalo) * 1000);
    void atualizarConexaoAgora(id, false);
  }
}
export function useServicos() {
  useEffect(() => {
    const falhou = () => useInterface.getState().avisar(T.configuracoes.salvarFalhou);
    window.addEventListener("niko:armazenamento-falhou", falhou);
    return () => window.removeEventListener("niko:armazenamento-falhou", falhou);
  }, []);
  const inatividade = useConfig((s) => s.agentes.inatividadeMin);

  usarPreferenciasDaJanela();

  useEffect(() => {
    const limpouExemplos = limparExemplos();
    const limpouSimulacoes = limparSimulacoes();
    if (limpouExemplos || limpouSimulacoes) useInterface.getState().avisar(T.configuracoes.exemplosRemovidos);
    void acertarConexoes();
    useRotina.getState().marcarAbertura();
    useFinancas.getState().garantirCategorias();
    useOrganizacao.getState().garantirPilares();
    const estudos = useEstudos.getState();
    const paginasExistentes = new Set(estudos.paginas.map((p) => p.id));
    if (estudos.revisoesConteudo.some((r) => !paginasExistentes.has(r.paginaId))) useEstudos.setState({ revisoesConteudo: estudos.revisoesConteudo.filter((r) => paginasExistentes.has(r.paginaId)) });
    const gerados = useFinancas.getState().gerarRecorrentes();
    if (gerados > 0 && funcaoLigada("financas")) useAgentes.getState().registrar("operador", T.financas.abas.recorrentes);
    verificarPomodoro();
    verificarConquistas();
  }, []);

  useEffect(() => {
    let rapido: number | undefined;
    let lento: number | undefined;
    let planos: number | undefined;
    let midia: number | undefined;
    const iniciar = () => {
      parar();
      planos = window.setInterval(() => void verificarLimitesPlanos(), 5 * 60000);
      void useMidia.getState().sincronizar();
      midia = window.setInterval(() => void useMidia.getState().sincronizar(), 2500);
      void verificarLimitesPlanos();
      verificarDatas();
      rapido = window.setInterval(() => {
        verificarPomodoro();
        lerConexoes();
      }, 1000);
      lento = window.setInterval(() => {
        verificarLembretes();
        avisarHabitosNaHora();
        verificarOrcamento();
        verificarConquistas();
        lembrarHabitos();
        verificarDatas();
        useAgentes.getState().verificarSono(inatividade);
        useRotina.getState().marcarAbertura();
        useFinancas.getState().gerarRecorrentes();
      }, 20000);
      verificarLembretes();
      avisarHabitosNaHora();
      verificarOrcamento();
    };
    const parar = () => {
      window.clearInterval(rapido);
      window.clearInterval(lento);
      window.clearInterval(planos);
      window.clearInterval(midia);
    };
    const aoMudarVisibilidade = () => {
      if (document.hidden) {
        parar();
        rapido = window.setInterval(verificarPomodoro, 5000);
      } else iniciar();
    };
    iniciar();
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => {
      parar();
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [inatividade]);
}
