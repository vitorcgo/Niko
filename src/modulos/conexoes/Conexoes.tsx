import { useEffect, useState } from "react";
import { Maximize2, KeyRound, Pin, PinOff, RefreshCw, TriangleAlert, ShieldCheck, ExternalLink, Plug } from "lucide-react";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { Cartao, Botao, Pilulas, AvisoFaixa, Modal, Campo, LinhaAlternador } from "../../componentes/basicos";
import { Marca } from "../../marcas/Marca";
import { useComunicacao, SERVICOS, CATEGORIA_SERVICO } from "../../estado/comunicacao";
import { useInterface } from "../../estado/interface";
import { useConfig } from "../../estado/configuracoes";
import { T } from "../../textos/textos";
import { horarioRelativo } from "../../utilitarios/datas";
import { conexoesPonte, resumoDe, LINKS_DO_GUIA } from "../../ponte/conexoesReais";
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
  useEffect(() => {
    setChave("");
    setErro("");
    setUrl("");
  }, [servico]);
  if (!servico || !conexao) return <Modal aberto={false} titulo="" aoFechar={aoFechar}>{null}</Modal>;
  const nome = T.conexoes.servicos[servico].nome;
  const fixadas = conexoes.filter((c) => c.fixadaNaIlha).length;

  const salvar = async () => {
    if (servico === "gmail" ? !/\.apps\.googleusercontent\.com$/.test(clienteId.trim()) : false) {
      setErro(T.conexoes.clienteIdInvalido);
      return;
    }
    if (chave.trim().length < 8) {
      setErro(T.conexoes.chaveCurta);
      return;
    }
    setTestando(true);
    setErro("");
    try {
      await conexoesPonte.salvarChave(servico, chave.trim(), servico === "n8n" ? { url: url.trim() } : servico === "gmail" ? { clienteId: clienteId.trim(), segredo: chave.trim() } : {});
      setChave("");
      const dados = await conexoesPonte.ler(servico, true);
      atualizar(servico, { chaveSalva: true, ligada: true, status: "conectado", ultimaAtualizacao: new Date().toISOString(), resumo: resumoDe(servico, dados) });
      avisar(T.conexoes.chaveSalva);
      void tocarSom("approve");
    } catch (e) {
      setErro(T.conexoes.falhaChave((e as Error).message));
      void tocarSom("error", "avisos");
    } finally {
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
        <GuiaConexao servico={servico} />
        {servico === "gmail" && (
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
        <Campo id="cx-chave" rotulo={servico === "gmail" ? T.conexoes.segredoCliente : T.conexoes.chave} erro={erro} dica={servico === "gmail" ? T.conexoes.gmailDica : T.conexoes.chaveDica}>
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
        </Campo>
        <div className="linha">
          <Botao type="submit" variante="primario" icone={<KeyRound size={14} />} disabled={testando || !chave.trim()}>
            {testando ? (servico === "gmail" ? T.conexoes.aguardandoGoogle : T.conexoes.testando) : servico === "gmail" ? T.conexoes.conectarGoogle : T.conexoes.salvarChave}
          </Botao>
          {conexao.chaveSalva && (
            <Botao
              variante="perigo"
              onClick={async () => {
                try {
                  await conexoesPonte.removerChave(servico);
                  atualizar(servico, { chaveSalva: false, ligada: false, status: "sem_chave", resumo: "" });
                } catch (e) {
                  setErro(T.conexoes.falhaRemoverChave((e as Error).message));
                }
              }}
            >
              {T.conexoes.removerChave}
            </Botao>
          )}
        </div>
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
        agente="java"
        acoes={
          <Botao pequeno variante={pausadas ? "primario" : "secundario"} onClick={() => definir({ pausarConexoes: !pausadas })}>
            {pausadas ? T.conexoes.retomarTudo : T.configuracoes.pausarConexoes}
          </Botao>
        }
      />
      <AvisoFaixa>{T.conexoes.avisoReal}</AvisoFaixa>
      <Pilulas<Filtro> rotulo={T.conexoes.titulo} valor={filtro} aoMudar={setFiltro} opcoes={(Object.keys(T.conexoes.filtros) as Filtro[]).map((f) => ({ valor: f, rotulo: T.conexoes.filtros[f] }))} />
      <div className="grade">
        {lista.map((id) => {
          const c = conexoes.find((x) => x.id === id)!;
          const servico = T.conexoes.servicos[id];
          const ultimo = eventos.find((e) => e.servico === id);
          const status = pausadas && c.ligada ? "pausado" : c.status;
          return (
            <Cartao key={id} className="col-4 cartao-conexao">
              <div className="linha" style={{ gap: 12, marginBottom: 12 }}>
                <div className="janela-conexao-marca" style={{ width: 40, height: 40, flexBasis: 40 }}>
                  <Marca marca={id} tamanho={20} />
                </div>
                <div className="coluna" style={{ gap: 0, minWidth: 0, flex: 1 }}>
                  <b>{servico.nome}</b>
                  <span className="texto-3 cortar" style={{ fontSize: 12 }}>{servico.descricao}</span>
                </div>
                <span className={`etiqueta ${status === "conectado" ? "etiqueta-sucesso" : status === "erro" ? "etiqueta-erro" : ""}`}>{T.conexoes.status[status]}</span>
              </div>
              <div className="coluna" style={{ gap: 4, minHeight: 52 }}>
                <span className="privado">{c.resumo || T.conexoes.semDados}</span>
                <span className="texto-3" style={{ fontSize: 11 }}>{c.ultimaAtualizacao ? T.conexoes.atualizado(horarioRelativo(c.ultimaAtualizacao)) : T.conexoes.nunca}</span>
                {ultimo && (
                  <span className="linha texto-2 cortar" style={{ fontSize: 12 }}>
                    {ultimo.tipo === "falha" && <TriangleAlert size={12} color="var(--erro)" />}
                    {ultimo.texto} . {horarioRelativo(ultimo.data)}
                  </span>
                )}
              </div>
              <div className="linha" style={{ marginTop: 12, flexWrap: "wrap" }}>
                {c.chaveSalva ? (
                  <>
                    <Botao pequeno variante="primario" icone={<Maximize2 size={13} />} onClick={() => abrirJanela(id)}>{T.ilha.abrirConexao}</Botao>
                    <Botao pequeno icone={<KeyRound size={13} />} onClick={() => setConfigurando(id)}>{T.janelaConexao.configurar}</Botao>
                  </>
                ) : (
                  <Botao pequeno variante="primario" icone={<Plug size={13} />} onClick={() => setConfigurando(id)}>{T.conexoes.conectar}</Botao>
                )}
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
                      disabled={!c.fixadaNaIlha && conexoes.filter((x) => x.fixadaNaIlha).length >= 4}
                      onClick={() => atualizar(id, { fixadaNaIlha: !c.fixadaNaIlha })}
                    />
                  </>
                )}
              </div>
            </Cartao>
          );
        })}
      </div>
      <Configurar servico={configurando} aoFechar={() => setConfigurando(null)} />
    </>
  );
}
