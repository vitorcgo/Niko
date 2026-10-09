import { useCallback, useEffect, useState, type ReactNode } from "react";
import { RefreshCw, ExternalLink, Search, Settings2, Lock, Globe, Star } from "lucide-react";
import { WindowValue } from "../../windows/Window";
import { useInterface, type ConnectionWindow as StateWindow } from "../../state/interface";
import { useCommunication } from "../../state/communication";
import { Brand } from "../../brands/Brand";
import { Button, Segmented, Empty, NoticeBanner } from "../../components/basics";
import { T } from "../../i18n/ptBR";
import { connectionsBridge, PANEL_OFFICIAL, summary, type DataService } from "../../bridge/liveConnections";
import { formatMoney } from "../../utils/money";
import { formatDateString, scheduleRelative } from "../../utils/dates";
import { contains } from "../../utils/basics";
import { playSound } from "../../bridge/sounds";
import type { ServiceId } from "../../types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const MINIMUM = { w: 560, h: 420 };
const C = T.janelaConexao.colunas;
const E = T.janelaConexao.estados;

interface Column<L> {
  titulo: string;
  render: (line: L) => ReactNode;
  texto?: (line: L) => string;
  direita?: boolean;
}

function Table<L>({ linhas: lines, colunas: columns, filtro: filter }: { linhas: L[]; colunas: Column<L>[]; filtro: string }) {
  const filtered = filter
    ? lines.filter((l) => columns.some((c) => (c.texto ? contains(c.texto(l), filter) : false)))
    : lines;
  if (filtered.length === 0) return <Empty titulo={T.janelaConexao.semResultados} />;
  return (
    <div className="tabela-rolagem">
      <table className="tabela">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.titulo} className={c.direita ? "direita" : undefined}>{c.titulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((l, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.titulo} className={c.direita ? "direita numero" : undefined}>{c.render(l)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function State({ valor: value }: { valor: string }) {
  const tone = ["pago", "sucesso", "pronto", "entregue", "aberto", "confirmado", "aprovado", "pago"].includes(value)
    ? "sucesso"
    : ["falhou", "erro", "devolvido", "spam", "cancelado"].includes(value)
      ? "erro"
      : ["rodando", "construindo", "a_caminho", "pendente", "mudancas", "reembolsado", "revisar"].includes(value)
        ? "alerta"
        : "";
  return <span className={`etiqueta ${tone ? `etiqueta-${tone}` : ""}`}>{E[value] ?? value}</span>;
}

function Metric({ rotulo: label, valor: value }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="cartao metrica">
      <span className="rotulo-secao">{label}</span>
      <span className="numero-grande privado">{value}</span>
    </div>
  );
}

const data = (iso: string) => format(new Date(iso), "d MMM, HH:mm", { locale: ptBR });

function ContentService({ servico: service, aba: tab, filtro: filter, dados: payload }: { servico: ServiceId; aba: string; filtro: string; dados: DataService[ServiceId] }) {

  if (service === "stripe") {
    const d = payload as DataService["stripe"];
    const charges = (
      <Table
        filtro={filter}
        linhas={d.cobrancas}
        colunas={[
          { titulo: C.cliente, render: (l) => l.cliente, texto: (l) => l.cliente },
          { titulo: C.metodo, render: (l) => l.metodo, texto: (l) => l.metodo },
          { titulo: C.status, render: (l) => <State valor={l.status} />, texto: (l) => E[l.status] },
          { titulo: C.data, render: (l) => data(l.data) },
          { titulo: C.valor, render: (l) => <span className="privado">{formatMoney(l.valor)}</span>, direita: true },
        ]}
      />
    );
    if (tab === "cobrancas") return charges;
    if (tab === "disputas")
      return d.disputas.length === 0 ? (
        <Empty titulo={T.janelaConexao.semResultados} />
      ) : (
        <Table filtro={filter} linhas={d.disputas} colunas={[
          { titulo: C.motivo, render: (l) => l.motivo, texto: (l) => l.motivo },
          { titulo: C.prazo, render: (l) => data(l.prazo) },
          { titulo: C.valor, render: (l) => formatMoney(l.valor), direita: true },
        ]} />
      );
    if (tab === "repasses")
      return <Table filtro={filter} linhas={d.repasses} colunas={[
        { titulo: C.chegada, render: (l) => data(l.chegada) },
        { titulo: C.status, render: (l) => <State valor={l.status} />, texto: (l) => E[l.status] },
        { titulo: C.valor, render: (l) => <span className="privado">{formatMoney(l.valor)}</span>, direita: true },
      ]} />;
    if (tab === "clientes")
      return <Table filtro={filter} linhas={d.clientes} colunas={[
        { titulo: C.nome, render: (l) => l.nome, texto: (l) => l.nome },
        { titulo: C.email, render: (l) => <span className="privado">{l.email}</span>, texto: (l) => l.email },
        { titulo: C.desde, render: (l) => data(l.desde) },
        { titulo: C.total, render: (l) => <span className="privado">{formatMoney(l.total)}</span>, direita: true },
      ]} />;
    const M = T.janelaConexao.metricas;
    return (
      <div className="coluna">
        <div className="grade-metricas">
          <Metric rotulo={M.disponivel} valor={formatMoney(d.disponivel)} />
          <Metric rotulo={M.pendente} valor={formatMoney(d.pendente)} />
          <Metric rotulo={M.pagasHoje} valor={d.cobrancas.filter((c) => c.status === "pago").length} />
          <Metric rotulo={M.falhas} valor={d.cobrancas.filter((c) => c.status === "falhou").length} />
        </div>
        <h3 className="rotulo-secao">{T.janelaConexao.ultimas}</h3>
        {charges}
      </div>
    );
  }

  if (service === "github") {
    const d = payload as DataService["github"];
    const actions = (
      <Table filtro={filter} linhas={d.actions} colunas={[
        { titulo: C.workflow, render: (l) => l.workflow, texto: (l) => l.workflow },
        { titulo: C.repo, render: (l) => l.repo, texto: (l) => l.repo },
        { titulo: C.branch, render: (l) => <code>{l.branch}</code>, texto: (l) => l.branch },
        { titulo: C.status, render: (l) => <State valor={l.status} />, texto: (l) => E[l.status] },
        { titulo: C.duracao, render: (l) => T.janelaConexao.segundos(l.duracao), direita: true },
        { titulo: C.data, render: (l) => scheduleRelative(l.data), direita: true },
      ]} />
    );
    if (tab === "repositorios")
      return <Table filtro={filter} linhas={d.repositorios} colunas={[
        { titulo: C.nome, render: (l) => <span className="linha">{l.privado ? <Lock size={12} /> : <Globe size={12} />}{l.nome}</span>, texto: (l) => l.nome },
        { titulo: C.linguagem, render: (l) => l.linguagem, texto: (l) => l.linguagem },
        { titulo: C.estrelas, render: (l) => <span className="linha"><Star size={12} />{l.estrelas}</span>, direita: true },
        { titulo: C.atualizado, render: (l) => scheduleRelative(l.atualizado), direita: true },
      ]} />;
    if (tab === "prs")
      return <Table filtro={filter} linhas={d.prs} colunas={[
        { titulo: C.titulo, render: (l) => `#${l.numero} ${l.titulo}`, texto: (l) => l.titulo },
        { titulo: C.repo, render: (l) => l.repo, texto: (l) => l.repo },
        { titulo: C.autor, render: (l) => l.autor, texto: (l) => l.autor },
        { titulo: C.revisao, render: (l) => <State valor={l.tipo === "revisar" ? "revisar" : l.revisao} /> },
        { titulo: C.ci, render: (l) => (l.tipo === "revisar" || !l.ci ? "" : <State valor={l.ci} />) },
        { titulo: C.data, render: (l) => scheduleRelative(l.data), direita: true },
      ]} />;
    if (tab === "issues")
      return <Table filtro={filter} linhas={d.issues} colunas={[
        { titulo: C.titulo, render: (l) => `#${l.numero} ${l.titulo}`, texto: (l) => l.titulo },
        { titulo: C.repo, render: (l) => l.repo, texto: (l) => l.repo },
        { titulo: C.rotulos, render: (l) => <span className="linha">{l.rotulos.map((r) => <span key={r} className="etiqueta">{r}</span>)}</span>, texto: (l) => l.rotulos.join(" ") },
        { titulo: C.data, render: (l) => scheduleRelative(l.data), direita: true },
      ]} />;
    if (tab === "actions") return actions;
    const M = T.janelaConexao.metricas;
    return (
      <div className="coluna">
        <div className="grade-metricas">
          <Metric rotulo={M.prsAbertos} valor={d.prs.length} />
          <Metric rotulo={M.issuesAbertas} valor={d.issues.length} />
          <Metric rotulo={M.falhasActions} valor={d.actions.filter((a) => a.status === "falhou").length} />
          <Metric rotulo={M.repositorios} valor={d.repositorios.length} />
        </div>
        <h3 className="rotulo-secao">{T.janelaConexao.ultimas}</h3>
        {actions}
      </div>
    );
  }

  if (service === "vercel") {
    const d = payload as DataService["vercel"];
    const deploys = (
      <Table filtro={filter} linhas={d.deploys} colunas={[
        { titulo: C.projeto, render: (l) => l.projeto, texto: (l) => l.projeto },
        { titulo: C.commit, render: (l) => <span className="cortar" style={{ display: "inline-block", maxWidth: 220 }}>{l.commit}</span>, texto: (l) => l.commit },
        { titulo: C.branch, render: (l) => <code>{l.branch}</code>, texto: (l) => l.branch },
        { titulo: C.ambiente, render: (l) => l.ambiente, texto: (l) => l.ambiente },
        { titulo: C.status, render: (l) => <State valor={l.estado} />, texto: (l) => E[l.estado] },
        { titulo: C.duracao, render: (l) => T.janelaConexao.segundos(l.duracao), direita: true },
        { titulo: C.data, render: (l) => scheduleRelative(l.data), direita: true },
      ]} />
    );
    if (tab === "projetos")
      return <Table filtro={filter} linhas={d.projetos} colunas={[
        { titulo: C.nome, render: (l) => l.nome, texto: (l) => l.nome },
        { titulo: C.dominio, render: (l) => <code>{l.dominio}</code>, texto: (l) => l.dominio },
        { titulo: C.framework, render: (l) => l.framework, texto: (l) => l.framework },
        { titulo: C.status, render: (l) => <State valor={l.estado} /> },
        { titulo: C.atualizado, render: (l) => scheduleRelative(l.ultimoDeploy), direita: true },
      ]} />;
    if (tab === "deploys") return deploys;
    const M = T.janelaConexao.metricas;
    const ready = d.deploys.filter((x) => x.estado === "pronto");
    return (
      <div className="coluna">
        <div className="grade-metricas">
          <Metric rotulo={M.projetos} valor={d.projetos.length} />
          <Metric rotulo={M.prontos} valor={ready.length} />
          <Metric rotulo={M.comErro} valor={d.deploys.filter((x) => x.estado === "erro").length} />
          <Metric rotulo={M.tempoMedio} valor={T.janelaConexao.segundos(Math.round(ready.reduce((a, b) => a + b.duracao, 0) / Math.max(1, ready.length)))} />
        </div>
        <h3 className="rotulo-secao">{T.janelaConexao.ultimas}</h3>
        {deploys}
      </div>
    );
  }

  if (service === "resend") {
    const d = payload as DataService["resend"];
    const emails = (
      <Table filtro={filter} linhas={d.emails} colunas={[
        { titulo: C.para, render: (l) => <span className="privado">{l.para}</span>, texto: (l) => l.para },
        { titulo: C.assunto, render: (l) => l.assunto, texto: (l) => l.assunto },
        { titulo: C.status, render: (l) => <State valor={l.estado} />, texto: (l) => E[l.estado] },
        { titulo: C.data, render: (l) => scheduleRelative(l.data), direita: true },
      ]} />
    );
    if (tab === "emails") return emails;
    if (tab === "dominios")
      return <Table filtro={filter} linhas={d.dominios} colunas={[
        { titulo: C.dominio, render: (l) => <code>{l.nome}</code>, texto: (l) => l.nome },
        { titulo: C.verificado, render: (l) => <State valor={l.verificado ? "confirmado" : "pendente"} /> },
      ]} />;
    const M = T.janelaConexao.metricas;
    return (
      <div className="coluna">
        <div className="grade-metricas">
          <Metric rotulo={M.enviados} valor={d.enviados} />
          <Metric rotulo={M.entregues} valor={d.entregues} />
          <Metric rotulo={M.falhas} valor={d.falhas} />
          <Metric rotulo={M.taxaEntrega} valor={`${Math.round((d.entregues / Math.max(1, d.enviados)) * 100)}%`} />
        </div>
        <h3 className="rotulo-secao">{T.janelaConexao.ultimas}</h3>
        {emails}
      </div>
    );
  }

  if (service === "notion") {
    const d = payload as DataService["notion"];
    const pages = (
      <Table filtro={filter} linhas={d.paginas} colunas={[
        { titulo: C.titulo, render: (l) => l.titulo, texto: (l) => l.titulo },
        { titulo: C.local, render: (l) => l.local, texto: (l) => l.local },
        { titulo: C.editadoPor, render: (l) => l.editadoPor, texto: (l) => l.editadoPor },
        { titulo: C.data, render: (l) => scheduleRelative(l.data), direita: true },
      ]} />
    );
    if (tab === "paginas") return pages;
    if (tab === "bancos")
      return <Table filtro={filter} linhas={d.bancos} colunas={[
        { titulo: C.nome, render: (l) => l.nome, texto: (l) => l.nome },
        { titulo: C.itens, render: (l) => l.itens, direita: true },
      ]} />;
    const M = T.janelaConexao.metricas;
    return (
      <div className="coluna">
        <div className="grade-metricas">
          <Metric rotulo={M.paginas} valor={d.paginas.length} />
          <Metric rotulo={M.bancos} valor={d.bancos.length} />
        </div>
        <h3 className="rotulo-secao">{T.janelaConexao.ultimas}</h3>
        {pages}
      </div>
    );
  }

  if (service === "calcom") {
    const d = payload as DataService["calcom"];
    const agenda = (
      <Table filtro={filter} linhas={[...d.agendamentos].sort((a, b) => a.inicio.localeCompare(b.inicio))} colunas={[
        { titulo: C.inicio, render: (l) => data(l.inicio) },
        { titulo: C.pessoa, render: (l) => <span className="privado">{l.pessoa}</span>, texto: (l) => l.pessoa },
        { titulo: C.tipo, render: (l) => l.tipo, texto: (l) => l.tipo },
        { titulo: C.status, render: (l) => <State valor={l.status} />, texto: (l) => E[l.status] },
      ]} />
    );
    if (tab === "agendamentos") return agenda;
    if (tab === "tipos")
      return <Table filtro={filter} linhas={d.tiposEvento} colunas={[
        { titulo: C.nome, render: (l) => l.nome, texto: (l) => l.nome },
        { titulo: C.duracao, render: (l) => `${l.duracao} min`, direita: true },
        { titulo: C.reservas, render: (l) => l.reservas, direita: true },
      ]} />;
    const M = T.janelaConexao.metricas;
    const today = new Date().toDateString();
    return (
      <div className="coluna">
        <div className="grade-metricas">
          <Metric rotulo={M.proximos} valor={d.agendamentos.length} />
          <Metric rotulo={M.hoje} valor={d.agendamentos.filter((a) => new Date(a.inicio).toDateString() === today).length} />
          <Metric rotulo={M.pendentes} valor={d.agendamentos.filter((a) => a.status === "pendente").length} />
        </div>
        <h3 className="rotulo-secao">{T.janelaConexao.ultimas}</h3>
        {agenda}
      </div>
    );
  }

  if (service === "gmail") {
    const d = payload as DataService["gmail"];
    const table = (lines: DataService["gmail"]["recentes"]) => (
      <Table filtro={filter} linhas={lines} colunas={[
        { titulo: C.de, render: (l) => <span className="privado" style={{ fontWeight: l.naoLido ? 600 : 400 }}>{l.de}</span>, texto: (l) => l.de },
        { titulo: C.assunto, render: (l) => <span className="privado" style={{ fontWeight: l.naoLido ? 600 : 400 }}>{l.assunto}</span>, texto: (l) => l.assunto },
        { titulo: C.trecho, render: (l) => <span className="privado texto-3 cortar" style={{ maxWidth: 280, display: "inline-block" }}>{l.trecho}</span>, texto: (l) => l.trecho },
        { titulo: C.data, render: (l) => data(l.data), direita: true },
      ]} />
    );
    if (tab === "importantes") return d.importantes.length ? table(d.importantes) : <Empty titulo={T.janelaConexao.semResultados} />;
    if (tab === "recentes") return table(d.recentes);
    const M = T.janelaConexao.metricas;
    return (
      <div className="coluna">
        <div className="grade-metricas">
          <Metric rotulo={M.naoLidos} valor={d.naoLidos} />
          <Metric rotulo={M.importantes} valor={d.importantes.length} />
          <Metric rotulo={M.totalEmails} valor={d.total} />
        </div>
        <span className="texto-3 privado">{d.email}</span>
        <h3 className="rotulo-secao">{T.janelaConexao.ultimas}</h3>
        {table(d.importantes.length ? d.importantes : d.recentes.slice(0, 8))}
      </div>
    );
  }

  if (service === "agenda") {
    const d = payload as DataService["agenda"];
    const M = T.janelaConexao.metricas;
    return (
      <div className="coluna">
        <div className="grade-metricas">
          <Metric rotulo={M.hoje} valor={d.hoje} />
          <Metric rotulo={M.proximos} valor={d.proximos.length} />
        </div>
        <Table filtro={filter} linhas={d.proximos} colunas={[
          { titulo: C.data, render: (l) => formatDateString(l.data, "EEE, d 'de' MMM"), texto: (l) => l.data },
          { titulo: C.inicio, render: (l) => l.hora ?? "" },
          { titulo: C.titulo, render: (l) => <span className="privado">{l.titulo}</span>, texto: (l) => l.titulo },
        ]} />
      </div>
    );
  }

  if (service === "supabase") {
    const d = payload as DataService["supabase"];
    const size = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);
    const projects = (
      <Table filtro={filter} linhas={d.projetos} colunas={[
        { titulo: C.nome, render: (l) => l.nome, texto: (l) => l.nome },
        { titulo: C.regiao, render: (l) => l.regiao },
        { titulo: C.status, render: (l) => <State valor={l.status} /> },
        { titulo: C.usuarios, render: (l) => (l.semSql ? "" : l.usuarios), direita: true },
        { titulo: C.banco, render: (l) => (l.semSql ? "" : size(l.bancoBytes)), direita: true },
      ]} />
    );
    if (tab === "projetos") return projects;
    if (tab === "storage") {
      const lines = d.projetos.flatMap((p) => p.buckets.map((b) => ({ ...b, projeto: p.nome })));
      return lines.length ? (
        <Table filtro={filter} linhas={lines} colunas={[
          { titulo: C.projeto, render: (l) => l.projeto, texto: (l) => l.projeto },
          { titulo: C.nome, render: (l) => l.nome, texto: (l) => l.nome },
          { titulo: C.visibilidade, render: (l) => <State valor={l.publico ? "publico" : "privado"} /> },
          { titulo: C.arquivos, render: (l) => l.arquivos, direita: true },
          { titulo: C.tamanho, render: (l) => size(l.bytes), direita: true },
        ]} />
      ) : <Empty titulo={T.janelaConexao.semResultados} />;
    }
    if (tab === "logs") {
      const lines = d.projetos.flatMap((p) => p.logs.map((x) => ({ ...x, projeto: p.nome })));
      return lines.length ? (
        <Table filtro={filter} linhas={lines} colunas={[
          { titulo: C.projeto, render: (l) => l.projeto, texto: (l) => l.projeto },
          { titulo: C.mensagem, render: (l) => <code className="cortar" style={{ maxWidth: 420, display: "inline-block" }}>{l.texto}</code>, texto: (l) => l.texto },
          { titulo: C.data, render: (l) => data(l.data), direita: true },
        ]} />
      ) : <Empty titulo={T.janelaConexao.semResultados} />;
    }
    const M = T.janelaConexao.metricas;
    const total = d.projetos.reduce((a, p) => a + p.usuarios, 0);
    return (
      <div className="coluna">
        <div className="grade-metricas">
          <Metric rotulo={M.projetos} valor={d.projetos.length} />
          <Metric rotulo={M.usuarios} valor={total} />
          <Metric rotulo={M.novos7d} valor={d.projetos.reduce((a, p) => a + p.novos7d, 0)} />
          <Metric rotulo={M.tamanhoBanco} valor={size(d.projetos.reduce((a, p) => a + p.bancoBytes, 0))} />
        </div>
        {d.projetos.some((p) => p.semSql) && <NoticeBanner>{M.semSql}</NoticeBanner>}
        {d.projetos.flatMap((p) => p.servicos.filter((x) => !x.saudavel).map((x) => <NoticeBanner key={`${p.ref}-${x.nome}`} tipo="erro">{T.conexoes.ocorrencias.supabaseServico(p.nome, x.nome)}</NoticeBanner>))}
        {projects}
      </div>
    );
  }

  if (service === "cloudflare") {
    const d = payload as DataService["cloudflare"];
    if (tab === "dominios")
      return <Table filtro={filter} linhas={d.zonas} colunas={[
        { titulo: C.zona, render: (l) => l.nome, texto: (l) => l.nome },
        { titulo: C.status, render: (l) => <State valor={l.status} /> },
        { titulo: C.plano, render: (l) => l.plano, direita: true },
      ]} />;
    if (tab === "dns")
      return <Table filtro={filter} linhas={d.dns} colunas={[
        { titulo: C.tipo, render: (l) => <code>{l.tipo}</code>, texto: (l) => l.tipo },
        { titulo: C.nome, render: (l) => l.nome, texto: (l) => l.nome },
        { titulo: C.valorDns, render: (l) => <span className="cortar privado" style={{ maxWidth: 260, display: "inline-block" }}>{l.valor}</span>, texto: (l) => l.valor },
        { titulo: C.proxy, render: (l) => <State valor={l.proxy ? "sim" : "nao"} />, direita: true },
      ]} />;
    if (tab === "pages")
      return d.pages.length ? <Table filtro={filter} linhas={d.pages} colunas={[
        { titulo: C.projeto, render: (l) => l.nome, texto: (l) => l.nome },
        { titulo: C.dominio, render: (l) => l.dominio, texto: (l) => l.dominio },
        { titulo: C.status, render: (l) => <State valor={l.estado} /> },
        { titulo: C.data, render: (l) => (l.data ? data(l.data) : ""), direita: true },
      ]} /> : <Empty titulo={T.janelaConexao.semResultados} />;
    if (tab === "workers")
      return d.workers.length ? <Table filtro={filter} linhas={d.workers} colunas={[
        { titulo: C.nome, render: (l) => l.nome, texto: (l) => l.nome },
        { titulo: C.alterado, render: (l) => data(l.alterado), direita: true },
      ]} /> : <Empty titulo={T.janelaConexao.semResultados} />;
    const M = T.janelaConexao.metricas;
    const days = d.metricas.flatMap((m) => m.dias);
    return (
      <div className="coluna">
        <div className="grade-metricas">
          <Metric rotulo={M.dominios} valor={d.zonas.length} />
          <Metric rotulo={M.requisicoes7d} valor={days.reduce((a, x) => a + x.requisicoes, 0).toLocaleString("pt-BR")} />
          <Metric rotulo={M.visitantes7d} valor={days.reduce((a, x) => a + x.unicos, 0).toLocaleString("pt-BR")} />
          <Metric rotulo={M.ameacas7d} valor={days.reduce((a, x) => a + x.ameacas, 0).toLocaleString("pt-BR")} />
        </div>
        <Table filtro={filter} linhas={d.zonas} colunas={[
          { titulo: C.zona, render: (l) => l.nome, texto: (l) => l.nome },
          { titulo: C.status, render: (l) => <State valor={l.status} /> },
          { titulo: C.plano, render: (l) => l.plano, direita: true },
        ]} />
      </div>
    );
  }
  const d = payload as DataService["n8n"];
  const executions = (
    <Table filtro={filter} linhas={d.execucoes} colunas={[
      { titulo: "#", render: (l) => l.id, texto: (l) => l.id },
      { titulo: C.workflow, render: (l) => l.workflow, texto: (l) => l.workflow },
      { titulo: C.status, render: (l) => <State valor={l.status} />, texto: (l) => E[l.status] },
      { titulo: C.duracao, render: (l) => T.janelaConexao.milissegundos(l.duracao), direita: true },
      { titulo: C.data, render: (l) => scheduleRelative(l.data), direita: true },
    ]} />
  );
  if (tab === "execucoes") return executions;
  if (tab === "workflows")
    return <Table filtro={filter} linhas={d.workflows} colunas={[
      { titulo: C.nome, render: (l) => l.nome, texto: (l) => l.nome },
      { titulo: C.ativo, render: (l) => <State valor={l.ativo ? "sim" : "nao"} /> },
      { titulo: C.execucoes, render: (l) => l.execucoes, direita: true },
      { titulo: C.ultimaFalha, render: (l) => (l.ultimaFalha ? scheduleRelative(l.ultimaFalha) : ""), direita: true },
    ]} />;
  const M = T.janelaConexao.metricas;
  const total = d.execucoes.length;
  return (
    <div className="coluna">
      <div className="grade-metricas">
        <Metric rotulo={M.workflowsAtivos} valor={d.workflows.filter((w) => w.ativo).length} />
        <Metric rotulo={M.sucesso} valor={`${Math.round((d.execucoes.filter((e) => e.status === "sucesso").length / Math.max(1, total)) * 100)}%`} />
        <Metric rotulo={M.erros} valor={d.execucoes.filter((e) => e.status === "erro").length} />
      </div>
      <h3 className="rotulo-secao">{T.janelaConexao.ultimas}</h3>
      {executions}
    </div>
  );
}

export function ConnectionWindow({ janela: windowValue }: { janela: StateWindow }) {
  const connection = useCommunication((s) => s.conexoes.find((c) => c.id === windowValue.id));
  const connectionCurrent = connection;
  const updateConnection = useCommunication((s) => s.updateConnection);
  const closeValue = useInterface((s) => s.closeWindowConnection);
  const updateWindow = useInterface((s) => s.updateWindowConnection);
  const focusValue = useInterface((s) => s.focusConnection);
  const navigateTo = useInterface((s) => s.navigateTo);
  const focusSystem = useInterface((s) => s.focusSystem);
  const configureConnection = () => {
    focusSystem();
    navigateTo("conexoes", { servico: windowValue.id, aberto: String(Date.now()) });
  };
  const tabs = T.janelaConexao.abas[windowValue.id] as Record<string, string>;
  const [tab, setTab] = useState(Object.keys(tabs)[0]);
  const [filter, setFilter] = useState("");
  const [payload, setData] = useState<DataService[ServiceId] | null>(null);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const activeNow = Boolean(connectionCurrent?.ligada && connectionCurrent?.chaveSalva);
  const search = useCallback(
    async (force: boolean) => {
      setSearching(true);
      setError("");
      try {
        const d = await connectionsBridge.ler(windowValue.id, force);
        setData(d);
        updateConnection(windowValue.id, { ultimaAtualizacao: new Date().toISOString(), resumo: summary(windowValue.id, d), status: "conectado" });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSearching(false);
      }
    },
    [windowValue.id, updateConnection],
  );
  useEffect(() => {
    if (activeNow) void search(false);
  }, [activeNow, search]);
  useEffect(() => {
    if (!windowValue.minimizada) useCommunication.getState().markFailuresViews(windowValue.id);
  }, [windowValue.id, windowValue.minimizada]);
  const onChangeGeometry = useCallback((g: StateWindow["geometria"]) => updateWindow(windowValue.id, { geometria: g }), [updateWindow, windowValue.id]);

  if (!connection || windowValue.minimizada) return null;
  const service = T.conexoes.servicos[windowValue.id];
  const active = connection.ligada && connection.chaveSalva;

  return (
    <WindowValue
      titulo={
        <span className="linha">
          <Brand marca={windowValue.id} tamanho={14} />
          {service.nome}
        </span>
      }
      rotuloAcessivel={service.nome}
      geometria={windowValue.geometria}
      maximizada={windowValue.maximizada}
      z={windowValue.z}
      minimo={MINIMUM}
      aoFocar={() => focusValue(windowValue.id)}
      aoFechar={() => closeValue(windowValue.id)}
      aoMinimizar={() => updateWindow(windowValue.id, { minimizada: true })}
      aoMaximizar={() => updateWindow(windowValue.id, { maximizada: !windowValue.maximizada })}
      aoMudarGeometria={onChangeGeometry}
    >
      <div className="janela-conexao">
        <header className="janela-conexao-topo">
          <div className="janela-conexao-marca">
            <Brand marca={windowValue.id} tamanho={26} />
          </div>
          <div className="coluna" style={{ gap: 2, minWidth: 0 }}>
            <h2 className="titulo-secao">{service.nome}</h2>
            <span className="texto-2 cortar">
              {T.conexoes.status[connection.status]}
              {" . "}
              {connection.ultimaAtualizacao ? T.conexoes.atualizado(scheduleRelative(connection.ultimaAtualizacao)) : T.conexoes.nunca}
            </span>
          </div>
          <div className="linha empurrar">
            <Button
              pequeno
              icone={<RefreshCw size={13} />}
              disabled={!active || searching}
              onClick={() => {
                void playSound("search");
                void search(true);
              }}
            >
              {T.janelaConexao.atualizar}
            </Button>
            <a className="botao botao-secundario botao-pequeno" href={PANEL_OFFICIAL[windowValue.id]} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={13} />
              {T.janelaConexao.abrirPainel}
            </a>
            <Button pequeno soIcone variante="fantasma" icone={<Settings2 size={14} />} aria-label={T.janelaConexao.configurar} title={T.janelaConexao.configurar} onClick={() => configureConnection()} />
          </div>
        </header>
        {error && <NoticeBanner tipo="erro">{T.conexoes.falhaLeitura(error)}</NoticeBanner>}
        {!active ? (
          <Empty
            icone={<Brand marca={windowValue.id} tamanho={32} />}
            titulo={T.janelaConexao.desligada}
            texto={T.janelaConexao.desligadaDica}
            acao={<Button variante="primario" onClick={() => configureConnection()}>{T.janelaConexao.configurar}</Button>}
          />
        ) : (
          <>
            <div className="linha-entre" style={{ flexWrap: "wrap" }}>
              <Segmented rotulo={service.nome} valor={tab} aoMudar={(v) => { setTab(v); setFilter(""); }} opcoes={Object.entries(tabs).map(([value, label]) => ({ valor: value, rotulo: label }))} />
              {tab !== "visao" && (
                <label className="campo-busca">
                  <Search size={14} />
                  <input className="campo" value={filter} maxLength={80} onChange={(e) => setFilter(e.target.value)} placeholder={T.janelaConexao.buscar} aria-label={T.janelaConexao.buscar} />
                </label>
              )}
            </div>
            {payload ? <ContentService servico={windowValue.id} aba={tab} filtro={filter} dados={payload} /> : <p className="texto-3">{searching ? T.conexoes.carregando : ""}</p>}
          </>
        )}
      </div>
    </WindowValue>
  );
}
