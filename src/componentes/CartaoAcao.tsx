import { useEffect } from "react";
import { motion } from "motion/react";
import { Check, ShieldCheck, X } from "lucide-react";
import type { CartaoConfirmacao, Mensagem } from "../tipos";
import { faltaCategoria, linhasDaConfirmacao, tipoDeCategoriaDoCartao } from "../utilitarios/comandos";
import { alterarDadosDoCartao, decidirCartao, useConversando } from "../estado/conversando";
import { chaveConfirmacao } from "../ponte/confirmacoes";
import { useConfig } from "../estado/configuracoes";
import { useComunicacao } from "../estado/comunicacao";
import { useFinancas } from "../estado/financas";
import { T } from "../textos/textos";
import { SeletorDeCategoria } from "./SeletorDeCategoria";

function digitandoEmCampo(e: KeyboardEvent): boolean {
  const alvo = e.target as HTMLElement | null;
  return !!alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable);
}

function Cartao({ cartao, aoDecidir, aoSempre, aoMudarDados, compacto, atalhos, agenteNome, ocupado }: { cartao: CartaoConfirmacao; aoDecidir: (aceitar: boolean) => void; aoSempre: () => void; aoMudarDados: (dados: CartaoConfirmacao["dados"]) => void; compacto?: boolean; atalhos: boolean; agenteNome: string; ocupado: boolean }) {
  const pendente = cartao.situacao === "pendente";
  useFinancas((s) => s.categorias);
  const tipoCategoria = tipoDeCategoriaDoCartao(cartao);
  const semCategoria = faltaCategoria(cartao);
  const linhas = linhasDaConfirmacao(cartao).filter(([k]) => !(pendente && tipoCategoria && k === T.chat.rotulos.categoria));

  useEffect(() => {
    if (!pendente || !atalhos || ocupado) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.repeat || e.defaultPrevented || digitandoEmCampo(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "y" || e.key === "Y" || e.key === "s" || e.key === "S") aoDecidir(true);
      if (e.key === "n" || e.key === "N") aoDecidir(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [pendente, atalhos, aoDecidir, ocupado]);

  return (
    <motion.div
      className={`chat-confirmacao cartao-permissao${compacto ? " chat-confirmacao-compacta" : ""}`}
      data-situacao={cartao.situacao}
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", visualDuration: 0.3, bounce: 0.3 }}
    >
      <span className="permissao-lavagem" aria-hidden="true" />
      <div className="permissao-quem">
        <span className="permissao-ponto" />
        <b>{agenteNome}</b>
        <span>{ocupado ? T.chat.confirmando : pendente ? T.chat.permissao.precisa : cartao.situacao === "verificar" ? T.chat.confirmacaoVerificar : cartao.situacao === "confirmado" ? T.chat.confirmado : T.chat.cancelado}</span>
      </div>
      <code className="permissao-codigo">{T.chat.permissao.acoes[cartao.tipo]} · {linhas[0]?.[1] ?? ""}</code>
      {linhas.length > 1 && (
        <dl>
          {linhas.slice(1).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd className="privado">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {pendente && tipoCategoria && (
        <div className="permissao-categoria" inert={ocupado} data-falta={semCategoria || undefined}>
          {semCategoria ? T.financas.categoriaObrigatoria : T.chat.rotulos.categoria}
          <SeletorDeCategoria
            tipo={tipoCategoria}
            categoriaId={String(cartao.dados.categoriaId ?? "")}
            novaCategoria={String(cartao.dados.novaCategoria ?? "")}
            invalido={semCategoria}
            aoMudar={(categoriaId, novaCategoria) => aoMudarDados({ categoriaId, novaCategoria })}
          />
        </div>
      )}
      {pendente && (
        <div className="permissao-botoes">
          <button type="button" className="botao botao-secundario botao-pequeno" disabled={ocupado} onClick={() => aoDecidir(false)}>
            <X size={13} />
            {T.chat.permissao.recusar}
            {atalhos && <kbd>N</kbd>}
          </button>
          <button type="button" className="botao botao-primario botao-pequeno" disabled={semCategoria || ocupado} title={semCategoria ? T.financas.categoriaObrigatoria : undefined} onClick={() => aoDecidir(true)}>
            <Check size={13} />
            {T.chat.permissao.permitir}
            {atalhos && <kbd>Y</kbd>}
          </button>
          <button type="button" className="botao botao-fantasma botao-pequeno" title={semCategoria ? T.financas.categoriaObrigatoria : T.chat.permissao.sempreDica} disabled={semCategoria || ocupado} onClick={aoSempre}>
            <ShieldCheck size={13} />
            {T.chat.permissao.sempre}
          </button>
        </div>
      )}
    </motion.div>
  );
}

export function CartoesDaMensagem({ conversaId, mensagem, compacto, atalhos = false }: { conversaId: string; mensagem: Mensagem; compacto?: boolean; atalhos?: boolean }) {
  const confirmando = useConversando((s) => s.confirmando);
  const nome = useConfig((s) => s.agentes.nomes[mensagem.agenteId]);
  const sempre = (cartao: CartaoConfirmacao, indice: number | null) => {
    if (useConversando.getState().confirmando[chaveConfirmacao(conversaId, mensagem.id, indice)]) return;
    const atual = useComunicacao.getState().conversas.find((c) => c.id === conversaId)?.mensagens.find((m) => m.id === mensagem.id);
    const decisao = indice === null ? atual?.confirmacao : atual?.confirmacoes?.[indice];
    if (decisao?.situacao !== "pendente" || decisao.tipo !== cartao.tipo || faltaCategoria(decisao)) return;
    const ia = useConfig.getState().ia;
    if (!ia.autoAprovar.includes(cartao.tipo)) useConfig.getState().definir({ ia: { ...ia, autoAprovar: [...ia.autoAprovar, cartao.tipo] } });
    decidirCartao(conversaId, mensagem, indice, true);
  };
  const primeiroPendente = mensagem.confirmacao?.situacao === "pendente" ? -1 : mensagem.confirmacoes?.findIndex((c) => c.situacao === "pendente") ?? -2;
  return (
    <>
      {mensagem.confirmacao && <Cartao cartao={mensagem.confirmacao} ocupado={!!confirmando[chaveConfirmacao(conversaId, mensagem.id, null)]} agenteNome={nome} compacto={compacto} atalhos={atalhos && primeiroPendente === -1} aoSempre={() => sempre(mensagem.confirmacao!, null)} aoDecidir={(a) => decidirCartao(conversaId, mensagem, null, a)} aoMudarDados={(d) => alterarDadosDoCartao(conversaId, mensagem, null, d)} />}
      {mensagem.confirmacoes?.map((c, i) => (
        <Cartao key={i} cartao={c} ocupado={!!confirmando[chaveConfirmacao(conversaId, mensagem.id, i)]} agenteNome={nome} compacto={compacto} atalhos={atalhos && primeiroPendente === i} aoSempre={() => sempre(c, i)} aoDecidir={(a) => decidirCartao(conversaId, mensagem, i, a)} aoMudarDados={(d) => alterarDadosDoCartao(conversaId, mensagem, i, d)} />
      ))}
    </>
  );
}
