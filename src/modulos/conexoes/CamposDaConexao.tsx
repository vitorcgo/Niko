import { Plus, Trash2 } from "lucide-react";
import { Botao, Campo } from "../../componentes/basicos";
import { T } from "../../textos/textos";
import type { ServicoId } from "../../tipos";

const F = T.conexoes.campos;

export const SERVICOS_COM_CAMPOS: ServicoId[] = ["jira", "trello", "discord", "reddit", "strava", "email", "calendario", "cripto", "gitlab", "gitea"];

type Valores = Record<string, unknown>;

interface Props {
  servico: ServicoId;
  salva: Valores;
  valores: Valores;
  mudar: (parcial: Valores) => void;
}

const texto = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

function CampoTexto({ id, rotulo, dica, valor, mudar, senha, guardado, tipo = "text" }: { id: string; rotulo: string; dica?: string; valor: unknown; mudar: (v: string) => void; senha?: boolean; guardado?: boolean; tipo?: string }) {
  return (
    <Campo id={id} rotulo={rotulo} dica={guardado ? F.guardado : dica}>
      <input id={id} className="campo" type={senha ? "password" : tipo} autoComplete="off" spellCheck={false} value={texto(valor)} placeholder={guardado ? "••••••••" : ""} onChange={(e) => mudar(e.target.value)} />
    </Campo>
  );
}

const REDES = ["bitcoin", "ethereum", "polygon", "arbitrum", "optimism", "base", "bnb", "solana"];
const CORRETORAS = ["binance", "okx", "bybit", "kraken"];
const NOMES_DAS_CORRETORAS: Record<string, string> = { binance: "Binance", okx: "OKX", bybit: "Bybit", kraken: "Kraken" };

interface Carteira {
  rede: string;
  endereco: string;
  nome?: string;
}

interface CorretoraNoFormulario {
  tipo: string;
  chave: string;
  segredo?: string;
  frase?: string;
  final?: string;
}

function CamposDaCripto({ valores, mudar }: { valores: Valores; mudar: (parcial: Valores) => void }) {
  const carteiras = (Array.isArray(valores.carteiras) ? valores.carteiras : []) as Carteira[];
  const corretoras = (Array.isArray(valores.corretoras) ? valores.corretoras : []) as CorretoraNoFormulario[];
  const mudarCarteira = (i: number, parcial: Partial<Carteira>) => mudar({ carteiras: carteiras.map((c, j) => (j === i ? { ...c, ...parcial } : c)) });
  const mudarCorretora = (i: number, parcial: Partial<CorretoraNoFormulario>) => mudar({ corretoras: corretoras.map((c, j) => (j === i ? { ...c, ...parcial } : c)) });
  return (
    <>
      <CampoTexto id="cx-moedas" rotulo={F.moedas} dica={F.moedasDica} valor={Array.isArray(valores.moedas) ? (valores.moedas as string[]).join(", ") : valores.moedas} mudar={(v) => mudar({ moedas: v })} />
      <div className="formulario-linha">
        <Campo id="cx-moeda" rotulo={F.moedaExibicao}>
          <select id="cx-moeda" className="seletor" value={texto(valores.moeda) || "BRL"} onChange={(e) => mudar({ moeda: e.target.value })}>
            {["BRL", "USD", "EUR"].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Campo>
        <Campo id="cx-fonte" rotulo={F.fonteCotacao}>
          <select id="cx-fonte" className="seletor" value={texto(valores.fonte) || "coinbase"} onChange={(e) => mudar({ fonte: e.target.value })}>
            <option value="coinbase">Coinbase</option>
            <option value="okx">OKX</option>
          </select>
        </Campo>
        <Campo id="cx-alerta" rotulo={F.alertaVariacao}>
          <select id="cx-alerta" className="seletor" value={Number(valores.alerta) || 0} onChange={(e) => mudar({ alerta: Number(e.target.value) })}>
            {[0, 3, 5, 10].map((n) => <option key={n} value={n}>{F.alertas[n]}</option>)}
          </select>
        </Campo>
      </div>
      <fieldset className="cx-lista">
        <legend>{F.carteiras}</legend>
        {carteiras.map((c, i) => (
          <div key={i} className="cx-lista-linha">
            <select className="seletor" aria-label={F.redes[c.rede] ?? c.rede} value={c.rede} onChange={(e) => mudarCarteira(i, { rede: e.target.value })}>
              {REDES.map((r) => <option key={r} value={r}>{F.redes[r]}</option>)}
            </select>
            <input className="campo" aria-label={F.endereco} placeholder={F.endereco} spellCheck={false} value={c.endereco} onChange={(e) => mudarCarteira(i, { endereco: e.target.value.trim() })} />
            <input className="campo" aria-label={F.apelido} placeholder={F.apelido} value={c.nome ?? ""} onChange={(e) => mudarCarteira(i, { nome: e.target.value })} />
            <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={F.remover} title={F.remover} onClick={() => mudar({ carteiras: carteiras.filter((_, j) => j !== i) })} />
          </div>
        ))}
        {carteiras.length < 12 && <Botao pequeno icone={<Plus size={13} />} onClick={() => mudar({ carteiras: [...carteiras, { rede: "bitcoin", endereco: "" }] })}>{F.adicionarCarteira}</Botao>}
      </fieldset>
      <fieldset className="cx-lista">
        <legend>{F.corretoras}</legend>
        {corretoras.map((c, i) => (
          <div key={i} className="cx-lista-linha">
            <select className="seletor" aria-label={NOMES_DAS_CORRETORAS[c.tipo]} value={c.tipo} onChange={(e) => mudarCorretora(i, { tipo: e.target.value })}>
              {CORRETORAS.map((x) => <option key={x} value={x}>{NOMES_DAS_CORRETORAS[x]}</option>)}
            </select>
            <input className="campo" aria-label={F.chaveCorretora} placeholder={F.chaveCorretora} autoComplete="off" spellCheck={false} value={c.chave} onChange={(e) => mudarCorretora(i, { chave: e.target.value.trim() })} />
            <input className="campo" type="password" aria-label={F.segredoCorretora} placeholder={c.final ? `${F.segredoCorretora} (${c.final})` : F.segredoCorretora} autoComplete="off" value={c.segredo ?? ""} onChange={(e) => mudarCorretora(i, { segredo: e.target.value.trim() })} />
            {c.tipo === "okx" && <input className="campo" type="password" aria-label={F.fraseOkx} placeholder={F.fraseOkx} autoComplete="off" value={c.frase ?? ""} onChange={(e) => mudarCorretora(i, { frase: e.target.value })} />}
            <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={F.remover} title={F.remover} onClick={() => mudar({ corretoras: corretoras.filter((_, j) => j !== i) })} />
          </div>
        ))}
        {corretoras.length < 6 && <Botao pequeno icone={<Plus size={13} />} onClick={() => mudar({ corretoras: [...corretoras, { tipo: "binance", chave: "" }] })}>{F.adicionarCorretora}</Botao>}
      </fieldset>
    </>
  );
}

export function CamposDaConexao({ servico, salva, valores, mudar }: Props) {
  const guardado = salva.temToken === true;
  switch (servico) {
    case "jira":
      return (
        <>
          <CampoTexto id="cx-site" rotulo={F.siteJira} dica={F.siteJiraDica} tipo="url" valor={valores.site} mudar={(v) => mudar({ site: v })} />
          <CampoTexto id="cx-email" rotulo={F.emailAtlassian} tipo="email" valor={valores.email} mudar={(v) => mudar({ email: v })} />
          <CampoTexto id="cx-chave" rotulo={F.tokenApi} senha guardado={guardado} valor={valores.chave} mudar={(v) => mudar({ chave: v })} />
        </>
      );
    case "gitlab":
    case "gitea":
      return (
        <>
          <CampoTexto id="cx-site" rotulo={F.siteForja} dica={servico === "gitlab" ? F.siteGitlabDica : F.siteGiteaDica} tipo="url" valor={valores.site} mudar={(v) => mudar({ site: v.trim() })} />
          <CampoTexto id="cx-chave" rotulo={F.tokenDeAcesso} senha guardado={guardado} valor={valores.chave} mudar={(v) => mudar({ chave: v.trim() })} />
        </>
      );
    case "trello":
      return (
        <>
          <CampoTexto id="cx-chave-api" rotulo={F.chaveApiTrello} dica={F.chaveApiTrelloDica} valor={valores.chaveApi} mudar={(v) => mudar({ chaveApi: v.trim() })} />
          <CampoTexto id="cx-chave" rotulo={F.tokenTrello} senha guardado={guardado} valor={valores.chave} mudar={(v) => mudar({ chave: v.trim() })} />
        </>
      );
    case "discord":
      return (
        <>
          <CampoTexto id="cx-chave" rotulo={F.tokenBot} senha guardado={guardado} valor={valores.chave} mudar={(v) => mudar({ chave: v.trim() })} />
          <CampoTexto id="cx-usuario" rotulo={F.seuIdDiscord} dica={F.seuIdDiscordDica} valor={valores.usuario} mudar={(v) => mudar({ usuario: v.trim() })} />
          <CampoTexto id="cx-canais" rotulo={F.canaisDiscord} dica={F.canaisDiscordDica} valor={Array.isArray(valores.canais) ? (valores.canais as string[]).join(", ") : valores.canais} mudar={(v) => mudar({ canais: v })} />
        </>
      );
    case "reddit":
      return <CampoTexto id="cx-chave" rotulo={F.linkReddit} dica={F.linkRedditDica} senha guardado={guardado} valor={valores.chave} mudar={(v) => mudar({ chave: v.trim() })} />;
    case "strava":
      return (
        <>
          <CampoTexto id="cx-cliente" rotulo={F.clienteStrava} valor={valores.clienteId} mudar={(v) => mudar({ clienteId: v.trim() })} />
          <CampoTexto id="cx-chave" rotulo={F.segredoStrava} senha guardado={guardado} valor={valores.chave} mudar={(v) => mudar({ chave: v.trim() })} />
        </>
      );
    case "email": {
      const provedor = texto(valores.provedor) || "gmail";
      return (
        <>
          <Campo id="cx-provedor" rotulo={F.provedorEmail}>
            <select id="cx-provedor" className="seletor" value={provedor} onChange={(e) => mudar({ provedor: e.target.value })}>
              {Object.entries(F.provedoresEmail).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
            </select>
          </Campo>
          {provedor === "outro" && (
            <div className="formulario-linha">
              <CampoTexto id="cx-servidor" rotulo={F.servidorImap} valor={valores.servidor} mudar={(v) => mudar({ servidor: v.trim() })} />
              <CampoTexto id="cx-porta" rotulo={F.porta} tipo="number" valor={valores.porta ?? 993} mudar={(v) => mudar({ porta: Number(v) || 993 })} />
            </div>
          )}
          <CampoTexto id="cx-usuario" rotulo={F.usuarioEmail} tipo="email" valor={valores.usuario} mudar={(v) => mudar({ usuario: v.trim() })} />
          <CampoTexto id="cx-chave" rotulo={F.senhaApp} dica={F.senhaAppDica} senha guardado={guardado} valor={valores.chave} mudar={(v) => mudar({ chave: v })} />
        </>
      );
    }
    case "calendario": {
      const salvas = (Array.isArray(salva.links) ? salva.links : []) as { nome: string; host: string }[];
      const manter = (Array.isArray(valores.manter) ? valores.manter : salvas.map((_, i) => i)) as number[];
      return (
        <>
          {salvas.length > 0 && (
            <fieldset className="cx-lista">
              <legend>{F.agendasGuardadas}</legend>
              {salvas.map((l, i) =>
                manter.includes(i) ? (
                  <div key={i} className="cx-lista-linha">
                    <span className="cortar">{l.nome || l.host}</span>
                    <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={F.remover} title={F.remover} onClick={() => mudar({ manter: manter.filter((x) => x !== i) })} />
                  </div>
                ) : null,
              )}
            </fieldset>
          )}
          <Campo id="cx-chave" rotulo={F.linksAgenda} dica={F.linksAgendaDica}>
            <textarea id="cx-chave" className="campo" rows={3} spellCheck={false} value={texto(valores.chave)} onChange={(e) => mudar({ chave: e.target.value, manter })} />
          </Campo>
        </>
      );
    }
    case "cripto":
      return <CamposDaCripto valores={valores} mudar={mudar} />;
    default:
      return null;
  }
}

export function valoresIniciais(servico: ServicoId, salva: Valores): Valores {
  switch (servico) {
    case "jira":
      return { site: salva.site ?? "", email: salva.email ?? "" };
    case "gitlab":
    case "gitea":
      return { site: salva.site ?? "" };
    case "trello":
      return { chaveApi: salva.chaveApi ?? "" };
    case "discord":
      return { usuario: salva.usuario ?? "", canais: salva.canais ?? "" };
    case "strava":
      return { clienteId: salva.clienteId ?? "" };
    case "email": {
      const presets: Record<string, string> = { "imap.gmail.com": "gmail", "imap.mail.yahoo.com": "yahoo", "imap.mail.me.com": "icloud", "imap.zoho.com": "zoho", "imap.uol.com.br": "uol", "imap.terra.com.br": "terra" };
      const servidor = texto(salva.servidor);
      return { provedor: servidor ? presets[servidor] ?? "outro" : "gmail", servidor, porta: salva.porta ?? 993, usuario: salva.usuario ?? "" };
    }
    case "calendario":
      return { manter: (Array.isArray(salva.links) ? salva.links : []).map((_, i) => i) };
    case "cripto":
      return {
        moedas: salva.moedas ?? ["BTC", "ETH"],
        moeda: salva.moeda ?? "BRL",
        fonte: salva.fonte ?? "coinbase",
        alerta: salva.alerta ?? 0,
        carteiras: salva.carteiras ?? [],
        corretoras: salva.corretoras ?? [],
      };
    default:
      return {};
  }
}
