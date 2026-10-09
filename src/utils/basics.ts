export function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function limit(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function contains(text: string, search: string): boolean {
  return normalizeText(text).includes(normalizeText(search));
}

export function downloadFile(nameValue: string, content: string, type = "application/json") {
  const blob = new Blob([content], { type: type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = nameValue;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileText(file: File, limitBytes = 5 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > limitBytes) {
      reject(new Error("arquivo_grande"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("falha_leitura"));
    reader.readAsText(file);
  });
}

export function readImageAsDataUrl(file: File, limitBytes = 1.5 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      reject(new Error("tipo_invalido"));
      return;
    }
    if (file.size > limitBytes) {
      reject(new Error("arquivo_grande"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("falha_leitura"));
    reader.readAsDataURL(file);
  });
}

export function urlSafe(text: string): URL | null {
  try {
    const url = new URL(text.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

export function group<T, K extends string>(items: T[], key: (item: T) => K): Record<K, T[]> {
  const result = {} as Record<K, T[]>;
  for (const item of items) {
    const k = key(item);
    (result[k] ??= []).push(item);
  }
  return result;
}

export function sumBy<T>(items: T[], value: (item: T) => number): number {
  let total = 0;
  for (const item of items) total += value(item);
  return total;
}
