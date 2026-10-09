import {
  siStripe, siGithub, siVercel, siResend, siNotion, siCaldotcom, siN8n, siAnthropic, siOllama,
  siNvidia, siOpencode, siQwen, siGooglegemini, siOpenrouter, siMistralai, siHuggingface, siDeepseek, siLmstudio, siGmail, siGooglecalendar, siGoogle, siGoogledrive, siGoogletasks, siSupabase, siCloudflare, siClaudecode, siGithubcopilot, siKimi,
  siSpotify, siGooglechrome, siFirefoxbrowser, siZenbrowser, siYoutube, siYoutubemusic, siDeezer, siApplemusic, siTidal, siSoundcloud,
} from "simple-icons";
import type { ServicoId } from "../tipos";
import logoCodex from "./lobe/codex.svg";
import logoAntigravity from "./lobe/antigravity.svg";
import logoAmp from "./lobe/amp.svg";

interface IconeMarca {
  title: string;
  path: string;
  hex: string;
}

export type MarcaId = ServicoId | "gmail" | "agenda" | "drive" | "tarefasGoogle" | "anthropic" | "ollama" | "nvidia" | "opencode" | "qwen" | "gemini" | "openrouter" | "mistral" | "huggingface" | "deepseek" | "lmstudio" | "claudecode" | "copilot" | "kimi" | MarcaDeMidia | MarcaColorida;

export type MarcaColorida = "codex" | "antigravity" | "amp";

const MARCAS_COLORIDAS: Record<MarcaColorida, { title: string; url: string }> = {
  codex: { title: "Codex", url: logoCodex },
  antigravity: { title: "Antigravity", url: logoAntigravity },
  amp: { title: "Amp", url: logoAmp },
};

function ehColorida(marca: MarcaId): marca is MarcaColorida {
  return Object.hasOwn(MARCAS_COLORIDAS, marca);
}

export type MarcaDeMidia = "spotify" | "chrome" | "firefox" | "zen" | "youtube" | "youtubemusic" | "deezer" | "applemusic" | "tidal" | "soundcloud";

const PADROES_DE_MIDIA: [RegExp, MarcaDeMidia][] = [
  [/youtube music/i, "youtubemusic"],
  [/youtube/i, "youtube"],
  [/spotify/i, "spotify"],
  [/deezer/i, "deezer"],
  [/apple ?music|itunes/i, "applemusic"],
  [/tidal/i, "tidal"],
  [/soundcloud/i, "soundcloud"],
  [/chrome/i, "chrome"],
  [/firefox/i, "firefox"],
  [/^zen$/i, "zen"],
];

export function marcaDoApp(app: string): MarcaDeMidia | null {
  return PADROES_DE_MIDIA.find(([padrao]) => padrao.test(app))?.[1] ?? null;
}

export const MARCAS: Record<Exclude<MarcaId, MarcaColorida>, IconeMarca> = {
  stripe: siStripe,
  github: siGithub,
  vercel: siVercel,
  resend: siResend,
  notion: siNotion,
  calcom: siCaldotcom,
  n8n: siN8n,
  google: siGoogle,
  gmail: siGmail,
  agenda: siGooglecalendar,
  drive: siGoogledrive,
  tarefasGoogle: siGoogletasks,
  supabase: siSupabase,
  cloudflare: siCloudflare,
  anthropic: siAnthropic,
  ollama: siOllama,
  nvidia: siNvidia,
  opencode: siOpencode,
  qwen: siQwen,
  gemini: siGooglegemini,
  openrouter: siOpenrouter,
  mistral: siMistralai,
  huggingface: siHuggingface,
  deepseek: siDeepseek,
  lmstudio: siLmstudio,
  claudecode: siClaudecode,
  copilot: siGithubcopilot,
  kimi: siKimi,
  spotify: siSpotify,
  chrome: siGooglechrome,
  firefox: siFirefoxbrowser,
  zen: siZenbrowser,
  youtube: siYoutube,
  youtubemusic: siYoutubemusic,
  deezer: siDeezer,
  applemusic: siApplemusic,
  tidal: siTidal,
  soundcloud: siSoundcloud,
};

function escura(hex: string): boolean {
  const n = parseInt(hex, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.22;
}

interface Props {
  marca: MarcaId;
  tamanho?: number;
  monocromatica?: boolean;
}

export function Marca({ marca, tamanho = 18, monocromatica = false }: Props) {
  if (ehColorida(marca)) {
    const colorida = MARCAS_COLORIDAS[marca];
    return <img src={colorida.url} alt={colorida.title} width={tamanho} height={tamanho} draggable={false} style={{ flex: "0 0 auto", filter: monocromatica ? "grayscale(1) brightness(1.4)" : undefined }} />;
  }
  const icone = MARCAS[marca];
  const cor = monocromatica || escura(icone.hex) ? "currentColor" : `#${icone.hex}`;
  return (
    <svg role="img" aria-label={icone.title} viewBox="0 0 24 24" width={tamanho} height={tamanho} fill={cor} style={{ flex: "0 0 auto" }}>
      <path d={icone.path} />
    </svg>
  );
}
