import { criarProcessoPowerShell } from "./processoPowerShell.ts";

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
  [StructLayout(LayoutKind.Sequential)] public struct Retangulo { public int Esquerda, Topo, Direita, Base; }
  [StructLayout(LayoutKind.Sequential)] public struct Ponto { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct Posicionamento { public int Tamanho; public int Flags; public int Mostrar; public Ponto Minimo; public Ponto Maximo; public Retangulo Normal; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct InfoDoMonitor { public int Tamanho; public Retangulo Monitor; public Retangulo Trabalho; public uint Flags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string Dispositivo; }
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromRect(ref Retangulo r, uint f);
  [DllImport("user32.dll")] static extern bool GetWindowPlacement(IntPtr h, ref Posicionamento p);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr m, ref InfoDoMonitor i);
  [StructLayout(LayoutKind.Sequential, Pack = 4)] public struct ChaveDePropriedade { public Guid Formato; public uint Id; }
  [StructLayout(LayoutKind.Sequential)] public struct ValorDePropriedade { public ushort Tipo; public ushort R1, R2, R3; public IntPtr Ponteiro; public IntPtr Extra; }
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore {
    [PreserveSig] int GetCount(out uint n);
    [PreserveSig] int GetAt(uint i, out ChaveDePropriedade k);
    [PreserveSig] int GetValue(ref ChaveDePropriedade k, out ValorDePropriedade v);
    [PreserveSig] int SetValue(ref ChaveDePropriedade k, ref ValorDePropriedade v);
    [PreserveSig] int Commit();
  }
  [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr h, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IPropertyStore p);
  [DllImport("ole32.dll")] static extern int PropVariantClear(ref ValorDePropriedade v);
  static readonly Guid FORMATO_DO_APP = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
  static Guid INTERFACE_DAS_PROPRIEDADES = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
  static string LerPropriedade(IPropertyStore p, uint id) {
    var k = new ChaveDePropriedade { Formato = FORMATO_DO_APP, Id = id };
    ValorDePropriedade v;
    if (p.GetValue(ref k, out v) != 0) return null;
    string s = v.Tipo == 31 && v.Ponteiro != IntPtr.Zero ? Marshal.PtrToStringUni(v.Ponteiro) : null;
    PropVariantClear(ref v);
    return string.IsNullOrEmpty(s) ? null : s;
  }
  static void LerIdentidade(IntPtr h, Info info) {
    IPropertyStore p = null;
    try {
      if (SHGetPropertyStoreForWindow(h, ref INTERFACE_DAS_PROPRIEDADES, out p) != 0 || p == null) return;
      info.Grupo = LerPropriedade(p, 5);
      if (info.Grupo == null) return;
      info.IconeDoGrupo = LerPropriedade(p, 3);
      info.NomeDoGrupo = LerPropriedade(p, 4);
    } catch { } finally { if (p != null) Marshal.ReleaseComObject(p); }
  }
  public class Info { public long Id; public uint Pid; public string Titulo; public bool Minimizada; public bool Ativa; public string Monitor; public string Grupo; public string IconeDoGrupo; public string NomeDoGrupo; }
  static string MonitorDa(IntPtr h) {
    IntPtr m;
    if (IsIconic(h)) {
      var p = new Posicionamento();
      p.Tamanho = Marshal.SizeOf(p);
      GetWindowPlacement(h, ref p);
      m = MonitorFromRect(ref p.Normal, 2);
    } else m = MonitorFromWindow(h, 2);
    var i = new InfoDoMonitor();
    i.Tamanho = Marshal.SizeOf(i);
    return GetMonitorInfo(m, ref i) ? i.Dispositivo : "";
  }
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
      var info = new Info { Id = h.ToInt64(), Pid = pid, Titulo = sb.ToString(), Minimizada = IsIconic(h), Ativa = h == frente && !IsIconic(h), Monitor = MonitorDa(h) };
      LerIdentidade(h, info);
      lista.Add(info);
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
function IconeDoGrupo($recurso) {
  if (-not $recurso) { return $null }
  $arquivo = ($recurso -replace ',-?\d+$', '').Trim('"')
  if (-not $arquivo.ToLower().EndsWith('.ico') -or -not (Test-Path -LiteralPath $arquivo -PathType Leaf)) { return $null }
  $chave = $arquivo + '|' + (Get-Item -LiteralPath $arquivo).LastWriteTimeUtc.Ticks
  if ($icones.ContainsKey($chave)) { return $icones[$chave] }
  $valor = $null
  try {
    $ico = New-Object System.Drawing.Icon($arquivo, 48, 48)
    $bmp = $ico.ToBitmap()
    $mem = New-Object System.IO.MemoryStream
    $bmp.Save($mem, [System.Drawing.Imaging.ImageFormat]::Png)
    $valor = 'data:image/png;base64,' + [Convert]::ToBase64String($mem.ToArray())
  } catch { }
  $icones[$chave] = $valor
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
        $iconeDoGrupo = IconeDoGrupo $j.IconeDoGrupo
        $lista += @{ id = [string]$j.Id; pid = $j.Pid; titulo = $j.Titulo; minimizada = $j.Minimizada; ativa = $j.Ativa; app = $info.nome; nome = $(if ($info.descricao) { $info.descricao } else { $info.nome }); caminho = $info.caminho; icone = $(if ($iconeDoGrupo) { $iconeDoGrupo } else { Icone $info.caminho }); monitor = $j.Monitor; grupo = $j.Grupo; nomeDoGrupo = $j.NomeDoGrupo }
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

export function pedirJanelas(acao: "listar" | "focar" | "minimizar" | "fechar", janela?: string): Promise<unknown> {
  if (janela !== undefined && !/^\d{1,20}$/.test(janela)) return Promise.reject(new Error("janela_invalida"));
  return janelas.pedir({ acao, janela }, 20000);
}

export function encerrarJanelas() {
  janelas.encerrar();
}
