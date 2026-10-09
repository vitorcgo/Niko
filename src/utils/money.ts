const formatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatMoney(cents: number): string {
  return formatter.format(cents / 100);
}

export function readValueAtCents(text: string): number | null {
  const clean = text.trim().replace(/^r\$\s*/i, "").replace(/\s/g, "");
  if (!clean) return null;
  let normalized = clean;
  if (/,\d{1,2}$/.test(clean)) normalized = clean.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(clean)) normalized = clean.replace(/\./g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Math.round(Number(normalized) * 100);
  if (!Number.isFinite(value)) return null;
  return value;
}

export function centsToField(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
