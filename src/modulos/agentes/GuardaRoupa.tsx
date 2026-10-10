import { useState } from "react";
import { Check, X, CircleSlash } from "lucide-react";
import type { AgenteId } from "../../tipos";
import type { AparenciaAgente } from "../../personagens/personalizacao";
import { ACESSORIOS, POSICOES_ACESSORIOS, SEM_ACESSORIOS, vestirAcessorio, type AcessoriosAgente, type CategoriaAcessorio } from "../../personagens/acessorios";
import { Personagem } from "../../personagens/Personagem";
import { corOriginalDoAcessorio } from "../../personagens/desenhosDosAcessorios";
import { T } from "../../textos/textos";

export function GuardaRoupa({ agente, aparencia, acessorios, aoMudar, corAcessorio = null, aoMudarCor, compacto = false }: { agente: AgenteId; aparencia: AparenciaAgente; acessorios: AcessoriosAgente; aoMudar: (acessorios: AcessoriosAgente) => void; corAcessorio?: string | null; aoMudarCor?: (cor: string | null) => void; compacto?: boolean }) {
  const [categoria, setCategoria] = useState<CategoriaAcessorio | "todas">("todas");
  const [emFoco, setEmFoco] = useState<string | null>(null);
  const textos = T.agentes.guardaRoupa;
  const vestido = ACESSORIOS.find((a) => acessorios[a.posicao] === a.id);
  const corMostrada = corAcessorio ?? (vestido ? corOriginalDoAcessorio(vestido.id) : "#8b6bb5");
  const visiveis = ACESSORIOS.filter((a) => categoria === "todas" || a.categoria === categoria);
  return (
    <section className={`guarda-roupa${compacto ? " guarda-roupa-compacto" : ""}`} aria-label={textos.titulo}>
      {compacto ? <div className="guarda-roupa-legenda"><strong>{textos.titulo}</strong><span>{emFoco ?? textos.escolher}</span></div> : <p className="guarda-roupa-dica">{textos.dica}</p>}
      <div className="guarda-roupa-filtros" aria-label={textos.titulo}>
        {(["todas", "dia", "halloween", "natal"] as const).map((id) => <button key={id} type="button" aria-pressed={categoria === id} onClick={() => setCategoria(id)}>{textos.categorias[id]}</button>)}
      </div>
      {!compacto && <div className="guarda-roupa-vestidos">
        {POSICOES_ACESSORIOS.filter((p) => acessorios[p]).map((posicao) => {
          const id = acessorios[posicao];
          return <button key={posicao} type="button" disabled={!id} aria-label={id ? textos.retirar(textos.nomes[id]) : `${textos.posicoes[posicao]}: ${textos.vazio}`} onClick={() => aoMudar({ ...acessorios, [posicao]: null })}><span><small>{textos.posicoes[posicao]}</small><strong>{id ? textos.nomes[id] : textos.vazio}</strong></span>{id && <X size={12} aria-hidden="true" />}</button>;
        })}
      </div>}
      <div className="guarda-roupa-grade" tabIndex={compacto ? 0 : undefined} role={compacto ? "group" : undefined} aria-label={textos.escolher}>
        <button type="button" className="guarda-roupa-peca" title={textos.remover} aria-label={textos.remover} aria-pressed={!POSICOES_ACESSORIOS.some((p) => acessorios[p])} onClick={() => aoMudar({ ...SEM_ACESSORIOS })} onMouseEnter={() => setEmFoco(textos.vazio)} onMouseLeave={() => setEmFoco(null)} onFocus={() => setEmFoco(textos.vazio)} onBlur={() => setEmFoco(null)}><CircleSlash size={18} aria-hidden="true" />{!compacto && <strong>{textos.vazio}</strong>}</button>
        {visiveis.map((item) => {
          const selecionado = acessorios[item.posicao] === item.id;
          return <button type="button" key={item.id} className="guarda-roupa-peca" title={textos.nomes[item.id]} aria-pressed={selecionado} aria-label={textos.vestir(textos.nomes[item.id])} onMouseEnter={() => setEmFoco(textos.nomes[item.id])} onMouseLeave={() => setEmFoco(null)} onFocus={() => setEmFoco(textos.nomes[item.id])} onBlur={() => setEmFoco(null)} onClick={() => aoMudar(vestirAcessorio(acessorios, item.id))}>
            <span className="guarda-roupa-miniatura"><Personagem agente={agente} tamanho={compacto ? 48 : 76} estado="ocioso" aparencia={aparencia} acessorios={{ ...SEM_ACESSORIOS, [item.posicao]: item.id }} corAcessorio={corAcessorio} interativo={false} olhar={false} textura={false} estatico />{selecionado && <Check size={compacto ? 10 : 14} aria-hidden="true" />}</span>
            {!compacto && <><strong>{textos.nomes[item.id]}</strong><small>{textos.posicoes[item.posicao]}</small></>}
          </button>;
        })}
      </div>
      {aoMudarCor && <div className="guarda-roupa-cor"><label>{textos.cor}<input type="color" aria-label={textos.cor} value={corMostrada} onChange={(e) => aoMudarCor(e.target.value)} /></label><div className="guarda-roupa-amostras">{["#ef719d", "#7d9ee8", "#70bca6", "#e6b75e", "#343746"].map((cor) => <button key={cor} type="button" aria-label={textos.escolherCor(cor)} aria-pressed={corAcessorio === cor} style={{ background: cor }} onClick={() => aoMudarCor(cor)} />)}</div><button className="guarda-roupa-cor-original" type="button" disabled={corAcessorio === null} onClick={() => aoMudarCor(null)}>{textos.corOriginal}</button></div>}
      {compacto ? <div className="guarda-roupa-equipados">{POSICOES_ACESSORIOS.filter((p) => acessorios[p]).map((p) => <button key={p} type="button" title={textos.retirar(textos.nomes[acessorios[p]!])} onClick={() => aoMudar({ ...acessorios, [p]: null })}>{textos.nomes[acessorios[p]!]}<X size={10} aria-hidden="true" /></button>)}</div> : <footer className="guarda-roupa-rodape"><p>{textos.combinacao}</p><button type="button" disabled={!POSICOES_ACESSORIOS.some((p) => acessorios[p])} onClick={() => aoMudar({ ...SEM_ACESSORIOS })}>{textos.remover}</button></footer>}
    </section>
  );
}
