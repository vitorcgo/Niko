import { spawn } from "node:child_process";
import { ensureScript } from "./temporaryScripts";

const CODE = `
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class NikoCredential {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public int Flags; public int Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.HasTypes.FILETIME LastWritten;
    public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;
    public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredWrite(ref CREDENTIAL c, int f);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredRead(string target, int type, int f, out IntPtr c);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredDelete(string target, int type, int f);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr p);
  public static bool Write(string target, string secret) {
    byte[] bytes = Encoding.Unicode.GetBytes(secret);
    CREDENTIAL c = new CREDENTIAL();
    c.Type = 1; c.TargetName = target; c.Persist = 2; c.UserName = "niko";
    c.CredentialBlobSize = bytes.Length; c.CredentialBlob = Marshal.AllocHGlobal(bytes.Length);
    Marshal.Copy(bytes, 0, c.CredentialBlob, bytes.Length);
    try { return CredWrite(ref c, 0); } finally { Marshal.FreeHGlobal(c.CredentialBlob); }
  }
  public static string Read(string target) {
    IntPtr p;
    if (!CredRead(target, 1, 0, out p)) return null;
    try {
      CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
      if (c.CredentialBlobSize == 0) return "";
      return Marshal.PtrToStringUni(c.CredentialBlob, c.CredentialBlobSize / 2);
    } finally { CredFree(p); }
  }
  public static bool Delete(string target) { return CredDelete(target, 1, 0); }
}
`;

const SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
${CODE}
'@
$input = [Console]::In.ReadToEnd() | ConvertFrom-Json
$result = @{ ok = $true }
switch ($input.acao) {
  'gravar' { $result.ok = [NikoCredential]::Write($input.target, $input.secret) }
  'ler' { $result.valor = [NikoCredential]::Read($input.target) }
  'apagar' { $result.ok = [NikoCredential]::Delete($input.target) }
}
$result | ConvertTo-Json -Compress
`;

const PREFIX = "Niko/";
const TIME_LIMIT_MS = 20000;

const cache = new Map<string, string | null>();
const readsAtProgress = new Map<string, Promise<string | null>>();

function execute(input: Record<string, string>): Promise<{ ok?: boolean; valor?: string | null }> {
  return new Promise((resolve, reject) => {
    const childProcess = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ensureScript("niko-credencial", SCRIPT)], { windowsHide: true });
    let output = "";
    let error = "";
    const clock = setTimeout(() => {
      childProcess.kill();
      reject(new Error("tempo_credencial"));
    }, TIME_LIMIT_MS);
    childProcess.stdout.on("data", (d) => (output += d.toString()));
    childProcess.stderr.on("data", (d) => (error += d.toString()));
    childProcess.on("error", (e) => {
      clearTimeout(clock);
      reject(e);
    });
    childProcess.on("close", (code) => {
      clearTimeout(clock);
      if (code !== 0) return reject(new Error(error.trim().split("\n")[0] || "falha_credencial"));
      try {
        resolve(JSON.parse(output.trim().split("\n").pop() ?? "{}"));
      } catch {
        reject(new Error("resposta_invalida"));
      }
    });
    childProcess.stdin.end(JSON.stringify(input));
  });
}

function validateId(id: string) {
  if (!/^[a-z0-9-]{1,64}$/.test(id)) throw new Error("id_invalido");
}

export async function writeSecret(id: string, secret: string) {
  validateId(id);
  if (!secret || secret.length > 4000) throw new Error("segredo_invalido");
  if (process.platform !== "win32") throw new Error("somente_windows");
  const r = await execute({ acao: "gravar", alvo: PREFIX + id, segredo: secret });
  if (!r.ok) throw new Error("falha_ao_gravar");
  readsAtProgress.delete(id);
  cache.set(id, secret);
}

export async function readSecret(id: string): Promise<string | null> {
  validateId(id);
  if (cache.has(id)) return cache.get(id) ?? null;
  if (process.platform !== "win32") return null;
  const atProgress = readsAtProgress.get(id);
  if (atProgress) return atProgress;
  const readResult = execute({ acao: "ler", alvo: PREFIX + id })
    .then((r) => {
      const value = r.valor ?? null;
      if (readsAtProgress.get(id) === readResult) cache.set(id, value);
      return value;
    })
    .finally(() => {
      if (readsAtProgress.get(id) === readResult) readsAtProgress.delete(id);
    });
  readsAtProgress.set(id, readResult);
  return readResult;
}

export async function deleteSecret(id: string) {
  validateId(id);
  cache.delete(id);
  readsAtProgress.delete(id);
  if (process.platform !== "win32") return;
  await execute({ acao: "apagar", alvo: PREFIX + id });
}
