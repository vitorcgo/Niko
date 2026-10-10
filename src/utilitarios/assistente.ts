import type { AgenteId, CartaoConfirmacao, Mensagem } from "../tipos";
import { estadoDaPonte, conversarIa, testarProvedor, type Provedor, type MensagemPonteIa, type ChamadaFerramenta } from "../ponte/ponteLocal";
import { useConfig } from "../estado/configuracoes";
import { useComunicacao } from "../estado/comunicacao";
import { AGENTES } from "../estado/agentes";
import { definicoesFerramentas, executarFerramenta } from "./ferramentasIa";
import { preferenciasDoAgente, promptDoAgente } from "./contextoIa";
import { agentePeloAssunto } from "./intencoes";
import { gerarId, normalizarTexto } from "./basicos";
import { hojeISO } from "./datas";
import { textoComAnexos, imagensDaMensagem } from "./anexos";
import { T } from "../textos/textos";
import { afirmaExecucao, removerPrefixoDeAgente } from "./recursosChat";

export interface ProvedorEmUso {
  provedor: Provedor;
  modelo: string;
}

export interface RespostaAssistente {
  texto: string;
  confirmacoes: CartaoConfirmacao[];
  acoes: string[];
  origem: string | null;
  trocas: string[];
  falha: string | null;
  parado: boolean;
  exigirConfirmacao?: boolean;
  cortada?: "cortado" | "so_raciocinio";
}

export function modeloDoProvedor(p: Provedor): string {
  const ia = useConfig.getState().ia;
  return ia.modelos?.[p.id] || (p.id === ia.provedorId ? ia.modelo : "") || p.modelo;
}

export async function provedoresEmOrdem(forcar = false): Promise<ProvedorEmUso[]> {
  const ia = useConfig.getState().ia;
  const estado = await estadoDaPonte(forcar);
  const ids = [...new Set([ia.provedorId, ...(ia.reservas ?? [])].filter((x): x is string => Boolean(x)))];
  return ids
    .map((id) => estado.provedores.find((p) => p.id === id))
    .filter((p): p is Provedor => Boolean(p))
    .map((provedor) => ({ provedor, modelo: modeloDoProvedor(provedor) }));
}

export function acharMencao(texto: string): AgenteId | undefined {
  const nomes = useConfig.getState().agentes.nomes;
  const inicio = /^@([\p{L}\d_-]+)/u.exec(texto.trim())?.[1];
  if (!inicio) return undefined;
  const alvo = normalizarTexto(inicio);
  return AGENTES.find((a) => normalizarTexto(nomes[a]) === alvo || a === alvo);
}

export function escolherAgente(texto: string): AgenteId {
  return acharMencao(texto) ?? agentePeloAssunto(texto);
}

export function historicoParaIa(mensagens: Mensagem[], agente: AgenteId, pedido: Mensagem | string): MensagemPonteIa[] {
  const nomes = useConfig.getState().agentes.nomes;
  const anteriores = mensagens.filter((m) => !m.repetir && !m.erro && (m.texto.trim() || m.anexos?.length)).slice(-16).map((m): MensagemPonteIa => ({
    papel: m.autor === "usuario" ? "usuario" : "assistente",
    texto: m.autor === "agente" && m.agenteId !== agente ? `${nomes[m.agenteId]}: ${m.texto}` : textoComAnexos(m.texto, m.anexos),
  }));
  const ultimo: MensagemPonteIa =
    typeof pedido === "string"
      ? { papel: "usuario", texto: pedido }
      : { papel: "usuario", texto: textoComAnexos(pedido.texto, pedido.anexos), imagens: imagensDaMensagem(pedido.id) };
  return [...anteriores, ultimo];
}

const semFerramentas = new Set<string>();
const modelosDoProvedor = new Map<string, Promise<string[]>>();

function familia(modelo: string): string {
  return modelo.toLowerCase().split(/[-_/:.\d]/).filter(Boolean)[0] ?? "";
}

async function modeloIrmao(provedor: Provedor, atual: string, usados: Set<string>): Promise<string | null> {
  if (!modelosDoProvedor.has(provedor.id)) modelosDoProvedor.set(provedor.id, testarProvedor(provedor.id).then((r) => (r.ok ? r.modelos : [])).catch(() => []));
  const lista = await modelosDoProvedor.get(provedor.id)!;
  const fam = familia(atual);
  const tipoAtual = /lite|mini|small|nano/.test(atual) ? "leve" : /pro|large|opus/.test(atual) ? "grande" : "medio";
  const candidatos = lista
    .filter((m) => m !== atual && familia(m) === fam && !usados.has(`${provedor.id}|${m}`) && !/(preview|exp|tts|image|audio|live|embedding|vision-only|thinking)/i.test(m))
    .sort((a, b) => {
      const peso = (m: string) => ((/lite|mini|small|nano/.test(m) ? "leve" : /pro|large|opus/.test(m) ? "grande" : "medio") === tipoAtual ? 0 : 1);
      return peso(a) - peso(b) || b.localeCompare(a, undefined, { numeric: true });
    });
  const escolhido = candidatos[0] ?? null;
  if (escolhido) {
    const ia = useConfig.getState().ia;
    useConfig.getState().definir({ ia: { ...ia, modelos: { ...ia.modelos, [provedor.id]: escolhido }, ...(ia.provedorId === provedor.id ? { modelo: escolhido } : {}) } });
  }
  return escolhido;
}

export function registrarUso(uso: { entrada: number; saida: number; provedor: string; modelo: string }, agente: AgenteId) {
  const lista = useComunicacao.getState().usoIa;
  useComunicacao.getState().definirUsoIa([...lista, { id: gerarId(), data: hojeISO(), provedor: uso.provedor, modelo: uso.modelo, agenteId: agente, entrada: uso.entrada, saida: uso.saida }]);
}

export function textoAteUltimaFrase(texto: string): string {
  const fim = Math.max(...[". ", "! ", "? ", ".\n", "!\n", "?\n", ":\n", "\n\n"].map((m) => texto.lastIndexOf(m)));
  return fim < 0 ? "" : texto.slice(0, fim + 1).trimEnd();
}

export async function perguntarAssistente(opcoes: {
  agente: AgenteId;
  historico: MensagemPonteIa[];
  sinal: AbortSignal;
  aoTexto?: (texto: string) => void;
  apenasAnalise?: boolean;
}): Promise<RespostaAssistente> {
  const resposta: RespostaAssistente = { texto: "", confirmacoes: [], acoes: [], origem: null, trocas: [], falha: null, parado: false };
  const fila = await provedoresEmOrdem();
  if (fila.length === 0) {
    resposta.falha = "sem_provedor";
    return resposta;
  }
  const sistema = promptDoAgente(opcoes.agente, opcoes.apenasAnalise);
  const preferencias = opcoes.apenasAnalise ? null : preferenciasDoAgente(opcoes.agente);
  const personaPersonalizada = preferencias !== null;
  resposta.exigirConfirmacao = personaPersonalizada;
  const definicoes = opcoes.apenasAnalise ? [] : definicoesFerramentas(personaPersonalizada);
  const permitidas = new Set(definicoes.map((f) => f.nome));
  const errosFerramenta: string[] = [];
  const textosVerificados: string[] = [];
  let analiseBloqueada = false;
  let modeloSemFerramentas = false;
  const mensagens = [...(preferencias ? [preferencias] : []), ...opcoes.historico];
  let indice = 0;
  let ultimoErro = "";
  const tentativas = new Map<number, number>();
  const usados = new Set(fila.map((f) => `${f.provedor.id}|${f.modelo}`));

  const nomesDosAgentes = [...Object.values(useConfig.getState().agentes.nomes), ...AGENTES, "Rubi", "Nanquim", "Sol", "Java"];
  let exibicaoLiberada = Boolean(opcoes.aoTexto);
  let ultimoExibido = "";
  const exibirParcial = (texto: string) => {
    if (!exibicaoLiberada) return;
    const completo = textoAteUltimaFrase(texto);
    if (!opcoes.apenasAnalise && afirmaExecucao(completo)) {
      exibicaoLiberada = false;
      if (ultimoExibido) opcoes.aoTexto?.("");
      return;
    }
    const limpo = removerPrefixoDeAgente(completo, nomesDosAgentes);
    if (limpo === ultimoExibido) return;
    ultimoExibido = limpo;
    opcoes.aoTexto?.(limpo);
  };
  const encerrarExibicao = () => {
    if (!exibicaoLiberada) return;
    exibicaoLiberada = false;
    if (ultimoExibido) opcoes.aoTexto?.("");
  };

  for (let passo = 0; passo < 8; passo++) {
    let textoPasso = "";
    let chamadas: ChamadaFerramenta[] = [];
    let erro: string | null = null;
    let fim: { entrada: number; saida: number; provedor: string; modelo: string } | null = null;

    while (indice < fila.length) {
      const { provedor, modelo } = fila[indice];
      const chave = `${provedor.id}|${modelo}`;
      modeloSemFerramentas = semFerramentas.has(chave);
      textoPasso = "";
      chamadas = [];
      erro = null;
      fim = null;
      try {
        for await (const ev of conversarIa({ provedorId: provedor.id, modelo: modelo || undefined, sistema, mensagens, ferramentas: semFerramentas.has(chave) ? undefined : definicoes }, opcoes.sinal)) {
          if (ev.tipo === "texto" && ev.texto) {
            textoPasso += ev.texto;
            if (passo === 0 && chamadas.length === 0) exibirParcial(textoPasso);
          } else if (ev.tipo === "ferramenta" && ev.chamada) {
            chamadas.push(ev.chamada);
            encerrarExibicao();
          }
          else if (ev.tipo === "aviso" && (ev.texto === "cortado" || ev.texto === "so_raciocinio")) resposta.cortada = ev.texto;
          else if (ev.tipo === "aviso" && ev.texto === "sem_ferramentas") {
            semFerramentas.add(chave);
            modeloSemFerramentas = true;
          }
          else if (ev.tipo === "erro") {
            erro = ev.texto || "erro";
            break;
          } else if (ev.tipo === "fim") fim = { entrada: ev.entrada ?? 0, saida: ev.saida ?? 0, provedor: ev.provedor ?? provedor.nome, modelo: ev.modelo ?? modelo };
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") resposta.parado = true;
        else erro = T.chat.semPonte;
      }
      if (resposta.parado) break;
      if (erro && erro !== "cancelado" && !textoPasso && chamadas.length === 0) {
        ultimoErro = erro;
        const tipo = classificarErroIa(erro).tipo;
        const feitas = tentativas.get(indice) ?? 0;
        if (tipo === "cota" && feitas < 2) {
          tentativas.set(indice, feitas + 1);
          const irmao = await modeloIrmao(provedor, modelo, usados);
          if (irmao) {
            usados.add(`${provedor.id}|${irmao}`);
            resposta.trocas.push(`${provedor.nome} . ${modelo}`);
            fila[indice] = { provedor, modelo: irmao };
            continue;
          }
        }
        if ((tipo === "sobrecarga" || tipo === "limite" || tipo === "tempo") && feitas < 1) {
          tentativas.set(indice, feitas + 1);
          opcoes.aoTexto?.("");
          await new Promise((r) => window.setTimeout(r, tipo === "limite" ? 3000 : 1500));
          if (opcoes.sinal.aborted) {
            resposta.parado = true;
            break;
          }
          continue;
        }
        resposta.trocas.push(provedor.nome);
        indice++;
        continue;
      }
      resposta.origem = `${provedor.nome} . ${modelo}`;
      break;
    }

    if (chamadas.length === 0) resposta.texto = textoPasso;
    if (fim) registrarUso(fim, opcoes.agente);
    if (resposta.parado) break;
    if (indice >= fila.length) {
      resposta.falha = ultimoErro || "erro";
      break;
    }
    if (erro) {
      resposta.falha = erro;
      break;
    }
    if (chamadas.length === 0) break;

    mensagens.push({ papel: "assistente", texto: textoPasso, chamadas });
    let continuar = false;
    for (const c of chamadas) {
      if (opcoes.sinal.aborted) { resposta.parado = true; break; }
      if (opcoes.apenasAnalise) { analiseBloqueada = true; break; }
      if (modeloSemFerramentas || !permitidas.has(c.nome)) {
        const mensagem = T.chat.confianca.ferramentaIndisponivel(c.nome);
        errosFerramenta.push(mensagem);
        mensagens.push({ papel: "ferramenta", idChamada: c.id, texto: mensagem });
        continuar = true;
        continue;
      }
      const r = await executarFerramenta(c.nome, c.argumentos, personaPersonalizada);
      if (r.tipo === "dados") {
        if (r.resumo) resposta.acoes.push(r.resumo);
        if (r.textoVerificado) textosVerificados.push(r.textoVerificado);
        mensagens.push({ papel: "ferramenta", idChamada: c.id, texto: JSON.stringify(r.conteudo).slice(0, 12000) });
        continuar = true;
      } else if (r.tipo === "confirmar") {
        resposta.confirmacoes.push(r.cartao);
        mensagens.push({ papel: "ferramenta", idChamada: c.id, texto: T.chat.ferramentas.aguardandoConfirmacao });
      } else {
        errosFerramenta.push(r.mensagem);
        mensagens.push({ papel: "ferramenta", idChamada: c.id, texto: `Erro: ${r.mensagem}` });
        continuar = true;
      }
    }
    if (!continuar) break;
  }

  resposta.texto = removerPrefixoDeAgente(resposta.texto, nomesDosAgentes);
  if (analiseBloqueada) resposta.texto = T.chat.confianca.analiseBloqueada;
  else if (textosVerificados.length || resposta.acoes.length || resposta.confirmacoes.length || errosFerramenta.length) {
    resposta.texto = [
      ...textosVerificados,
      ...resposta.acoes,
      ...(resposta.confirmacoes.length ? [T.chat.ferramentas.confira(resposta.confirmacoes.length)] : []),
      ...(errosFerramenta.length ? [T.chat.confianca.falhaFerramenta([...new Set(errosFerramenta)].join("; "))] : []),
    ].join("\n\n");
  } else if (!opcoes.apenasAnalise && afirmaExecucao(resposta.texto)) resposta.texto = T.chat.confianca.semExecucao;
  if (modeloSemFerramentas && !opcoes.apenasAnalise) resposta.texto = [resposta.texto, T.chat.confianca.semFerramentas].filter(Boolean).join("\n\n");
  if (resposta.cortada && resposta.texto.trim()) resposta.texto = `${resposta.texto}\n\n${T.chat.confianca.respostaCortada}`;
  opcoes.aoTexto?.(resposta.texto);
  return resposta;
}

export type TipoErroIa = "cota" | "sobrecarga" | "limite" | "chave" | "modelo" | "recusado" | "tempo" | "rede" | "ponte" | "sem_provedor" | "outro";

export function classificarErroIa(erro: string): { tipo: TipoErroIa; status: number | null } {
  const status = Number(/http_(\d{3})/.exec(erro)?.[1]) || null;
  const texto = erro.toLowerCase();
  if (erro === "sem_provedor") return { tipo: "sem_provedor", status };
  if (erro === T.chat.semPonte) return { tipo: "ponte", status };
  if (texto.includes("tempo_esgotado") || status === 408 || status === 504) return { tipo: "tempo", status };
  if (/exceeded your current quota|quota exceeded|insufficient_quota|billing/.test(texto)) return { tipo: "cota", status };
  if (status === 429 || /rate.?limit|quota|resource_exhausted|too many/.test(texto)) return { tipo: "limite", status };
  if (status === 503 || status === 502 || status === 500 || status === 529 || /overloaded|high demand|unavailable/.test(texto)) return { tipo: "sobrecarga", status };
  if (status === 401 || status === 403 || /sem_chave|api key|unauthorized|invalid.*key|permission/.test(texto)) return { tipo: "chave", status };
  if (status === 404 || /sem_modelo|model.*not.*found|does not exist|provedor_nao_encontrado/.test(texto)) return { tipo: "modelo", status };
  if (status === 400 || status === 422) return { tipo: "recusado", status };
  if (texto.startsWith("rede") || /fetch failed|econnrefused|enotfound|network/.test(texto)) return { tipo: "rede", status };
  return { tipo: "outro", status };
}

export function mensagemDeErroIa(erro: string, trocas: string[]): string {
  const { tipo } = classificarErroIa(erro);
  const base = T.chat.erros[tipo];
  return trocas.length > 1 ? `${base} ${T.chat.erros.tentados(trocas.join(", "))}` : base;
}
