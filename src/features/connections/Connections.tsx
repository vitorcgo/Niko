import { useEffect, useState } from "react";
import { Maximize2, KeyRound, Pin, PinOff, RefreshCw, TriangleAlert, ShieldCheck, ExternalLink, Plug } from "lucide-react";
import { TabHeader } from "../../components/TabHeader";
import { Card, Button, Pills, NoticeBanner, Modal, Field, LineToggle } from "../../components/basics";
import { Brand } from "../../brands/Brand";
import { useCommunication, SERVICES, CATEGORY_SERVICE } from "../../state/communication";
import { useInterface } from "../../state/interface";
import { useConfig } from "../../state/settings";
import { T } from "../../i18n/ptBR";
import { scheduleRelative } from "../../utils/dates";
import { connectionsBridge, summary, LINKS_GUIDE, SERVICES_GOOGLE } from "../../bridge/liveConnections";
import { updateConnectionNow } from "../../services/services";
import { playSound } from "../../bridge/sounds";
import type { ServiceId } from "../../types";

type Filter = keyof typeof T.conexoes.filtros;

const INTERVALS = [30, 60, 120, 300, 600];

function GuideConnection({ servico: service }: { servico: ServiceId }) {
  const links = LINKS_GUIDE[service];
  return (
    <section className="guia-conexao" aria-label={T.conexoes.comoConectar}>
      <h3 className="rotulo-secao">{T.conexoes.comoConectar}</h3>
      <ol className="guia-conexao-passos">
        {T.conexoes.guias[service].map((step, i) => (
          <li key={i}>
            <div className="guia-conexao-passo">
              <span>{step}</span>
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

function Configure({ servico: service, aoFechar: onClose }: { servico: ServiceId | null; aoFechar: () => void }) {
  const connection = useCommunication((s) => s.conexoes.find((c) => c.id === service));
  const update = useCommunication((s) => s.updateConnection);
  const connections = useCommunication((s) => s.conexoes);
  const notify = useInterface((s) => s.notify);
  const [key, setKey] = useState("");
  const [url, setUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  useEffect(() => {
    setKey("");
    setError("");
    setUrl("");
  }, [service]);
  if (!service || !connection) return <Modal aberto={false} titulo="" aoFechar={onClose}>{null}</Modal>;
  const nameValue = T.conexoes.servicos[service].nome;
  const fromGoogle = SERVICES_GOOGLE.includes(service);
  const pinned = connections.filter((c) => c.fixadaNaIlha).length;

  const save = async () => {
    if (fromGoogle && !/\.apps\.googleusercontent\.com$/.test(clientId.trim())) {
      setError(T.conexoes.clienteIdInvalido);
      return;
    }
    if (key.trim().length < 8) {
      setError(T.conexoes.chaveCurta);
      return;
    }
    setTesting(true);
    setError("");
    try {
      await connectionsBridge.salvarChave(service, key.trim(), service === "n8n" ? { url: url.trim() } : fromGoogle ? { clienteId: clientId.trim(), segredo: key.trim() } : {});
      setKey("");
      const payload = await connectionsBridge.ler(service, true);
      update(service, { chaveSalva: true, ligada: true, status: "conectado", ultimaAtualizacao: new Date().toISOString(), resumo: summary(service, payload) });
      notify(T.conexoes.chaveSalva);
      void playSound("approve");
    } catch (e) {
      setError(T.conexoes.falhaChave((e as Error).message));
      void playSound("error", "avisos");
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal aberto={!!service} titulo={`${T.janelaConexao.configurar}: ${nameValue}`} aoFechar={onClose}>
      <form className="formulario" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <NoticeBanner>
          <span className="linha"><ShieldCheck size={13} />{T.conexoes.permissao}</span>
          <span>{T.conexoes.permissoes[service]}</span>
        </NoticeBanner>
        <GuideConnection servico={service} />
        {fromGoogle && (
          <>
            <Field id="cx-cliente" rotulo={T.conexoes.clienteId} dica={T.conexoes.clienteIdDica}>
              <input id="cx-cliente" className="campo" autoComplete="off" spellCheck={false} value={clientId} onChange={(e) => setClientId(e.target.value)} />
            </Field>
          </>
        )}
        {service === "n8n" && (
          <Field id="cx-url" rotulo={T.conexoes.urlN8n} dica={T.conexoes.urlN8nDica}>
            <input id="cx-url" className="campo" type="url" autoComplete="off" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
        )}
        <Field id="cx-chave" rotulo={fromGoogle ? T.conexoes.segredoCliente : T.conexoes.chave} erro={error} dica={fromGoogle ? T.conexoes.gmailDica : T.conexoes.chaveDica}>
          <input
            id="cx-chave"
            className="campo"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            placeholder={connection.chaveSalva ? T.conexoes.chaveGuardada : ""}
            aria-invalid={!!error}
            onChange={(e) => {
              setKey(e.target.value);
              setError("");
            }}
          />
        </Field>
        <div className="linha">
          <Button type="submit" variante="primario" icone={<KeyRound size={14} />} disabled={testing || !key.trim()}>
            {testing ? (fromGoogle ? T.conexoes.aguardandoGoogle : T.conexoes.testando) : fromGoogle ? T.conexoes.conectarGoogle : T.conexoes.salvarChave}
          </Button>
          {connection.chaveSalva && (
            <Button
              variante="perigo"
              onClick={async () => {
                await connectionsBridge.removerChave(service).catch(() => undefined);
                update(service, { chaveSalva: false, ligada: false, status: "sem_chave", resumo: "" });
              }}
            >
              {T.conexoes.removerChave}
            </Button>
          )}
        </div>
        <LineToggle
          rotulo={connection.ligada ? T.conexoes.desligar : T.conexoes.ligar}
          ligado={connection.ligada}
          desativado={!connection.chaveSalva}
          aoMudar={(v) => update(service, { ligada: v, status: v ? "conectado" : "pausado" })}
        />
        <LineToggle
          rotulo={T.conexoes.fixarNaIlha}
          dica={T.conexoes.limiteIlha}
          ligado={connection.fixadaNaIlha}
          desativado={!connection.fixadaNaIlha && pinned >= 4}
          aoMudar={(v) => update(service, { fixadaNaIlha: v })}
        />
        <Field id="cx-int" rotulo={T.conexoes.intervalo}>
          <select id="cx-int" className="seletor" value={connection.intervalo} onChange={(e) => update(service, { intervalo: Number(e.target.value) })}>
            {INTERVALS.map((s) => <option key={s} value={s}>{T.conexoes.segundos(s)}</option>)}
          </select>
        </Field>
        <div className="formulario-acoes">
          <Button onClick={onClose}>{T.geral.fechar}</Button>
        </div>
      </form>
    </Modal>
  );
}
export default function Connections() {
  const parameters = useInterface((s) => s.parametros);
  const connections = useCommunication((s) => s.conexoes);
  const events = useCommunication((s) => s.eventosConexao);
  const update = useCommunication((s) => s.updateConnection);
  const openWindow = useInterface((s) => s.openWindowConnection);
  const paused = useConfig((s) => s.pausarConexoes);
  const set = useConfig((s) => s.set);
  const [filter, setFilter] = useState<Filter>("todas");
  const [configuring, setConfiguring] = useState<ServiceId | null>((parameters.servico as ServiceId) || null);

  useEffect(() => {
    if (parameters.servico && SERVICES.includes(parameters.servico as ServiceId)) setConfiguring(parameters.servico as ServiceId);
  }, [parameters]);

  const list = SERVICES.filter((id) => filter === "todas" || CATEGORY_SERVICE[id] === filter);

  return (
    <>
      <TabHeader
        titulo={T.conexoes.titulo}
        subtitulo={T.conexoes.subtitulo}
        agente="java"
        acoes={
          <Button pequeno variante={paused ? "primario" : "secundario"} onClick={() => set({ pausarConexoes: !paused })}>
            {paused ? T.conexoes.retomarTudo : T.configuracoes.pausarConexoes}
          </Button>
        }
      />
      <NoticeBanner>{T.conexoes.avisoReal}</NoticeBanner>
      <Pills<Filter> rotulo={T.conexoes.titulo} valor={filter} aoMudar={setFilter} opcoes={(Object.keys(T.conexoes.filtros) as Filter[]).map((f) => ({ valor: f, rotulo: T.conexoes.filtros[f] }))} />
      <div className="grade">
        {list.map((id) => {
          const c = connections.find((x) => x.id === id)!;
          const service = T.conexoes.servicos[id];
          const last = events.find((e) => e.servico === id);
          const status = paused && c.ligada ? "pausado" : c.status;
          return (
            <Card key={id} className="col-4 cartao-conexao">
              <div className="linha" style={{ gap: 12, marginBottom: 12 }}>
                <div className="janela-conexao-marca" style={{ width: 40, height: 40, flexBasis: 40 }}>
                  <Brand marca={id} tamanho={20} />
                </div>
                <div className="coluna" style={{ gap: 0, minWidth: 0, flex: 1 }}>
                  <b>{service.nome}</b>
                  <span className="texto-3 cortar" style={{ fontSize: 12 }}>{service.descricao}</span>
                </div>
                <span className={`etiqueta ${status === "conectado" ? "etiqueta-sucesso" : status === "erro" ? "etiqueta-erro" : ""}`}>{T.conexoes.status[status]}</span>
              </div>
              <div className="coluna" style={{ gap: 4, minHeight: 52 }}>
                <span className="privado">{c.resumo || T.conexoes.semDados}</span>
                <span className="texto-3" style={{ fontSize: 11 }}>{c.ultimaAtualizacao ? T.conexoes.atualizado(scheduleRelative(c.ultimaAtualizacao)) : T.conexoes.nunca}</span>
                {last && (
                  <span className="linha texto-2 cortar" style={{ fontSize: 12 }}>
                    {last.tipo === "falha" && <TriangleAlert size={12} color="var(--erro)" />}
                    {last.texto} . {scheduleRelative(last.data)}
                  </span>
                )}
              </div>
              <div className="linha" style={{ marginTop: 12, flexWrap: "wrap" }}>
                {c.chaveSalva ? (
                  <>
                    <Button pequeno variante="primario" icone={<Maximize2 size={13} />} onClick={() => openWindow(id)}>{T.ilha.abrirConexao}</Button>
                    <Button pequeno icone={<KeyRound size={13} />} onClick={() => setConfiguring(id)}>{T.janelaConexao.configurar}</Button>
                  </>
                ) : (
                  <Button pequeno variante="primario" icone={<Plug size={13} />} onClick={() => setConfiguring(id)}>{T.conexoes.conectar}</Button>
                )}
                {c.chaveSalva && (
                  <>
                    <Button
                      pequeno
                      soIcone
                      variante="fantasma"
                      icone={<RefreshCw size={13} />}
                      aria-label={T.conexoes.atualizarAgora}
                      title={T.conexoes.atualizarAgora}
                      onClick={() => {
                        void playSound("search");
                        void updateConnectionNow(id);
                      }}
                    />
                    <Button
                      pequeno
                      soIcone
                      variante="fantasma"
                      icone={c.fixadaNaIlha ? <PinOff size={13} /> : <Pin size={13} />}
                      aria-label={T.conexoes.fixarNaIlha}
                      title={T.conexoes.fixarNaIlha}
                      disabled={!c.fixadaNaIlha && connections.filter((x) => x.fixadaNaIlha).length >= 4}
                      onClick={() => update(id, { fixadaNaIlha: !c.fixadaNaIlha })}
                    />
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <Configure servico={configuring} aoFechar={() => setConfiguring(null)} />
    </>
  );
}
