import type { AgentId } from "../types";
import { normalizeText, urlSafe } from "./basics";

export type Intent =
  | { tipo: "comando"; comando: string; confirmar?: boolean }
  | { tipo: "saudacao" }
  | { tipo: "resumo" }
  | { tipo: "desconhecida"; agente: AgentId };

const VALUE = /(?:r\$\s*)?(\d{1,6}(?:[.,]\d{1,2})?)\b(?!\s*h\b|\s*horas?\b|:\d|\/)/i;
const CONNECTORS = /^(?:(?:reais|real|conto|contos|pila|r\$|no|na|nos|nas|em|de|do|da|com|pro|pra|para|o|a)\s+)+/i;

export function removeConnectors(text: string): string {
  return text.replace(CONNECTORS, "").trim();
}

function original(text: string, normalized: string, excerpt: string): string {
  const start = normalized.length - excerpt.length;
  return text.slice(start).trim();
}

export function detectIntent(textOriginal: string): Intent {
  const text = textOriginal.trim();
  if (text.startsWith("/")) return { tipo: "comando", comando: text };
  const n = normalizeText(text).replace(/[?!.]+$/, "");

  if (/^(oi|ola|opa|eai|e ai|bom dia|boa tarde|boa noite|salve|fala|hey)\b[ ,]*(time|galera|pessoal|gente)?$/.test(n)) return { tipo: "saudacao" };
  if (/^(como (estou|to|ta|esta|anda|vai)( (hoje|meu dia|o dia|as coisas))?|resumo( do dia)?|status|o que (eu )?tenho( pra| para)? hoje|meu dia|como foi (meu|o) dia)$/.test(n)) return { tipo: "resumo" };

  const firstWord = text.split(/\s+/)[0] ?? "";
  if (urlSafe(firstWord)) return { tipo: "comando", comando: `/link ${text}` };

  const expense = /^(gastei|paguei|comprei|torrei|saiu|gasto de)\s+(.*)$/.exec(n);
  if (expense) {
    const rest = original(text, normalizeText(text), expense[2]);
    const value = VALUE.exec(rest);
    if (value) {
      const description = removeConnectors(rest.replace(value[0], " ").replace(/\s+/g, " ").trim());
      return { tipo: "comando", comando: `/gasto ${value[1]} ${description}`.trim() };
    }
  }
  const income = /^(recebi|ganhei|entrou|caiu)\s+(.*)$/.exec(n);
  if (income) {
    const rest = original(text, normalizeText(text), income[2]);
    const value = VALUE.exec(rest);
    if (value) return { tipo: "comando", comando: `/receita ${value[1]} ${removeConnectors(rest.replace(value[0], " ").replace(/\s+/g, " ").trim())}`.trim() };
  }

  const reminder = /^(me lembra(r)?|lembre-me|me lembre|lembrete|me avisa|me avise)( de| que| para| pra)?\s+(.*)$/.exec(n);
  if (reminder) return { tipo: "comando", comando: `/lembrete ${original(text, normalizeText(text), reminder[4])}`, confirmar: true };

  const purchase = /^(lista de compras|adiciona na lista|adicionar na lista|adiciona a lista|comprar)[:\s]+(.*)$/.exec(n);
  if (purchase && /,| e /.test(purchase[2])) return { tipo: "comando", comando: `/compra ${original(text, normalizeText(text), purchase[2]).replace(/\s+e\s+/gi, ", ")}` };

  const task = /^(tenho que|tenho de|preciso|nova tarefa|tarefa|anota|anote)[:\s]+(.*)$/.exec(n);
  if (task) return { tipo: "comando", comando: `/tarefa ${removeConnectors(original(text, normalizeText(text), task[2]))}`, confirmar: true };

  const focusValue = /^(?:(?:inicia|iniciar|comeca|comecar|bora|vamos|liga|ligar)\s+(?:um\s+|o\s+)?)?(?:pomodoro|foco)(?:\s+de)?\s*(\d{1,3})?(?:\s*min(?:utos)?)?$/.exec(n);
  if (focusValue) return { tipo: "comando", comando: `/pomodoro ${focusValue[1] ?? ""}`.trim() };
  if (/^(?:(?:bora|vamos|quero|hora de)\s+)?revisar(?:\s+(?:agora|os cartoes|cartoes))?$/.test(n)) return { tipo: "comando", comando: "/revisar" };
  if (/^lembra(r)? que\s+/.test(n)) return { tipo: "comando", comando: `/lembrar ${text.replace(/^lembra(r)? que\s+/i, "")}` };

  return { tipo: "desconhecida", agente: agentPeloSubject(text) };
}

const SUBJECTS: [AgentId, RegExp][] = [
  ["organizador", /\b(tarefas?|lembretes?|lembra\w*|agenda\w*|compromissos?|reunia?o|reunioes|calendario|eventos?|marca(r)? (que|uma|um|na|no)|anota\w*|habitos?|rotina|planeja\w*|organiza\w*)\b/],
  ["java", /\b(codigo|programa\w*|bug\w*|debug\w*|compila\w*|funcao|funcoes|variave\w*|classe\w*|typescript|javascript|java|python|rust|react|html|css|sql|api|apis|algoritmo\w*|commit\w*|refator\w*|framework\w*|backend|frontend|git|github|vercel|deploy\w*|stripe|n8n|resend|notion|cal\.?com|pull request|pr|prs|actions|servidor|banco de dados|webhook\w*|conex(ao|oes)|integra\w*|cobranca\w*|assinante\w*|computador|pc|notebook|ram|memoria|processador|cpu|gpu|placa de video|disco|armazenamento|bateria|wi-?fi|bluetooth|programas? abertos?|janelas? abertas?|processos?)\b/],
  ["operador", /\b(gast\w*|dinheiro|conta|contas|fatura\w*|orcamento\w*|pagamento\w*|pagar|paguei|reais|saldo|cartao de credito|investi\w*|econom\w*|compra\w*|mercado|salario|receita\w*|divid\w*|consumo de ia|tokens?)\b|r\$/],
  ["tutor", /\b(estud\w*|prova\w*|materia\w*|revis\w*|aula\w*|curso\w*|livro\w*|ler|leitura|cartao|cartoes|flashcard\w*|faculdade|escola|resumo de|explica\w*|aprender)\b/],
];

export function agentPeloSubject(textOriginal: string): AgentId {
  const n = normalizeText(textOriginal);
  if (/\b(cloudflare|supabase|github|vercel|n8n|resend)\b/.test(n)) return "java";
  return SUBJECTS.find(([, defaultValue]) => defaultValue.test(n))?.[0] ?? "organizador";
}
