export type NameSound =
  | "annoyed" | "approval" | "approve" | "attach" | "blip" | "close" | "dizzy"
  | "error" | "finish" | "greet" | "gulp" | "hover" | "love" | "open"
  | "peek" | "pop" | "proud" | "question" | "rate" | "search" | "send"
  | "slap" | "sleep" | "think" | "tick" | "wink" | "work" | "yawn";

export type CategorySound = "personagens" | "avisos" | "pomodoro" | "interface";

export const ALL_THE_SOUNDS: NameSound[] = [
  "annoyed", "approval", "approve", "attach", "blip", "close", "dizzy",
  "error", "finish", "greet", "gulp", "hover", "love", "open",
  "peek", "pop", "proud", "question", "rate", "search", "send",
  "slap", "sleep", "think", "tick", "wink", "work", "yawn",
];

interface PreferencesSound {
  ligado: boolean;
  volume: number;
  categorias: Record<CategorySound, boolean>;
  silencioFoco: boolean;
}

let preferences: PreferencesSound = {
  ligado: true,
  volume: 0.15,
  categorias: { personagens: true, avisos: true, pomodoro: true, interface: true },
  silencioFoco: false,
};

let context: AudioContext | null = null;
let income: GainNode | null = null;
let timerClose: number | undefined;
const buffers = new Map<NameSound, AudioBuffer>();
const loading = new Map<NameSound, Promise<AudioBuffer | null>>();
const lastTouch = new Map<NameSound, number>();

export function setPreferencesSound(newItems: PreferencesSound) {
  preferences = newItems;
  if (income) income.gain.value = newItems.volume;
}

function getContext(): AudioContext | null {
  if (context) return context;
  try {
    context = new AudioContext();
    income = context.createGain();
    income.gain.value = preferences.volume;
    income.connect(context.destination);
    return context;
  } catch {
    return null;
  }
}

function scheduleClosing() {
  window.clearTimeout(timerClose);
  timerClose = window.setTimeout(() => {
    if (context && context.state === "running") void context.suspend();
  }, 30000);
}

async function load(nameValue: NameSound): Promise<AudioBuffer | null> {
  const ready = buffers.get(nameValue);
  if (ready) return ready;
  const atProgress = loading.get(nameValue);
  if (atProgress) return atProgress;
  const ctx = getContext();
  if (!ctx) return null;
  const promise = fetch(`/sons/${nameValue}.wav`)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("som"))))
    .then((payload) => ctx.decodeAudioData(payload))
    .then((buffer) => {
      buffers.set(nameValue, buffer);
      return buffer;
    })
    .catch(() => null)
    .finally(() => loading.delete(nameValue));
  loading.set(nameValue, promise);
  return promise;
}

export async function playSound(nameValue: NameSound, category: CategorySound = "interface") {
  if (!preferences.ligado || !preferences.categorias[category]) return;
  if (preferences.silencioFoco && category !== "pomodoro") return;
  if (typeof navigator !== "undefined" && navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  const now = performance.now();
  if (now - (lastTouch.get(nameValue) ?? 0) < 400) return;
  lastTouch.set(nameValue, now);
  const ctx = getContext();
  if (!ctx || !income) return;
  try {
    if (ctx.state === "suspended") await ctx.resume();
    const buffer = await load(nameValue);
    if (!buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(income);
    source.start();
    scheduleClosing();
  } catch {
    return;
  }
}

export async function playSequence(names: NameSound[], category: CategorySound, intervalMs = 260) {
  for (let i = 0; i < names.length; i++) {
    window.setTimeout(() => void playSound(names[i], category), i * intervalMs);
  }
}
