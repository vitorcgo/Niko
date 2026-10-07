import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { KeyRound, Plug, Trash2, CheckCircle2, ShieldCheck, Sparkles, RefreshCw, ExternalLink, LifeBuoy, ArrowLeft, Cpu, Zap, Globe, ChevronDown } from "lucide-react";
import { Botao, Campo, AvisoFaixa, ConfirmarModal, Vazio } from "../../componentes/basicos";
import { Marca, type MarcaId } from "../../marcas/Marca";
import { useConfig } from "../../estado/configuracoes";
import { useInterface } from "../../estado/interface";
import { T } from "../../textos/textos";
import { estadoDaPonte, salvarProvedor, removerProvedor, testarProvedor, type Provedor, type EstadoPonte } from "../../ponte/ponteLocal";
import { CATALOGO_IA, itemDoCatalogo, catalogoPelaUrl, type ItemCatalogo, type CustoProvedor } from "../../dados/provedoresIa";

type Filtro = "todos" | "gratis" | "local" | "pago";
type Teste = { ok: boolean; modelos: string[]; erro?: string } | "testando";

const C = T.configuracoes.catalogoIa;

const MARCA_DO_CATALOGO: Partial<Record<string, MarcaId>> = {
  anthropic: "anthropic",
  nvidia: "nvidia",
  opencode: "opencode",
  qwen: "qwen",
  gemini: "gemini",
  openrouter: "openrouter",
  mistral: "mistral",
  huggingface: "huggingface",
  github: "github",
  deepseek: "deepseek",
  ollama: "ollama",
  lmstudio: "lmstudio",
};

const ICONE_SEM_MARCA: Record<string, React.ReactNode> = {
  groq: <Zap size={18} />,
  cerebras: <Cpu size={18} />,
  openai: <Sparkles size={18} />,
  personalizado: <Globe size={18} />,
};

function LogoProvedor({ id, tamanho = 18 }: { id?: string; tamanho?: number }) {
  const marca = id ? MARCA_DO_CATALOGO[id] : undefined;
  if (marca) return <Marca marca={marca} tamanho={tamanho} />;
  return <>{(id && ICONE_SEM_MARCA[id]) ?? <Plug size={tamanho - 2} />}</>;
}

function passaNoFiltro(custo: CustoProvedor, filtro: Filtro) {
  if (filtro === "todos") return true;
  if (filtro === "gratis") return custo === "gratis" || custo === "cota";
  return custo === filtro;
}

function ordenarModelos(modelos: string[], sugerido: string) {
  const gratis = modelos.filter((m) => /(:free|-free)$/i.test(m));
  const resto = modelos.filter((m) => !gratis.includes(m));
  return [...new Set([...(sugerido && modelos.includes(sugerido) ? [sugerido] : []), ...gratis, ...resto])];
}

export function SecaoIa() {
  const ia = useConfig((s) => s.ia);
  const definir = useConfig((s) => s.definir);
  const avisar = useInterface((s) => s.avisar);
  const [ponte, setPonte] = useState<EstadoPonte | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [escolhido, setEscolhido] = useState<ItemCatalogo | null>(null);
  const [nome, setNome] = useState("");
  const [urlBase, setUrlBase] = useState("");
  const [modelo, setModelo] = useState("");
  const [chave, setChave] = useState("");
  const [avancado, setAvancado] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [testes, setTestes] = useState<Record<string, Teste>>({});
  const [remover, setRemover] = useState<Provedor | null>(null);

  const recarregar = async () => setPonte(await estadoDaPonte(true));

  useEffect(() => {
    void recarregar();
  }, []);

  const usados = useMemo(() => new Set((ponte?.provedores ?? []).map((p) => p.catalogo ?? catalogoPelaUrl(p.urlBase)?.id)), [ponte]);
  const visiveis = CATALOGO_IA.filter((c) => passaNoFiltro(c.custo, filtro) || c.id === "personalizado");

  const escolher = (item: ItemCatalogo) => {
    setEscolhido(item);
    setNome(item.nome || "");
    setUrlBase(item.url);
    setModelo(item.modeloSugerido);
    setChave("");
    setErros({});
    setAvancado(item.id === "personalizado");
  };

  const testar = async (p: Provedor, sugerido = "") => {
    setTestes((t) => ({ ...t, [p.id]: "testando" }));
    const r = await testarProvedor(p.id).catch((e) => ({ ok: false, modelos: [] as string[], erro: (e as Error).message }));
    const modelos = r.ok ? ordenarModelos(r.modelos, sugerido || p.modelo) : r.modelos;
    setTestes((t) => ({ ...t, [p.id]: { ...r, modelos } }));
    if (r.ok && !p.modelo && modelos[0]) {
      await salvarProvedor({ id: p.id, tipo: p.tipo, nome: p.nome, urlBase: p.urlBase, modelo: modelos[0] }).catch(() => undefined);
      await recarregar();
    }
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!escolhido) return;
    const novos: Record<string, string> = {};
    if (!nome.trim()) novos.nome = T.validacao.obrigatorio;
    if (escolhido.tipo === "openai_compativel") {
      try {
        const u = new URL(urlBase.trim());
        const local = ["localhost", "127.0.0.1"].includes(u.hostname);
        if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) novos.url = T.configuracoes.urlInsegura;
      } catch {
        novos.url = T.validacao.urlInvalida;
      }
    }
    if (escolhido.pedeChave && !chave.trim()) novos.chave = T.validacao.obrigatorio;
    if (chave && chave.trim().length < 8) novos.chave = T.conexoes.chaveCurta;
    setErros(novos);
    if (Object.keys(novos).length) {
      if (novos.nome || novos.url) setAvancado(true);
      return;
    }
    setSalvando(true);
    try {
      const p = await salvarProvedor({ tipo: escolhido.tipo, nome: nome.trim(), urlBase: urlBase.trim(), modelo: modelo.trim(), chave: chave.trim() || undefined, catalogo: escolhido.id });
      setChave("");
      const atualIa = useConfig.getState().ia;
      if (!atualIa.provedorId) definir({ ia: { ...atualIa, provedorId: p.id } });
      else if (atualIa.provedorId !== p.id && !atualIa.reservas.includes(p.id)) definir({ ia: { ...atualIa, reservas: [...atualIa.reservas, p.id] } });
      avisar(C.testeAutomatico);
      setEscolhido(null);
      await recarregar();
      void testar(p, escolhido.modeloSugerido);
    } catch (x) {
      setErros({ geral: T.configuracoes.falhaPonte((x as Error).message) });
    } finally {
      setSalvando(false);
    }
  };

  if (!ponte) return <p className="texto-3">{T.geral.carregando}</p>;

  if (!ponte.disponivel) return <AvisoFaixa tipo="alerta">{T.configuracoes.ponteIndisponivel}</AvisoFaixa>;

  return (
    <div className="coluna" style={{ gap: 22 }}>
      <AvisoFaixa>
        <span className="linha"><ShieldCheck size={13} />{T.configuracoes.chaveSegura}</span>
      </AvisoFaixa>

      {ponte.provedores.length === 0 ? (
        <Vazio icone={<Sparkles size={26} />} titulo={T.configuracoes.semProvedores} texto={T.configuracoes.semProvedoresDica} />
      ) : (
        <div className="ia-provedores">
          {ponte.provedores.map((p) => {
            const teste = testes[p.id];
            const emUso = ia.provedorId === p.id;
            const cat = p.catalogo ?? catalogoPelaUrl(p.urlBase)?.id;
            const modeloAtual = ia.modelos[p.id] || (emUso ? ia.modelo : "") || p.modelo;
            const posReserva = ia.reservas.indexOf(p.id);
            return (
              <div key={p.id} className="ia-provedor" data-em-uso={emUso ? "sim" : "nao"}>
                <span className="ia-logo"><LogoProvedor id={cat} /></span>
                <div className="coluna" style={{ gap: 4, minWidth: 0, flex: 1 }}>
                  <span className="linha" style={{ flexWrap: "wrap" }}>
                    <b>{p.nome}</b>
                    {emUso && <span className="etiqueta etiqueta-sucesso"><CheckCircle2 size={11} />{T.configuracoes.emUso}</span>}
                    {posReserva >= 0 && <span className="etiqueta" title={T.configuracoes.reservaDica}><LifeBuoy size={11} />{T.configuracoes.reserva(posReserva + 1)}</span>}
                    {cat && itemDoCatalogo(cat) && <span className={`etiqueta ia-custo-${itemDoCatalogo(cat)!.custo}`}>{C.custos[itemDoCatalogo(cat)!.custo]}</span>}
                    {!p.temChave && itemDoCatalogo(cat)?.pedeChave && <span className="etiqueta">{T.configuracoes.semChave}</span>}
                  </span>
                  <span className="texto-3 cortar" style={{ fontSize: 12 }}>{modeloAtual || C.modeloOpcional}</span>
                  {teste === "testando" && <span className="campo-dica">{T.configuracoes.testando}</span>}
                  {teste && teste !== "testando" && (teste.ok ? (
                    teste.modelos.length > 0 ? (
                      <div className="linha" style={{ flexWrap: "wrap" }}>
                        <span className="campo-dica" style={{ color: "var(--sucesso)" }}>{T.configuracoes.conexaoOk(teste.modelos.length)}</span>
                        <select className="seletor" style={{ maxWidth: 320, height: 30 }} aria-label={T.configuracoes.modeloChat} value={modeloAtual} onChange={(e) => definir({ ia: { ...ia, modelos: { ...ia.modelos, [p.id]: e.target.value }, ...(emUso ? { modelo: e.target.value } : {}) } })}>
                          {[...new Set([modeloAtual, ...teste.modelos].filter(Boolean))].map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    ) : (
                      <span className="campo-dica">{C.semModelos}</span>
                    )
                  ) : (
                    <span className="campo-erro">{T.configuracoes.conexaoFalhou(teste.erro ?? "")}</span>
                  ))}
                </div>
                <div className="linha" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {!emUso && <Botao pequeno variante="primario" onClick={() => definir({ ia: { ...ia, provedorId: p.id, modelo: ia.modelos[p.id] ?? "", reservas: [...(ia.provedorId ? [ia.provedorId] : []), ...ia.reservas.filter((x) => x !== p.id)] } })}>{T.configuracoes.usarNoChat}</Botao>}
                  {!emUso && (
                    <Botao
                      pequeno
                      icone={<LifeBuoy size={13} />}
                      title={T.configuracoes.reservaDica}
                      onClick={() => definir({ ia: { ...ia, reservas: posReserva >= 0 ? ia.reservas.filter((x) => x !== p.id) : [...ia.reservas, p.id] } })}
                    >
                      {posReserva >= 0 ? T.configuracoes.tirarReserva : T.configuracoes.usarReserva}
                    </Botao>
                  )}
                  <Botao pequeno icone={<RefreshCw size={13} className={teste === "testando" ? "girando" : ""} />} disabled={teste === "testando"} onClick={() => void testar(p, itemDoCatalogo(cat)?.modeloSugerido)}>{T.configuracoes.testar}</Botao>
                  <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => setRemover(p)} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {!escolhido ? (
          <motion.div key="catalogo" className="coluna" style={{ gap: 14 }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            <div className="linha-entre" style={{ flexWrap: "wrap", gap: 12 }}>
              <div className="coluna" style={{ gap: 2 }}>
                <b>{C.titulo}</b>
                <span className="campo-dica">{C.dica}</span>
              </div>
              <div className="pilulas">
                {(Object.keys(C.filtros) as Filtro[]).map((f) => (
                  <button key={f} type="button" className="pilula" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>{C.filtros[f]}</button>
                ))}
              </div>
            </div>
            <div className="ia-catalogo">
              {visiveis.map((item, i) => (
                <motion.button
                  key={item.id}
                  type="button"
                  className="ia-opcao"
                  data-custo={item.custo}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: i * 0.02 } }}
                  onClick={() => escolher(item)}
                >
                  <span className="ia-opcao-topo">
                    <span className="ia-logo"><LogoProvedor id={item.id} /></span>
                    <b className="cortar">{item.nome || C.personalizado}</b>
                    {item.id !== "personalizado" && <span className={`etiqueta ia-custo-${item.custo}`}>{C.custos[item.custo]}</span>}
                  </span>
                  <span className="ia-opcao-texto">{C.descricoes[item.id]}</span>
                  {usados.has(item.id) && <span className="ia-opcao-usado"><CheckCircle2 size={12} />{C.jaAdicionado}</span>}
                </motion.button>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.form key="formulario" className="formulario cartao ia-formulario" onSubmit={salvar} noValidate initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            <div className="linha-entre" style={{ gap: 12, flexWrap: "wrap" }}>
              <span className="linha" style={{ gap: 12 }}>
                <span className="ia-logo ia-logo-grande"><LogoProvedor id={escolhido.id} tamanho={22} /></span>
                <span className="coluna" style={{ gap: 2 }}>
                  <b>{C.configurando(escolhido.nome || C.personalizado)}</b>
                  <span className="campo-dica">{C.descricoes[escolhido.id]}</span>
                </span>
              </span>
              <Botao pequeno variante="fantasma" icone={<ArrowLeft size={13} />} onClick={() => setEscolhido(null)}>{C.trocar}</Botao>
            </div>

            {escolhido.id !== "personalizado" && (
              <ol className="ia-passos">
                {(escolhido.custo === "local" ? C.passosLocal : C.passosChave).map((passo, i) => (
                  <li key={passo}>
                    <span className="ia-passo-numero">{i + 1}</span>
                    <span>{passo}</span>
                    {i === 0 && escolhido.paginaChave && (
                      <a className="botao botao-secundario botao-pequeno" href={escolhido.paginaChave} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={12} />
                        {C.pegarChave}
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            )}

            {(escolhido.pedeChave || escolhido.id === "personalizado") && (
              <Campo id="ia-chave" rotulo={T.conexoes.chave} obrigatorio={escolhido.pedeChave} erro={erros.chave} dica={escolhido.pedeChave ? undefined : T.configuracoes.chaveOpcionalLocal}>
                <input id="ia-chave" className="campo" type="password" autoComplete="off" spellCheck={false} value={chave} autoFocus onChange={(e) => setChave(e.target.value)} />
              </Campo>
            )}

            <Campo id="ia-modelo" rotulo={T.configuracoes.modeloPadrao} erro={erros.modelo} dica={C.modeloOpcional}>
              <input id="ia-modelo" className="campo" value={modelo} maxLength={160} placeholder={escolhido.modeloSugerido || "llama, qwen, gemini..."} onChange={(e) => setModelo(e.target.value)} />
            </Campo>

            <button type="button" className="ia-avancado" aria-expanded={avancado} onClick={() => setAvancado(!avancado)}>
              <ChevronDown size={14} />
              {C.avancado}
            </button>
            {avancado && (
              <div className="formulario-linha">
                <Campo id="ia-nome" rotulo={T.configuracoes.nomeProvedor} obrigatorio erro={erros.nome}>
                  <input id="ia-nome" className="campo" value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} />
                </Campo>
                {escolhido.tipo === "openai_compativel" && (
                  <Campo id="ia-url" rotulo={T.configuracoes.urlBase} obrigatorio erro={erros.url} dica={T.configuracoes.urlDica}>
                    <input id="ia-url" className="campo" value={urlBase} inputMode="url" placeholder="https://.../v1" onChange={(e) => setUrlBase(e.target.value)} />
                  </Campo>
                )}
              </div>
            )}

            {erros.geral && <AvisoFaixa tipo="erro">{erros.geral}</AvisoFaixa>}
            <div className="formulario-acoes">
              <Botao onClick={() => setEscolhido(null)}>{T.geral.cancelar}</Botao>
              <Botao type="submit" variante="primario" icone={<KeyRound size={14} />} disabled={salvando}>{salvando ? T.configuracoes.salvandoChave : T.configuracoes.salvarProvedor}</Botao>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <ConfirmarModal
        aberto={!!remover}
        titulo={T.geral.confirmarExclusao}
        texto={T.configuracoes.removerProvedor}
        aoFechar={() => setRemover(null)}
        aoConfirmar={async () => {
          if (!remover) return;
          try {
            await removerProvedor(remover.id);
          } catch (e) {
            avisar(T.configuracoes.falhaRemoverProvedor((e as Error).message));
            return;
          }
          const restantes = ia.reservas.filter((x) => x !== remover.id);
          const { [remover.id]: _removido, ...modelos } = ia.modelos;
          if (ia.provedorId === remover.id) definir({ ia: { ...ia, provedorId: restantes[0] ?? null, modelo: restantes[0] ? ia.modelos[restantes[0]] ?? "" : "", reservas: restantes.slice(1), modelos } });
          else definir({ ia: { ...ia, reservas: restantes, modelos } });
          await recarregar();
        }}
      />
    </div>
  );
}
