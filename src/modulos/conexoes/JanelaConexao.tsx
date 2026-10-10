import { useCallback, useEffect, useState, type ReactNode } from "react";
import { RefreshCw, ExternalLink, Search, Settings2, Lock, Globe, Star } from "lucide-react";
import { Janela } from "../../janelas/Janela";
import { useInterface, type JanelaConexao as EstadoJanela } from "../../estado/interface";
import { useComunicacao } from "../../estado/comunicacao";
import { Marca } from "../../marcas/Marca";
import { Botao, Vazio, AvisoFaixa, Alternador } from "../../componentes/basicos";
import { Paginacao, usarPaginacao } from "../../componentes/Paginacao";
import { T } from "../../textos/textos";
import { conexoesPonte, PAINEL_OFICIAL, resumoDe, type DadosServico } from "../../ponte/conexoesReais";
import { formatarDinheiro } from "../../utilitarios/dinheiro";
import { formatar, horarioRelativo } from "../../utilitarios/datas";
import { contem } from "../../utilitarios/basicos";
import { tocarSom } from "../../ponte/sons";
import type { ServicoId } from "../../tipos";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ContribuicoesGithub } from "./ContribuicoesGithub";

const MINIMO = { w: 560, h: 420 };
const INTERVALOS = [30, 60, 120, 300, 600];
const C = T.janelaConexao.colunas;
const E = T.janelaConexao.estados;

interface Coluna<L> {
  titulo: string;
  render: (linha: L) => ReactNode;
  texto?: (linha: L) => string;
  direita?: boolean;
}

function Tabela<L>({ linhas, colunas, filtro }: { linhas: L[]; colunas: Coluna<L>[]; filtro: string }) {
  const filtradas = filtro
    ? linhas.filter((l) => colunas.some((c) => (c.texto ? contem(c.texto(l), filtro) : false)))
    : linhas;
  const paginas = usarPaginacao(filtradas, 15, `${filtro}|${linhas.length}`);
  if (filtradas.length === 0) return <Vazio titulo={T.janelaConexao.semResultados} />;
  return (
    <>
    <div className="tabela-rolagem">
      <table className="tabela">
        <thead>
          <tr>
            {colunas.map((c) => (
              <th key={c.titulo} className={c.direita ? "direita" : undefined}>{c.titulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paginas.visiveis.map((l, i) => (
            <tr key={i}>
              {colunas.map((c) => (
                <td key={c.titulo} className={c.direita ? "direita numero" : undefined}>{c.render(l)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <Paginacao {...paginas} />
    </>
  );
}

function Estado({ valor }: { valor: string }) {
  const tom = ["pago", "sucesso", "pronto", "entregue", "aberto", "confirmado", "aprovado", "pago"].includes(valor)
    ? "sucesso"
    : ["falhou", "erro", "devolvido", "spam", "cancelado"].includes(valor)
      ? "erro"
      : ["rodando", "construindo", "a_caminho", "pendente", "mudancas", "reembolsado", "revisar"].includes(valor)
        ? "alerta"
        : "";
  return <span className={`etiqueta ${tom ? `etiqueta-${tom}` : ""}`}>{E[valor] ?? valor}</span>;
}

function Metrica({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="conexao-metrica">
      <span className="numero-grande privado">{valor}</span>
      <span className="conexao-metrica-rotulo">{rotulo}</span>
    </div>
  );
}

const data = (iso: string) => format(new Date(iso), "d MMM, HH:mm", { locale: ptBR });

function ConteudoServico({ servico, aba, filtro, dados }: { servico: ServicoId; aba: string; filtro: string; dados: DadosServico[ServicoId] }) {

  if (servico === "stripe") {
    const d = dados as DadosServico["stripe"];
    const cobrancas = (
      <Tabela
        filtro={filtro}
        linhas={d.cobrancas}
        colunas={[
          { titulo: C.cliente, render: (l) => l.cliente, texto: (l) => l.cliente },
          { titulo: C.metodo, render: (l) => l.metodo, texto: (l) => l.metodo },
          { titulo: C.status, render: (l) => <Estado valor={l.status} />, texto: (l) => E[l.status] },
          { titulo: C.data, render: (l) => data(l.data) },
          { titulo: C.valor, render: (l) => <span className="privado">{formatarDinheiro(l.valor)}</span>, direita: true },
        ]}
      />
    );
    if (aba === "cobrancas") return cobrancas;
    if (aba === "disputas")
      return d.disputas.length === 0 ? (
        <Vazio titulo={T.janelaConexao.semResultados} />
      ) : (
        <Tabela filtro={filtro} linhas={d.disputas} colunas={[
          { titulo: C.motivo, render: (l) => l.motivo, texto: (l) => l.motivo },
          { titulo: C.prazo, render: (l) => data(l.prazo) },
          { titulo: C.valor, render: (l) => formatarDinheiro(l.valor), direita: true },
        ]} />
      );
    if (aba === "repasses")
      return <Tabela filtro={filtro} linhas={d.repasses} colunas={[
        { titulo: C.chegada, render: (l) => data(l.chegada) },
        { titulo: C.status, render: (l) => <Estado valor={l.status} />, texto: (l) => E[l.status] },
        { titulo: C.valor, render: (l) => <span className="privado">{formatarDinheiro(l.valor)}</span>, direita: true },
      ]} />;
    if (aba === "clientes")
      return <Tabela filtro={filtro} linhas={d.clientes} colunas={[
        { titulo: C.nome, render: (l) => l.nome, texto: (l) => l.nome },
        { titulo: C.email, render: (l) => <span className="privado">{l.email}</span>, texto: (l) => l.email },
        { titulo: C.desde, render: (l) => data(l.desde) },
        { titulo: C.total, render: (l) => <span className="privado">{formatarDinheiro(l.total)}</span>, direita: true },
      ]} />;
    const M = T.janelaConexao.metricas;
    return (
      <div className="coluna">
        <div className="conexao-metricas">
          <Metrica rotulo={M.disponivel} valor={formatarDinheiro(d.disponivel)} />
          <Metrica rotulo={M.pendente} valor={formatarDinheiro(d.pendente)} />
          <Metrica rotulo={M.pagasHoje} valor={d.cobrancas.filter((c) => c.status === "pago").length} />
          <Metrica rotulo={M.falhas} valor={d.cobrancas.filter((c) => c.status === "falhou").length} />
        </div>
        <h3 className="conexao-bloco-titulo">{T.janelaConexao.ultimas}</h3>
        {cobrancas}
      </div>
    );
  }

  if (servico === "github") {
    const d = dados as DadosServico["github"];
    if (aba === "contribuicoes") return <ContribuicoesGithub calendario={d.contribuicoes} />;
    const acoes = (
      <Tabela filtro={filtro} linhas={d.actions} colunas={[
        { titulo: C.workflow, render: (l) => l.workflow, texto: (l) => l.workflow },
        { titulo: C.repo, render: (l) => l.repo, texto: (l) => l.repo },
        { titulo: C.branch, render: (l) => <code>{l.branch}</code>, texto: (l) => l.branch },
        { titulo: C.status, render: (l) => <Estado valor={l.status} />, texto: (l) => E[l.status] },
        { titulo: C.duracao, render: (l) => T.janelaConexao.segundos(l.duracao), direita: true },
        { titulo: C.data, render: (l) => horarioRelativo(l.data), direita: true },
      ]} />
    );
    if (aba === "repositorios")
      return <Tabela filtro={filtro} linhas={d.repositorios} colunas={[
        { titulo: C.nome, render: (l) => <span className="linha">{l.privado ? <Lock size={12} /> : <Globe size={12} />}{l.nome}</span>, texto: (l) => l.nome },
        { titulo: C.linguagem, render: (l) => l.linguagem, texto: (l) => l.linguagem },
        { titulo: C.estrelas, render: (l) => <span className="linha"><Star size={12} />{l.estrelas}</span>, direita: true },
        { titulo: C.atualizado, render: (l) => horarioRelativo(l.atualizado), direita: true },
      ]} />;
    if (aba === "prs")
      return <Tabela filtro={filtro} linhas={d.prs} colunas={[
        { titulo: C.titulo, render: (l) => `#${l.numero} ${l.titulo}`, texto: (l) => l.titulo },
        { titulo: C.repo, render: (l) => l.repo, texto: (l) => l.repo },
        { titulo: C.autor, render: (l) => l.autor, texto: (l) => l.autor },
        { titulo: C.revisao, render: (l) => <Estado valor={l.tipo === "revisar" ? "revisar" : l.revisao} /> },
        { titulo: C.ci, render: (l) => (l.tipo === "revisar" || !l.ci ? "" : <Estado valor={l.ci} />) },
        { titulo: C.data, render: (l) => horarioRelativo(l.data), direita: true },
      ]} />;
    if (aba === "issues")
      return <Tabela filtro={filtro} linhas={d.issues} colunas={[
        { titulo: C.titulo, render: (l) => `#${l.numero} ${l.titulo}`, texto: (l) => l.titulo },
        { titulo: C.repo, render: (l) => l.repo, texto: (l) => l.repo },
        { titulo: C.rotulos, render: (l) => <span className="linha">{l.rotulos.map((r) => <span key={r} className="etiqueta">{r}</span>)}</span>, texto: (l) => l.rotulos.join(" ") },
        { titulo: C.data, render: (l) => horarioRelativo(l.data), direita: true },
      ]} />;
    if (aba === "actions") return acoes;
    const M = T.janelaConexao.metricas;
    return (
      <div className="coluna">
        <div className="conexao-metricas">
          <Metrica rotulo={M.prsAbertos} valor={d.prs.length} />
          <Metrica rotulo={M.issuesAbertas} valor={d.issues.length} />
          <Metrica rotulo={M.falhasActions} valor={d.actions.filter((a) => a.status === "falhou").length} />
          <Metrica rotulo={M.repositorios} valor={d.repositorios.length} />
        </div>
        <ContribuicoesGithub calendario={d.contribuicoes} />
        <h3 className="conexao-bloco-titulo">{T.janelaConexao.ultimas}</h3>
        {acoes}
      </div>
    );
  }

  if (servico === "vercel") {
    const d = dados as DadosServico["vercel"];
    const deploys = (
      <Tabela filtro={filtro} linhas={d.deploys} colunas={[
        { titulo: C.projeto, render: (l) => l.projeto, texto: (l) => l.projeto },
        { titulo: C.commit, render: (l) => <span className="cortar" style={{ display: "inline-block", maxWidth: 220 }}>{l.commit}</span>, texto: (l) => l.commit },
        { titulo: C.branch, render: (l) => <code>{l.branch}</code>, texto: (l) => l.branch },
        { titulo: C.ambiente, render: (l) => l.ambiente, texto: (l) => l.ambiente },
        { titulo: C.status, render: (l) => <Estado valor={l.estado} />, texto: (l) => E[l.estado] },
        { titulo: C.duracao, render: (l) => T.janelaConexao.segundos(l.duracao), direita: true },
        { titulo: C.data, render: (l) => horarioRelativo(l.data), direita: true },
      ]} />
    );
    if (aba === "projetos")
      return <Tabela filtro={filtro} linhas={d.projetos} colunas={[
        { titulo: C.nome, render: (l) => l.nome, texto: (l) => l.nome },
        { titulo: C.dominio, render: (l) => <code>{l.dominio}</code>, texto: (l) => l.dominio },
        { titulo: C.framework, render: (l) => l.framework, texto: (l) => l.framework },
        { titulo: C.status, render: (l) => <Estado valor={l.estado} /> },
        { titulo: C.atualizado, render: (l) => horarioRelativo(l.ultimoDeploy), direita: true },
      ]} />;
    if (aba === "deploys") return deploys;
    const M = T.janelaConexao.metricas;
    const prontos = d.deploys.filter((x) => x.estado === "pronto");
    return (
      <div className="coluna">
        <div className="conexao-metricas">
          <Metrica rotulo={M.projetos} valor={d.projetos.length} />
          <Metrica rotulo={M.prontos} valor={prontos.length} />
          <Metrica rotulo={M.comErro} valor={d.deploys.filter((x) => x.estado === "erro").length} />
          <Metrica rotulo={M.tempoMedio} valor={T.janelaConexao.segundos(Math.round(prontos.reduce((a, b) => a + b.duracao, 0) / Math.max(1, prontos.length)))} />
        </div>
        <h3 className="conexao-bloco-titulo">{T.janelaConexao.ultimas}</h3>
        {deploys}
      </div>
    );
  }

  if (servico === "resend") {
    const d = dados as DadosServico["resend"];
    const emails = (
      <Tabela filtro={filtro} linhas={d.emails} colunas={[
        { titulo: C.para, render: (l) => <span className="privado">{l.para}</span>, texto: (l) => l.para },
        { titulo: C.assunto, render: (l) => l.assunto, texto: (l) => l.assunto },
        { titulo: C.status, render: (l) => <Estado valor={l.estado} />, texto: (l) => E[l.estado] },
        { titulo: C.data, render: (l) => horarioRelativo(l.data), direita: true },
      ]} />
    );
    if (aba === "emails") return emails;
    if (aba === "dominios")
      return <Tabela filtro={filtro} linhas={d.dominios} colunas={[
        { titulo: C.dominio, render: (l) => <code>{l.nome}</code>, texto: (l) => l.nome },
        { titulo: C.verificado, render: (l) => <Estado valor={l.verificado ? "confirmado" : "pendente"} /> },
      ]} />;
    const M = T.janelaConexao.metricas;
    return (
      <div className="coluna">
        <div className="conexao-metricas">
          <Metrica rotulo={M.enviados} valor={d.enviados} />
          <Metrica rotulo={M.entregues} valor={d.entregues} />
          <Metrica rotulo={M.falhas} valor={d.falhas} />
          <Metrica rotulo={M.taxaEntrega} valor={`${Math.round((d.entregues / Math.max(1, d.enviados)) * 100)}%`} />
        </div>
        <h3 className="conexao-bloco-titulo">{T.janelaConexao.ultimas}</h3>
        {emails}
      </div>
    );
  }

  if (servico === "notion") {
    const d = dados as DadosServico["notion"];
    const paginas = (
      <Tabela filtro={filtro} linhas={d.paginas} colunas={[
        { titulo: C.titulo, render: (l) => l.titulo, texto: (l) => l.titulo },
        { titulo: C.local, render: (l) => l.local, texto: (l) => l.local },
        { titulo: C.editadoPor, render: (l) => l.editadoPor, texto: (l) => l.editadoPor },
        { titulo: C.data, render: (l) => horarioRelativo(l.data), direita: true },
      ]} />
    );
    if (aba === "paginas") return paginas;
    if (aba === "bancos")
      return <Tabela filtro={filtro} linhas={d.bancos} colunas={[
        { titulo: C.nome, render: (l) => l.nome, texto: (l) => l.nome },
        { titulo: C.itens, render: (l) => l.itens, direita: true },
      ]} />;
    const M = T.janelaConexao.metricas;
    return (
      <div className="coluna">
        <div className="conexao-metricas">
          <Metrica rotulo={M.paginas} valor={d.paginas.length} />
          <Metrica rotulo={M.bancos} valor={d.bancos.length} />
        </div>
        <h3 className="conexao-bloco-titulo">{T.janelaConexao.ultimas}</h3>
        {paginas}
      </div>
    );
  }

  if (servico === "calcom") {
    const d = dados as DadosServico["calcom"];
    const agenda = (
      <Tabela filtro={filtro} linhas={[...d.agendamentos].sort((a, b) => a.inicio.localeCompare(b.inicio))} colunas={[
        { titulo: C.inicio, render: (l) => data(l.inicio) },
        { titulo: C.pessoa, render: (l) => <span className="privado">{l.pessoa}</span>, texto: (l) => l.pessoa },
        { titulo: C.tipo, render: (l) => l.tipo, texto: (l) => l.tipo },
        { titulo: C.status, render: (l) => <Estado valor={l.status} />, texto: (l) => E[l.status] },
      ]} />
    );
    if (aba === "agendamentos") return agenda;
    if (aba === "tipos")
      return <Tabela filtro={filtro} linhas={d.tiposEvento} colunas={[
        { titulo: C.nome, render: (l) => l.nome, texto: (l) => l.nome },
        { titulo: C.duracao, render: (l) => `${l.duracao} min`, direita: true },
        { titulo: C.reservas, render: (l) => l.reservas, direita: true },
      ]} />;
    const M = T.janelaConexao.metricas;
    const hoje = new Date().toDateString();
    return (
      <div className="coluna">
        <div className="conexao-metricas">
          <Metrica rotulo={M.proximos} valor={d.agendamentos.length} />
          <Metrica rotulo={M.hoje} valor={d.agendamentos.filter((a) => new Date(a.inicio).toDateString() === hoje).length} />
          <Metrica rotulo={M.pendentes} valor={d.agendamentos.filter((a) => a.status === "pendente").length} />
        </div>
        <h3 className="conexao-bloco-titulo">{T.janelaConexao.ultimas}</h3>
        {agenda}
      </div>
    );
  }

  if (servico === "google") {
    const g = dados as DadosServico["google"];
    const G = T.janelaConexao.google;
    const M = T.janelaConexao.metricas;
    const avisos = (Object.keys(G.partes) as (keyof typeof G.partes)[]).flatMap((p) => {
      const f = g.falhas[p];
      return f ? [<AvisoFaixa key={p} tipo="alerta">{G.falhas[f](G.partes[p])}</AvisoFaixa>] : [];
    });
    const emails = (linhas: NonNullable<DadosServico["google"]["gmail"]>["recentes"]) => (
      <Tabela filtro={filtro} linhas={linhas} colunas={[
        { titulo: C.de, render: (l) => <span className="privado" style={{ fontWeight: l.naoLido ? 600 : 400 }}>{l.de}</span>, texto: (l) => l.de },
        { titulo: C.assunto, render: (l) => <span className="privado" style={{ fontWeight: l.naoLido ? 600 : 400 }}>{l.assunto}</span>, texto: (l) => l.assunto },
        { titulo: C.trecho, render: (l) => <span className="privado texto-3 cortar" style={{ maxWidth: 280, display: "inline-block" }}>{l.trecho}</span>, texto: (l) => l.trecho },
        { titulo: C.data, render: (l) => data(l.data), direita: true },
      ]} />
    );
    const agenda = (linhas: NonNullable<DadosServico["google"]["agenda"]>["proximos"]) => (
      <Tabela filtro={filtro} linhas={linhas} colunas={[
        { titulo: C.data, render: (l) => formatar(l.data, "EEE, d 'de' MMM"), texto: (l) => l.data },
        { titulo: C.inicio, render: (l) => l.hora ?? "" },
        { titulo: C.titulo, render: (l) => (l.link ? <a className="privado" href={l.link} target="_blank" rel="noopener noreferrer">{l.titulo}</a> : <span className="privado">{l.titulo}</span>), texto: (l) => l.titulo },
      ]} />
    );
    const drive = (linhas: NonNullable<DadosServico["google"]["drive"]>) => (
      <Tabela filtro={filtro} linhas={linhas} colunas={[
        { titulo: C.nome, render: (l) => (l.link ? <a className="privado" href={l.link} target="_blank" rel="noopener noreferrer">{l.nome}</a> : <span className="privado">{l.nome}</span>), texto: (l) => l.nome },
        { titulo: C.tipo, render: (l) => G.tiposArquivo[l.tipo] ?? l.tipo, texto: (l) => G.tiposArquivo[l.tipo] ?? l.tipo },
        { titulo: C.alterado, render: (l) => data(l.alterado), direita: true },
      ]} />
    );
    const tarefas = (linhas: NonNullable<DadosServico["google"]["tarefas"]>) => (
      <Tabela filtro={filtro} linhas={linhas} colunas={[
        { titulo: C.titulo, render: (l) => (l.link ? <a className="privado" href={l.link} target="_blank" rel="noopener noreferrer">{l.titulo}</a> : <span className="privado">{l.titulo}</span>), texto: (l) => l.titulo },
        { titulo: C.lista, render: (l) => l.lista, texto: (l) => l.lista },
        { titulo: C.prazo, render: (l) => (l.prazo ? formatar(l.prazo, "d 'de' MMM") : <span className="texto-3">{G.semPrazo}</span>), direita: true },
      ]} />
    );
    const vazio = <Vazio titulo={T.janelaConexao.semResultados} />;
    if (aba === "importantes") return <div className="coluna">{avisos}{g.gmail?.importantes.length ? emails(g.gmail.importantes) : vazio}</div>;
    if (aba === "recentes") return <div className="coluna">{avisos}{g.gmail ? emails(g.gmail.recentes) : vazio}</div>;
    if (aba === "agenda") return <div className="coluna">{avisos}{g.agenda?.proximos.length ? agenda(g.agenda.proximos) : vazio}</div>;
    if (aba === "drive") return <div className="coluna">{avisos}{g.drive?.length ? drive(g.drive) : vazio}</div>;
    if (aba === "tarefas") return <div className="coluna">{avisos}{g.tarefas?.length ? tarefas(g.tarefas) : vazio}</div>;
    return (
      <div className="coluna">
        {avisos}
        <div className="conexao-metricas">
          <Metrica rotulo={M.naoLidos} valor={g.gmail?.naoLidos ?? "-"} />
          <Metrica rotulo={M.importantes} valor={g.gmail?.importantes.length ?? "-"} />
          <Metrica rotulo={M.hoje} valor={g.agenda?.hoje ?? "-"} />
          <Metrica rotulo={M.tarefasAbertas} valor={g.tarefas?.length ?? "-"} />
          <Metrica rotulo={M.arquivosRecentes} valor={g.drive?.length ?? "-"} />
        </div>
        {g.email && <span className="texto-3 privado">{g.email}</span>}
        {g.gmail && (
          <>
            <h3 className="conexao-bloco-titulo">{T.janelaConexao.ultimas}</h3>
            {emails(g.gmail.importantes.length ? g.gmail.importantes : g.gmail.recentes.slice(0, 8))}
          </>
        )}
      </div>
    );
  }

  if (servico === "supabase") {
    const d = dados as DadosServico["supabase"];
    const tamanho = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);
    const projetos = (
      <Tabela filtro={filtro} linhas={d.projetos} colunas={[
        { titulo: C.nome, render: (l) => l.nome, texto: (l) => l.nome },
        { titulo: C.regiao, render: (l) => l.regiao },
        { titulo: C.status, render: (l) => <Estado valor={l.status} /> },
        { titulo: C.usuarios, render: (l) => (l.semSql ? "" : l.usuarios), direita: true },
        { titulo: C.banco, render: (l) => (l.semSql ? "" : tamanho(l.bancoBytes)), direita: true },
      ]} />
    );
    if (aba === "projetos") return projetos;
    if (aba === "storage") {
      const linhas = d.projetos.flatMap((p) => p.buckets.map((b) => ({ ...b, projeto: p.nome })));
      return linhas.length ? (
        <Tabela filtro={filtro} linhas={linhas} colunas={[
          { titulo: C.projeto, render: (l) => l.projeto, texto: (l) => l.projeto },
          { titulo: C.nome, render: (l) => l.nome, texto: (l) => l.nome },
          { titulo: C.visibilidade, render: (l) => <Estado valor={l.publico ? "publico" : "privado"} /> },
          { titulo: C.arquivos, render: (l) => l.arquivos, direita: true },
          { titulo: C.tamanho, render: (l) => tamanho(l.bytes), direita: true },
        ]} />
      ) : <Vazio titulo={T.janelaConexao.semResultados} />;
    }
    if (aba === "logs") {
      const linhas = d.projetos.flatMap((p) => p.logs.map((x) => ({ ...x, projeto: p.nome })));
      return linhas.length ? (
        <Tabela filtro={filtro} linhas={linhas} colunas={[
          { titulo: C.projeto, render: (l) => l.projeto, texto: (l) => l.projeto },
          { titulo: C.mensagem, render: (l) => <code className="cortar" style={{ maxWidth: 420, display: "inline-block" }}>{l.texto}</code>, texto: (l) => l.texto },
          { titulo: C.data, render: (l) => data(l.data), direita: true },
        ]} />
      ) : <Vazio titulo={T.janelaConexao.semResultados} />;
    }
    const M = T.janelaConexao.metricas;
    const total = d.projetos.reduce((a, p) => a + p.usuarios, 0);
    return (
      <div className="coluna">
        <div className="conexao-metricas">
          <Metrica rotulo={M.projetos} valor={d.projetos.length} />
          <Metrica rotulo={M.usuarios} valor={total} />
          <Metrica rotulo={M.novos7d} valor={d.projetos.reduce((a, p) => a + p.novos7d, 0)} />
          <Metrica rotulo={M.tamanhoBanco} valor={tamanho(d.projetos.reduce((a, p) => a + p.bancoBytes, 0))} />
        </div>
        {d.projetos.some((p) => p.semSql) && <AvisoFaixa>{M.semSql}</AvisoFaixa>}
        {d.projetos.flatMap((p) => p.servicos.filter((x) => !x.saudavel).map((x) => <AvisoFaixa key={`${p.ref}-${x.nome}`} tipo="erro">{T.conexoes.ocorrencias.supabaseServico(p.nome, x.nome)}</AvisoFaixa>))}
        {projetos}
      </div>
    );
  }

  if (servico === "cloudflare") {
    const d = dados as DadosServico["cloudflare"];
    if (aba === "dominios")
      return <Tabela filtro={filtro} linhas={d.zonas} colunas={[
        { titulo: C.zona, render: (l) => l.nome, texto: (l) => l.nome },
        { titulo: C.status, render: (l) => <Estado valor={l.status} /> },
        { titulo: C.plano, render: (l) => l.plano, direita: true },
      ]} />;
    if (aba === "dns")
      return <Tabela filtro={filtro} linhas={d.dns} colunas={[
        { titulo: C.tipo, render: (l) => <code>{l.tipo}</code>, texto: (l) => l.tipo },
        { titulo: C.nome, render: (l) => l.nome, texto: (l) => l.nome },
        { titulo: C.valorDns, render: (l) => <span className="cortar privado" style={{ maxWidth: 260, display: "inline-block" }}>{l.valor}</span>, texto: (l) => l.valor },
        { titulo: C.proxy, render: (l) => <Estado valor={l.proxy ? "sim" : "nao"} />, direita: true },
      ]} />;
    if (aba === "pages")
      return d.pages.length ? <Tabela filtro={filtro} linhas={d.pages} colunas={[
        { titulo: C.projeto, render: (l) => l.nome, texto: (l) => l.nome },
        { titulo: C.dominio, render: (l) => l.dominio, texto: (l) => l.dominio },
        { titulo: C.status, render: (l) => <Estado valor={l.estado} /> },
        { titulo: C.data, render: (l) => (l.data ? data(l.data) : ""), direita: true },
      ]} /> : <Vazio titulo={T.janelaConexao.semResultados} />;
    if (aba === "workers")
      return d.workers.length ? <Tabela filtro={filtro} linhas={d.workers} colunas={[
        { titulo: C.nome, render: (l) => l.nome, texto: (l) => l.nome },
        { titulo: C.alterado, render: (l) => data(l.alterado), direita: true },
      ]} /> : <Vazio titulo={T.janelaConexao.semResultados} />;
    const M = T.janelaConexao.metricas;
    const dias = d.metricas.flatMap((m) => m.dias);
    return (
      <div className="coluna">
        <div className="conexao-metricas">
          <Metrica rotulo={M.dominios} valor={d.zonas.length} />
          <Metrica rotulo={M.requisicoes7d} valor={dias.reduce((a, x) => a + x.requisicoes, 0).toLocaleString("pt-BR")} />
          <Metrica rotulo={M.visitantes7d} valor={dias.reduce((a, x) => a + x.unicos, 0).toLocaleString("pt-BR")} />
          <Metrica rotulo={M.ameacas7d} valor={dias.reduce((a, x) => a + x.ameacas, 0).toLocaleString("pt-BR")} />
        </div>
        <Tabela filtro={filtro} linhas={d.zonas} colunas={[
          { titulo: C.zona, render: (l) => l.nome, texto: (l) => l.nome },
          { titulo: C.status, render: (l) => <Estado valor={l.status} /> },
          { titulo: C.plano, render: (l) => l.plano, direita: true },
        ]} />
      </div>
    );
  }
  const d = dados as DadosServico["n8n"];
  const execucoes = (
    <Tabela filtro={filtro} linhas={d.execucoes} colunas={[
      { titulo: "#", render: (l) => l.id, texto: (l) => l.id },
      { titulo: C.workflow, render: (l) => l.workflow, texto: (l) => l.workflow },
      { titulo: C.status, render: (l) => <Estado valor={l.status} />, texto: (l) => E[l.status] },
      { titulo: C.duracao, render: (l) => T.janelaConexao.milissegundos(l.duracao), direita: true },
      { titulo: C.data, render: (l) => horarioRelativo(l.data), direita: true },
    ]} />
  );
  if (aba === "execucoes") return execucoes;
  if (aba === "workflows")
    return <Tabela filtro={filtro} linhas={d.workflows} colunas={[
      { titulo: C.nome, render: (l) => l.nome, texto: (l) => l.nome },
      { titulo: C.ativo, render: (l) => <Estado valor={l.ativo ? "sim" : "nao"} /> },
      { titulo: C.execucoes, render: (l) => l.execucoes, direita: true },
      { titulo: C.ultimaFalha, render: (l) => (l.ultimaFalha ? horarioRelativo(l.ultimaFalha) : ""), direita: true },
    ]} />;
  const M = T.janelaConexao.metricas;
  const total = d.execucoes.length;
  return (
    <div className="coluna">
      <div className="conexao-metricas">
        <Metrica rotulo={M.workflowsAtivos} valor={d.workflows.filter((w) => w.ativo).length} />
        <Metrica rotulo={M.sucesso} valor={`${Math.round((d.execucoes.filter((e) => e.status === "sucesso").length / Math.max(1, total)) * 100)}%`} />
        <Metrica rotulo={M.erros} valor={d.execucoes.filter((e) => e.status === "erro").length} />
      </div>
      <h3 className="conexao-bloco-titulo">{T.janelaConexao.ultimas}</h3>
      {execucoes}
    </div>
  );
}

export function JanelaConexao({ janela }: { janela: EstadoJanela }) {
  const conexao = useComunicacao((s) => s.conexoes.find((c) => c.id === janela.id));
  const conexaoAtual = conexao;
  const atualizarConexao = useComunicacao((s) => s.atualizarConexao);
  const fechar = useInterface((s) => s.fecharJanelaConexao);
  const atualizarJanela = useInterface((s) => s.atualizarJanelaConexao);
  const focar = useInterface((s) => s.focarConexao);
  const irPara = useInterface((s) => s.irPara);
  const focarSistema = useInterface((s) => s.focarSistema);
  const configurarConexao = () => {
    focarSistema();
    irPara("conexoes", { servico: janela.id, aberto: String(Date.now()) });
  };
  const abas = T.janelaConexao.abas[janela.id] as Record<string, string>;
  const [aba, setAba] = useState(Object.keys(abas)[0]);
  const [filtro, setFiltro] = useState("");
  const [dados, setDados] = useState<DadosServico[ServicoId] | null>(null);
  const [erro, setErro] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);
  const todas = useComunicacao((s) => s.conexoes);
  const ativaAgora = Boolean(conexaoAtual?.ligada && conexaoAtual?.chaveSalva);
  const buscar = useCallback(
    async (forcar: boolean) => {
      setBuscando(true);
      setErro("");
      try {
        const d = await conexoesPonte.ler(janela.id, forcar);
        setDados(d);
        atualizarConexao(janela.id, { ultimaAtualizacao: new Date().toISOString(), resumo: resumoDe(janela.id, d), status: "conectado" });
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setBuscando(false);
      }
    },
    [janela.id, atualizarConexao],
  );
  useEffect(() => {
    if (ativaAgora) void buscar(false);
  }, [ativaAgora, buscar]);
  useEffect(() => {
    if (!janela.minimizada) useComunicacao.getState().marcarFalhasVistas(janela.id);
  }, [janela.id, janela.minimizada]);
  const aoMudarGeometria = useCallback((g: EstadoJanela["geometria"]) => atualizarJanela(janela.id, { geometria: g }), [atualizarJanela, janela.id]);

  if (!conexao || janela.minimizada) return null;
  const servico = T.conexoes.servicos[janela.id];
  const ativa = conexao.ligada && conexao.chaveSalva;
  const status = conexao.status;
  const tomStatus = status === "conectado" ? "etiqueta-sucesso" : status === "erro" ? "etiqueta-erro" : "";
  const fixadas = todas.filter((c) => c.fixadaNaIlha).length;
  const removerChave = async () => {
    if (!confirmandoRemocao) {
      setConfirmandoRemocao(true);
      window.setTimeout(() => setConfirmandoRemocao(false), 3000);
      return;
    }
    setConfirmandoRemocao(false);
    await conexoesPonte.removerChave(janela.id).catch(() => undefined);
    atualizarConexao(janela.id, { chaveSalva: false, ligada: false, status: "sem_chave", resumo: "" });
  };

  return (
    <Janela
      className="estilo-sistema"
      titulo={
        <span className="linha">
          <Marca marca={janela.id} tamanho={14} />
          {servico.nome}
        </span>
      }
      rotuloAcessivel={servico.nome}
      geometria={janela.geometria}
      maximizada={janela.maximizada}
      z={janela.z}
      minimo={MINIMO}
      aoFocar={() => focar(janela.id)}
      aoFechar={() => fechar(janela.id)}
      aoMinimizar={() => atualizarJanela(janela.id, { minimizada: true })}
      aoMaximizar={() => atualizarJanela(janela.id, { maximizada: !janela.maximizada })}
      aoMudarGeometria={aoMudarGeometria}
    >
      <div className="conexao-janela">
        <header className="conexao-janela-topo">
          <span className="conexao-janela-logo">
            <Marca marca={janela.id} tamanho={24} />
          </span>
          <span className="conexao-janela-titulo">
            <span className="conexao-janela-nome">
              <h2>{servico.nome}</h2>
              <span className={`etiqueta ${tomStatus}`}>{T.conexoes.status[status]}</span>
            </span>
            <span className="conexao-janela-sub cortar">
              {servico.descricao} · {conexao.ultimaAtualizacao ? T.conexoes.atualizado(horarioRelativo(conexao.ultimaAtualizacao)) : T.conexoes.nunca}
            </span>
          </span>
          <div className="conexao-janela-acoes">
            <Botao
              icone={<RefreshCw size={13} />}
              disabled={!ativa || buscando}
              onClick={() => {
                void tocarSom("search");
                void buscar(true);
              }}
            >
              {T.janelaConexao.atualizar}
            </Botao>
            <a className="botao botao-secundario" href={PAINEL_OFICIAL[janela.id]} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={13} />
              {T.janelaConexao.abrirPainel}
            </a>
            <Botao soIcone icone={<Settings2 size={14} />} aria-label={T.janelaConexao.configurar} title={T.janelaConexao.configurar} onClick={() => configurarConexao()} />
          </div>
        </header>
        {erro && <div className="conexao-janela-erro"><AvisoFaixa tipo="erro">{T.conexoes.falhaLeitura(erro)}</AvisoFaixa></div>}
        {!ativa ? (
          <Vazio
            icone={<Marca marca={janela.id} tamanho={32} />}
            titulo={T.janelaConexao.desligada}
            texto={T.janelaConexao.desligadaDica}
            acao={<Botao variante="primario" onClick={() => configurarConexao()}>{T.janelaConexao.configurar}</Botao>}
          />
        ) : (
          <>
            <div className="conexao-abas" role="tablist" aria-label={T.janelaConexao.abasRotulo}>
              {Object.entries(abas).map(([valor, rotulo]) => (
                <button key={valor} type="button" role="tab" aria-selected={aba === valor} onClick={() => { setAba(valor); setFiltro(""); }}>{rotulo}</button>
              ))}
            </div>
            <div className="conexao-janela-corpo">
              <div className="conexao-janela-principal">
                {aba !== "visao" && (
                  <label className="campo-busca conexao-janela-busca">
                    <Search size={14} />
                    <input className="campo" value={filtro} maxLength={80} onChange={(e) => setFiltro(e.target.value)} placeholder={T.janelaConexao.buscar} aria-label={T.janelaConexao.buscar} />
                  </label>
                )}
                {dados ? <ConteudoServico servico={janela.id} aba={aba} filtro={filtro} dados={dados} /> : <p className="conexao-janela-carregando">{buscando ? T.conexoes.carregando : ""}</p>}
              </div>
              <aside className="conexao-janela-lado">
                <div className="conexao-lado-cartao">
                  <span className="conexao-lado-rotulo">{T.conexoes.chave}</span>
                  <button type="button" className="conexao-chave" title={T.janelaConexao.trocarChave} onClick={() => configurarConexao()}>
                    <Lock size={12} />
                    <span className="cortar">{T.janelaConexao.chaveGuardada}</span>
                    <span className="conexao-chave-trocar">{T.janelaConexao.trocarChave}</span>
                  </button>
                  <span className="conexao-lado-dica">{T.conexoes.chaveDica}</span>
                </div>
                <div className="conexao-lado-cartao">
                  <label className="conexao-lado-linha" htmlFor={`cx-int-${janela.id}`}>
                    {T.conexoes.intervalo}
                    <select id={`cx-int-${janela.id}`} className="seletor conexao-intervalo" value={conexao.intervalo} onChange={(e) => atualizarConexao(janela.id, { intervalo: Number(e.target.value) })}>
                      {INTERVALOS.map((s) => <option key={s} value={s}>{T.conexoes.segundos(s)}</option>)}
                    </select>
                  </label>
                  <span className="conexao-lado-linha">
                    {T.conexoes.fixarNaIlha}
                    <Alternador ligado={conexao.fixadaNaIlha} rotulo={T.conexoes.fixarNaIlha} desativado={!conexao.fixadaNaIlha && fixadas >= 4} aoMudar={(v) => atualizarConexao(janela.id, { fixadaNaIlha: v })} />
                  </span>
                  <span className="conexao-lado-dica">{T.conexoes.limiteIlha}</span>
                </div>
                <div className="conexao-lado-botoes">
                  <button type="button" className="conexao-desligar" onClick={() => atualizarConexao(janela.id, { ligada: false, status: "pausado" })}>{T.conexoes.desligar}</button>
                  <button type="button" className="conexao-remover" data-confirmando={confirmandoRemocao || undefined} onClick={() => void removerChave()}>
                    {confirmandoRemocao ? T.janelaConexao.confirmarRemocao : T.conexoes.removerChave}
                  </button>
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </Janela>
  );
}
