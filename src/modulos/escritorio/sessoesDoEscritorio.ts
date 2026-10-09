import type { SessaoClaude } from "../../estado/claudeCode";
import type { FerramentaDeCodigo } from "../../ponte/claudeCode";
import { T } from "../../textos/textos";
import { hash32 } from "./motor/shared/hash";

export function agruparSessoesDoEscritorio(sessoes: SessaoClaude[], busca = "", nomes: Record<string, string> = {}, nomesSalas: Record<string, string> = {}) {
  const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");
  const consulta = normalizar(busca.trim());
  const salas = new Map<string, { id: string; projeto: string; sessoes: SessaoClaude[] }>();
  for (const sessao of sessoes) {
    const id = sessao.cwd.replace(/\\/g, "/").replace(/\/+$/, "").toLocaleLowerCase("pt-BR") || sessao.id;
    if (consulta && !normalizar(`${sessao.projeto} ${sessao.ferramenta} ${sessao.pedido ?? ""} ${nomes[String(hash32(sessao.id))] || nomeDoPersonagem(sessao.id)} ${nomesSalas[String(hash32(id))] || ""}`).includes(consulta)) continue;
    let sala = salas.get(id);
    if (!sala) {
      sala = { id, projeto: sessao.projeto, sessoes: [] };
      salas.set(id, sala);
    }
    if (!sala.sessoes.some((s) => s.id === sessao.id)) sala.sessoes.push(sessao);
  }
  return [...salas.values()];
}

export function poseDaSessao(estado: SessaoClaude["estado"]) {
  if (estado === "aprovacao") return "raise_hand" as const;
  if (estado === "trabalhando") return "type" as const;
  if (estado === "erro") return "sulk" as const;
  return "stand" as const;
}

export function filtrarSessoes(sessoes: SessaoClaude[], ferramenta: FerramentaDeCodigo | "todas", estado: SessaoClaude["estado"] | "todos") {
  return sessoes.filter((s) => (ferramenta === "todas" || s.ferramenta === ferramenta) && (estado === "todos" || s.estado === estado));
}

export function acontecimentosDoEscritorio(sessoes: SessaoClaude[]) {
  return sessoes.flatMap((sessao) => sessao.passos.map((passo) => ({ sessao, passo })))
    .filter(({ passo }) => Number.isFinite(Date.parse(passo.hora)))
    .sort((a, b) => Date.parse(b.passo.hora) - Date.parse(a.passo.hora))
    .slice(0, 120);
}

export function nomeDoPersonagem(id: string) {
  const nomes = T.escritorio.ias.pessoas;
  return nomes[hash32(id) % nomes.length];
}

export function minutosDaSessao(iniciadaEm: string, agora: number) {
  const inicio = Date.parse(iniciadaEm);
  return Number.isFinite(inicio) && Number.isFinite(agora) ? Math.max(0, Math.floor((agora - inicio) / 60_000)) : 0;
}

export function sessoesDeDemonstracao(agora = Date.now()): SessaoClaude[] {
  const E = T.escritorio.ias.exemplos;
  const exemplos: [string, FerramentaDeCodigo, SessaoClaude["estado"], string][] = [
    [E.site, "claude", "trabalhando", E.revisar],
    [E.site, "codex", "pensando", E.testar],
    [E.ponte, "codex", "aprovacao", E.perguntar],
    [E.ponte, "copilot", "erro", E.erro],
    [E.docs, "claude", "terminou", E.concluir],
  ];
  return exemplos.map(([projeto, ferramenta, estado, pedido], i) => {
    const hora = new Date(agora - (i + 1) * 90_000).toISOString();
    return {
      id: `demo:${i}`, ferramenta, projeto, cwd: `C:/Exemplos/${projeto}`, estado, pedido,
      ferramentasUsadas: (i + 1) * 3, iniciadaEm: new Date(agora - 25 * 60_000 - i * 60_000).toISOString(), atualizadaEm: hora,
      passos: [
        { id: `demo:${i}:ler`, tipo: "ferramenta", ferramenta: "Read", rotulo: E.ler, hora: new Date(agora - (i + 2) * 90_000).toISOString() },
        { id: `demo:${i}:ultimo`, tipo: estado === "erro" ? "erro" : estado === "terminou" ? "fim" : "ferramenta", rotulo: pedido, hora },
      ],
    };
  });
}
