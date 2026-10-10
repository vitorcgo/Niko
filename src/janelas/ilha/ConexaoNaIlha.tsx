import { useEffect, useState, type ReactNode } from "react";
import { conexoesPonte, type DadosServico } from "../../ponte/conexoesReais";
import { formatarDinheiro } from "../../utilitarios/dinheiro";
import { formatar, horarioRelativo } from "../../utilitarios/datas";
import { T } from "../../textos/textos";
import type { ServicoId } from "../../tipos";
import { ContribuicoesGithub } from "../../modulos/conexoes/ContribuicoesGithub";
import { resumirContribuicoesGithub } from "../../utilitarios/contribuicoesGithub";

const M = T.janelaConexao.metricas;
const E = T.janelaConexao.estados;
const I = T.ilha.conexao;

type Tom = "sucesso" | "erro" | "alerta" | "";

interface Numero {
  rotulo: string;
  valor: ReactNode;
  tom?: Tom;
}

interface Linha {
  chave: string;
  principal: string;
  secundario?: string;
  estado?: string;
  quando?: string;
  valor?: string;
}

interface Resumo {
  numeros: Numero[];
  tituloDaLista: string;
  linhas: Linha[];
  aviso?: { texto: string; tom: Tom };
}

const ESTADOS_BONS = ["pago", "sucesso", "pronto", "entregue", "aberto", "confirmado", "aprovado", "active", "ACTIVE_HEALTHY", "success", "proxy"];
const ESTADOS_RUINS = ["falhou", "erro", "devolvido", "spam", "cancelado", "failure"];

function tomDo(estado: string): Tom {
  if (ESTADOS_BONS.includes(estado)) return "sucesso";
  if (ESTADOS_RUINS.includes(estado)) return "erro";
  return estado ? "alerta" : "";
}

const UNIDADES = [
  { limite: 1e12, sufixo: "TB" },
  { limite: 1e9, sufixo: "GB" },
  { limite: 1e6, sufixo: "MB" },
  { limite: 1e3, sufixo: "KB" },
];

function tamanho(bytes: number) {
  const unidade = UNIDADES.find((u) => bytes >= u.limite);
  if (!unidade) return `${bytes} B`;
  return `${(bytes / unidade.limite).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${unidade.sufixo}`;
}

function mil(n: number) {
  return n.toLocaleString("pt-BR", { notation: n >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 });
}


export function montarResumo(servico: ServicoId, dados: DadosServico[ServicoId]): Resumo {
  switch (servico) {
    case "stripe": {
      const d = dados as DadosServico["stripe"];
      const falhas = d.cobrancas.filter((c) => c.status === "falhou").length;
      const proximo = [...d.repasses].filter((r) => r.status === "a_caminho").sort((a, b) => a.chegada.localeCompare(b.chegada))[0];
      return {
        numeros: [
          { rotulo: M.disponivel, valor: formatarDinheiro(d.disponivel) },
          { rotulo: M.pendente, valor: formatarDinheiro(d.pendente) },
          { rotulo: M.pagasHoje, valor: d.cobrancas.filter((c) => c.status === "pago").length, tom: "sucesso" },
          { rotulo: M.falhas, valor: falhas, tom: falhas ? "erro" : "" },
        ],
        aviso: d.disputas.length
          ? { texto: I.disputas(d.disputas.length), tom: "erro" }
          : proximo
            ? { texto: I.proximoRepasse(formatarDinheiro(proximo.valor), horarioRelativo(proximo.chegada)), tom: "" }
            : undefined,
        tituloDaLista: I.ultimasCobrancas,
        linhas: d.cobrancas.slice(0, 6).map((c) => ({ chave: c.id, principal: c.cliente, secundario: c.metodo, estado: c.status, quando: c.data, valor: formatarDinheiro(c.valor) })),
      };
    }
    case "github": {
      const d = dados as DadosServico["github"];
      const contribuicoes = d.contribuicoes ? resumirContribuicoesGithub(d.contribuicoes).ultimos7dias : null;
      const falhas = d.actions.filter((a) => a.status === "falhou").length;
      const linhas: Linha[] = [
        ...d.prs.slice(0, 3).map((p) => ({ chave: `pr-${p.repo}-${p.numero}`, principal: `#${p.numero} ${p.titulo}`, secundario: p.repo, estado: p.tipo === "revisar" ? "revisar" : p.ci === "falhou" || p.ci === "rodando" ? p.ci : p.revisao, quando: p.data })),
        ...d.actions.slice(0, 6 - Math.min(3, d.prs.length)).map((a) => ({ chave: `ac-${a.repo}-${a.workflow}-${a.data}`, principal: a.workflow, secundario: `${a.repo} . ${a.branch}`, estado: a.status, quando: a.data })),
      ];
      return {
        numeros: [
          { rotulo: M.prsAbertos, valor: d.prs.length },
          { rotulo: M.issuesAbertas, valor: d.issues.length },
          { rotulo: M.falhasActions, valor: falhas, tom: falhas ? "erro" : "" },
          { rotulo: I.contribuicoes7d, valor: contribuicoes === null ? "-" : mil(contribuicoes) },
        ],
        tituloDaLista: d.prs.length ? I.prsEActions : I.actionsRecentes,
        linhas: linhas.length ? linhas : d.repositorios.slice(0, 6).map((r) => ({ chave: r.nome, principal: r.nome, secundario: r.linguagem, quando: r.atualizado })),
      };
    }
    case "vercel": {
      const d = dados as DadosServico["vercel"];
      const erros = d.deploys.filter((x) => x.estado === "erro").length;
      const prontos = d.deploys.filter((x) => x.estado === "pronto" && x.duracao > 0);
      const medio = prontos.length ? Math.round(prontos.reduce((a, x) => a + x.duracao, 0) / prontos.length) : 0;
      return {
        numeros: [
          { rotulo: M.projetos, valor: d.projetos.length },
          { rotulo: M.prontos, valor: d.deploys.filter((x) => x.estado === "pronto").length, tom: "sucesso" },
          { rotulo: M.comErro, valor: erros, tom: erros ? "erro" : "" },
          { rotulo: M.tempoMedio, valor: medio ? T.janelaConexao.segundos(medio) : "-" },
        ],
        tituloDaLista: I.deploysRecentes,
        linhas: d.deploys.slice(0, 6).map((x) => ({ chave: `${x.projeto}-${x.data}`, principal: x.commit || x.projeto, secundario: `${x.projeto} . ${x.ambiente}${x.branch ? ` . ${x.branch}` : ""}`, estado: x.estado, quando: x.data })),
      };
    }
    case "resend": {
      const d = dados as DadosServico["resend"];
      const abertos = d.emails.filter((e) => e.estado === "aberto").length;
      const verificados = d.dominios.filter((x) => x.verificado).length;
      return {
        numeros: [
          { rotulo: M.enviados, valor: d.enviados },
          { rotulo: M.entregues, valor: d.entregues, tom: "sucesso" },
          { rotulo: I.abertos, valor: abertos },
          { rotulo: M.falhas, valor: d.falhas, tom: d.falhas ? "erro" : "" },
        ],
        aviso: d.dominios.length ? { texto: I.dominiosVerificados(verificados, d.dominios.length), tom: verificados < d.dominios.length ? "alerta" : "" } : undefined,
        tituloDaLista: I.ultimosEmails,
        linhas: [...d.emails]
          .sort((a, b) => Number(ESTADOS_RUINS.includes(b.estado)) - Number(ESTADOS_RUINS.includes(a.estado)) || b.data.localeCompare(a.data))
          .slice(0, 6)
          .map((e, i) => ({ chave: `${e.para}-${e.data}-${i}`, principal: e.assunto || I.semAssunto, secundario: e.para, estado: e.estado, quando: e.data })),
      };
    }
    case "notion": {
      const d = dados as DadosServico["notion"];
      const hoje = d.paginas.filter((p) => Date.now() - new Date(p.data).getTime() < 86400000).length;
      return {
        numeros: [
          { rotulo: M.paginas, valor: d.paginas.length },
          { rotulo: M.bancos, valor: d.bancos.length },
          { rotulo: I.editadasHoje, valor: hoje },
          { rotulo: I.ultimaEdicao, valor: d.paginas[0] ? horarioRelativo(d.paginas[0].data) : "-" },
        ],
        tituloDaLista: I.editadasRecentemente,
        linhas: d.paginas.slice(0, 6).map((p, i) => ({ chave: `${p.titulo}-${i}`, principal: p.titulo, secundario: p.local, quando: p.data })),
      };
    }
    case "calcom": {
      const d = dados as DadosServico["calcom"];
      const hoje = new Date().toLocaleDateString("sv-SE");
      return {
        numeros: [
          { rotulo: M.proximos, valor: d.agendamentos.length },
          { rotulo: M.hoje, valor: d.agendamentos.filter((a) => a.inicio.slice(0, 10) === hoje).length },
          { rotulo: M.pendentes, valor: d.agendamentos.filter((a) => a.status === "pendente").length, tom: "alerta" },
          { rotulo: I.tiposDeEvento, valor: d.tiposEvento.length },
        ],
        tituloDaLista: I.proximosAgendamentos,
        linhas: d.agendamentos.slice(0, 6).map((a, i) => ({ chave: `${a.inicio}-${i}`, principal: a.pessoa || a.tipo, secundario: a.tipo, estado: a.status, quando: a.inicio })),
      };
    }
    case "n8n": {
      const d = dados as DadosServico["n8n"];
      const erros = d.execucoes.filter((e) => e.status === "erro").length;
      const concluidas = d.execucoes.filter((e) => e.status !== "rodando").length;
      return {
        numeros: [
          { rotulo: M.workflowsAtivos, valor: d.workflows.filter((w) => w.ativo).length },
          { rotulo: I.execucoes, valor: d.execucoes.length },
          { rotulo: M.erros, valor: erros, tom: erros ? "erro" : "" },
          { rotulo: M.sucesso, valor: concluidas ? `${Math.round(((concluidas - erros) / concluidas) * 100)}%` : "-" },
        ],
        tituloDaLista: I.execucoesRecentes,
        linhas: d.execucoes.slice(0, 6).map((e) => ({ chave: e.id, principal: e.workflow, secundario: T.janelaConexao.milissegundos(e.duracao), estado: e.status, quando: e.data })),
      };
    }
    case "google": {
      const d = dados as DadosServico["google"];
      const emails = d.gmail ? (d.gmail.importantes.length ? d.gmail.importantes : d.gmail.recentes) : [];
      const eventos = d.agenda?.proximos ?? [];
      return {
        numeros: [
          { rotulo: M.naoLidos, valor: d.gmail?.naoLidos ?? "-", tom: d.gmail?.naoLidos ? "alerta" : "" },
          { rotulo: M.hoje, valor: d.agenda?.hoje ?? "-", tom: d.agenda?.hoje ? "sucesso" : "" },
          { rotulo: M.tarefasAbertas, valor: d.tarefas?.length ?? "-" },
          { rotulo: M.arquivosRecentes, valor: d.drive?.length ?? "-" },
        ],
        tituloDaLista: emails.length ? (d.gmail?.importantes.length ? M.importantes : I.recentes) : M.proximos,
        linhas: emails.length
          ? emails.slice(0, 6).map((e) => ({ chave: e.id, principal: e.assunto, secundario: e.de, estado: e.naoLido ? "pendente" : "", quando: e.data }))
          : eventos.slice(0, 6).map((e) => ({ chave: e.id, principal: e.titulo, secundario: [formatar(e.data, "EEE, d 'de' MMM"), e.hora].filter(Boolean).join(" . "), estado: "" })),
      };
    }
    case "supabase": {
      const d = dados as DadosServico["supabase"];
      const fora = d.projetos.flatMap((p) => p.servicos.filter((s) => !s.saudavel).map((s) => `${p.nome}: ${s.nome}`));
      const storage = d.projetos.reduce((a, p) => a + p.buckets.reduce((b, x) => b + x.bytes, 0), 0);
      const ultimoLogin = d.projetos.map((p) => p.ultimoLogin).filter((x): x is string => Boolean(x)).sort().pop();
      return {
        numeros: [
          { rotulo: M.usuarios, valor: d.projetos.reduce((a, p) => a + p.usuarios, 0) },
          { rotulo: M.novos7d, valor: d.projetos.reduce((a, p) => a + p.novos7d, 0), tom: "sucesso" },
          { rotulo: M.tamanhoBanco, valor: tamanho(d.projetos.reduce((a, p) => a + p.bancoBytes, 0)) },
          { rotulo: I.armazenamento, valor: tamanho(storage) },
        ],
        aviso: fora.length
          ? { texto: I.servicosFora(fora.join(", ")), tom: "erro" }
          : d.projetos.some((p) => p.semSql)
            ? { texto: M.semSql, tom: "alerta" }
            : { texto: ultimoLogin ? I.servicosOkComLogin(horarioRelativo(ultimoLogin)) : I.servicosOk, tom: "sucesso" },
        tituloDaLista: I.projetosETabelas,
        linhas: d.projetos.flatMap((p) => [
          {
            chave: p.ref,
            principal: p.nome,
            secundario: `${p.regiao} . ${I.usuariosE(p.usuarios, p.buckets.length)}`,
            estado: p.status,
            valor: p.semSql ? undefined : tamanho(p.bancoBytes),
          },
          ...(p.tabelas ?? []).slice(0, 5).map((t) => ({ chave: `${p.ref}-${t.nome}`, principal: t.nome, secundario: I.linhas(t.linhas), valor: tamanho(t.bytes) })),
        ]),
      };
    }
    case "cloudflare": {
      const d = dados as DadosServico["cloudflare"];
      const dias = d.metricas.flatMap((m) => m.dias);
      const ameacas = dias.reduce((a, x) => a + x.ameacas, 0);
      return {
        numeros: [
          { rotulo: M.requisicoes7d, valor: mil(dias.reduce((a, x) => a + x.requisicoes, 0)) },
          { rotulo: M.visitantes7d, valor: mil(dias.reduce((a, x) => a + x.unicos, 0)) },
          { rotulo: I.trafego7d, valor: tamanho(dias.reduce((a, x) => a + x.bytes, 0)) },
          { rotulo: M.ameacas7d, valor: mil(ameacas), tom: ameacas ? "alerta" : "" },
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

export function ConexaoNaIlha({ servico }: { servico: ServicoId }) {
  const [dados, setDados] = useState<DadosServico[ServicoId] | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    setDados(null);
    setErro(false);
    conexoesPonte
      .ler(servico)
      .then((d) => vivo && setDados(d))
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, [servico]);

  if (erro) return <span className="ilha-sub">{I.erro}</span>;
  if (!dados) return <span className="ilha-sub brilho-texto">{I.carregando}</span>;

  const resumo = montarResumo(servico, dados);
  return (
    <>
      <div className="ilha-conexao-numeros">
        {resumo.numeros.map((n) => (
          <div key={n.rotulo} className="ilha-conexao-numero" data-tom={n.tom || undefined}>
            <span className="ilha-conexao-numero-valor numero privado">{n.valor}</span>
            <span className="ilha-conexao-numero-rotulo cortar">{n.rotulo}</span>
          </div>
        ))}
      </div>
      {servico === "github" && <ContribuicoesGithub calendario={(dados as DadosServico["github"]).contribuicoes} compacto />}
      {resumo.aviso && (
        <div className="ilha-conexao-aviso cortar privado" data-tom={resumo.aviso.tom || undefined}>
          {resumo.aviso.texto}
        </div>
      )}
      <span className="ilha-mini">{resumo.tituloDaLista}</span>
      <div className="ilha-rolagem ilha-conexao-lista">
        {resumo.linhas.length === 0 && <span className="ilha-sub">{I.semItens}</span>}
        {resumo.linhas.map((l) => (
          <div key={l.chave} className="ilha-conexao-linha-item">
            <span className="ilha-conexao-ponto" data-tom={l.estado ? tomDo(l.estado) || undefined : undefined} />
            <span className="ilha-conexao-linha-textos">
              <span className="cortar privado">{l.principal}</span>
              {l.secundario && <span className="ilha-mini cortar privado">{l.secundario}</span>}
            </span>
            {l.estado && E[l.estado] && <span className="ilha-conexao-etiqueta" data-tom={tomDo(l.estado) || undefined}>{E[l.estado]}</span>}
            {l.valor && <span className="ilha-conexao-valor numero privado">{l.valor}</span>}
            {l.quando && <span className="ilha-mini numero ilha-conexao-quando">{horarioRelativo(l.quando)}</span>}
          </div>
        ))}
      </div>
    </>
  );
}
