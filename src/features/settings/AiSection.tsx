import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { KeyRound, Plug, Trash2, CheckCircle2, ShieldCheck, BrainCircuit, RefreshCw, ExternalLink, LifeBuoy, ArrowLeft, Cpu, Zap, Globe, ChevronDown } from "lucide-react";
import { Button, Field, NoticeBanner, ConfirmModal, Empty } from "../../components/basics";
import { Brand, type BrandId } from "../../brands/Brand";
import { useConfig } from "../../state/settings";
import { useInterface } from "../../state/interface";
import { T } from "../../i18n/ptBR";
import { stateBridge, saveProvider, removeProvider, testProvider, type Provider, type StateBridge } from "../../bridge/localBridge";
import { CATALOG_AI, itemCatalog, catalogPelaUrl, type ItemCatalog, type CostProvider } from "../../data/aiProviders";

type Filter = "todos" | "gratis" | "local" | "pago";
type Test = { ok: boolean; modelos: string[]; erro?: string } | "testando";

const C = T.configuracoes.catalogoIa;

const BRAND_CATALOG: Partial<Record<string, BrandId>> = {
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

const ICON_WITHOUT_BRAND: Record<string, React.ReactNode> = {
  groq: <Zap size={18} />,
  cerebras: <Cpu size={18} />,
  personalizado: <Globe size={18} />,
};

function LogoProvider({ id, tamanho: size = 18 }: { id?: string; tamanho?: number }) {
  const brand = id ? BRAND_CATALOG[id] : undefined;
  if (brand) return <Brand marca={brand} tamanho={size} />;
  return <>{(id && ICON_WITHOUT_BRAND[id]) ?? <Plug size={size - 2} />}</>;
}

function passaFilter(cost: CostProvider, filter: Filter) {
  if (filter === "todos") return true;
  if (filter === "gratis") return cost === "gratis" || cost === "cota";
  return cost === filter;
}

function sortModels(models: string[], suggested: string) {
  const free = models.filter((m) => /(:free|-free)$/i.test(m));
  const rest = models.filter((m) => !free.includes(m));
  return [...new Set([...(suggested && models.includes(suggested) ? [suggested] : []), ...free, ...rest])];
}

export function AiSection() {
  const ai = useConfig((s) => s.ia);
  const set = useConfig((s) => s.set);
  const notify = useInterface((s) => s.notify);
  const [bridge, setBridge] = useState<StateBridge | null>(null);
  const [filter, setFilter] = useState<Filter>("todos");
  const [selected, setSelected] = useState<ItemCatalog | null>(null);
  const [nameValue, setName] = useState("");
  const [urlBase, setUrlBase] = useState("");
  const [model, setModel] = useState("");
  const [key, setKey] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testes, setTestes] = useState<Record<string, Test>>({});
  const [remove, setRemove] = useState<Provider | null>(null);

  const reload = async () => setBridge(await stateBridge(true));

  useEffect(() => {
    void reload();
  }, []);

  const used = useMemo(() => new Set((bridge?.provedores ?? []).map((p) => p.catalogo ?? catalogPelaUrl(p.urlBase)?.id)), [bridge]);
  const visible = CATALOG_AI.filter((c) => passaFilter(c.custo, filter) || c.id === "personalizado");

  const select = (item: ItemCatalog) => {
    setSelected(item);
    setName(item.nome || "");
    setUrlBase(item.url);
    setModel(item.modeloSugerido);
    setKey("");
    setErrors({});
    setAdvanced(item.id === "personalizado");
  };

  const test = async (p: Provider, suggested = "") => {
    setTestes((t) => ({ ...t, [p.id]: "testando" }));
    const r = await testProvider(p.id).catch((e) => ({ ok: false, modelos: [] as string[], erro: (e as Error).message }));
    const models = r.ok ? sortModels(r.modelos, suggested || p.modelo) : r.modelos;
    setTestes((t) => ({ ...t, [p.id]: { ...r, modelos: models } }));
    if (r.ok && !p.modelo && models[0]) {
      await saveProvider({ id: p.id, tipo: p.tipo, nome: p.nome, urlBase: p.urlBase, modelo: models[0] }).catch(() => undefined);
      await reload();
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const newItems: Record<string, string> = {};
    if (!nameValue.trim()) newItems.nome = T.validacao.obrigatorio;
    if (selected.tipo === "openai_compativel") {
      try {
        const u = new URL(urlBase.trim());
        const local = ["localhost", "127.0.0.1"].includes(u.hostname);
        if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) newItems.url = T.configuracoes.urlInsegura;
      } catch {
        newItems.url = T.validacao.urlInvalida;
      }
    }
    if (selected.pedeChave && !key.trim()) newItems.chave = T.validacao.obrigatorio;
    if (key && key.trim().length < 8) newItems.chave = T.conexoes.chaveCurta;
    setErrors(newItems);
    if (Object.keys(newItems).length) {
      if (newItems.nome || newItems.url) setAdvanced(true);
      return;
    }
    setSaving(true);
    try {
      const p = await saveProvider({ tipo: selected.tipo, nome: nameValue.trim(), urlBase: urlBase.trim(), modelo: model.trim(), chave: key.trim() || undefined, catalogo: selected.id });
      setKey("");
      const currentAi = useConfig.getState().ia;
      if (!currentAi.provedorId) set({ ia: { ...currentAi, provedorId: p.id } });
      else if (currentAi.provedorId !== p.id && !currentAi.reservas.includes(p.id)) set({ ia: { ...currentAi, reservas: [...currentAi.reservas, p.id] } });
      notify(C.testeAutomatico);
      setSelected(null);
      await reload();
      void test(p, selected.modeloSugerido);
    } catch (x) {
      setErrors({ geral: T.configuracoes.falhaPonte((x as Error).message) });
    } finally {
      setSaving(false);
    }
  };

  if (!bridge) return <p className="texto-3">{T.geral.carregando}</p>;

  if (!bridge.disponivel) return <NoticeBanner tipo="alerta">{T.configuracoes.ponteIndisponivel}</NoticeBanner>;

  return (
    <div className="coluna" style={{ gap: 22 }}>
      <NoticeBanner>
        <span className="linha"><ShieldCheck size={13} />{T.configuracoes.chaveSegura}</span>
      </NoticeBanner>

      {bridge.provedores.length === 0 ? (
        <Empty icone={<BrainCircuit size={26} />} titulo={T.configuracoes.semProvedores} texto={T.configuracoes.semProvedoresDica} />
      ) : (
        <div className="ia-provedores">
          {bridge.provedores.map((p) => {
            const testValue = testes[p.id];
            const atUsage = ai.provedorId === p.id;
            const cat = p.catalogo ?? catalogPelaUrl(p.urlBase)?.id;
            const modelCurrent = ai.modelos[p.id] || (atUsage ? ai.modelo : "") || p.modelo;
            const posFallback = ai.reservas.indexOf(p.id);
            return (
              <div key={p.id} className="ia-provedor" data-em-uso={atUsage ? "sim" : "nao"}>
                <span className="ia-logo"><LogoProvider id={cat} /></span>
                <div className="coluna" style={{ gap: 4, minWidth: 0, flex: 1 }}>
                  <span className="linha" style={{ flexWrap: "wrap" }}>
                    <b>{p.nome}</b>
                    {atUsage && <span className="etiqueta etiqueta-sucesso"><CheckCircle2 size={11} />{T.configuracoes.emUso}</span>}
                    {posFallback >= 0 && <span className="etiqueta" title={T.configuracoes.reservaDica}><LifeBuoy size={11} />{T.configuracoes.reserva(posFallback + 1)}</span>}
                    {cat && itemCatalog(cat) && <span className={`etiqueta ia-custo-${itemCatalog(cat)!.custo}`}>{C.custos[itemCatalog(cat)!.custo]}</span>}
                    {!p.temChave && itemCatalog(cat)?.pedeChave && <span className="etiqueta">{T.configuracoes.semChave}</span>}
                  </span>
                  <span className="texto-3 cortar" style={{ fontSize: 12 }}>{modelCurrent || C.modeloOpcional}</span>
                  {testValue === "testando" && <span className="campo-dica">{T.configuracoes.testando}</span>}
                  {testValue && testValue !== "testando" && (testValue.ok ? (
                    testValue.modelos.length > 0 ? (
                      <div className="linha" style={{ flexWrap: "wrap" }}>
                        <span className="campo-dica" style={{ color: "var(--sucesso)" }}>{T.configuracoes.conexaoOk(testValue.modelos.length)}</span>
                        <select className="seletor" style={{ maxWidth: 320, height: 30 }} aria-label={T.configuracoes.modeloChat} value={modelCurrent} onChange={(e) => set({ ia: { ...ai, modelos: { ...ai.modelos, [p.id]: e.target.value }, ...(atUsage ? { modelo: e.target.value } : {}) } })}>
                          {[...new Set([modelCurrent, ...testValue.modelos].filter(Boolean))].map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    ) : (
                      <span className="campo-dica">{C.semModelos}</span>
                    )
                  ) : (
                    <span className="campo-erro">{T.configuracoes.conexaoFalhou(testValue.erro ?? "")}</span>
                  ))}
                </div>
                <div className="linha" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {!atUsage && <Button pequeno variante="primario" onClick={() => set({ ia: { ...ai, provedorId: p.id, modelo: ai.modelos[p.id] ?? "", reservas: [...(ai.provedorId ? [ai.provedorId] : []), ...ai.reservas.filter((x) => x !== p.id)] } })}>{T.configuracoes.usarNoChat}</Button>}
                  {!atUsage && (
                    <Button
                      pequeno
                      icone={<LifeBuoy size={13} />}
                      title={T.configuracoes.reservaDica}
                      onClick={() => set({ ia: { ...ai, reservas: posFallback >= 0 ? ai.reservas.filter((x) => x !== p.id) : [...ai.reservas, p.id] } })}
                    >
                      {posFallback >= 0 ? T.configuracoes.tirarReserva : T.configuracoes.usarReserva}
                    </Button>
                  )}
                  <Button pequeno icone={<RefreshCw size={13} className={testValue === "testando" ? "girando" : ""} />} disabled={testValue === "testando"} onClick={() => void test(p, itemCatalog(cat)?.modeloSugerido)}>{T.configuracoes.testar}</Button>
                  <Button pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => setRemove(p)} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {!selected ? (
          <motion.div key="catalogo" className="coluna" style={{ gap: 14 }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            <div className="linha-entre" style={{ flexWrap: "wrap", gap: 12 }}>
              <div className="coluna" style={{ gap: 2 }}>
                <b>{C.titulo}</b>
                <span className="campo-dica">{C.dica}</span>
              </div>
              <div className="pilulas">
                {(Object.keys(C.filtros) as Filter[]).map((f) => (
                  <button key={f} type="button" className="pilula" aria-pressed={filter === f} onClick={() => setFilter(f)}>{C.filtros[f]}</button>
                ))}
              </div>
            </div>
            <div className="ia-catalogo">
              {visible.map((item, i) => (
                <motion.button
                  key={item.id}
                  type="button"
                  className="ia-opcao"
                  data-custo={item.custo}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: i * 0.02 } }}
                  onClick={() => select(item)}
                >
                  <span className="ia-opcao-topo">
                    <span className="ia-logo"><LogoProvider id={item.id} /></span>
                    <b className="cortar">{item.nome || C.personalizado}</b>
                    {item.id !== "personalizado" && <span className={`etiqueta ia-custo-${item.custo}`}>{C.custos[item.custo]}</span>}
                  </span>
                  <span className="ia-opcao-texto">{C.descricoes[item.id]}</span>
                  {used.has(item.id) && <span className="ia-opcao-usado"><CheckCircle2 size={12} />{C.jaAdicionado}</span>}
                </motion.button>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.form key="formulario" className="formulario cartao ia-formulario" onSubmit={save} noValidate initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            <div className="linha-entre" style={{ gap: 12, flexWrap: "wrap" }}>
              <span className="linha" style={{ gap: 12 }}>
                <span className="ia-logo ia-logo-grande"><LogoProvider id={selected.id} tamanho={22} /></span>
                <span className="coluna" style={{ gap: 2 }}>
                  <b>{C.configurando(selected.nome || C.personalizado)}</b>
                  <span className="campo-dica">{C.descricoes[selected.id]}</span>
                </span>
              </span>
              <Button pequeno variante="fantasma" icone={<ArrowLeft size={13} />} onClick={() => setSelected(null)}>{C.trocar}</Button>
            </div>

            {selected.id !== "personalizado" && (
              <ol className="ia-passos">
                {(selected.custo === "local" ? C.passosLocal : C.passosChave).map((step, i) => (
                  <li key={step}>
                    <span className="ia-passo-numero">{i + 1}</span>
                    <span>{step}</span>
                    {i === 0 && selected.paginaChave && (
                      <a className="botao botao-secundario botao-pequeno" href={selected.paginaChave} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={12} />
                        {C.pegarChave}
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            )}

            {(selected.pedeChave || selected.id === "personalizado") && (
              <Field id="ia-chave" rotulo={T.conexoes.chave} obrigatorio={selected.pedeChave} erro={errors.chave} dica={selected.pedeChave ? undefined : T.configuracoes.chaveOpcionalLocal}>
                <input id="ia-chave" className="campo" type="password" autoComplete="off" spellCheck={false} value={key} autoFocus onChange={(e) => setKey(e.target.value)} />
              </Field>
            )}

            <Field id="ia-modelo" rotulo={T.configuracoes.modeloPadrao} erro={errors.modelo} dica={C.modeloOpcional}>
              <input id="ia-modelo" className="campo" value={model} maxLength={160} placeholder={selected.modeloSugerido || "llama, qwen, gemini..."} onChange={(e) => setModel(e.target.value)} />
            </Field>

            <button type="button" className="ia-avancado" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>
              <ChevronDown size={14} />
              {C.avancado}
            </button>
            {advanced && (
              <div className="formulario-linha">
                <Field id="ia-nome" rotulo={T.configuracoes.nomeProvedor} obrigatorio erro={errors.nome}>
                  <input id="ia-nome" className="campo" value={nameValue} maxLength={40} onChange={(e) => setName(e.target.value)} />
                </Field>
                {selected.tipo === "openai_compativel" && (
                  <Field id="ia-url" rotulo={T.configuracoes.urlBase} obrigatorio erro={errors.url} dica={T.configuracoes.urlDica}>
                    <input id="ia-url" className="campo" value={urlBase} inputMode="url" placeholder="https://.../v1" onChange={(e) => setUrlBase(e.target.value)} />
                  </Field>
                )}
              </div>
            )}

            {errors.geral && <NoticeBanner tipo="erro">{errors.geral}</NoticeBanner>}
            <div className="formulario-acoes">
              <Button onClick={() => setSelected(null)}>{T.geral.cancelar}</Button>
              <Button type="submit" variante="primario" icone={<KeyRound size={14} />} disabled={saving}>{saving ? T.configuracoes.salvandoChave : T.configuracoes.salvarProvedor}</Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <ConfirmModal
        aberto={!!remove}
        titulo={T.geral.confirmarExclusao}
        texto={T.configuracoes.removerProvedor}
        aoFechar={() => setRemove(null)}
        aoConfirmar={async () => {
          if (!remove) return;
          await removeProvider(remove.id);
          const remaining = ai.reservas.filter((x) => x !== remove.id);
          const { [remove.id]: removed, ...models } = ai.modelos;
          if (ai.provedorId === remove.id) set({ ia: { ...ai, provedorId: remaining[0] ?? null, modelo: remaining[0] ? ai.modelos[remaining[0]] ?? "" : "", reservas: remaining.slice(1), modelos: models } });
          else set({ ia: { ...ai, reservas: remaining, modelos: models } });
          await reload();
        }}
      />
    </div>
  );
}
