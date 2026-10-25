import { useEffect, useState } from "react";
import { Download, LoaderCircle, ShieldAlert, Smartphone } from "lucide-react";
import { AvisoFaixa, Botao, ConfirmarModal, LinhaAlternador, Modal } from "../../componentes/basicos";
import { Marca, corDaMarca } from "../../marcas/Marca";
import { T } from "../../textos/textos";
import { useWhatsapp } from "../../estado/whatsapp";
import { numeroDoJid, whatsappPonte, type EstadoWhatsapp } from "../../ponte/whatsapp";
import { tocarSom } from "../../ponte/sons";

const W = T.whatsapp;
const ETAPAS_EM_ANDAMENTO = ["verificando", "baixando", "conferindo", "instalando"];

export function mensagemDoWhatsapp(e: unknown): string {
  const codigo = (e as Error)?.message ?? "";
  return W.erros[codigo] ?? codigo;
}

function textoDaEtapa(e: EstadoWhatsapp["instalacao"]): string {
  if (e.etapa === "baixando") return W.etapas.baixando(e.megabytes);
  if (e.etapa === "pronto") return W.etapas.pronto(e.versao);
  if (e.etapa === "falhou") return W.etapas.falhou(W.erros[e.erro] ?? e.erro);
  return W.etapas[e.etapa] as string;
}

export function CartaoWhatsapp({ aoConfigurar }: { aoConfigurar: () => void }) {
  const estado = useWhatsapp((s) => s.estado);
  const carregar = useWhatsapp((s) => s.carregar);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  const ativa = Boolean(estado?.ligado && estado.vinculo === "conectado");
  const vinculo = estado ? (estado.ligado ? estado.vinculo : "desligado") : "desligado";
  return (
    <article className="conexao-cartao" data-ativa={ativa ? "sim" : "nao"} style={{ ["--marca" as string]: corDaMarca("whatsapp") }}>
      <button type="button" className="conexao-cartao-abrir" aria-label={W.configurar} onClick={aoConfigurar} />
      <div className="conexao-cartao-topo">
        <span className="conexao-logo"><Marca marca="whatsapp" tamanho={20} /></span>
        <span className="conexao-cartao-nome">
          <b>{W.nome}</b>
          <span>{W.descricao}</span>
        </span>
      </div>
      <div className="conexao-cartao-resumo">
        <span className="privado">{ativa ? T.conexoes.resumos.email(estado?.naoLidas ?? 0) : W.vinculos[vinculo]}</span>
        <span className={`etiqueta ${ativa ? "etiqueta-sucesso" : ""}`}>{W.vinculos[vinculo]}</span>
      </div>
    </article>
  );
}

export function ConfigWhatsapp({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const estado = useWhatsapp((s) => s.estado);
  const carregar = useWhatsapp((s) => s.carregar);
  const definir = useWhatsapp((s) => s.definir);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [confirmandoEsquecer, setConfirmandoEsquecer] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    void carregar();
    const relogio = window.setInterval(() => void carregar(), 1500);
    return () => window.clearInterval(relogio);
  }, [aberto, carregar]);

  const agir = async (acao: () => Promise<EstadoWhatsapp | unknown>) => {
    setErro("");
    setOcupado(true);
    try {
      const r = await acao();
      if (r && typeof r === "object" && "vinculo" in r) definir(r as EstadoWhatsapp);
      else await carregar();
    } catch (e) {
      setErro(mensagemDoWhatsapp(e));
      void tocarSom("error", "avisos");
    } finally {
      setOcupado(false);
    }
  };

  const instalando = estado ? ETAPAS_EM_ANDAMENTO.includes(estado.instalacao.etapa) : false;

  return (
    <Modal aberto={aberto} titulo={W.configurar} aoFechar={aoFechar} largo>
      <div className="formulario">
        <AvisoFaixa tipo="alerta">
          <span className="linha"><ShieldAlert size={13} />{W.aviso}</span>
        </AvisoFaixa>
        <span className="campo-dica">{W.privacidade}</span>
        {estado && !estado.suportado ? (
          <AvisoFaixa tipo="erro">{W.naoSuportado}</AvisoFaixa>
        ) : (
          <>
            <ol className="guia-conexao-passos">
              {W.passos.map((p) => <li key={p}>{p}</li>)}
            </ol>
            <div className="linha">
              <Botao variante={estado?.instalado ? "secundario" : "primario"} icone={instalando ? <LoaderCircle size={14} className="girando" /> : <Download size={14} />} disabled={!estado || instalando || ocupado} onClick={() => void agir(() => whatsappPonte.instalar())}>
                {estado?.instalado ? W.reinstalar : W.instalar}
              </Botao>
              {estado && estado.instalacao.etapa !== "parado" && <span className="campo-dica" role="status">{textoDaEtapa(estado.instalacao)}</span>}
            </div>
            <LinhaAlternador rotulo={W.ligar} ligado={Boolean(estado?.ligado)} desativado={!estado?.instalado || ocupado} aoMudar={(v) => void agir(() => whatsappPonte.ligar(v))} />
            {estado?.ligado && (
              <div className="whatsapp-vinculo">
                {estado.vinculo === "precisa_qr" && estado.qr ? (
                  <img className="whatsapp-qr" src={estado.qr} alt={W.qrAlt} width={232} height={232} />
                ) : estado.vinculo === "precisa_qr" || estado.vinculo === "iniciando" || estado.vinculo === "desligado" ? (
                  <div className="whatsapp-qr-preparando" role="status" aria-live="polite">
                    <LoaderCircle size={28} className="girando" />
                    <strong>{W.qrPreparando}</strong>
                    <span className="campo-dica">{W.qrPreparandoDica}</span>
                  </div>
                ) : (
                  <span className="linha"><Smartphone size={14} />{estado.vinculo === "conectado" && estado.eu ? W.conectadoComo(numeroDoJid(estado.eu)) : W.vinculos[estado.vinculo]}</span>
                )}
                {estado.erro === "gateway_fora" && <AvisoFaixa tipo="alerta">{W.gatewayFora}</AvisoFaixa>}
                {estado.erro && estado.erro !== "gateway_fora" && T.configuracoes.errosDoCofre[estado.erro] && <AvisoFaixa tipo="erro">{T.configuracoes.errosDoCofre[estado.erro]}</AvisoFaixa>}
              </div>
            )}
            {estado && (
              <>
                <LinhaAlternador rotulo={W.mostrarFotos} dica={W.mostrarFotosDica} ligado={estado.filtros.mostrarFotos} aoMudar={(v) => void agir(() => whatsappPonte.filtros({ mostrarFotos: v }))} />
                <LinhaAlternador rotulo={W.esconderArquivadas} dica={W.esconderArquivadasDica} ligado={estado.filtros.esconderArquivadas} aoMudar={(v) => void agir(() => whatsappPonte.filtros({ esconderArquivadas: v }))} />
                <LinhaAlternador rotulo={W.esconderGrupos} dica={W.esconderGruposDica} ligado={estado.filtros.esconderGrupos} aoMudar={(v) => void agir(() => whatsappPonte.filtros({ esconderGrupos: v }))} />
                {!estado.filtros.esconderGrupos && <LinhaAlternador rotulo={W.silenciarGrupos} ligado={estado.filtros.silenciarGrupos} aoMudar={(v) => void agir(() => whatsappPonte.filtros({ silenciarGrupos: v }))} />}
                <LinhaAlternador rotulo={W.lerAoAbrir} dica={W.lerAoAbrirDica} ligado={estado.filtros.lerAoAbrir} aoMudar={(v) => void agir(() => whatsappPonte.filtros({ lerAoAbrir: v }))} />
                {estado.filtros.ignoradas.length > 0 && (
                  <fieldset className="cx-lista">
                    <legend>{W.ignoradas}</legend>
                    {estado.filtros.ignoradas.map((jid) => (
                      <div key={jid} className="cx-lista-linha">
                        <span className="cortar privado">{numeroDoJid(jid)}</span>
                        <Botao pequeno onClick={() => void agir(() => whatsappPonte.ignorar(jid, false))}>{W.voltarAMostrar}</Botao>
                      </div>
                    ))}
                  </fieldset>
                )}
              </>
            )}
            {erro && <AvisoFaixa tipo="erro"><span role="alert">{erro}</span></AvisoFaixa>}
            <div className="formulario-acoes">
              {estado?.vinculo === "conectado" && <Botao disabled={ocupado} onClick={() => void agir(() => whatsappPonte.desconectar())}>{W.desconectar}</Botao>}
              {estado?.instalado && <Botao variante="perigo" disabled={ocupado} onClick={() => setConfirmandoEsquecer(true)}>{W.esquecer}</Botao>}
              <Botao onClick={aoFechar}>{T.geral.fechar}</Botao>
            </div>
          </>
        )}
      </div>
      <ConfirmarModal
        aberto={confirmandoEsquecer}
        titulo={W.esquecer}
        texto={W.esquecerConfirmar}
        aoFechar={() => setConfirmandoEsquecer(false)}
        aoConfirmar={() => {
          setConfirmandoEsquecer(false);
          void agir(() => whatsappPonte.esquecer());
        }}
      />
    </Modal>
  );
}
