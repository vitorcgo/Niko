export async function readLastVersion() {
  const response = await fetch("https://api.github.com/repos/vitorcgo/niko/releases/latest", {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "Niko" },
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 404) return { versao: null, notas: "" };
  if (!response.ok) throw new Error(`github_${response.status}`);
  const payload = await response.json() as { tag_name?: unknown; body?: unknown };
  if (typeof payload.tag_name !== "string" || !/^v?\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/.test(payload.tag_name)) throw new Error("versao_invalida");
  return { versao: payload.tag_name.replace(/^v/, ""), notas: typeof payload.body === "string" ? payload.body : "" };
}
