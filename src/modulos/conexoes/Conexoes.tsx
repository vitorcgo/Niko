import { useEffect, useRef, useState } from "react";
import { KeyRound, Pin, PinOff, RefreshCw, TriangleAlert, ShieldCheck, ExternalLink, Play, Pause } from "lucide-react";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { Botao, AvisoFaixa, Modal, Campo, LinhaAlternador, Alternador } from "../../componentes/basicos";
import { Marca } from "../../marcas/Marca";
import { useComunicacao, SERVICOS, CATEGORIA_SERVICO } from "../../estado/comunicacao";
import { useInterface } from "../../estado/interface";
import { useConfig } from "../../estado/configuracoes";
import { T } from "../../textos/textos";
import { horarioRelativo } from "../../utilitarios/datas";
import { conexoesPonte, resumoDe, LINKS_DO_GUIA, SERVICOS_DO_GOOGLE } from "../../ponte/conexoesReais";
import { atualizarConexaoAgora } from "../../servicos/servicos";
import { tocarSom } from "../../ponte/sons";
import type { ServicoId } from "../../tipos";

type Filtro = keyof typeof T.conexoes.filtros;

const INTERVALOS = [30, 60, 120, 300, 600];

function GuiaConexao({ servico }: { servico: ServicoId }) {
  const links = LINKS_DO_GUIA[servico];
  return (
    <section className="guia-conexao" aria-label={T.conexoes.comoConectar}>
      <h3 className="rotulo-secao">{T.conexoes.comoConectar}</h3>
      <ol className="guia-conexao-passos">
        {T.conexoes.guias[servico].map((passo, i) => (
          <li key={i}>
            <div className="guia-conexao-passo">
              <span>{passo}</span>
              {links[i] && (
                <a className="botao botao-secundario botao-pequeno" href={links[i]!} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={12} />
                  {T.conexoes.abrirPasso}
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Configurar({ servico, aoFechar }: { servico: ServicoId | null; aoFechar: () => void }) {
  const conexao = useComunicacao((s) => s.conexoes.find((c) => c.id === servico));
  const atualizar = useComunicacao((s) => s.atualizarConexao);
  const conexoes = useComunicacao((s) => s.conexoes);
  const avisar = useInterface((s) => s.avisar);
  const [chave, setChave] = useState("");
  const [url, setUrl] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [erro, setErro] = useState("");
  const [testando, setTestando] = useState(false);
  const [loginDisponivel, setLoginDisponivel] = useState(false);
  const [clienteProprio, setClienteProprio] = useState(false);
  const [verificandoLogin, setVerificandoLogin] = useState(servico === "google");
  const salvando = useRef(false);
  useEffect(() => {
    let ativo = true;
    setChave("");
    setClienteId("");
    setErro("");
    setUrl("");
    setLoginDisponivel(false);
    setClienteProprio(false);
    setVerificandoLogin(servico === "google");
    if (servico === "google") {
      void conexoesPonte.loginDireto().then((r) => {
        if (ativo) setLoginDisponivel(r.disponivel === true);
      }).catch(() => undefined).finally(() => {
        if (ativo) setVerificandoLogin(false);
      });
    }
    return () => { ativo = false; };
  }, [servico]);
  if (!servico || !conexao) return <Modal aberto={false} titulo="" aoFechar={aoFechar}>{null}</Modal>;
  const nome = T.conexoes.servicos[servico].nome;
  const doGoogle = SERVICOS_DO_GOOGLE.includes(servico);
  const loginSimples = servico === "google" && loginDisponivel && !clienteProprio;
  const fixadas = conexoes.filter((c) => c.fixadaNaIlha).length;

  const salvar = async () => {
    if (salvando.current || verificandoLogin) return;
    if (doGoogle && !loginSimples && !/\.apps\.googleusercontent\.com$/.test(clienteId.trim())) {
      setErro(T.conexoes.clienteIdInvalido);
      return;
    }
    if (!loginSimples && chave.trim().length < 8) {
      setErro(T.conexoes.chaveCurta);
      return;
    }
    salvando.current = true;
    setTestando(true);
    setErro("");
    try {
      await conexoesPonte.salvarChave(servico, loginSimples ? "" : chave.trim(), loginSimples ? {} : servico === "n8n" ? { url: url.trim() } : doGoogle ? { clienteId: clienteId.trim(), segredo: chave.trim() } : {});
      setChave("");
      const dados = await conexoesPonte.ler(servico, true);
      atualizar(servico, { chaveSalva: true, ligada: true, status: "conectado", ultimaAtualizacao: new Date().toISOString(), resumo: resumoDe(servico, dados) });
      avisar(doGoogle ? T.conexoes.googleConectado : T.conexoes.chaveSalva);
      void tocarSom("approve");
    } catch (e) {
      setErro(doGoogle ? T.conexoes.falhaLoginGoogle((e as Error).message) : T.conexoes.falhaChave((e as Error).message));
      void tocarSom("error", "avisos");
    } finally {
      salvando.current = false;
      setTestando(false);
    }
  };

  return (
    <Modal aberto={!!servico} titulo={`${T.janelaConexao.configurar}: ${nome}`} aoFechar={aoFechar}>
      <form className="formulario" noValidate onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
        <AvisoFaixa>
          <span className="linha"><ShieldCheck size={13} />{T.conexoes.permissao}</span>
          <span>{T.conexoes.permissoes[servico]}</span>
        </AvisoFaixa>
        {!loginSimples && !verificandoLogin && <GuiaConexao servico={servico} />}
        {doGoogle && !loginSimples && !verificandoLogin && (
          <>
            <Campo id="cx-cliente" rotulo={T.conexoes.clienteId} dica={T.conexoes.clienteIdDica}>
              <input id="cx-cliente" className="campo" autoComplete="off" spellCheck={false} value={clienteId} onChange={(e) => setClienteId(e.target.value)} />
            </Campo>
          </>
        )}
        {servico === "n8n" && (
          <Campo id="cx-url" rotulo={T.conexoes.urlN8n} dica={T.conexoes.urlN8nDica}>
            <input id="cx-url" className="campo" type="url" autoComplete="off" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} />
          </Campo>
        )}
        {!loginSimples && !verificandoLogin && <Campo id="cx-chave" rotulo={doGoogle ? T.conexoes.segredoCliente : T.conexoes.chave} erro={erro} dica={doGoogle ? T.conexoes.gmailDica : T.conexoes.chaveDica}>
          <input
            id="cx-chave"
            className="campo"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={chave}
            placeholder={conexao.chaveSalva ? T.conexoes.chaveGuardada : ""}
            aria-invalid={!!erro}
            onChange={(e) => {
              setChave(e.target.value);
              setErro("");
            }}
          />
        </Campo>}
        {loginSimples && erro && <AvisoFaixa tipo="erro"><span role="alert">{erro}</span></AvisoFaixa>}
        <div className="linha">
          <Botao type="submit" variante="primario" icone={loginSimples ? <Marca marca="google" tamanho={14} /> : <KeyRound size={14} />} disabled={testando || verificandoLogin || (!loginSimples && !chave.trim())}>
            {verificandoLogin ? T.conexoes.verificandoLoginGoogle : testando ? (doGoogle ? T.conexoes.aguardandoGoogle : T.conexoes.testando) : loginSimples ? T.conexoes.entrarGoogle : doGoogle ? T.conexoes.conectarGoogle : T.conexoes.salvarChave}
          </Botao>
          {conexao.chaveSalva && (
            <Botao
              variante="perigo"
              disabled={testando}
              onClick={async () => {
                await conexoesPonte.removerChave(servico).catch(() => undefined);
                atualizar(servico, { chaveSalva: false, ligada: false, status: "sem_chave", resumo: "" });
              }}
            >
              {T.conexoes.removerChave}
            </Botao>
          )}
        </div>
        {servico === "google" && loginDisponivel && (
          <button type="button" className="botao botao-fantasma botao-pequeno" disabled={testando} onClick={() => { setClienteProprio(!clienteProprio); setErro(""); }}>
            {clienteProprio ? T.conexoes.usarLoginDoNiko : T.conexoes.usarClienteProprio}
          </button>
        )}
        <LinhaAlternador
          rotulo={conexao.ligada ? T.conexoes.desligar : T.conexoes.ligar}
          ligado={conexao.ligada}
          desativado={!conexao.chaveSalva}
          aoMudar={(v) => atualizar(servico, { ligada: v, status: v ? "conectado" : "pausado" })}
        />
        <LinhaAlternador
          rotulo={T.conexoes.fixarNaIlha}
          dica={T.conexoes.limiteIlha}
          ligado={conexao.fixadaNaIlha}
          desativado={!conexao.fixadaNaIlha && fixadas >= 4}
          aoMudar={(v) => atualizar(servico, { fixadaNaIlha: v })}
        />
        <Campo id="cx-int" rotulo={T.conexoes.intervalo}>
          <select id="cx-int" className="seletor" value={conexao.intervalo} onChange={(e) => atualizar(servico, { intervalo: Number(e.target.value) })}>
            {INTERVALOS.map((s) => <option key={s} value={s}>{T.conexoes.segundos(s)}</option>)}
          </select>
        </Campo>
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.fechar}</Botao>
        </div>
      </form>
    </Modal>
  );
}
export default function Conexoes() {
  const parametros = useInterface((s) => s.parametros);
  const conexoes = useComunicacao((s) => s.conexoes);
  const eventos = useComunicacao((s) => s.eventosConexao);
  const atualizar = useComunicacao((s) => s.atualizarConexao);
  const abrirJanela = useInterface((s) => s.abrirJanelaConexao);
  const pausadas = useConfig((s) => s.pausarConexoes);
  const definir = useConfig((s) => s.definir);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [configurando, setConfigurando] = useState<ServicoId | null>((parametros.servico as ServicoId) || null);

  useEffect(() => {
    if (parametros.servico && SERVICOS.includes(parametros.servico as ServicoId)) setConfigurando(parametros.servico as ServicoId);
  }, [parametros]);

  const lista = SERVICOS.filter((id) => filtro === "todas" || CATEGORIA_SERVICO[id] === filtro);

  return (
    <>
      <CabecalhoAba
        titulo={T.conexoes.titulo}
        subtitulo={T.conexoes.subtitulo}
        acoes={
          <Botao icone={pausadas ? <Play size={13} /> : <Pause size={13} />} onClick={() => definir({ pausarConexoes: !pausadas })}>
            {pausadas ? T.conexoes.retomarTudo : T.configuracoes.pausarConexoes}
          </Botao>
        }
      />
      <section className="conexoes-barra">
        <div className="conexoes-filtros" role="group" aria-label={T.conexoes.titulo}>
          {(Object.keys(T.conexoes.filtros) as Filtro[]).map((f) => (
            <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>{T.conexoes.filtros[f]}</button>
          ))}
        </div>
        <span className="conexoes-aviso">
          <ShieldCheck size={14} />
          {T.conexoes.avisoReal}
        </span>
      </section>
      <section className="conexoes-grade">
        {lista.map((id) => {
          const c = conexoes.find((x) => x.id === id)!;
          const servico = T.conexoes.servicos[id];
          const ultimo = eventos.find((e) => e.servico === id);
          const status = pausadas && c.ligada ? "pausado" : c.status;
          const ativa = c.ligada && c.chaveSalva;
          return (
            <article key={id} className="conexao-cartao" data-ativa={ativa ? "sim" : "nao"}>
              <button
                type="button"
                className="conexao-cartao-abrir"
                aria-label={`${c.chaveSalva ? T.ilha.abrirConexao : T.conexoes.conectar}: ${servico.nome}`}
                onClick={() => (c.chaveSalva ? abrirJanela(id) : setConfigurando(id))}
              />
              <div className="conexao-cartao-topo">
                <span className="conexao-logo"><Marca marca={id} tamanho={20} /></span>
                <span className="conexao-cartao-nome">
                  <b>{servico.nome}</b>
                  <span>{servico.descricao}</span>
                </span>
                <span className="conexao-cartao-interativo">
                  <Alternador
                    ligado={c.ligada}
                    rotulo={c.ligada ? T.conexoes.desligar : T.conexoes.ligar}
                    desativado={!c.chaveSalva}
                    aoMudar={(v) => atualizar(id, { ligada: v, status: v ? "conectado" : "pausado" })}
                  />
                </span>
              </div>
              <div className="conexao-cartao-resumo">
                <span className="privado">{c.resumo || T.conexoes.semDados}</span>
                <span className={`etiqueta ${status === "conectado" ? "etiqueta-sucesso" : status === "erro" ? "etiqueta-erro" : ""}`}>{T.conexoes.status[status]}</span>
              </div>
              {ultimo && (
                <span className="conexao-cartao-evento" data-falha={ultimo.tipo === "falha" || undefined}>
                  {ultimo.tipo === "falha" && <TriangleAlert size={12} />}
                  <span className="cortar">{ultimo.texto} · {horarioRelativo(ultimo.data)}</span>
                </span>
              )}
              <div className="conexao-cartao-rodape">
                <span className="conexao-cartao-hora">{c.ultimaAtualizacao ? T.conexoes.atualizado(horarioRelativo(c.ultimaAtualizacao)) : T.conexoes.nunca}</span>
                <span className="conexao-cartao-interativo conexao-cartao-acoes">
                  {c.chaveSalva && (
                    <>
                      <Botao
                        pequeno
                        soIcone
                        variante="fantasma"
                        icone={<RefreshCw size={13} />}
                        aria-label={T.conexoes.atualizarAgora}
                        title={T.conexoes.atualizarAgora}
                        onClick={() => {
                          void tocarSom("search");
                          void atualizarConexaoAgora(id);
                        }}
                      />
                      <Botao
                        pequeno
                        soIcone
                        variante="fantasma"
                        icone={c.fixadaNaIlha ? <PinOff size={13} /> : <Pin size={13} />}
                        aria-label={T.conexoes.fixarNaIlha}
                        title={T.conexoes.fixarNaIlha}
                        aria-pressed={c.fixadaNaIlha}
                        disabled={!c.fixadaNaIlha && conexoes.filter((x) => x.fixadaNaIlha).length >= 4}
                        onClick={() => atualizar(id, { fixadaNaIlha: !c.fixadaNaIlha })}
                      />
                    </>
                  )}
                  <Botao pequeno soIcone variante="fantasma" icone={<KeyRound size={13} />} aria-label={c.chaveSalva ? T.janelaConexao.configurar : T.conexoes.conectar} title={c.chaveSalva ? T.janelaConexao.configurar : T.conexoes.conectar} onClick={() => setConfigurando(id)} />
                </span>
              </div>
            </article>
          );
        })}
      </section>
      <Configurar key={configurando ?? "fechado"} servico={configurando} aoFechar={() => setConfigurando(null)} />
    </>
  );
}
