import { useEffect, useState, type ReactNode } from "react";
import { connectionsBridge, type DataService } from "../../bridge/liveConnections";
import { formatMoney } from "../../utils/money";
import { formatDateString, scheduleRelative } from "../../utils/dates";
import { T } from "../../i18n/ptBR";
import type { ServiceId } from "../../types";

const M = T.janelaConexao.metricas;
const E = T.janelaConexao.estados;
const I = T.ilha.conexao;

type Tone = "sucesso" | "erro" | "alerta" | "";

interface NumberType {
  rotulo: string;
  valor: ReactNode;
  tom?: Tone;
}

interface Line {
  chave: string;
  principal: string;
  secundario?: string;
  estado?: string;
  quando?: string;
  valor?: string;
}

interface Summary {
  numeros: NumberType[];
  tituloDaLista: string;
  linhas: Line[];
  aviso?: { texto: string; tom: Tone };
}

const STATES_GOOD = ["pago", "sucesso", "pronto", "entregue", "aberto", "confirmado", "aprovado", "active", "ACTIVE_HEALTHY", "success", "proxy"];
const STATES_BAD = ["falhou", "erro", "devolvido", "spam", "cancelado", "failure"];

function tone(state: string): Tone {
  if (STATES_GOOD.includes(state)) return "sucesso";
  if (STATES_BAD.includes(state)) return "erro";
  return state ? "alerta" : "";
}

const UNITS = [
  { limite: 1e12, sufixo: "TB" },
  { limite: 1e9, sufixo: "GB" },
  { limite: 1e6, sufixo: "MB" },
  { limite: 1e3, sufixo: "KB" },
];

function size(bytes: number) {
  const unit = UNITS.find((u) => bytes >= u.limite);
  if (!unit) return `${bytes} B`;
  return `${(bytes / unit.limite).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${unit.sufixo}`;
}

function thousand(n: number) {
  return n.toLocaleString("pt-BR", { notation: n >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 });
}

function count(list: unknown[]) {
  return list.length;
}

export function mountSummary(service: ServiceId, payload: DataService[ServiceId]): Summary {
  switch (service) {
    case "stripe": {
      const d = payload as DataService["stripe"];
      const failures = d.cobrancas.filter((c) => c.status === "falhou").length;
      const next = [...d.repasses].filter((r) => r.status === "a_caminho").sort((a, b) => a.chegada.localeCompare(b.chegada))[0];
      return {
        numeros: [
          { rotulo: M.disponivel, valor: formatMoney(d.disponivel) },
          { rotulo: M.pendente, valor: formatMoney(d.pendente) },
          { rotulo: M.pagasHoje, valor: d.cobrancas.filter((c) => c.status === "pago").length, tom: "sucesso" },
          { rotulo: M.falhas, valor: failures, tom: failures ? "erro" : "" },
        ],
        aviso: d.disputas.length
          ? { texto: I.disputas(d.disputas.length), tom: "erro" }
          : next
            ? { texto: I.proximoRepasse(formatMoney(next.valor), scheduleRelative(next.chegada)), tom: "" }
            : undefined,
        tituloDaLista: I.ultimasCobrancas,
        linhas: d.cobrancas.slice(0, 6).map((c) => ({ chave: c.id, principal: c.cliente, secundario: c.metodo, estado: c.status, quando: c.data, valor: formatMoney(c.valor) })),
      };
    }
    case "github": {
      const d = payload as DataService["github"];
      const since = Date.now() - 7 * 86400000;
      const commits = Object.entries(d.commitsPorDia ?? {}).filter(([day]) => new Date(`${day}T12:00:00`).getTime() >= since).reduce((a, [, n]) => a + n, 0);
      const failures = d.actions.filter((a) => a.status === "falhou").length;
      const lines: Line[] = [
        ...d.prs.slice(0, 3).map((p) => ({ chave: `pr-${p.repo}-${p.numero}`, principal: `#${p.numero} ${p.titulo}`, secundario: p.repo, estado: p.tipo === "revisar" ? "revisar" : p.ci === "falhou" || p.ci === "rodando" ? p.ci : p.revisao, quando: p.data })),
        ...d.actions.slice(0, 6 - Math.min(3, d.prs.length)).map((a) => ({ chave: `ac-${a.repo}-${a.workflow}-${a.data}`, principal: a.workflow, secundario: `${a.repo} . ${a.branch}`, estado: a.status, quando: a.data })),
      ];
      return {
        numeros: [
          { rotulo: M.prsAbertos, valor: d.prs.length },
          { rotulo: M.issuesAbertas, valor: d.issues.length },
          { rotulo: M.falhasActions, valor: failures, tom: failures ? "erro" : "" },
          { rotulo: I.commits7d, valor: commits },
        ],
        tituloDaLista: d.prs.length ? I.prsEActions : I.actionsRecentes,
        linhas: lines.length ? lines : d.repositorios.slice(0, 6).map((r) => ({ chave: r.nome, principal: r.nome, secundario: r.linguagem, quando: r.atualizado })),
      };
    }
    case "vercel": {
      const d = payload as DataService["vercel"];
      const errors = d.deploys.filter((x) => x.estado === "erro").length;
      const ready = d.deploys.filter((x) => x.estado === "pronto" && x.duracao > 0);
      const medium = ready.length ? Math.round(ready.reduce((a, x) => a + x.duracao, 0) / ready.length) : 0;
      return {
        numeros: [
          { rotulo: M.projetos, valor: d.projetos.length },
          { rotulo: M.prontos, valor: d.deploys.filter((x) => x.estado === "pronto").length, tom: "sucesso" },
          { rotulo: M.comErro, valor: errors, tom: errors ? "erro" : "" },
          { rotulo: M.tempoMedio, valor: medium ? T.janelaConexao.segundos(medium) : "-" },
        ],
        tituloDaLista: I.deploysRecentes,
        linhas: d.deploys.slice(0, 6).map((x) => ({ chave: `${x.projeto}-${x.data}`, principal: x.commit || x.projeto, secundario: `${x.projeto} . ${x.ambiente}${x.branch ? ` . ${x.branch}` : ""}`, estado: x.estado, quando: x.data })),
      };
    }
    case "resend": {
      const d = payload as DataService["resend"];
      const openValue = d.emails.filter((e) => e.estado === "aberto").length;
      const checked = d.dominios.filter((x) => x.verificado).length;
      return {
        numeros: [
          { rotulo: M.enviados, valor: d.enviados },
          { rotulo: M.entregues, valor: d.entregues, tom: "sucesso" },
          { rotulo: I.abertos, valor: openValue },
          { rotulo: M.falhas, valor: d.falhas, tom: d.falhas ? "erro" : "" },
        ],
        aviso: d.dominios.length ? { texto: I.dominiosVerificados(checked, d.dominios.length), tom: checked < d.dominios.length ? "alerta" : "" } : undefined,
        tituloDaLista: I.ultimosEmails,
        linhas: [...d.emails]
          .sort((a, b) => Number(STATES_BAD.includes(b.estado)) - Number(STATES_BAD.includes(a.estado)) || b.data.localeCompare(a.data))
          .slice(0, 6)
          .map((e, i) => ({ chave: `${e.para}-${e.data}-${i}`, principal: e.assunto || I.semAssunto, secundario: e.para, estado: e.estado, quando: e.data })),
      };
    }
    case "notion": {
      const d = payload as DataService["notion"];
      const today = d.paginas.filter((p) => Date.now() - new Date(p.data).getTime() < 86400000).length;
      return {
        numeros: [
          { rotulo: M.paginas, valor: d.paginas.length },
          { rotulo: M.bancos, valor: d.bancos.length },
          { rotulo: I.editadasHoje, valor: today },
          { rotulo: I.ultimaEdicao, valor: d.paginas[0] ? scheduleRelative(d.paginas[0].data) : "-" },
        ],
        tituloDaLista: I.editadasRecentemente,
        linhas: d.paginas.slice(0, 6).map((p, i) => ({ chave: `${p.titulo}-${i}`, principal: p.titulo, secundario: p.local, quando: p.data })),
      };
    }
    case "calcom": {
      const d = payload as DataService["calcom"];
      const today = new Date().toLocaleDateString("sv-SE");
      return {
        numeros: [
          { rotulo: M.proximos, valor: d.agendamentos.length },
          { rotulo: M.hoje, valor: d.agendamentos.filter((a) => a.inicio.slice(0, 10) === today).length },
          { rotulo: M.pendentes, valor: d.agendamentos.filter((a) => a.status === "pendente").length, tom: "alerta" },
          { rotulo: I.tiposDeEvento, valor: d.tiposEvento.length },
        ],
        tituloDaLista: I.proximosAgendamentos,
        linhas: d.agendamentos.slice(0, 6).map((a, i) => ({ chave: `${a.inicio}-${i}`, principal: a.pessoa || a.tipo, secundario: a.tipo, estado: a.status, quando: a.inicio })),
      };
    }
    case "n8n": {
      const d = payload as DataService["n8n"];
      const errors = d.execucoes.filter((e) => e.status === "erro").length;
      const completed = d.execucoes.filter((e) => e.status !== "rodando").length;
      return {
        numeros: [
          { rotulo: M.workflowsAtivos, valor: d.workflows.filter((w) => w.ativo).length },
          { rotulo: I.execucoes, valor: d.execucoes.length },
          { rotulo: M.erros, valor: errors, tom: errors ? "erro" : "" },
          { rotulo: M.sucesso, valor: completed ? `${Math.round(((completed - errors) / completed) * 100)}%` : "-" },
        ],
        tituloDaLista: I.execucoesRecentes,
        linhas: d.execucoes.slice(0, 6).map((e) => ({ chave: e.id, principal: e.workflow, secundario: T.janelaConexao.milissegundos(e.duracao), estado: e.status, quando: e.data })),
      };
    }
    case "gmail": {
      const d = payload as DataService["gmail"];
      return {
        numeros: [
          { rotulo: M.naoLidos, valor: d.naoLidos, tom: d.naoLidos ? "alerta" : "" },
          { rotulo: M.importantes, valor: d.importantes.length },
          { rotulo: M.totalEmails, valor: thousand(d.total) },
          { rotulo: I.recentes, valor: count(d.recentes) },
        ],
        tituloDaLista: d.importantes.length ? M.importantes : I.recentes,
        linhas: (d.importantes.length ? d.importantes : d.recentes).slice(0, 6).map((e) => ({ chave: e.id, principal: e.assunto, secundario: e.de, estado: e.naoLido ? "pendente" : "", quando: e.data })),
      };
    }
    case "agenda": {
      const d = payload as DataService["agenda"];
      return {
        numeros: [
          { rotulo: M.hoje, valor: d.hoje, tom: d.hoje ? "sucesso" : "" },
          { rotulo: M.proximos, valor: d.proximos.length },
        ],
        tituloDaLista: M.proximos,
        linhas: d.proximos.slice(0, 6).map((e) => ({ chave: e.id, principal: e.titulo, secundario: [formatDateString(e.data, "EEE, d 'de' MMM"), e.hora].filter(Boolean).join(" . "), estado: "" })),
      };
    }
    case "supabase": {
      const d = payload as DataService["supabase"];
      const outside = d.projetos.flatMap((p) => p.servicos.filter((s) => !s.saudavel).map((s) => `${p.nome}: ${s.nome}`));
      const storage = d.projetos.reduce((a, p) => a + p.buckets.reduce((b, x) => b + x.bytes, 0), 0);
      const lastLogin = d.projetos.map((p) => p.ultimoLogin).filter((x): x is string => Boolean(x)).sort().pop();
      return {
        numeros: [
          { rotulo: M.usuarios, valor: d.projetos.reduce((a, p) => a + p.usuarios, 0) },
          { rotulo: M.novos7d, valor: d.projetos.reduce((a, p) => a + p.novos7d, 0), tom: "sucesso" },
          { rotulo: M.tamanhoBanco, valor: size(d.projetos.reduce((a, p) => a + p.bancoBytes, 0)) },
          { rotulo: I.armazenamento, valor: size(storage) },
        ],
        aviso: outside.length
          ? { texto: I.servicosFora(outside.join(", ")), tom: "erro" }
          : d.projetos.some((p) => p.semSql)
            ? { texto: M.semSql, tom: "alerta" }
            : { texto: lastLogin ? I.servicosOkComLogin(scheduleRelative(lastLogin)) : I.servicosOk, tom: "sucesso" },
        tituloDaLista: I.projetosETabelas,
        linhas: d.projetos.flatMap((p) => [
          {
            chave: p.ref,
            principal: p.nome,
            secundario: `${p.regiao} . ${I.usuariosE(p.usuarios, p.buckets.length)}`,
            estado: p.status,
            valor: p.semSql ? undefined : size(p.bancoBytes),
          },
          ...(p.tabelas ?? []).slice(0, 5).map((t) => ({ chave: `${p.ref}-${t.nome}`, principal: t.nome, secundario: I.linhas(t.linhas), valor: size(t.bytes) })),
        ]),
      };
    }
    case "cloudflare": {
      const d = payload as DataService["cloudflare"];
      const days = d.metricas.flatMap((m) => m.dias);
      const threats = days.reduce((a, x) => a + x.ameacas, 0);
      return {
        numeros: [
          { rotulo: M.requisicoes7d, valor: thousand(days.reduce((a, x) => a + x.requisicoes, 0)) },
          { rotulo: M.visitantes7d, valor: thousand(days.reduce((a, x) => a + x.unicos, 0)) },
          { rotulo: I.trafego7d, valor: size(days.reduce((a, x) => a + x.bytes, 0)) },
          { rotulo: M.ameacas7d, valor: thousand(threats), tom: threats ? "alerta" : "" },
        ],
        aviso: { texto: I.cloudflareContagem(d.zonas.length, d.dns.length, d.pages.length, d.workers.length), tom: "" },
        tituloDaLista: I.dominiosEDns,
        linhas: [
          ...d.zonas.map((z) => ({ chave: `zn-${z.nome}`, principal: z.nome, secundario: z.plano, estado: z.status })),
          ...d.pages.slice(0, 3).map((p) => ({ chave: `pg-${p.nome}`, principal: p.nome, secundario: `Pages . ${p.dominio}`, estado: p.estado, quando: p.data || undefined })),
          ...d.dns.slice(0, 8).map((r, i) => ({ chave: `dns-${r.nome}-${r.tipo}-${i}`, principal: r.nome, secundario: r.valor, estado: r.proxy ? "proxy" : "", valor: r.tipo })),
        ],
      };
    }
    default:
      return { numeros: [], tituloDaLista: "", linhas: [] };
  }
}

export function IslandConnection({ servico: service }: { servico: ServiceId }) {
  const [payload, setData] = useState<DataService[ServiceId] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(false);
    connectionsBridge
      .ler(service)
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [service]);

  if (error) return <span className="ilha-sub">{I.erro}</span>;
  if (!payload) return <span className="ilha-sub brilho-texto">{I.carregando}</span>;

  const summary = mountSummary(service, payload);
  return (
    <>
      <div className="ilha-conexao-numeros">
        {summary.numeros.map((n) => (
          <div key={n.rotulo} className="ilha-conexao-numero" data-tom={n.tom || undefined}>
            <span className="ilha-conexao-numero-valor numero privado">{n.valor}</span>
            <span className="ilha-conexao-numero-rotulo cortar">{n.rotulo}</span>
          </div>
        ))}
      </div>
      {summary.aviso && (
        <div className="ilha-conexao-aviso cortar privado" data-tom={summary.aviso.tom || undefined}>
          {summary.aviso.texto}
        </div>
      )}
      <span className="ilha-mini">{summary.tituloDaLista}</span>
      <div className="ilha-rolagem ilha-conexao-lista">
        {summary.linhas.length === 0 && <span className="ilha-sub">{I.semItens}</span>}
        {summary.linhas.map((l) => (
          <div key={l.chave} className="ilha-conexao-linha-item">
            <span className="ilha-conexao-ponto" data-tom={l.estado ? tone(l.estado) || undefined : undefined} />
            <span className="ilha-conexao-linha-textos">
              <span className="cortar privado">{l.principal}</span>
              {l.secundario && <span className="ilha-mini cortar privado">{l.secundario}</span>}
            </span>
            {l.estado && E[l.estado] && <span className="ilha-conexao-etiqueta" data-tom={tone(l.estado) || undefined}>{E[l.estado]}</span>}
            {l.valor && <span className="ilha-conexao-valor numero privado">{l.valor}</span>}
            {l.quando && <span className="ilha-mini numero ilha-conexao-quando">{scheduleRelative(l.quando)}</span>}
          </div>
        ))}
      </div>
    </>
  );
}
