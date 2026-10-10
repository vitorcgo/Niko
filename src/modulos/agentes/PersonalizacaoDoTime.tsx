import { useState, type CSSProperties } from "react";
import { Check, RotateCcw, Save, ShieldCheck } from "lucide-react";
import type { AgenteId } from "../../tipos";
import { AGENTES } from "../../estado/agentes";
import { useConfig } from "../../estado/configuracoes";
import { restaurarPersonalizacao, salvarPersonalizacao, type PersonalizacaoAgente } from "../../estado/personalizacaoAgentes";
import { aparenciaPadrao, FORMATOS_AGENTE, LIMITE_PERSONA, personaValida } from "../../personagens/personalizacao";
import { Personagem } from "../../personagens/Personagem";
import { MoldePersonagem } from "../../personagens/MoldePersonagem";
import { Botao, Campo, ConfirmarModal } from "../../componentes/basicos";
import { T } from "../../textos/textos";
import "./agentes.css";

export function PersonalizacaoDoTime() {
  const agentes = useConfig((s) => s.agentes);
  const [selecionado, setSelecionado] = useState<AgenteId>("organizador");
  const [rascunhos, setRascunhos] = useState<Partial<Record<AgenteId, PersonalizacaoAgente>>>({});
  const [restaurando, setRestaurando] = useState<AgenteId | null>(null);
  const textos = T.agentes.personalizacao;
  const dados = rascunhos[selecionado] ?? {
    nome: agentes.nomes[selecionado], cargo: agentes.cargos[selecionado], aparencia: agentes.aparencias[selecionado], persona: agentes.personas[selecionado],
  };
  const alterado = !!rascunhos[selecionado];
  const editar = (parcial: Partial<PersonalizacaoAgente>) => setRascunhos((atuais) => ({ ...atuais, [selecionado]: { ...(atuais[selecionado] ?? dados), ...parcial } }));
  const descartar = (agente: AgenteId) => setRascunhos((atuais) => {
    const novos = { ...atuais };
    delete novos[agente];
    return novos;
  });

  return (
    <section className="time-editor" aria-label={textos.titulo}>
      <header className="time-introducao"><h3>{textos.titulo}</h3><p>{textos.dica}</p></header>
      <div className="time-grade">
        <nav className="time-integrantes" aria-label={textos.selecionar}>
          {AGENTES.map((agente) => (
            <button key={agente} type="button" className="time-integrante" aria-pressed={selecionado === agente} onClick={() => setSelecionado(agente)}>
              <Personagem agente={agente} tamanho={88} estado="ocioso" interativo={false} olhar={false} />
              <span><strong>{agentes.nomes[agente]}</strong><small>{T.agentes.areas[agente]}</small></span>
            </button>
          ))}
        </nav>
        <form className="time-formulario" onSubmit={(e) => { e.preventDefault(); salvarPersonalizacao(selecionado, dados); descartar(selecionado); }}>
          <div className="time-edicao">
          <div className="time-previa" style={{ "--cor-time": dados.aparencia.cor } as CSSProperties}>
            <span className="time-previa-rotulo">{textos.previa}</span>
            <div className="time-previa-corpo"><Personagem agente={selecionado} tamanho={208} estado="ocioso" interativo={false} aparencia={dados.aparencia} rotulo={dados.nome || agentes.nomes[selecionado]} /></div>
            <div><strong>{dados.nome.trim() || T.agentes.nomes[selecionado]}</strong><p>{T.agentes.areas[selecionado]}</p><span className="time-persona-etiqueta">{personaValida(dados.persona) ? textos.personalizada : textos.padrao}</span></div>
          </div>
          <div className="time-controles">
          <div className="time-campos">
            <Campo id="time-nome" rotulo={textos.nome}><input id="time-nome" className="campo" maxLength={20} value={dados.nome} onChange={(e) => editar({ nome: e.target.value })} /></Campo>
            <Campo id="time-cargo" rotulo={textos.cargo}><input id="time-cargo" className="campo" maxLength={32} value={dados.cargo} onChange={(e) => editar({ cargo: e.target.value })} /></Campo>
            <Campo id="time-cor" rotulo={textos.cor}><div className="time-cor"><input id="time-cor" type="color" value={dados.aparencia.cor} onChange={(e) => editar({ aparencia: { ...dados.aparencia, cor: e.target.value } })} /><code>{dados.aparencia.cor.toUpperCase()}</code></div></Campo>
            <fieldset className="time-formatos"><legend>{textos.formato}</legend><div>{FORMATOS_AGENTE.map((formato) => {
              const modelo = formato === "padrao" ? selecionado : formato;
              return <button type="button" key={formato} aria-label={textos.formatos[formato]} aria-pressed={dados.aparencia.formato === formato} onClick={() => editar({ aparencia: { ...dados.aparencia, formato } })}>{formato === "padrao" ? <><Personagem agente={modelo} tamanho={34} estado="ocioso" interativo={false} olhar={false} aparencia={aparenciaPadrao(modelo)} /><span>{textos.formatos.padrao}</span></> : <MoldePersonagem agente={modelo} />}</button>;
            })}</div></fieldset>
          </div>
          <Campo id="time-persona" rotulo={textos.persona} dica={textos.personaDica}><textarea id="time-persona" className="campo time-persona" maxLength={LIMITE_PERSONA} rows={4} value={dados.persona} placeholder={textos.personaExemplo} aria-describedby="time-persona-dica time-persona-contagem" onChange={(e) => editar({ persona: e.target.value })} /></Campo>
          <span id="time-persona-contagem" className="time-contagem">{textos.caracteres(dados.persona.length, LIMITE_PERSONA)}</span>
          <p className="time-comandos"><ShieldCheck size={15} aria-hidden="true" />{textos.comandosLocais}</p>
          </div>
          </div>
          <div className="time-acoes">
            <span className="time-salvo" role="status">{!alterado && <Check size={14} />}{alterado ? textos.alterado : textos.salvo}</span>
            <Botao pequeno variante="fantasma" icone={<RotateCcw size={13} />} onClick={() => setRestaurando(selecionado)}>{textos.restaurar}</Botao>
            {alterado && <Botao pequeno variante="fantasma" onClick={() => descartar(selecionado)}>{textos.descartar}</Botao>}
            <Botao type="submit" variante="primario" icone={<Save size={14} />} disabled={!alterado}>{textos.salvar}</Botao>
          </div>
        </form>
      </div>
      {restaurando !== null && <ConfirmarModal aberto titulo={textos.restaurar} texto={textos.confirmarRestaurar(agentes.nomes[restaurando])} rotuloConfirmar={textos.restaurar} aoFechar={() => setRestaurando(null)} aoConfirmar={() => { restaurarPersonalizacao(restaurando); descartar(restaurando); }} />}
    </section>
  );
}
