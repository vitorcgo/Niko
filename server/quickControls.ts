import { createProcessPowerShell } from "./powerShellProcess";

const CODE = String.raw`
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class NikoControl {
  [HasImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class EnumeradorDispositivos { }

  [HasImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(HasInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int flow, int states, out IntPtr devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device);
  }

  [HasImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(HasInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object activatedInterface);
  }

  [HasImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(HasInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    [PreserveSig] int RegisterControlChangeNotify(IntPtr notice);
    [PreserveSig] int UnregisterControlChangeNotify(IntPtr notice);
    [PreserveSig] int GetChannelCount(out uint channels);
    [PreserveSig] int SetMasterVolumeLevel(float decibels, ref Guid context);
    [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid context);
    [PreserveSig] int GetMasterVolumeLevel(out float decibels);
    [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
    [PreserveSig] int SetChannelVolumeLevel(uint channel, float decibels, ref Guid context);
    [PreserveSig] int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context);
    [PreserveSig] int GetChannelVolumeLevel(uint channel, out float decibels);
    [PreserveSig] int GetChannelVolumeLevelScalar(uint channel, out float level);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }

  [HasImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(HasInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 {
    [PreserveSig] int GetAudioSessionControl(IntPtr group, int flows, out IntPtr control);
    [PreserveSig] int GetSimpleAudioVolume(IntPtr group, int flows, out IntPtr volume);
    [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator enumerator);
  }

  [HasImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(HasInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator {
    [PreserveSig] int GetCount(out int total);
    [PreserveSig] int GetSession(int index, [MarshalAs(UnmanagedType.IUnknown)] out object session);
  }

  [HasImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(HasInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    [PreserveSig] int GetState(out int state);
    [PreserveSig] int GetDisplayName(out IntPtr name);
    [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid context);
    [PreserveSig] int GetIconPath(out IntPtr path);
    [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid context);
    [PreserveSig] int GetGroupingParam(out Guid group);
    [PreserveSig] int SetGroupingParam(ref Guid group, ref Guid context);
    [PreserveSig] int RegisterAudioSessionNotification(IntPtr notice);
    [PreserveSig] int UnregisterAudioSessionNotification(IntPtr notice);
    [PreserveSig] int GetSessionIdentifier(out IntPtr identificador);
    [PreserveSig] int GetSessionInstanceIdentifier(out IntPtr identificador);
    [PreserveSig] int GetProcessId(out uint pid);
    [PreserveSig] int IsSystemSoundsSession();
  }

  [HasImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(HasInterfaceType.InterfaceIsIUnknown)]
  interface ISimpleAudioVolume {
    [PreserveSig] int SetMasterVolume(float level, ref Guid context);
    [PreserveSig] int GetMasterVolume(out float level);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }

  [StructLayout(LayoutKind.Sequential)] struct Size { public int cx; public int cy; }

  [HasImport, Guid("BCC18B79-BA16-442F-80C4-8A59C30C463B"), InterfaceType(HasInterfaceType.InterfaceIsIUnknown)]
  interface IShellItemImageFactory {
    [PreserveSig] int GetImage(Size size, int options, out IntPtr bitmap);
  }

  [DllImport("ole32.dll")] static extern void CoTaskMemFree(IntPtr memory);
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SHCreateItemFromParsingName(string path, IntPtr context, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory item);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr object);
  [DllImport("user32.dll")] static extern bool LockWorkStation();
  [DllImport("powrprof.dll")] static extern byte SetSuspendState([MarshalAs(UnmanagedType.I1)] bool hibernar, [MarshalAs(UnmanagedType.I1)] bool force, [MarshalAs(UnmanagedType.I1)] bool withoutDespertar);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessageTimeout(IntPtr window, uint message, IntPtr w, string l, uint options, uint limit, out IntPtr result);
  [DllImport("shell32.dll")] static extern int SHGetKnownFolderPath(ref Guid directory, uint options, IntPtr user, out IntPtr path);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr window);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr window, System.Text.StringBuilder text, int size);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint from, uint to, bool enable);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern void keybd_event(byte key, byte varredura, uint options, UIntPtr extra);

  const int OUTPUT = 0;
  const int INPUT = 1;
  const int PAPEL_MULTIMIDIA = 1;
  const int CLSCTX_ALL = 23;
  static Guid WITHOUT_CONTEXT = Guid.Empty;

  public class Endpoint { public int Volume; public bool Mute; }
  public class Session { public uint Pid; public int Volume; public bool Mute; public bool System; public int State; }

  static IMMDevice Device(int flow) {
    var enumerator = (IMMDeviceEnumerator)new EnumeradorDispositivos();
    IMMDevice device;
    if (enumerator.GetDefaultAudioEndpoint(flow, PAPEL_MULTIMIDIA, out device) != 0) return null;
    return device;
  }

  static T Ativar<T>(IMMDevice device) {
    Guid iid = typeof(T).GUID;
    object result;
    Marshal.ThrowExceptionForHR(device.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out result));
    return (T)result;
  }

  static IAudioEndpointVolume Volume(int flow) {
    var device = Device(flow);
    return device == null ? null : Ativar<IAudioEndpointVolume>(device);
  }

  public static Endpoint ReadEndpoint(int flow) {
    var volume = Volume(flow);
    if (volume == null) return null;
    float level; bool mute;
    volume.GetMasterVolumeLevelScalar(out level);
    volume.GetMute(out mute);
    return new Endpoint { Volume = (int)Math.Round(level * 100), Mute = mute };
  }

  public static bool SetVolume(int flow, int value) {
    var volume = Volume(flow);
    if (volume == null) return false;
    return volume.SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(100, value)) / 100f, ref WITHOUT_CONTEXT) == 0;
  }

  public static bool SetMute(int flow, bool mute) {
    var volume = Volume(flow);
    if (volume == null) return false;
    return volume.SetMute(mute, ref WITHOUT_CONTEXT) == 0;
  }

  static List<object> SessionsRaw() {
    var list = new List<object>();
    var device = Device(OUTPUT);
    if (device == null) return list;
    var manager = Ativar<IAudioSessionManager2>(device);
    IAudioSessionEnumerator enumerator;
    if (manager.GetSessionEnumerator(out enumerator) != 0) return list;
    int total;
    enumerator.GetCount(out total);
    for (int i = 0; i < total; i++) {
      object session;
      if (enumerator.GetSession(i, out session) == 0 && session != null) list.Add(session);
    }
    return list;
  }

  public static List<Session> ListSessions() {
    var output = new List<Session>();
    foreach (var raw in SessionsRaw()) {
      var control = (IAudioSessionControl2)raw;
      var volume = (ISimpleAudioVolume)raw;
      int state; uint pid; float level; bool mute;
      control.GetState(out state);
      if (state == 2) continue;
      control.GetProcessId(out pid);
      volume.GetMasterVolume(out level);
      volume.GetMute(out mute);
      output.Add(new Session { Pid = pid, Volume = (int)Math.Round(level * 100), Mute = mute, System = control.IsSystemSoundsSession() == 0, State = state });
    }
    return output;
  }

  public static int AdjustSessions(uint[] pids, int volume, int mute) {
    var targets = new HashSet<uint>(pids);
    int ajustadas = 0;
    foreach (var raw in SessionsRaw()) {
      uint pid;
      ((IAudioSessionControl2)raw).GetProcessId(out pid);
      if (!targets.Contains(pid)) continue;
      var simples = (ISimpleAudioVolume)raw;
      if (volume >= 0) simples.SetMasterVolume(Math.Max(0, Math.Min(100, volume)) / 100f, ref WITHOUT_CONTEXT);
      if (mute >= 0) simples.SetMute(mute == 1, ref WITHOUT_CONTEXT);
      ajustadas++;
    }
    return ajustadas;
  }

  public static string IconApp(string path, int side) {
    Guid iid = typeof(IShellItemImageFactory).GUID;
    IShellItemImageFactory fabrica;
    if (SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out fabrica) != 0 || fabrica == null) return null;
    IntPtr bitmap;
    if (fabrica.GetImage(new Size { cx = side, cy = side }, 4, out bitmap) != 0 || bitmap == IntPtr.Zero) return null;
    try {
      using (var withoutAlfa = Image.FromHbitmap(bitmap)) {
        var area = new Rectangle(0, 0, withoutAlfa.Width, withoutAlfa.Height);
        var payload = withoutAlfa.LockBits(area, ImageLockMode.ReadOnly, withoutAlfa.PixelFormat);
        try {
          using (var withAlpha = new Bitmap(payload.Width, payload.Height, payload.Stride, PixelFormat.Format32bppPArgb, payload.Scan0))
          using (var copy = new Bitmap(withAlpha))
          using (var memory = new MemoryStream()) {
            copy.Save(memory, ImageFormat.Png);
            return "data:image/png;base64," + Convert.ToBase64String(memory.ToArray());
          }
        } finally { withoutAlfa.UnlockBits(payload); }
      }
    } finally { DeleteObject(bitmap); }
  }

  public static void NotifyThemeChange() {
    IntPtr result;
    SendMessageTimeout(new IntPtr(0xffff), 0x001A, IntPtr.Zero, "ImmersiveColorSet", 2, 3000, out result);
  }

  public static string ResolvePath(string path) {
    if (string.IsNullOrEmpty(path) || path[0] != '{') return path;
    int end = path.IndexOf('}');
    Guid directory;
    if (end < 0 || !Guid.TryParse(path.Substring(0, end + 1), out directory)) return path;
    IntPtr base_;
    if (SHGetKnownFolderPath(ref directory, 0, IntPtr.Zero, out base_) != 0) return path;
    try { return Path.Combine(Marshal.PtrToStringUni(base_), path.Substring(end + 1).TrimStart('\\')); }
    finally { CoTaskMemFree(base_); }
  }

  public static bool Focus(IntPtr window) {
    if (IsIconic(window)) ShowWindow(window, 9);
    uint pid;
    uint target = GetWindowThreadProcessId(GetForegroundWindow(), out pid);
    uint self = GetCurrentThreadId();
    AttachThreadInput(self, target, true);
    BringWindowToTop(window);
    bool ok = SetForegroundWindow(window);
    AttachThreadInput(self, target, false);
    return ok;
  }

  public static void OpenStart() {
    const byte KEY_WINDOWS = 0x5B;
    const uint RELEASE = 0x0002;
    keybd_event(KEY_WINDOWS, 0, 0, UIntPtr.Zero);
    keybd_event(KEY_WINDOWS, 0, RELEASE, UIntPtr.Zero);
  }

  public static bool StartOpen() {
    IntPtr window = GetForegroundWindow();
    uint pid;
    GetWindowThreadProcessId(window, out pid);
    try {
      using (var childProcess = System.Diagnostics.Process.GetProcessById((int)pid)) {
        if (childProcess.ProcessName.Equals("StartMenuExperienceHost", StringComparison.OrdinalIgnoreCase)) return true;
        if (!childProcess.ProcessName.Equals("ShellExperienceHost", StringComparison.OrdinalIgnoreCase)) return false;
        var text = new System.Text.StringBuilder(256);
        GetWindowText(window, text, text.Capacity);
        return text.ToString() == "Start" || text.ToString() == "Iniciar";
      }
    } catch { return false; }
  }

  public static void CloseStart() {
    if (!StartOpen()) return;
    const byte ESCAPE = 0x1B;
    keybd_event(ESCAPE, 0, 0, UIntPtr.Zero);
    keybd_event(ESCAPE, 0, 0x0002, UIntPtr.Zero);
  }

  public static bool Lock() { return LockWorkStation(); }
  public static bool Suspend() { return SetSuspendState(false, false, false) != 0; }
}
`;

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
` + CODE + String.raw`
'@
$KEY_THEME = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize'
$KEY_TRAY = 'HKCU:\Control Panel\NotifyIconSettings'
$IGNORE_TRAY = @('explorer.exe', 'niko.exe')
$PROCESSES_BACKGROUND = '(?i)(container|service|services|host|helper|update|updater|crashpad|tray|agent|daemon|broker|monitor)'
$processes = @{}
$iconsProcess = @{}
$trayKnown = @{}

function InfoProcess($processId) {
  if ($processes.ContainsKey($processId)) { return $processes[$processId] }
  $p = Get-Process -Id $processId -ErrorAction SilentlyContinue
  $path = $null; $description = $null
  if ($p) {
    try { $path = $p.Path } catch { }
    try { $description = $p.MainModule.FileVersionInfo.FileDescription } catch { }
  }
  $info = @{ name = $(if ($description) { $description } elseif ($p) { $p.ProcessName } else { '' }); path = $path }
  $processes[$processId] = $info
  return $info
}

function IconProcess($path) {
  if (-not $path) { return $null }
  if ($iconsProcess.ContainsKey($path)) { return $iconsProcess[$path] }
  $value = $null
  try { $value = [NikoControl]::IconApp($path, 32) } catch { }
  $iconsProcess[$path] = $value
  return $value
}

function Endpoint($flow) {
  try {
    $e = [NikoControl]::ReadEndpoint($flow)
    if ($e) { return @{ volume = $e.Volume; mute = $e.Mute } }
  } catch { }
  return $null
}

function Audio {
  $sessions = @()
  try {
    foreach ($s in [NikoControl]::ListSessions()) {
      if ($s.System) { $info = @{ name = ''; path = $null } } else { $info = InfoProcess ([int]$s.Pid) }
      $sessions += @{ pid = $s.Pid; sistema = $s.System; ativa = ($s.State -eq 1); volume = $s.Volume; mute = $s.Mute; name = $info.name; path = $info.path; icone = (IconProcess $info.path) }
    }
  } catch { }
  return @{ output = (Endpoint 0); entrada = (Endpoint 1); sessoes = $sessions }
}

function ThemeDark {
  $value = (Get-ItemProperty -Path $KEY_THEME -Name AppsUseLightTheme -ErrorAction SilentlyContinue).AppsUseLightTheme
  return ($value -eq 0)
}

function ProcessesByPath {
  $map = @{}
  foreach ($p in Get-Process) {
    $path = $null
    try { $path = $p.Path } catch { }
    if (-not $path) { continue }
    $key = $path.ToLowerInvariant()
    if (-not $map.ContainsKey($key)) { $map[$key] = @() }
    $map[$key] += $p
  }
  return $map
}

function Tray {
  $running = ProcessesByPath
  $items = [ordered]@{}
  $trayKnown.Clear()
  foreach ($k in @(Get-ChildItem $KEY_TRAY -ErrorAction SilentlyContinue)) {
    $v = Get-ItemProperty $k.PSPath
    if (-not $v.ExecutablePath) { continue }
    $path = [NikoControl]::ResolvePath([string]$v.ExecutablePath)
    $key = $path.ToLowerInvariant()
    if (-not $running.ContainsKey($key)) { continue }
    if ($IGNORE_TRAY -contains [IO.Path]::GetFileName($key)) { continue }
    $icon = $(if ($v.IconSnapshot) { 'data:image/png;base64,' + [Convert]::ToBase64String([byte[]]$v.IconSnapshot) } else { $null })
    $previous = $items[$key]
    if ($previous -and ($previous.icone -or -not $icon)) { continue }
    $info = InfoProcess ([int]$running[$key][0].Id)
    $hint = [string]$v.InitialTooltip
    $items[$key] = @{ path = $path; name = $(if ($info.name) { $info.name } else { [IO.Path]::GetFileNameWithoutExtension($path) }); dica = $(if ($hint) { $hint } else { $null }); icone = $icon }
    $trayKnown[$key] = $path
  }
  return @{ itens = @($items.Values) }
}

function OpenTray($path) {
  $key = ([string]$path).ToLowerInvariant()
  if (-not $trayKnown.ContainsKey($key)) { Tray | Out-Null }
  if (-not $trayKnown.ContainsKey($key)) { throw 'app_desconhecido' }
  $real = $trayKnown[$key]
  $hasWindow = (ProcessesByPath)[$key] | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
  if ($hasWindow) { [NikoControl]::Focus($hasWindow.MainWindowHandle) | Out-Null; return }
  $name = [IO.Path]::GetFileNameWithoutExtension($real)
  $fromWindows = $real.StartsWith($env:WINDIR, [StringComparison]::OrdinalIgnoreCase)
  if ($fromWindows -or $name -match $PROCESSES_BACKGROUND) { throw 'sem_janela' }
  Start-Process -FilePath $real -WorkingDirectory ([IO.Path]::GetDirectoryName($real))
}

function PathTray($path) {
  $key = ([string]$path).ToLowerInvariant()
  if (-not $trayKnown.ContainsKey($key)) { Tray | Out-Null }
  if (-not $trayKnown.ContainsKey($key)) { throw 'app_desconhecido' }
  return $trayKnown[$key]
}

function ShowDirectory($path) {
  $real = PathTray $path
  Start-Process -FilePath (Join-Path $env:WINDIR 'explorer.exe') -ArgumentList ('/select,"' + $real + '"')
}

function StopTray($path) {
  $real = PathTray $path
  if ($real.StartsWith($env:WINDIR, [StringComparison]::OrdinalIgnoreCase)) { throw 'app_do_windows' }
  $targets = @((ProcessesByPath)[$real.ToLowerInvariant()] | Where-Object { $_ })
  foreach ($p in $targets) { try { Stop-Process -Id $p.Id -Force -ErrorAction Stop } catch { } }
  return $targets.Count
}

$COMMANDS_SYSTEM = @{
  rede = 'ms-settings:network'
  wifi = 'ms-settings:network-wifi'
  bluetooth = 'ms-settings:bluetooth'
  som = 'ms-settings:sound'
  tela = 'ms-settings:display'
  configuracoes = 'ms-settings:'
  atualizacoes = 'ms-settings:windowsupdate'
  tarefas = (Join-Path $env:WINDIR 'System32\Taskmgr.exe')
  adaptadores = (Join-Path $env:WINDIR 'System32\ncpa.cpl')
  terminal = (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe')
  arquivos = (Join-Path $env:WINDIR 'explorer.exe')
  painel = (Join-Path $env:WINDIR 'System32\control.exe')
}
$TIME_CACHE_APPS = 300
$appsInstalled = @{}
$listApps = $null
$appsLidosAt = [DateTime]::MinValue
$iconsApps = @{}
$LIMIT_ICONS_GUARDADOS = 400

function ExeApp($id) {
  if ($id -like 'lnk:*') { return $null }
  $c = [NikoControl]::ResolvePath([string]$id)
  if ($c -match '(?i)^[a-z]:\\.+\.exe$' -and (Test-Path -LiteralPath $c -PathType Leaf)) { return $c }
  return $null
}

function AppsMenuStart {
  $items = New-Object System.Collections.ArrayList
  $seen = @{}
  try {
    foreach ($a in @(Get-StartApps -ErrorAction Stop)) {
      $name = [string]$a.Name; $id = [string]$a.AppID
      if (-not $name -or -not $id -or $seen.ContainsKey($id)) { continue }
      $seen[$id] = $true
      [void]$items.Add(@{ id = $id; name = $name; admin = [bool](ExeApp $id) })
    }
  } catch { }
  if ($items.Count -gt 0) { return $items }
  $directories = @((Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))
  foreach ($directory in $directories) {
    foreach ($f in @(Get-ChildItem -LiteralPath $directory -Filter *.lnk -Recurse -ErrorAction SilentlyContinue)) {
      $id = 'lnk:' + $f.FullName
      if ($seen.ContainsKey($id)) { continue }
      $seen[$id] = $true
      [void]$items.Add(@{ id = $id; name = $f.BaseName; admin = $false })
    }
  }
  return $items
}

function ListApps($force) {
  if (-not $force -and $script:listaDeApps -and ((Get-Date) - $script:appsLidosEm).TotalSeconds -lt $TIME_CACHE_APPS) { return $script:listaDeApps }
  $items = @(AppsMenuStart | Where-Object { $_.name -notmatch '(?i)^(uninstall|desinstalar)\b' } | Sort-Object { $_.name })
  $script:appsInstalados = @{}
  foreach ($a in $items) { $script:appsInstalados[$a.id] = $a }
  $script:listaDeApps = @{ apps = $items }
  $script:appsLidosEm = Get-Date
  return $script:listaDeApps
}

function AppConhecido($id) {
  if (-not $script:appsInstalados.ContainsKey($id)) { ListApps $true | Out-Null }
  if (-not $script:appsInstalados.ContainsKey($id)) { throw 'app_desconhecido' }
}

function IconAppInstalled($id) {
  if (-not $script:appsInstalados.ContainsKey($id)) { return $null }
  if ($iconsApps.ContainsKey($id)) { return $iconsApps[$id] }
  if ($iconsApps.Count -ge $LIMIT_ICONS_GUARDADOS) { $iconsApps.Clear() }
  $value = $null
  try {
    if ($id -like 'lnk:*') { $value = [NikoControl]::IconApp($id.Substring(4), 32) }
    else { $value = [NikoControl]::IconApp('shell:AppsFolder\' + $id, 32) }
  } catch { }
  if (-not $value) { $exe = ExeApp $id; if ($exe) { try { $value = [NikoControl]::IconApp($exe, 32) } catch { } } }
  $iconsApps[$id] = $value
  return $value
}

function OwnerConnection($portLocal, $portRemota) {
  $c = Get-NetTCPConnection -LocalPort ([int]$portLocal) -RemotePort ([int]$portRemota) -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 0 } | Select-Object -First 1
  if ($c) { return [int]$c.OwningProcess }
  return 0
}

function FocusWindowProcess($processId) {
  $current = [int]$processId
  for ($level = 0; $level -lt 10 -and $current -gt 4; $level++) {
    $p = Get-Process -Id $current -ErrorAction SilentlyContinue
    if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero -and $p.ProcessName -notmatch '^(explorer|niko)$') {
      [NikoControl]::Focus($p.MainWindowHandle) | Out-Null
      return $p.ProcessName
    }
    $info = Get-CimInstance Win32_Process -Filter "ProcessId=$current" -ErrorAction SilentlyContinue
    if (-not $info) { break }
    $current = [int]$info.ParentProcessId
  }
  throw 'sem_janela'
}

function OpenApp($id, $admin) {
  AppConhecido $id
  if ($id -like 'lnk:*') { Start-Process -FilePath $id.Substring(4); return }
  if ($admin) {
    $exe = ExeApp $id
    if (-not $exe) { throw 'sem_admin' }
    Start-Process -FilePath $exe -WorkingDirectory ([IO.Path]::GetDirectoryName($exe)) -Verb RunAs
    return
  }
  Start-Process ('shell:AppsFolder\' + $id)
}

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  try {
    $request = $line | ConvertFrom-Json
    switch ($request.acao) {
      'audio' { $r = Audio }
      'volume' { $r = @{ ok = [NikoControl]::SetVolume([int]$request.flow, [int]$request.value) } }
      'mudo' { $r = @{ ok = [NikoControl]::SetMute([int]$request.flow, [bool]$request.mute) } }
      'sessao' {
        $pids = [uint32[]]@($request.pids | ForEach-Object { [uint32]$_ })
        $r = @{ ajustadas = [NikoControl]::AdjustSessions($pids, [int]$request.volume, [int]$request.mute) }
      }
      'tema' { $r = @{ escuro = (ThemeDark) } }
      'iniciar' { $r = @{ aberto = [NikoControl]::StartOpen() } }
      'definirTema' {
        $light = $(if ($request.escuro) { 0 } else { 1 })
        Set-ItemProperty -Path $KEY_THEME -Name AppsUseLightTheme -Value $light -Type DWord
        Set-ItemProperty -Path $KEY_THEME -Name SystemUsesLightTheme -Value $light -Type DWord
        [NikoControl]::NotifyThemeChange()
        $r = @{ escuro = (ThemeDark) }
      }
      'ferramenta' {
        if ($request.name -eq 'captura') { Start-Process 'ms-screenclip:' }
        elseif ($request.name -eq 'teclado') { Start-Process (Join-Path $env:WINDIR 'System32\osk.exe') }
        elseif ($request.name -eq 'iniciar') {
          if ($request.abertoAntes -eq $true -or [NikoControl]::StartOpen()) { [NikoControl]::CloseStart() }
          else { [NikoControl]::OpenStart() }
        }
        elseif ($request.name -eq 'papelDeParede') { Start-Process 'ms-settings:personalization-background' }
        else { throw 'ferramenta_desconhecida' }
        if ($request.name -eq 'iniciar') {
          Start-Sleep -Milliseconds 150
          $r = @{ ok = $true; aberto = [NikoControl]::StartOpen() }
        } else { $r = @{ ok = $true } }
      }
      'energia' {
        switch ($request.tipo) {
          'bloquear' { $r = @{ ok = [NikoControl]::Lock() } }
          'suspender' { $r = @{ ok = [NikoControl]::Suspend() } }
          'reiniciar' { Start-Process -FilePath (Join-Path $env:WINDIR 'System32\shutdown.exe') -ArgumentList '/r', '/t', '0' -WindowStyle Hidden; $r = @{ ok = $true } }
          'desligar' { Start-Process -FilePath (Join-Path $env:WINDIR 'System32\shutdown.exe') -ArgumentList '/s', '/t', '0' -WindowStyle Hidden; $r = @{ ok = $true } }
          default { throw 'acao_desconhecida' }
        }
      }
      'bandeja' { $r = Tray }
      'abrirDaBandeja' { OpenTray $request.path; $r = @{ ok = $true } }
      'pastaDaBandeja' { ShowDirectory $request.path; $r = @{ ok = $true } }
      'encerrarDaBandeja' { $r = @{ ok = $true; encerrados = (StopTray $request.path) } }
      'apps' { $r = (ListApps ($request.force -eq $true)).Clone() }
      'iconesApps' {
        $list = @()
        foreach ($id in @($request.ids)) { $list += @{ id = [string]$id; icone = (IconAppInstalled ([string]$id)) } }
        $r = @{ icones = $list }
      }
      'abrirApp' { OpenApp ([string]$request.id) ($request.admin -eq $true); $r = @{ ok = $true } }
      'donoDaConexao' { $r = @{ pid = (OwnerConnection $request.portaLocal $request.portaRemota) } }
      'focarProcesso' { $r = @{ ok = $true; window = (FocusWindowProcess $request.pid) } }
      'comandoDoSistema' {
        $target = $COMMANDS_SYSTEM[[string]$request.command]
        if (-not $target) { throw 'comando_desconhecido' }
        Start-Process $target
        $r = @{ ok = $true }
      }
      default { throw 'acao_desconhecida' }
    }
    $r.id = $request.id
    [Console]::Out.WriteLine(($r | ConvertTo-Json -Compress -Depth 5))
  } catch {
    [Console]::Out.WriteLine((@{ id = $request.id; erro = $_.Exception.Message } | ConvertTo-Json -Compress))
  }
}
`;

const control = createProcessPowerShell("niko-controle", SCRIPT, "controle_encerrado");
const request = control.request;

const FLOWS = { saida: 0, entrada: 1 } as const;
const TOOLS = ["captura", "teclado", "iniciar", "papelDeParede"] as const;
const POWER = ["bloquear", "suspender", "reiniciar", "desligar"] as const;

function flow(value: unknown): number {
  if (value !== "saida" && value !== "entrada") throw new Error("valor_invalido");
  return FLOWS[value];
}

function percentage(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error("valor_invalido");
  return Math.max(0, Math.min(100, Math.round(n)));
}

function pathApp(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 400 || /[\u0000-\u001f"]/.test(value) || !/\.exe$/i.test(value)) throw new Error("valor_invalido");
  return value;
}

export const readAudio = () => request({ acao: "audio" });
export const setVolume = (d: Record<string, unknown>) => request({ acao: "volume", fluxo: flow(d.alvo), valor: percentage(d.volume) });
export const setMute = (d: Record<string, unknown>) => request({ acao: "mudo", fluxo: flow(d.alvo), mudo: d.mudo === true });
export const adjustSession = (d: Record<string, unknown>) => {
  const pids = Array.isArray(d.pids) ? d.pids.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff).slice(0, 64) : [];
  if (pids.length === 0) throw new Error("valor_invalido");
  const volume = d.volume === undefined ? -1 : percentage(d.volume);
  const mute = d.mudo === undefined ? -1 : d.mudo === true ? 1 : 0;
  return request({ acao: "sessao", pids, volume, mudo: mute });
};
export const readTheme = () => request({ acao: "tema" });
export const readStart = () => request({ acao: "iniciar" });
export const setTheme = (d: Record<string, unknown>) => request({ acao: "definirTema", escuro: d.escuro === true });
export const openTool = (d: Record<string, unknown>) => {
  if (!TOOLS.includes(d.nome as (typeof TOOLS)[number])) throw new Error("valor_invalido");
  if (d.abertoAntes !== undefined && typeof d.abertoAntes !== "boolean") throw new Error("valor_invalido");
  return request({ acao: "ferramenta", nome: d.nome, abertoAntes: d.abertoAntes });
};
export const actPower = (d: Record<string, unknown>) => {
  if (!POWER.includes(d.tipo as (typeof POWER)[number])) throw new Error("valor_invalido");
  if (d.confirmacao !== "CONFIRMADO") throw new Error("confirmacao_invalida");
  return request({ acao: "energia", tipo: d.tipo });
};
export const readTray = () => request({ acao: "bandeja" }, 20000);
export const openTray = (d: Record<string, unknown>) => request({ acao: "abrirDaBandeja", caminho: pathApp(d.caminho) });
export const directoryTray = (d: Record<string, unknown>) => request({ acao: "pastaDaBandeja", caminho: pathApp(d.caminho) });
export const stopTray = (d: Record<string, unknown>) => {
  if (d.confirmacao !== "CONFIRMADO") throw new Error("confirmacao_invalida");
  return request({ acao: "encerrarDaBandeja", caminho: pathApp(d.caminho) });
};

export const COMMANDS_SYSTEM = ["rede", "wifi", "bluetooth", "som", "tela", "configuracoes", "atualizacoes", "tarefas", "adaptadores", "terminal", "arquivos", "painel"] as const;
const LIMIT_ICONS = 12;

export function idApp(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 500 || /[\u0000-\u001f]/.test(value)) throw new Error("valor_invalido");
  return value;
}

export const listApps = (d: Record<string, unknown>) => request({ acao: "apps", forcar: d.forcar === true }, 40000);
export const iconsApps = (d: Record<string, unknown>) => {
  const ids = Array.isArray(d.ids) ? d.ids.slice(0, LIMIT_ICONS).map(idApp) : [];
  if (ids.length === 0) throw new Error("valor_invalido");
  return request({ acao: "iconesApps", ids }, 30000);
};
export const openApp = (d: Record<string, unknown>) => request({ acao: "abrirApp", id: idApp(d.id), admin: d.admin === true }, 30000);
export const openCommandSystem = (d: Record<string, unknown>) => {
  if (!COMMANDS_SYSTEM.includes(d.comando as (typeof COMMANDS_SYSTEM)[number])) throw new Error("valor_invalido");
  return request({ acao: "comandoDoSistema", comando: d.comando });
};

function port(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error("valor_invalido");
  return n;
}

export async function ownerConnection(portLocal: number, portRemota: number): Promise<number> {
  const r = (await request({ acao: "donoDaConexao", portaLocal: port(portLocal), portaRemota: port(portRemota) }, 5000)) as { pid?: unknown };
  return Number.isInteger(r.pid) && (r.pid as number) > 0 ? (r.pid as number) : 0;
}

export function focusWindowProcess(processId: number) {
  if (!Number.isInteger(processId) || processId <= 4) throw new Error("valor_invalido");
  return request({ acao: "focarProcesso", pid: processId }, 10000);
}

export function stopControl() {
  control.stop();
}
