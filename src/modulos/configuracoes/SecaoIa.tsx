import { useEffect, useMemo, useState } from "react";
import { KeyRound, Plug, Trash2, CheckCircle2, ShieldCheck, BrainCircuit, RefreshCw, ExternalLink, LifeBuoy, Cpu, Zap, Globe, ChevronDown, Lock, LockOpen, Eye } from "lucide-react";
import { Botao, Campo, AvisoFaixa, ConfirmarModal, Vazio, Modal, Pilulas } from "../../componentes/basicos";
import { Marca, type MarcaId } from "../../marcas/Marca";
import { useConfig } from "../../estado/configuracoes";
import { useInterface } from "../../estado/interface";
import { T } from "../../textos/textos";
import { estadoDaPonte, salvarProvedor, removerProvedor, testarProvedor, type Provedor, type EstadoPonte } from "../../ponte/ponteLocal";
import { CATALOGO_IA, itemDoCatalogo, catalogoPelaUrl, provedorEntendeImagens, type ItemCatalogo, type CustoProvedor } from "../../dados/provedoresIa";
import { situacaoDoEndereco } from "../../utilitarios/enderecoDoProvedor";

type Filtro = "todos" | "gratis" | "local" | "pago";
type Grupo = keyof typeof T.provedoresIa.grupos;
type Teste = { ok: boolean; modelos: string[]; erro?: string } | "testando";

const C = T.configuracoes.catalogoIa;
const P = T.provedoresIa;

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

const ICONE_SEM_MARCA: Record<string, (tamanho: number) => React.ReactNode> = {
  groq: (t) => <Zap size={t} />,
  cerebras: (t) => <Cpu size={t} />,
  personalizado: (t) => <Globe size={t} />,
};

export function LogoProvedor({ id, tamanho = 16 }: { id?: string; tamanho?: number }) {
  const marca = id ? MARCA_DO_CATALOGO[id] : undefined;
  if (marca) return <Marca marca={marca} tamanho={tamanho} />;
  return <>{id && ICONE_SEM_MARCA[id] ? ICONE_SEM_MARCA[id](tamanho) : <Plug size={tamanho} />}</>;
}

function grupoDoCusto(custo: CustoProvedor): Grupo {
  if (custo === "gratis" || custo === "cota") return "gratis";
  return custo;
}

function passaNoFiltro(custo: CustoProvedor, filtro: Filtro) {
  if (filtro === "todos") return true;
  return grupoDoCusto(custo) === filtro;
}

function ordenarModelos(modelos: string[], sugerido: string) {
  const gratis = modelos.filter((m) => /(:free|-free)$/i.test(m));
  const resto = modelos.filter((m) => !gratis.includes(m));
  return [...new Set([...(sugerido && modelos.includes(sugerido) ? [sugerido] : []), ...gratis, ...resto])];
}

function ResultadoTeste({ teste }: { teste?: Teste }) {
  if (!teste) return null;
  if (teste === "testando") return <span className="ia-teste">{T.configuracoes.testando}</span>;
  if (!teste.ok) return <span className="ia-teste" data-estado="erro">{T.configuracoes.conexaoFalhou(teste.erro ?? "")}</span>;
  if (teste.modelos.length === 0) return <span className="ia-teste">{C.semModelos}</span>;
  return <span className="ia-teste" data-estado="ok">{T.configuracoes.conexaoOk(teste.modelos.length)}</span>;
}

export function SecaoIa() {
  const ia = useConfig((s) => s.ia);
  const definir = useConfig((s) => s.definir);
  const temVisao = (p: Provedor) => provedorEntendeImagens(p, ia.visao);
  const botaoDeVisao = (p: Provedor) => (
    <Botao
      pequeno
      variante={temVisao(p) ? "primario" : "secundario"}
      icone={<Eye size={12} />}
      aria-pressed={temVisao(p)}
      title={P.visaoDica}
      onClick={() => definir({ ia: { ...ia, visao: { ...ia.visao, [p.id]: temVisao(p) ? "nao" : "sim" } } })}
    >
      {temVisao(p) ? P.comVisao : P.marcarVisao}
    </Botao>
  );
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

  const catalogoDe = (p: Provedor) => p.catalogo ?? catalogoPelaUrl(p.urlBase)?.id;
  const usados = useMemo(() => new Set((ponte?.provedores ?? []).map((p) => p.catalogo ?? catalogoPelaUrl(p.urlBase)?.id)), [ponte]);
  const visiveis = CATALOGO_IA.filter((c) => passaNoFiltro(c.custo, filtro) || c.id === "personalizado");
  const grupos = (Object.keys(P.grupos) as Grupo[]).map((g) => ({ id: g, itens: visiveis.filter((c) => grupoDoCusto(c.custo) === g) })).filter((g) => g.itens.length > 0);

  const escolher = (item: ItemCatalogo) => {
    setEscolhido(item);
    setNome(item.nome || "");
    setUrlBase(item.url);
    setModelo(item.modeloSugerido);
    setChave("");
    setErros({});
    setAvancado(item.id === "personalizado" || item.custo === "local");
  };

  const avisoDoEndereco = (() => {
    if (!escolhido || escolhido.tipo !== "openai_compativel") return null;
    const situacao = situacaoDoEndereco(urlBase, false);
    if (situacao.erro) return null;
    if (situacao.semCriptografia) return { tipo: "alerta" as const, texto: T.configuracoes.enderecoSemCriptografia };
    if (situacao.alcance === "rede_local" || (escolhido.custo === "local" && situacao.alcance === "internet")) return { tipo: "info" as const, texto: T.configuracoes.enderecoDeOutroPc };
    return null;
  })();

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
      const erroDoEndereco = situacaoDoEndereco(urlBase, Boolean(chave.trim())).erro;
      if (erroDoEndereco === "url_invalida") novos.url = T.validacao.urlInvalida;
      else if (erroDoEndereco === "url_insegura") novos.url = T.configuracoes.urlInsegura;
      else if (erroDoEndereco === "chave_sem_criptografia") novos.url = T.configuracoes.chaveSemCriptografia;
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
      const motivo = (x as Error).message;
      setErros({ geral: T.configuracoes.errosDoCofre[motivo] ?? T.configuracoes.falhaPonte(motivo) });
    } finally {
      setSalvando(false);
    }
  };

  if (!ponte) return <p className="texto-3">{T.geral.carregando}</p>;

  if (!ponte.disponivel) return <AvisoFaixa tipo="alerta">{T.configuracoes.ponteIndisponivel}</AvisoFaixa>;

  const emUso = ponte.provedores.find((p) => p.id === ia.provedorId);
  const outros = ponte.provedores.filter((p) => p.id !== ia.provedorId);
  const catalogoEmUso = emUso ? catalogoDe(emUso) : undefined;
  const modeloDe = (p: Provedor) => ia.modelos[p.id] || (p.id === ia.provedorId ? ia.modelo : "") || p.modelo;
  const usarNoChat = (p: Provedor) => definir({ ia: { ...ia, provedorId: p.id, modelo: ia.modelos[p.id] ?? "", reservas: [...(ia.provedorId ? [ia.provedorId] : []), ...ia.reservas.filter((x) => x !== p.id)] } });
  const escolherModelo = (p: Provedor, valor: string) => definir({ ia: { ...ia, modelos: { ...ia.modelos, [p.id]: valor }, ...(p.id === ia.provedorId ? { modelo: valor } : {}) } });

  const seletorDeModelo = (p: Provedor) => {
    const teste = testes[p.id];
    const atual = modeloDe(p);
    const opcoes = [...new Set([atual, ...(teste && teste !== "testando" && teste.ok ? teste.modelos : [])].filter(Boolean))];
    return (
      <select className="seletor ia-modelo" aria-label={T.configuracoes.modeloChat} value={atual} disabled={opcoes.length === 0} title={opcoes.length <= 1 ? T.configuracoes.modeloDica : undefined} onChange={(e) => escolherModelo(p, e.target.value)}>
        {opcoes.length === 0 && <option value="">{C.modeloOpcional}</option>}
        {opcoes.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
    );
  };

  return (
    <div className="ia-tela">
      <div className="ia-catalogo">
        <div className="ia-catalogo-topo">
          <div className="ia-catalogo-texto">
            <b>{C.titulo}</b>
            <span>{C.dica}</span>
          </div>
          <Pilulas<Filtro> rotulo={C.titulo} valor={filtro} aoMudar={setFiltro} opcoes={(Object.keys(C.filtros) as Filtro[]).map((f) => ({ valor: f, rotulo: C.filtros[f] }))} />
        </div>
        {grupos.map((g) => (
          <div key={g.id} className="ia-grupo">
            <span className="ia-grupo-rotulo">{P.grupos[g.id]}</span>
            <div className="ia-grade">
              {g.itens.map((item) => {
                const usado = usados.has(item.id);
                const selecionado = catalogoEmUso === item.id;
                return (
                  <button key={item.id} type="button" className="ia-cartao" data-em-uso={selecionado ? "sim" : "nao"} onClick={() => escolher(item)}>
                    <span className="ia-cartao-topo">
                      <span className="ia-cartao-marca">
                        <span className="ia-logo"><LogoProvedor id={item.id} /></span>
                        <b className="cortar">{item.nome || C.personalizado}</b>
                      </span>
                      <span className="ia-ponto" data-estado={selecionado ? "uso" : usado ? "adicionado" : "livre"} title={selecionado ? T.configuracoes.emUso : usado ? C.jaAdicionado : undefined} />
                    </span>
                    <span className="ia-cartao-texto">{C.descricoes[item.id]}</span>
                    {(item.custo === "cota" || usado) && (
                      <span className="ia-cartao-rodape">
                        {item.custo === "cota" && <span className="etiqueta etiqueta-destaque">{C.custos.cota}</span>}
                        {usado && <span className="ia-cartao-usado"><CheckCircle2 size={11} />{C.jaAdicionado}</span>}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <aside className="ia-lado">
        <div className="ia-em-uso">
          <span className="ia-em-uso-rotulo">{P.emUso}</span>
          {!emUso ? (
            <Vazio icone={<BrainCircuit size={26} />} titulo={ponte.provedores.length === 0 ? T.configuracoes.semProvedores : P.nenhumEmUso} texto={ponte.provedores.length === 0 ? T.configuracoes.semProvedoresDica : P.nenhumEmUsoDica} />
          ) : (
            <>
              <span className="ia-em-uso-cabecalho">
                <span className="ia-logo ia-logo-grande"><LogoProvedor id={catalogoEmUso} tamanho={24} /></span>
                <span className="ia-em-uso-nome">{emUso.nome}</span>
              </span>
              {itemDoCatalogo(catalogoEmUso) && (
                <span className="ia-etiquetas">
                  <span className={`etiqueta ia-custo-${itemDoCatalogo(catalogoEmUso)!.custo}`}>{C.custos[itemDoCatalogo(catalogoEmUso)!.custo]}</span>
                </span>
              )}
              <div className="ia-campo">
                <span className="ia-campo-rotulo">{T.configuracoes.modeloPadrao}</span>
                {seletorDeModelo(emUso)}
                <ResultadoTeste teste={testes[emUso.id]} />
                {botaoDeVisao(emUso)}
                <span className="ia-campo-dica">{P.visaoDica}</span>
              </div>
              <div className="ia-campo">
                <span className="ia-campo-rotulo">{P.chaveAcesso}</span>
                <span className="ia-chave" data-guardada={emUso.temChave ? "sim" : "nao"}>
                  {emUso.temChave ? <Lock size={13} /> : <LockOpen size={13} />}
                  {emUso.temChave ? P.chaveGuardada : itemDoCatalogo(catalogoEmUso)?.pedeChave ? T.configuracoes.semChave : P.semChaveDica}
                </span>
                {emUso.temChave && <span className="ia-campo-dica">{P.chaveGuardadaDica}</span>}
              </div>
              <div className="ia-em-uso-acoes">
                <Botao variante="primario" className="ia-testar" icone={<RefreshCw size={13} className={testes[emUso.id] === "testando" ? "girando" : ""} />} disabled={testes[emUso.id] === "testando"} onClick={() => void testar(emUso, itemDoCatalogo(catalogoEmUso)?.modeloSugerido)}>{P.testarConexao}</Botao>
                <Botao icone={<Trash2 size={13} />} onClick={() => setRemover(emUso)}>{P.removerProvedor}</Botao>
              </div>
            </>
          )}
        </div>

        {outros.length > 0 && (
          <div className="ia-outros">
            <span className="ia-grupo-rotulo">{P.seusProvedores}</span>
            {outros.map((p) => {
              const cat = catalogoDe(p);
              const posReserva = ia.reservas.indexOf(p.id);
              const teste = testes[p.id];
              return (
                <div key={p.id} className="ia-provedor">
                  <div className="ia-provedor-topo">
                    <span className="ia-logo"><LogoProvedor id={cat} /></span>
                    <span className="ia-provedor-texto">
                      <b className="cortar">{p.nome}</b>
                      <span className="ia-provedor-modelo cortar">{modeloDe(p) || C.modeloOpcional}</span>
                    </span>
                    <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={12} />} aria-label={T.geral.excluir} title={T.geral.excluir} onClick={() => setRemover(p)} />
                  </div>
                  <span className="ia-etiquetas">
                    {posReserva >= 0 && <span className="etiqueta" title={T.configuracoes.reservaDica}><LifeBuoy size={11} />{T.configuracoes.reserva(posReserva + 1)}</span>}
                    {cat && itemDoCatalogo(cat) && <span className={`etiqueta ia-custo-${itemDoCatalogo(cat)!.custo}`}>{C.custos[itemDoCatalogo(cat)!.custo]}</span>}
                    {!p.temChave && itemDoCatalogo(cat)?.pedeChave && <span className="etiqueta etiqueta-alerta">{T.configuracoes.semChave}</span>}
                    {temVisao(p) && <span className="etiqueta"><Eye size={11} />{P.visao}</span>}
                  </span>
                  {teste && teste !== "testando" && teste.ok && teste.modelos.length > 0 && seletorDeModelo(p)}
                  <ResultadoTeste teste={teste} />
                  <div className="ia-provedor-acoes">
                    <Botao pequeno variante="primario" onClick={() => usarNoChat(p)}>{T.configuracoes.usarNoChat}</Botao>
                    <Botao
                      pequeno
                      icone={<LifeBuoy size={12} />}
                      title={T.configuracoes.reservaDica}
                      onClick={() => definir({ ia: { ...ia, reservas: posReserva >= 0 ? ia.reservas.filter((x) => x !== p.id) : [...ia.reservas, p.id] } })}
                    >
                      {posReserva >= 0 ? T.configuracoes.tirarReserva : T.configuracoes.usarReserva}
                    </Botao>
                    <Botao pequeno icone={<RefreshCw size={12} className={teste === "testando" ? "girando" : ""} />} disabled={teste === "testando"} onClick={() => void testar(p, itemDoCatalogo(cat)?.modeloSugerido)}>{T.configuracoes.testar}</Botao>
                    {botaoDeVisao(p)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </aside>

      <Modal aberto={!!escolhido} titulo={escolhido ? C.configurando(escolhido.nome || C.personalizado) : ""} aoFechar={() => setEscolhido(null)} largo>
        {escolhido && (
          <form className="formulario ia-formulario" onSubmit={salvar} noValidate>
            <div className="ia-formulario-topo">
              <span className="ia-logo ia-logo-grande"><LogoProvedor id={escolhido.id} tamanho={22} /></span>
              <span className="ia-formulario-texto">{C.descricoes[escolhido.id]}</span>
            </div>

            {escolhido.id !== "personalizado" && (
              <ol className="ia-passos">
                {(escolhido.custo === "local" ? C.passosLocal : C.passosChave).map((passo, i) => (
                  <li key={passo}>
                    <span className="ia-passo-numero">{i + 1}</span>
                    <span className="ia-passo-texto">{passo}</span>
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
              <>
                <Campo id="ia-chave" rotulo={T.conexoes.chave} obrigatorio={escolhido.pedeChave} erro={erros.chave} dica={escolhido.pedeChave ? undefined : T.configuracoes.chaveOpcionalLocal}>
                  <input id="ia-chave" className="campo ia-campo-mono" type="password" autoComplete="off" spellCheck={false} value={chave} autoFocus onChange={(e) => setChave(e.target.value)} />
                </Campo>
                <span className="ia-aviso-chave"><ShieldCheck size={13} />{T.configuracoes.chaveSegura}</span>
              </>
            )}

            <Campo id="ia-modelo" rotulo={T.configuracoes.modeloPadrao} erro={erros.modelo} dica={C.modeloOpcional}>
              <input id="ia-modelo" className="campo ia-campo-mono" value={modelo} maxLength={160} placeholder={escolhido.modeloSugerido || "llama, qwen, gemini..."} onChange={(e) => setModelo(e.target.value)} />
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
                    <input id="ia-url" className="campo ia-campo-mono" value={urlBase} inputMode="url" placeholder="https://.../v1" onChange={(e) => setUrlBase(e.target.value)} />
                  </Campo>
                )}
              </div>
            )}
            {avancado && avisoDoEndereco && <AvisoFaixa tipo={avisoDoEndereco.tipo}>{avisoDoEndereco.texto}</AvisoFaixa>}

            {erros.geral && <AvisoFaixa tipo="erro">{erros.geral}</AvisoFaixa>}
            <div className="formulario-acoes">
              <Botao onClick={() => setEscolhido(null)}>{T.geral.cancelar}</Botao>
              <Botao type="submit" variante="primario" icone={<KeyRound size={14} />} disabled={salvando}>{salvando ? T.configuracoes.salvandoChave : T.configuracoes.salvarProvedor}</Botao>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmarModal
        aberto={!!remover}
        titulo={T.geral.confirmarExclusao}
        texto={T.configuracoes.removerProvedor}
        aoFechar={() => setRemover(null)}
        aoConfirmar={async () => {
          if (!remover) return;
          await removerProvedor(remover.id);
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
