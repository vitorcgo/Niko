import type { TypeProvider } from "../bridge/localBridge";

export type CostProvider = "gratis" | "cota" | "local" | "pago";

export type IdCatalog =
  | "anthropic"
  | "nvidia"
  | "opencode"
  | "qwen"
  | "gemini"
  | "openrouter"
  | "groq"
  | "cerebras"
  | "mistral"
  | "huggingface"
  | "github"
  | "deepseek"
  | "openai"
  | "ollama"
  | "lmstudio"
  | "personalizado";

export interface ItemCatalog {
  id: IdCatalog;
  nome: string;
  tipo: TypeProvider;
  url: string;
  modeloSugerido: string;
  custo: CostProvider;
  pedeChave: boolean;
  paginaChave?: string;
}

export const CATALOG_AI: ItemCatalog[] = [
  { id: "nvidia", nome: "NVIDIA NIM", tipo: "openai_compativel", url: "https://integrate.api.nvidia.com/v1", modeloSugerido: "meta/llama-3.3-70b-instruct", custo: "gratis", pedeChave: true, paginaChave: "https://build.nvidia.com/settings/api-keys" },
  { id: "opencode", nome: "OpenCode Zen", tipo: "openai_compativel", url: "https://opencode.ai/zen/v1", modeloSugerido: "big-pickle", custo: "gratis", pedeChave: true, paginaChave: "https://opencode.ai/docs/zen" },
  { id: "qwen", nome: "Qwen (Alibaba Cloud)", tipo: "openai_compativel", url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", modeloSugerido: "qwen-plus", custo: "cota", pedeChave: true, paginaChave: "https://www.alibabacloud.com/help/en/model-studio/get-api-key" },
  { id: "gemini", nome: "Google Gemini", tipo: "openai_compativel", url: "https://generativelanguage.googleapis.com/v1beta/openai", modeloSugerido: "gemini-2.5-flash", custo: "gratis", pedeChave: true, paginaChave: "https://aistudio.google.com/apikey" },
  { id: "openrouter", nome: "OpenRouter", tipo: "openai_compativel", url: "https://openrouter.ai/api/v1", modeloSugerido: "", custo: "gratis", pedeChave: true, paginaChave: "https://openrouter.ai/keys" },
  { id: "groq", nome: "Groq", tipo: "openai_compativel", url: "https://api.groq.com/openai/v1", modeloSugerido: "llama-3.3-70b-versatile", custo: "gratis", pedeChave: true, paginaChave: "https://console.groq.com/keys" },
  { id: "cerebras", nome: "Cerebras", tipo: "openai_compativel", url: "https://api.cerebras.ai/v1", modeloSugerido: "", custo: "gratis", pedeChave: true, paginaChave: "https://cloud.cerebras.ai" },
  { id: "mistral", nome: "Mistral", tipo: "openai_compativel", url: "https://api.mistral.ai/v1", modeloSugerido: "mistral-small-latest", custo: "gratis", pedeChave: true, paginaChave: "https://console.mistral.ai/api-keys" },
  { id: "huggingface", nome: "Hugging Face", tipo: "openai_compativel", url: "https://router.huggingface.co/v1", modeloSugerido: "", custo: "cota", pedeChave: true, paginaChave: "https://huggingface.co/settings/tokens" },
  { id: "github", nome: "GitHub Models", tipo: "openai_compativel", url: "https://models.github.ai/inference", modeloSugerido: "openai/gpt-4.1-mini", custo: "gratis", pedeChave: true, paginaChave: "https://github.com/settings/personal-access-tokens" },
  { id: "anthropic", nome: "Anthropic", tipo: "anthropic", url: "https://api.anthropic.com", modeloSugerido: "claude-sonnet-5-5", custo: "pago", pedeChave: true, paginaChave: "https://console.anthropic.com/settings/keys" },
  { id: "deepseek", nome: "DeepSeek", tipo: "openai_compativel", url: "https://api.deepseek.com/v1", modeloSugerido: "deepseek-chat", custo: "pago", pedeChave: true, paginaChave: "https://platform.deepseek.com/api_keys" },
  { id: "openai", nome: "OpenAI", tipo: "openai_compativel", url: "https://api.openai.com/v1", modeloSugerido: "", custo: "pago", pedeChave: true, paginaChave: "https://platform.openai.com/api-keys" },
  { id: "ollama", nome: "Ollama", tipo: "openai_compativel", url: "http://localhost:11434/v1", modeloSugerido: "", custo: "local", pedeChave: false },
  { id: "lmstudio", nome: "LM Studio", tipo: "openai_compativel", url: "http://localhost:1234/v1", modeloSugerido: "", custo: "local", pedeChave: false },
  { id: "personalizado", nome: "", tipo: "openai_compativel", url: "", modeloSugerido: "", custo: "pago", pedeChave: false },
];

export function itemCatalog(id?: string): ItemCatalog | undefined {
  return CATALOG_AI.find((c) => c.id === id);
}

export function catalogPelaUrl(url: string): ItemCatalog | undefined {
  try {
    const host = new URL(url).host;
    return CATALOG_AI.find((c) => c.url && new URL(c.url).host === host);
  } catch {
    return undefined;
  }
}
