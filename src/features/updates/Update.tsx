import { useEffect } from "react";
import { CheckCircle2, Download, ExternalLink, Globe, History, RefreshCw, Megaphone } from "lucide-react";
import { useInterface } from "../../state/interface";
import { updatesUntil } from "../../utils/releaseNotes";
import { formatDateString } from "../../utils/dates";
import { TabHeader } from "../../components/TabHeader";
import { NoticeBanner, Button, Card, Progress } from "../../components/basics";
import { LogoNiko } from "../../components/LogoNiko";
import { Brand } from "../../brands/Brand";
import { useUpdate } from "../../state/update";
import { NATIVE } from "../../desktop/desktop";
import { T } from "../../i18n/ptBR";

const REPOSITORY = "https://github.com/vitorcgo/niko";
const VERSIONS = `${REPOSITORY}/releases`;

export default function Update() {
  const update = useUpdate();
  const busy = update.verificacao === "verificando" || update.fase === "baixando" || update.fase === "instalando";
  const available = update.verificacao === "disponivel";
  const titleState = update.fase === "baixando" ? T.atualizacao.baixando(Math.round(update.progresso * 100))
    : update.fase === "instalando" ? T.atualizacao.instalando
    : update.verificacao === "verificando" ? T.atualizacao.verificando
    : update.verificacao === "atualizado" ? T.atualizacao.atualizado
    : update.verificacao === "sem_versoes" ? T.atualizacao.semVersoes
    : available ? T.atualizacao.disponivel(update.versao)
    : T.atualizacao.pronto;

  const versions = updatesUntil(update.versaoAtual);
  const parameters = useInterface((s) => s.parametros);

  useEffect(() => {
    void useUpdate.getState().loadVersion();
  }, []);

  useEffect(() => {
    if (parameters.secao !== "novidades" || versions.length === 0) return;
    document.getElementById("novidades")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [parameters.secao, versions.length]);

  return (
    <>
      <TabHeader titulo={T.atualizacao.titulo} subtitulo={T.atualizacao.subtitulo} />
      <div className="atualizacao-layout">
        <div className="atualizacao-principal">
        <Card>
          <div className="atualizacao-produto">
            <div className="atualizacao-logo"><LogoNiko tamanho={56} /></div>
            <div className="coluna" style={{ gap: 4 }}>
              <h2 className="titulo-secao">{T.app.nome}</h2>
              <span className="texto-2">{T.atualizacao.plataforma}</span>
            </div>
            <div className="atualizacao-versao">
              <span className="rotulo-pequeno">{T.atualizacao.versaoAtual}</span>
              <strong className="numero">{update.versaoAtual ? `v${update.versaoAtual}` : T.geral.carregando}</strong>
            </div>
          </div>
          <div className="atualizacao-estado" role="status" aria-live="polite" aria-busy={busy}>
            {update.verificacao === "atualizado" ? <CheckCircle2 size={22} className="atualizacao-ok" /> : available ? <Download size={22} /> : <RefreshCw size={22} className={busy ? "atualizacao-girando" : ""} />}
            <span>{titleState}</span>
          </div>
          {update.erro && <NoticeBanner tipo="erro">{update.erro}</NoticeBanner>}
          {(update.fase === "baixando" || update.fase === "instalando") && <Progress valor={update.progresso} rotulo={titleState} />}
          <div className="atualizacao-acoes">
            <Button variante={available ? "secundario" : "primario"} icone={<RefreshCw size={15} />} disabled={busy} onClick={() => void update.check(true)}>{update.verificacao === "verificando" ? T.atualizacao.verificando : T.atualizacao.verificar}</Button>
            {available && (update.automatica ? (
              <Button variante="primario" icone={<Download size={15} />} disabled={busy} onClick={() => void update.install()}>{T.atualizacao.instalar}</Button>
            ) : (
              <a className="botao botao-primario" href={`${VERSIONS}/latest`} target="_blank" rel="noopener noreferrer"><Download size={15} />{T.atualizacao.baixarGithub}</a>
            ))}
          </div>
          {available && <p className="texto-3">{update.automatica ? T.atualizacao.instalacaoDica : NATIVE ? T.atualizacao.baixarManual : T.atualizacao.baixarNavegador}</p>}
          {update.ultimaVerificacao && <p className="texto-3">{T.atualizacao.ultimaVerificacao}: <time dateTime={update.ultimaVerificacao}>{new Date(update.ultimaVerificacao).toLocaleString("pt-BR")}</time></p>}
        </Card>
        <div className="atualizacao-links">
          <a href={REPOSITORY} target="_blank" rel="noopener noreferrer"><Brand marca="github" tamanho={20} monocromatica /><span>{T.atualizacao.github}<small>github.com/vitorcgo/niko</small></span><ExternalLink size={14} /></a>
          <a href="https://nikoapp-eight.vercel.app/" target="_blank" rel="noopener noreferrer"><Globe size={20} /><span>{T.atualizacao.site}<small>nikoapp-eight.vercel.app</small></span><ExternalLink size={14} /></a>
          <a href={VERSIONS} target="_blank" rel="noopener noreferrer"><History size={20} /><span>{T.atualizacao.versoes}<small>{T.app.nome}</small></span><ExternalLink size={14} /></a>
        </div>
        </div>
        <Card>
          <div className="atualizacao-criador">
            <img className="atualizacao-foto" src="/criador-vitor.jpg" width={88} height={88} alt={T.atualizacao.fotoCriador} />
            <span className="rotulo-pequeno">{T.atualizacao.criador}</span>
            <h2 className="titulo-secao">{T.atualizacao.nomeCriador}</h2>
            <span className="texto-3">{T.atualizacao.usuarioCriador}</span>
            <p className="texto-2">{T.atualizacao.descricaoCriador}</p>
            <a className="botao botao-secundario" href="https://github.com/vitorcgo" target="_blank" rel="noopener noreferrer"><Brand marca="github" tamanho={16} monocromatica />{T.atualizacao.githubCriador}<ExternalLink size={13} /></a>
          </div>
        </Card>
        {available && update.notas && <div className="atualizacao-notas"><Card titulo={T.atualizacao.novidades}><p>{update.notas}</p></Card></div>}
        {versions.length > 0 && (
          <div className="atualizacao-notas" id="novidades">
            <Card titulo={T.atualizacao.oQueMudou} icone={<Megaphone size={16} />}>
              <p className="texto-3">{T.atualizacao.oQueMudouDica}</p>
              <div className="novidades-lista">
                {versions.map((v, i) => (
                  <section key={v.versao} className="novidades-versao" aria-label={`v${v.versao}`}>
                    <div className="novidades-cabecalho">
                      <strong className="numero">v{v.versao}</strong>
                      {i === 0 && <span className="etiqueta etiqueta-destaque">{T.atualizacao.estaVersao}</span>}
                      {"data" in v && v.data && <span className="texto-3">{formatDateString(v.data, "d 'de' MMMM")}</span>}
                    </div>
                    <ul>
                      {v.mudancas.map(([type, text]) => (
                        <li key={text} data-tipo={type}>
                          <span className="novidades-tipo">{T.atualizacao.tiposDeMudanca[type]}</span>
                          <span>{text}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
