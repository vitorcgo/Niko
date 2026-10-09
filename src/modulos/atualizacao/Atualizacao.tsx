import { useEffect } from "react";
import { ArrowUpRight, Download, Globe, History, RefreshCw } from "lucide-react";
import { useInterface } from "../../estado/interface";
import { novidadesAte } from "../../utilitarios/novidades";
import { formatar } from "../../utilitarios/datas";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { AvisoFaixa, Botao, Progresso } from "../../componentes/basicos";
import { Marca } from "../../marcas/Marca";
import { useAtualizacao } from "../../estado/atualizacao";
import { NATIVO } from "../../desktop/desktop";
import { T } from "../../textos/textos";

const REPOSITORIO = "https://github.com/vitorcgo/niko";
const VERSOES = `${REPOSITORIO}/releases`;

export default function Atualizacao() {
  const atualizacao = useAtualizacao();
  const ocupada = atualizacao.verificacao === "verificando" || atualizacao.fase === "baixando" || atualizacao.fase === "instalando";
  const disponivel = atualizacao.verificacao === "disponivel";
  const tituloEstado = atualizacao.fase === "baixando" ? T.atualizacao.baixando(Math.round(atualizacao.progresso * 100))
    : atualizacao.fase === "instalando" ? T.atualizacao.instalando
    : atualizacao.verificacao === "verificando" ? T.atualizacao.verificando
    : atualizacao.verificacao === "atualizado" ? T.atualizacao.atualizado
    : atualizacao.verificacao === "sem_versoes" ? T.atualizacao.semVersoes
    : disponivel ? T.atualizacao.disponivel(atualizacao.versao)
    : T.atualizacao.pronto;
  const situacao = ocupada ? "ocupada" : disponivel ? "disponivel" : atualizacao.verificacao === "atualizado" ? "atualizado" : "neutra";

  const versoes = novidadesAte(atualizacao.versaoAtual);
  const parametros = useInterface((s) => s.parametros);

  useEffect(() => {
    void useAtualizacao.getState().carregarVersao();
  }, []);

  useEffect(() => {
    if (parametros.secao !== "novidades" || versoes.length === 0) return;
    document.getElementById("novidades")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [parametros.secao, versoes.length]);

  return (
    <>
      <CabecalhoAba titulo={T.atualizacao.titulo} subtitulo={T.atualizacao.subtitulo} />
      <section className="atualizacao-painel">
        <div className="atualizacao-versao">
          <span className="rotulo-secao">{T.getCurrentSystemVersion()}</span>
          <strong className="atualizacao-versao-numero">{atualizacao.versaoAtual || T.geral.carregando}</strong>
          <span className="atualizacao-versao-detalhe">
            {T.getCurrentSystemVersion()}
            {atualizacao.ultimaVerificacao && (
              <>
                {" · "}
                {T.atualizacao.ultimaVerificacao}: <time dateTime={atualizacao.ultimaVerificacao}>{new Date(atualizacao.ultimaVerificacao).toLocaleString("pt-BR")}</time>
              </>
            )}
          </span>
        </div>
        <div className="atualizacao-estado" data-situacao={situacao}>
          <span className="atualizacao-estado-titulo" role="status" aria-live="polite" aria-busy={ocupada}>
            {ocupada ? <RefreshCw size={14} className="atualizacao-girando" /> : <span className="atualizacao-ponto" />}
            {tituloEstado}
          </span>
          {disponivel && <span className="atualizacao-estado-dica">{atualizacao.automatica ? T.atualizacao.instalacaoDica : NATIVO ? T.atualizacao.baixarManual : T.atualizacao.baixarNavegador}</span>}
          {atualizacao.erro && <AvisoFaixa tipo="erro">{atualizacao.erro}</AvisoFaixa>}
          {(atualizacao.fase === "baixando" || atualizacao.fase === "instalando") && <Progresso valor={atualizacao.progresso} rotulo={tituloEstado} />}
          <div className="atualizacao-acoes">
            {disponivel && (atualizacao.automatica ? (
              <Botao variante="primario" className="atualizacao-botao" icone={<Download size={13} />} disabled={ocupada} onClick={() => void atualizacao.instalar()}>{T.atualizacao.instalar}</Botao>
            ) : (
              <a className="botao botao-primario atualizacao-botao" href={`${VERSOES}/latest`} target="_blank" rel="noopener noreferrer"><Download size={13} />{T.atualizacao.baixarGithub}</a>
            ))}
            <Botao variante={disponivel ? "secundario" : "primario"} className="atualizacao-botao" data-contorno={disponivel || undefined} icone={<RefreshCw size={13} />} disabled={ocupada} onClick={() => void atualizacao.verificar(true)}>
              {atualizacao.verificacao === "verificando" ? T.atualizacao.verificando : T.atualizacao.verificar}
            </Botao>
          </div>
        </div>
      </section>
      {(versoes.length > 0 || (disponivel && atualizacao.notas)) && (
        <section className="atualizacao-novidades" id="novidades">
          <div className="atualizacao-novidades-topo">
            <h2 className="atualizacao-novidades-titulo">{T.atualizacao.oQueMudou}</h2>
            <span className="atualizacao-novidades-dica">{T.atualizacao.oQueMudouDica}</span>
          </div>
          {disponivel && atualizacao.notas && (
            <div className="atualizacao-versao-linha">
              <div className="atualizacao-versao-lado">
                <span className="atualizacao-versao-rotulo">{atualizacao.versao}</span>
                <span className="atualizacao-versao-data">{T.atualizacao.versaoDisponivel}</span>
              </div>
              <div className="atualizacao-versao-itens">
                <span className="atualizacao-rotulo-notas">{T.atualizacao.novidades}</span>
                <p className="atualizacao-notas">{atualizacao.notas}</p>
              </div>
            </div>
          )}
          {versoes.map((v, i) => (
            <section key={v.versao} className="atualizacao-versao-linha" aria-label={`v${v.versao}`}>
              <div className="atualizacao-versao-lado">
                <span className="atualizacao-versao-rotulo">{v.versao}</span>
                {"data" in v && v.data && <span className="atualizacao-versao-data">{formatar(v.data, "dd/MM/yyyy")}</span>}
                {i === 0 && <span className="atualizacao-esta">{T.atualizacao.estaVersao}</span>}
              </div>
              <ul className="atualizacao-versao-itens">
                {v.mudancas.map(([tipo, texto]) => (
                  <li key={texto} data-tipo={tipo}>
                    <span className="atualizacao-tipo">{T.atualizacao.tiposDeMudanca[tipo]}</span>
                    <span className="atualizacao-texto">{texto}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </section>
      )}
      <section className="atualizacao-criador">
        <img className="atualizacao-foto" src="/criador-vitor.jpg" width={56} height={56} alt={T.atualizacao.fotoCriador} />
        <span className="atualizacao-criador-texto">
          <span className="rotulo-secao">{T.atualizacao.criador}</span>
          <b className="atualizacao-criador-nome">{T.atualizacao.nomeCriador} <span>{T.atualizacao.usuarioCriador}</span></b>
          <span className="atualizacao-criador-descricao">{T.atualizacao.descricaoCriador}</span>
        </span>
        <nav className="atualizacao-links" aria-label={T.app.nome}>
          <a href={REPOSITORIO} target="_blank" rel="noopener noreferrer"><Marca marca="github" tamanho={13} monocromatica />{T.atualizacao.github}<ArrowUpRight size={12} className="atualizacao-link-seta" /></a>
          <a href="https://nikoapp-eight.vercel.app/" target="_blank" rel="noopener noreferrer"><Globe size={13} />{T.atualizacao.site}<ArrowUpRight size={12} className="atualizacao-link-seta" /></a>
          <a href={VERSOES} target="_blank" rel="noopener noreferrer"><History size={13} />{T.atualizacao.versoes}<ArrowUpRight size={12} className="atualizacao-link-seta" /></a>
          <a href="https://github.com/vitorcgo" target="_blank" rel="noopener noreferrer"><img src="/criador-vitor.jpg" width={16} height={16} alt="" className="atualizacao-link-foto" />{T.atualizacao.githubCriador}<ArrowUpRight size={12} className="atualizacao-link-seta" /></a>
        </nav>
      </section>
    </>
  );
}
