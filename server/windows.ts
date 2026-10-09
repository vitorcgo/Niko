import { createProcessPowerShell } from "./powerShellProcess";

const CODE = String.raw`
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class NikoWindows {
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
  [StructLayout(LayoutKind.Sequential)] public struct Rectangle { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct Placement { public int Size; public int Flags; public int Show; public Point Minimum; public Point Maximum; public Rectangle Normal; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct InfoMonitor { public int Size; public Rectangle Monitor; public Rectangle Work; public uint Flags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string Device; }
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromRect(ref Rectangle r, uint f);
  [DllImport("user32.dll")] static extern bool GetWindowPlacement(IntPtr h, ref Placement p);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr m, ref InfoMonitor i);
  [StructLayout(LayoutKind.Sequential, Pack = 4)] public struct KeyProperty { public Guid Formato; public uint Id; }
  [StructLayout(LayoutKind.Sequential)] public struct ValueProperty { public ushort Type; public ushort R1, R2, R3; public IntPtr Pointer; public IntPtr Extra; }
  [HasImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(HasInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore {
    [PreserveSig] int GetCount(out uint n);
    [PreserveSig] int GetAt(uint i, out KeyProperty k);
    [PreserveSig] int GetValue(ref KeyProperty k, out ValueProperty v);
    [PreserveSig] int SetValue(ref KeyProperty k, ref ValueProperty v);
    [PreserveSig] int Commit();
  }
  [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr h, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IPropertyStore p);
  [DllImport("ole32.dll")] static extern int PropVariantClear(ref ValueProperty v);
  static readonly Guid FORMATO_APP = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
  static Guid INTERFACE_PROPERTIES = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
  static string ReadProperty(IPropertyStore p, uint id) {
    var k = new KeyProperty { Formato = FORMATO_APP, Id = id };
    ValueProperty v;
    if (p.GetValue(ref k, out v) != 0) return null;
    string s = v.Type == 31 && v.Pointer != IntPtr.Zero ? Marshal.PtrToStringUni(v.Pointer) : null;
    PropVariantClear(ref v);
    return string.IsNullOrEmpty(s) ? null : s;
  }
  static void ReadIdentidade(IntPtr h, Info info) {
    IPropertyStore p = null;
    try {
      if (SHGetPropertyStoreForWindow(h, ref INTERFACE_PROPERTIES, out p) != 0 || p == null) return;
      info.Group = ReadProperty(p, 5);
      if (info.Group == null) return;
      info.IconGroup = ReadProperty(p, 3);
      info.NameGroup = ReadProperty(p, 4);
    } catch { } finally { if (p != null) Marshal.ReleaseWithObject(p); }
  }
  public class Info { public long Id; public uint Pid; public string Title; public bool Minimized; public bool Active; public string Monitor; public string Group; public string IconGroup; public string NameGroup; }
  static string Monitor(IntPtr h) {
    IntPtr m;
    if (IsIconic(h)) {
      var p = new Placement();
      p.Size = Marshal.SizeOf(p);
      GetWindowPlacement(h, ref p);
      m = MonitorFromRect(ref p.Normal, 2);
    } else m = MonitorFromWindow(h, 2);
    var i = new InfoMonitor();
    i.Size = Marshal.SizeOf(i);
    return GetMonitorInfo(m, ref i) ? i.Device : "";
  }
  static IntPtr lastFront = IntPtr.Zero;
  static IntPtr FrontOutsideNiko() {
    IntPtr front = GetForegroundWindow();
    uint pid; GetWindowThreadProcessId(front, out pid);
    string name = "";
    try { name = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch { }
    if (name == "niko") return lastFront;
    lastFront = front;
    return front;
  }
  public static List<Info> List() {
    var list = new List<Info>();
    IntPtr front = FrontOutsideNiko();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      if (GetWindow(h, 4) != IntPtr.Zero) return true;
      int ex = GetWindowLong(h, -20);
      if ((ex & 0x80) != 0 && (ex & 0x40000) == 0) return true;
      int hidden = 0;
      DwmGetWindowAttribute(h, 14, out hidden, 4);
      if (hidden != 0) return true;
      var sb = new StringBuilder(300);
      GetWindowText(h, sb, 300);
      if (sb.Length == 0) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      var info = new Info { Id = h.ToInt64(), Pid = pid, Title = sb.ToString(), Minimized = IsIconic(h), Active = h == front && !IsIconic(h), Monitor = Monitor(h) };
      ReadIdentidade(h, info);
      list.Add(info);
      return true;
    }, IntPtr.Zero);
    return list;
  }
  public static bool Focus(long id) {
    IntPtr h = new IntPtr(id);
    if (IsIconic(h)) ShowWindow(h, 9);
    uint pid;
    uint target = GetWindowThreadProcessId(GetForegroundWindow(), out pid);
    uint self = GetCurrentThreadId();
    AttachThreadInput(self, target, true);
    BringWindowToTop(h);
    bool ok = SetForegroundWindow(h);
    AttachThreadInput(self, target, false);
    return ok;
  }
  public static bool Minimize(long id) { return ShowWindow(new IntPtr(id), 6); }
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  public static bool Close(long id) { return PostMessage(new IntPtr(id), 0x0010, IntPtr.Zero, IntPtr.Zero); }
}
`;

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
` + CODE + String.raw`
'@
$icons = @{}
$paths = @{}
function Icon($path) {
  if (-not $path) { return $null }
  if ($icons.ContainsKey($path)) { return $icons[$path] }
  $value = $null
  try {
    $ico = [System.Drawing.Icon]::ExtractAssociatedIcon($path)
    $bmp = $ico.ToBitmap()
    $mem = New-Object System.IO.MemoryStream
    $bmp.Save($mem, [System.Drawing.Imaging.ImageFormat]::Png)
    $value = 'data:image/png;base64,' + [Convert]::ToBase64String($mem.ToArray())
  } catch { }
  $icons[$path] = $value
  return $value
}
function IconGroup($resource) {
  if (-not $resource) { return $null }
  $file = ($resource -replace ',-?\d+$', '').Trim('"')
  if (-not $file.ToLower().EndsWith('.ico') -or -not (Test-Path -LiteralPath $file -PathType Leaf)) { return $null }
  $key = $file + '|' + (Get-Item -LiteralPath $file).LastWriteTimeUtc.Ticks
  if ($icons.ContainsKey($key)) { return $icons[$key] }
  $value = $null
  try {
    $ico = New-Object System.Drawing.Icon($file, 48, 48)
    $bmp = $ico.ToBitmap()
    $mem = New-Object System.IO.MemoryStream
    $bmp.Save($mem, [System.Drawing.Imaging.ImageFormat]::Png)
    $value = 'data:image/png;base64,' + [Convert]::ToBase64String($mem.ToArray())
  } catch { }
  $icons[$key] = $value
  return $value
}
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  try {
    $request = $line | ConvertFrom-Json
    if ($request.acao -eq 'focar') { $r = @{ ok = [NikoWindows]::Focus([long]$request.janela) } }
    elseif ($request.acao -eq 'minimizar') { $r = @{ ok = [NikoWindows]::Minimize([long]$request.janela) } }
    elseif ($request.acao -eq 'fechar') { $r = @{ ok = [NikoWindows]::Close([long]$request.janela) } }
    else {
      $list = @()
      foreach ($j in [NikoWindows]::List()) {
        if (-not $paths.ContainsKey($j.Pid)) {
          $p = Get-Process -Id $j.Pid -ErrorAction SilentlyContinue
          $paths[$j.Pid] = @{ name = $(if ($p) { $p.ProcessName } else { '' }); caminho = $(try { $p.Path } catch { $null }); descricao = $(try { $p.MainModule.FileVersionInfo.FileDescription } catch { $null }) }
        }
        $info = $paths[$j.Pid]
        if ($info.name -eq 'niko' -or ($info.name -eq 'ApplicationFrameHost' -and $j.Title -eq '')) { continue }
        $iconGroup = IconGroup $j.IconGroup
        $list += @{ id = [string]$j.Id; pid = $j.Pid; titulo = $j.Title; minimizada = $j.Minimized; ativa = $j.Active; app = $info.name; name = $(if ($info.descricao) { $info.descricao } else { $info.name }); caminho = $info.caminho; icone = $(if ($iconGroup) { $iconGroup } else { Icon $info.caminho }); monitor = $j.Monitor; grupo = $j.Group; nomeDoGrupo = $j.NameGroup }
      }
      $r = @{ janelas = $list }
    }
    $r.id = $request.id
    [Console]::Out.WriteLine(($r | ConvertTo-Json -Compress -Depth 4))
  } catch {
    [Console]::Out.WriteLine((@{ id = $request.id; erro = $_.Exception.Message } | ConvertTo-Json -Compress))
  }
}
`;

const windows = createProcessPowerShell("niko-janelas", SCRIPT, "janelas_encerrado");

export function requestWindows(action: "listar" | "focar" | "minimizar" | "fechar", windowValue?: string): Promise<unknown> {
  if (windowValue !== undefined && !/^\d{1,20}$/.test(windowValue)) return Promise.reject(new Error("janela_invalida"));
  return windows.request({ acao: action, janela: windowValue }, 20000);
}

export function stopWindows() {
  windows.stop();
}
