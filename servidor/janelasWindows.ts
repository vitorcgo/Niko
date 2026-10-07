import { pedirJanelasLinux, encerrarJanelasLinux } from "./janelasLinux";
import { criarProcessoPowerShell } from "./processoPowerShell";

const CODIGO = String.raw`
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class NikoJanelas {
  delegate bool Cb(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(Cb cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint c);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool f);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int t);
  public class Info { public long Id; public uint Pid; public string Titulo; public bool Minimizada; public bool Ativa; }
  static IntPtr ultimaFrente = IntPtr.Zero;
  static IntPtr FrenteForaDoNiko() {
    IntPtr frente = GetForegroundWindow();
    uint pid; GetWindowThreadProcessId(frente, out pid);
    string nome = "";
    try { nome = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch { }
    if (nome == "niko") return ultimaFrente;
    ultimaFrente = frente;
    return frente;
  }
  public static List<Info> Listar() {
    var lista = new List<Info>();
    IntPtr frente = FrenteForaDoNiko();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      if (GetWindow(h, 4) != IntPtr.Zero) return true;
      int ex = GetWindowLong(h, -20);
      if ((ex & 0x80) != 0 && (ex & 0x40000) == 0) return true;
      int oculta = 0;
      DwmGetWindowAttribute(h, 14, out oculta, 4);
      if (oculta != 0) return true;
      var sb = new StringBuilder(300);
      GetWindowText(h, sb, 300);
      if (sb.Length == 0) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      lista.Add(new Info { Id = h.ToInt64(), Pid = pid, Titulo = sb.ToString(), Minimizada = IsIconic(h), Ativa = h == frente && !IsIconic(h) });
      return true;
    }, IntPtr.Zero);
    return lista;
  }
  public static bool Focar(long id) {
    IntPtr h = new IntPtr(id);
    if (IsIconic(h)) ShowWindow(h, 9);
    uint pid;
    uint alvo = GetWindowThreadProcessId(GetForegroundWindow(), out pid);
    uint eu = GetCurrentThreadId();
    AttachThreadInput(eu, alvo, true);
    BringWindowToTop(h);
    bool ok = SetForegroundWindow(h);
    AttachThreadInput(eu, alvo, false);
    return ok;
  }
  public static bool Minimizar(long id) { return ShowWindow(new IntPtr(id), 6); }
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  public static bool Fechar(long id) { return PostMessage(new IntPtr(id), 0x0010, IntPtr.Zero, IntPtr.Zero); }
}
`;

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
` + CODIGO + String.raw`
'@
$icones = @{}
$caminhos = @{}
function Icone($caminho) {
  if (-not $caminho) { return $null }
  if ($icones.ContainsKey($caminho)) { return $icones[$caminho] }
  $valor = $null
  try {
    $ico = [System.Drawing.Icon]::ExtractAssociatedIcon($caminho)
    $bmp = $ico.ToBitmap()
    $mem = New-Object System.IO.MemoryStream
    $bmp.Save($mem, [System.Drawing.Imaging.ImageFormat]::Png)
    $valor = 'data:image/png;base64,' + [Convert]::ToBase64String($mem.ToArray())
  } catch { }
  $icones[$caminho] = $valor
  return $valor
}
while ($true) {
  $linha = [Console]::In.ReadLine()
  if ($null -eq $linha) { break }
  try {
    $pedido = $linha | ConvertFrom-Json
    if ($pedido.acao -eq 'focar') { $r = @{ ok = [NikoJanelas]::Focar([long]$pedido.janela) } }
    elseif ($pedido.acao -eq 'minimizar') { $r = @{ ok = [NikoJanelas]::Minimizar([long]$pedido.janela) } }
    elseif ($pedido.acao -eq 'fechar') { $r = @{ ok = [NikoJanelas]::Fechar([long]$pedido.janela) } }
    else {
      $lista = @()
      foreach ($j in [NikoJanelas]::Listar()) {
        if (-not $caminhos.ContainsKey($j.Pid)) {
          $p = Get-Process -Id $j.Pid -ErrorAction SilentlyContinue
          $caminhos[$j.Pid] = @{ nome = $(if ($p) { $p.ProcessName } else { '' }); caminho = $(try { $p.Path } catch { $null }); descricao = $(try { $p.MainModule.FileVersionInfo.FileDescription } catch { $null }) }
        }
        $info = $caminhos[$j.Pid]
        if ($info.nome -eq 'niko' -or ($info.nome -eq 'ApplicationFrameHost' -and $j.Titulo -eq '')) { continue }
        $lista += @{ id = [string]$j.Id; pid = $j.Pid; titulo = $j.Titulo; minimizada = $j.Minimizada; ativa = $j.Ativa; app = $info.nome; nome = $(if ($info.descricao) { $info.descricao } else { $info.nome }); caminho = $info.caminho; icone = (Icone $info.caminho) }
      }
      $r = @{ janelas = $lista }
    }
    $r.id = $pedido.id
    [Console]::Out.WriteLine(($r | ConvertTo-Json -Compress -Depth 4))
  } catch {
    [Console]::Out.WriteLine((@{ id = $pedido.id; erro = $_.Exception.Message } | ConvertTo-Json -Compress))
  }
}
`;

const janelas = criarProcessoPowerShell("niko-janelas", SCRIPT, "janelas_encerrado");

export function pedirJanelas(acao: "listar" | "focar" | "minimizar" | "fechar" | "niko" | "miniatura" | "estado" | "reservar", janela?: string): Promise<unknown> {
  if (process.platform === "linux") return pedirJanelasLinux(acao, janela);
  if (["niko", "miniatura", "estado", "reservar"].includes(acao)) return Promise.reject(new Error("somente_linux"));
  if (janela !== undefined && !/^\d{1,20}$/.test(janela)) return Promise.reject(new Error("janela_invalida"));
  return janelas.pedir({ acao, janela }, 20000);
}

export function encerrarJanelas() {
  if (process.platform === "linux") encerrarJanelasLinux();
  janelas.encerrar();
}
