export function versionMaisNew(newItem: string, current: string): boolean {
  const read = (version: string) => /^v?(\d+)\.(\d+)\.(\d+)(?:-([\da-zA-Z.-]+))?(?:\+[\da-zA-Z.-]+)?$/.exec(version);
  const a = read(newItem);
  const b = read(current);
  if (!a || !b) return false;
  for (let i = 1; i <= 3; i++) {
    if (Number(a[i]) !== Number(b[i])) return Number(a[i]) > Number(b[i]);
  }
  if (!a[4] || !b[4]) return Boolean(b[4]) && !a[4];
  const partsA = a[4].split(".");
  const partsB = b[4].split(".");
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const x = partsA[i];
    const y = partsB[i];
    if (x === y) continue;
    if (x === undefined || y === undefined) return y === undefined;
    const numberX = /^\d+$/.test(x);
    const numberY = /^\d+$/.test(y);
    if (numberX && numberY) return Number(x) > Number(y);
    if (numberX !== numberY) return numberY;
    return x > y;
  }
  return false;
}
