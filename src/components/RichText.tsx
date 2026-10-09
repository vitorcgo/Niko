import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { T } from "../i18n/ptBR";

function atLine(text: string, key: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const defaultValue = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = defaultValue.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const rawValue = m[0];
    const k = `${key}-${i++}`;
    if (rawValue.startsWith("`")) parts.push(<code key={k}>{rawValue.slice(1, -1)}</code>);
    else if (rawValue.startsWith("**") || rawValue.startsWith("__")) parts.push(<strong key={k}>{rawValue.slice(2, -2)}</strong>);
    else parts.push(<em key={k}>{rawValue.slice(1, -1)}</em>);
    last = m.index + rawValue.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

type Block =
  | { tipo: "codigo"; texto: string; linguagem: string }
  | { tipo: "titulo"; nivel: number; texto: string }
  | { tipo: "lista"; ordenada: boolean; itens: string[] }
  | { tipo: "citacao"; texto: string }
  | { tipo: "paragrafo"; linhas: string[] };

function blocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const output: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^```\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      output.push({ tipo: "codigo", texto: body.join("\n"), linguagem: fence[1] });
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const title = /^(#{1,4})\s+(.*)$/.exec(line);
    if (title) {
      output.push({ tipo: "titulo", nivel: title[1].length, texto: title[2] });
      i++;
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const sorted = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, ""));
      output.push({ tipo: "lista", ordenada: sorted, itens: items });
      continue;
    }
    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ""));
      output.push({ tipo: "citacao", texto: body.join(" ") });
      continue;
    }
    const body: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^```/.test(lines[i]) && !/^#{1,4}\s/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) && !/^>\s?/.test(lines[i])) body.push(lines[i++]);
    output.push({ tipo: "paragrafo", linhas: body });
  }
  return output;
}

export function RichText({ texto: text }: { texto: string }) {
  return (
    <div className="texto-rico">
      {blocks(text).map((b, n) => {
        const k = String(n);
        if (b.tipo === "codigo") return <BlockCode key={k} texto={b.texto} linguagem={b.linguagem} />;
        if (b.tipo === "titulo") return <p key={k} className={`texto-rico-titulo texto-rico-t${b.nivel}`}>{atLine(b.texto, k)}</p>;
        if (b.tipo === "citacao") return <blockquote key={k}>{atLine(b.texto, k)}</blockquote>;
        if (b.tipo === "lista") {
          const List = b.ordenada ? "ol" : "ul";
          return <List key={k}>{b.itens.map((it, j) => <li key={j}>{atLine(it, `${k}-${j}`)}</li>)}</List>;
        }
        return (
          <p key={k}>
            {b.linhas.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {atLine(l, `${k}-${j}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

const WORDS = /^(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|from|export|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|interface|type|enum|public|private|protected|static|void|null|undefined|true|false|this|super|def|lambda|pass|None|True|False|and|or|not|elif|with|as|yield|fn|mut|impl|struct|pub|use|mod|match|package|func|go|defer|select|from|where|join|insert|update|delete|create|table|into|values|set)$/;
const TOKENS = /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(<\/?[A-Za-z][\w-]*)/g;

function colorize(text: string, language: string): ReactNode[] {
  const withoutHash = !/^(py|python|sh|bash|ps1|powershell|yaml|yml|toml|r|rb|ruby)$/i.test(language);
  const output: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKENS)) {
    const start = m.index ?? 0;
    if (start > last) output.push(text.slice(last, start));
    const [todo, comment, chain, number, word, tag] = m;
    if (comment && !(withoutHash && comment.startsWith("#"))) output.push(<span key={i++} className="cod-comentario">{todo}</span>);
    else if (chain) output.push(<span key={i++} className="cod-texto">{todo}</span>);
    else if (number) output.push(<span key={i++} className="cod-numero">{todo}</span>);
    else if (word && WORDS.test(word)) output.push(<span key={i++} className="cod-palavra">{todo}</span>);
    else if (word && text[start + todo.length] === "(") output.push(<span key={i++} className="cod-funcao">{todo}</span>);
    else if (tag) output.push(<span key={i++} className="cod-palavra">{todo}</span>);
    else output.push(todo);
    last = start + todo.length;
  }
  if (last < text.length) output.push(text.slice(last));
  return output;
}

function BlockCode({ texto: text, linguagem: language }: { texto: string; linguagem: string }) {
  const [isOpen, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const lines = text.split("\n").length;
  const long = lines > 16;
  const parts = useMemo(() => colorize(text, language), [text, language]);
  return (
    <div className="bloco-codigo" data-longo={long && !isOpen ? "sim" : "nao"}>
      <div className="bloco-codigo-topo">
        <span>{language || T.chat.codigo.rotulo}</span>
        <span className="texto-3">{T.chat.codigo.linhas(lines)}</span>
        <button
          type="button"
          className="bloco-codigo-botao"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            } catch {
              return;
            }
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? T.chat.copiado : T.chat.copiar}
        </button>
      </div>
      <pre data-linguagem={language || undefined}>
        <code>{parts}</code>
      </pre>
      {long && (
        <button type="button" className="bloco-codigo-expandir" onClick={() => setOpen((a) => !a)}>
          {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {isOpen ? T.chat.codigo.recolher : T.chat.codigo.verTudo(lines)}
        </button>
      )}
    </div>
  );
}