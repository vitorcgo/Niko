import { criarProcessoPowerShell } from "./processoPowerShell.ts";

const CODIGO = String.raw`
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class NikoControle {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class EnumeradorDeDispositivos { }

  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int fluxo, int estados, out IntPtr dispositivos);
    [PreserveSig] int GetDefaultAudioEndpoint(int fluxo, int papel, out IMMDevice dispositivo);
  }

  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int contexto, IntPtr parametros, [MarshalAs(UnmanagedType.IUnknown)] out object interfaceAtivada);
  }

  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    [PreserveSig] int RegisterControlChangeNotify(IntPtr aviso);
    [PreserveSig] int UnregisterControlChangeNotify(IntPtr aviso);
    [PreserveSig] int GetChannelCount(out uint canais);
    [PreserveSig] int SetMasterVolumeLevel(float decibeis, ref Guid contexto);
    [PreserveSig] int SetMasterVolumeLevelScalar(float nivel, ref Guid contexto);
    [PreserveSig] int GetMasterVolumeLevel(out float decibeis);
    [PreserveSig] int GetMasterVolumeLevelScalar(out float nivel);
    [PreserveSig] int SetChannelVolumeLevel(uint canal, float decibeis, ref Guid contexto);
    [PreserveSig] int SetChannelVolumeLevelScalar(uint canal, float nivel, ref Guid contexto);
    [PreserveSig] int GetChannelVolumeLevel(uint canal, out float decibeis);
    [PreserveSig] int GetChannelVolumeLevelScalar(uint canal, out float nivel);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mudo, ref Guid contexto);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mudo);
  }

  [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 {
    [PreserveSig] int GetAudioSessionControl(IntPtr grupo, int fluxos, out IntPtr controle);
    [PreserveSig] int GetSimpleAudioVolume(IntPtr grupo, int fluxos, out IntPtr volume);
    [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator enumerador);
  }

  [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator {
    [PreserveSig] int GetCount(out int total);
    [PreserveSig] int GetSession(int indice, [MarshalAs(UnmanagedType.IUnknown)] out object sessao);
  }

  [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    [PreserveSig] int GetState(out int estado);
    [PreserveSig] int GetDisplayName(out IntPtr nome);
    [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string nome, ref Guid contexto);
    [PreserveSig] int GetIconPath(out IntPtr caminho);
    [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string caminho, ref Guid contexto);
    [PreserveSig] int GetGroupingParam(out Guid grupo);
    [PreserveSig] int SetGroupingParam(ref Guid grupo, ref Guid contexto);
    [PreserveSig] int RegisterAudioSessionNotification(IntPtr aviso);
    [PreserveSig] int UnregisterAudioSessionNotification(IntPtr aviso);
    [PreserveSig] int GetSessionIdentifier(out IntPtr identificador);
    [PreserveSig] int GetSessionInstanceIdentifier(out IntPtr identificador);
    [PreserveSig] int GetProcessId(out uint pid);
    [PreserveSig] int IsSystemSoundsSession();
  }

  [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ISimpleAudioVolume {
    [PreserveSig] int SetMasterVolume(float nivel, ref Guid contexto);
    [PreserveSig] int GetMasterVolume(out float nivel);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mudo, ref Guid contexto);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mudo);
  }

  [StructLayout(LayoutKind.Sequential)] struct Tamanho { public int cx; public int cy; }

  [ComImport, Guid("BCC18B79-BA16-442F-80C4-8A59C30C463B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItemImageFactory {
    [PreserveSig] int GetImage(Tamanho tamanho, int opcoes, out IntPtr bitmap);
  }

  [DllImport("ole32.dll")] static extern void CoTaskMemFree(IntPtr memoria);
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SHCreateItemFromParsingName(string caminho, IntPtr contexto, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory item);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr objeto);
  [DllImport("user32.dll")] static extern bool LockWorkStation();
  [DllImport("powrprof.dll")] static extern byte SetSuspendState([MarshalAs(UnmanagedType.I1)] bool hibernar, [MarshalAs(UnmanagedType.I1)] bool forcar, [MarshalAs(UnmanagedType.I1)] bool semDespertar);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessageTimeout(IntPtr janela, uint mensagem, IntPtr w, string l, uint opcoes, uint limite, out IntPtr resultado);
  [DllImport("shell32.dll")] static extern int SHGetKnownFolderPath(ref Guid pasta, uint opcoes, IntPtr usuario, out IntPtr caminho);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr janela);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr janela, int comando);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr janela);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr janela);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr janela, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr janela, System.Text.StringBuilder texto, int tamanho);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint de, uint para, bool ligar);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern void keybd_event(byte tecla, byte varredura, uint opcoes, UIntPtr extra);

  const int SAIDA = 0;
  const int ENTRADA = 1;
  const int PAPEL_MULTIMIDIA = 1;
  const int CLSCTX_ALL = 23;
  static Guid SEM_CONTEXTO = Guid.Empty;

  public class Endpoint { public int Volume; public bool Mudo; }
  public class Sessao { public uint Pid; public int Volume; public bool Mudo; public bool Sistema; public int Estado; }

  static IMMDevice Dispositivo(int fluxo) {
    var enumerador = (IMMDeviceEnumerator)new EnumeradorDeDispositivos();
    IMMDevice dispositivo;
    if (enumerador.GetDefaultAudioEndpoint(fluxo, PAPEL_MULTIMIDIA, out dispositivo) != 0) return null;
    return dispositivo;
  }

  static T Ativar<T>(IMMDevice dispositivo) {
    Guid iid = typeof(T).GUID;
    object resultado;
    Marshal.ThrowExceptionForHR(dispositivo.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out resultado));
    return (T)resultado;
  }

  static IAudioEndpointVolume VolumeDe(int fluxo) {
    var dispositivo = Dispositivo(fluxo);
    return dispositivo == null ? null : Ativar<IAudioEndpointVolume>(dispositivo);
  }

  public static Endpoint LerEndpoint(int fluxo) {
    var volume = VolumeDe(fluxo);
    if (volume == null) return null;
    float nivel; bool mudo;
    volume.GetMasterVolumeLevelScalar(out nivel);
    volume.GetMute(out mudo);
    return new Endpoint { Volume = (int)Math.Round(nivel * 100), Mudo = mudo };
  }

  public static bool DefinirVolume(int fluxo, int valor) {
    var volume = VolumeDe(fluxo);
    if (volume == null) return false;
    return volume.SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(100, valor)) / 100f, ref SEM_CONTEXTO) == 0;
  }

  public static bool DefinirMudo(int fluxo, bool mudo) {
    var volume = VolumeDe(fluxo);
    if (volume == null) return false;
    return volume.SetMute(mudo, ref SEM_CONTEXTO) == 0;
  }

  static List<object> SessoesBrutas() {
    var lista = new List<object>();
    var dispositivo = Dispositivo(SAIDA);
    if (dispositivo == null) return lista;
    var gerente = Ativar<IAudioSessionManager2>(dispositivo);
    IAudioSessionEnumerator enumerador;
    if (gerente.GetSessionEnumerator(out enumerador) != 0) return lista;
    int total;
    enumerador.GetCount(out total);
    for (int i = 0; i < total; i++) {
      object sessao;
      if (enumerador.GetSession(i, out sessao) == 0 && sessao != null) lista.Add(sessao);
    }
    return lista;
  }

  public static List<Sessao> ListarSessoes() {
    var saida = new List<Sessao>();
    foreach (var bruta in SessoesBrutas()) {
      var controle = (IAudioSessionControl2)bruta;
      var volume = (ISimpleAudioVolume)bruta;
      int estado; uint pid; float nivel; bool mudo;
      controle.GetState(out estado);
      if (estado == 2) continue;
      controle.GetProcessId(out pid);
      volume.GetMasterVolume(out nivel);
      volume.GetMute(out mudo);
      saida.Add(new Sessao { Pid = pid, Volume = (int)Math.Round(nivel * 100), Mudo = mudo, Sistema = controle.IsSystemSoundsSession() == 0, Estado = estado });
    }
    return saida;
  }

  public static int AjustarSessoes(uint[] pids, int volume, int mudo) {
    var alvos = new HashSet<uint>(pids);
    int ajustadas = 0;
    foreach (var bruta in SessoesBrutas()) {
      uint pid;
      ((IAudioSessionControl2)bruta).GetProcessId(out pid);
      if (!alvos.Contains(pid)) continue;
      var simples = (ISimpleAudioVolume)bruta;
      if (volume >= 0) simples.SetMasterVolume(Math.Max(0, Math.Min(100, volume)) / 100f, ref SEM_CONTEXTO);
      if (mudo >= 0) simples.SetMute(mudo == 1, ref SEM_CONTEXTO);
      ajustadas++;
    }
    return ajustadas;
  }

  public static string IconeDoApp(string caminho, int lado) {
    Guid iid = typeof(IShellItemImageFactory).GUID;
    IShellItemImageFactory fabrica;
    if (SHCreateItemFromParsingName(caminho, IntPtr.Zero, ref iid, out fabrica) != 0 || fabrica == null) return null;
    IntPtr bitmap;
    if (fabrica.GetImage(new Tamanho { cx = lado, cy = lado }, 4, out bitmap) != 0 || bitmap == IntPtr.Zero) return null;
    try {
      using (var semAlfa = Image.FromHbitmap(bitmap)) {
        var area = new Rectangle(0, 0, semAlfa.Width, semAlfa.Height);
        var dados = semAlfa.LockBits(area, ImageLockMode.ReadOnly, semAlfa.PixelFormat);
        try {
          using (var comAlfa = new Bitmap(dados.Width, dados.Height, dados.Stride, PixelFormat.Format32bppPArgb, dados.Scan0))
          using (var copia = new Bitmap(comAlfa))
          using (var memoria = new MemoryStream()) {
            copia.Save(memoria, ImageFormat.Png);
            return "data:image/png;base64," + Convert.ToBase64String(memoria.ToArray());
          }
        } finally { semAlfa.UnlockBits(dados); }
      }
    } finally { DeleteObject(bitmap); }
  }

  public static void AvisarMudancaDeTema() {
    IntPtr resultado;
    SendMessageTimeout(new IntPtr(0xffff), 0x001A, IntPtr.Zero, "ImmersiveColorSet", 2, 3000, out resultado);
  }

  public static string ResolverCaminho(string caminho) {
    if (string.IsNullOrEmpty(caminho) || caminho[0] != '{') return caminho;
    int fim = caminho.IndexOf('}');
    Guid pasta;
    if (fim < 0 || !Guid.TryParse(caminho.Substring(0, fim + 1), out pasta)) return caminho;
    IntPtr base_;
    if (SHGetKnownFolderPath(ref pasta, 0, IntPtr.Zero, out base_) != 0) return caminho;
    try { return Path.Combine(Marshal.PtrToStringUni(base_), caminho.Substring(fim + 1).TrimStart('\\')); }
    finally { CoTaskMemFree(base_); }
  }

  public static bool Focar(IntPtr janela) {
    if (IsIconic(janela)) ShowWindow(janela, 9);
    uint pid;
    uint alvo = GetWindowThreadProcessId(GetForegroundWindow(), out pid);
    uint eu = GetCurrentThreadId();
    AttachThreadInput(eu, alvo, true);
    BringWindowToTop(janela);
    bool ok = SetForegroundWindow(janela);
    AttachThreadInput(eu, alvo, false);
    return ok;
  }

  public static void AbrirIniciar() {
    const byte TECLA_WINDOWS = 0x5B;
    const uint SOLTAR = 0x0002;
    keybd_event(TECLA_WINDOWS, 0, 0, UIntPtr.Zero);
    keybd_event(TECLA_WINDOWS, 0, SOLTAR, UIntPtr.Zero);
  }

  public static bool IniciarAberto() {
    IntPtr janela = GetForegroundWindow();
    uint pid;
    GetWindowThreadProcessId(janela, out pid);
    try {
      using (var processo = System.Diagnostics.Process.GetProcessById((int)pid)) {
        if (processo.ProcessName.Equals("StartMenuExperienceHost", StringComparison.OrdinalIgnoreCase)) return true;
        if (!processo.ProcessName.Equals("ShellExperienceHost", StringComparison.OrdinalIgnoreCase)) return false;
        var texto = new System.Text.StringBuilder(256);
        GetWindowText(janela, texto, texto.Capacity);
        return texto.ToString() == "Start" || texto.ToString() == "Iniciar";
      }
    } catch { return false; }
  }

  public static void FecharIniciar() {
    if (!IniciarAberto()) return;
    const byte ESCAPE = 0x1B;
    keybd_event(ESCAPE, 0, 0, UIntPtr.Zero);
    keybd_event(ESCAPE, 0, 0x0002, UIntPtr.Zero);
  }

  public static bool Bloquear() { return LockWorkStation(); }
  public static bool Suspender() { return SetSuspendState(false, false, false) != 0; }
}
`;

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
` + CODIGO + String.raw`
'@
$CHAVE_TEMA = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize'
$CHAVE_BANDEJA = 'HKCU:\Control Panel\NotifyIconSettings'
$IGNORAR_NA_BANDEJA = @('explorer.exe', 'niko.exe')
$PROCESSOS_DE_FUNDO = '(?i)(container|service|services|host|helper|update|updater|crashpad|tray|agent|daemon|broker|monitor)'
$processos = @{}
$iconesDeProcesso = @{}
$bandejaConhecida = @{}

function InfoDoProcesso($processoId) {
  if ($processos.ContainsKey($processoId)) { return $processos[$processoId] }
  $p = Get-Process -Id $processoId -ErrorAction SilentlyContinue
  $caminho = $null; $descricao = $null
  if ($p) {
    try { $caminho = $p.Path } catch { }
    try { $descricao = $p.MainModule.FileVersionInfo.FileDescription } catch { }
  }
  $info = @{ nome = $(if ($descricao) { $descricao } elseif ($p) { $p.ProcessName } else { '' }); caminho = $caminho }
  $processos[$processoId] = $info
  return $info
}

function IconeDoProcesso($caminho) {
  if (-not $caminho) { return $null }
  if ($iconesDeProcesso.ContainsKey($caminho)) { return $iconesDeProcesso[$caminho] }
  $valor = $null
  try { $valor = [NikoControle]::IconeDoApp($caminho, 32) } catch { }
  $iconesDeProcesso[$caminho] = $valor
  return $valor
}

function Endpoint($fluxo) {
  try {
    $e = [NikoControle]::LerEndpoint($fluxo)
    if ($e) { return @{ volume = $e.Volume; mudo = $e.Mudo } }
  } catch { }
  return $null
}

function Audio {
  $sessoes = @()
  try {
    foreach ($s in [NikoControle]::ListarSessoes()) {
      if ($s.Sistema) { $info = @{ nome = ''; caminho = $null } } else { $info = InfoDoProcesso ([int]$s.Pid) }
      $sessoes += @{ pid = $s.Pid; sistema = $s.Sistema; ativa = ($s.Estado -eq 1); volume = $s.Volume; mudo = $s.Mudo; nome = $info.nome; caminho = $info.caminho; icone = (IconeDoProcesso $info.caminho) }
    }
  } catch { }
  return @{ saida = (Endpoint 0); entrada = (Endpoint 1); sessoes = $sessoes }
}

function TemaEscuro {
  $valor = (Get-ItemProperty -Path $CHAVE_TEMA -Name AppsUseLightTheme -ErrorAction SilentlyContinue).AppsUseLightTheme
  return ($valor -eq 0)
}

function ProcessosPorCaminho {
  $mapa = @{}
  foreach ($p in Get-Process) {
    $caminho = $null
    try { $caminho = $p.Path } catch { }
    if (-not $caminho) { continue }
    $chave = $caminho.ToLowerInvariant()
    if (-not $mapa.ContainsKey($chave)) { $mapa[$chave] = @() }
    $mapa[$chave] += $p
  }
  return $mapa
}

function Bandeja {
  $rodando = ProcessosPorCaminho
  $itens = [ordered]@{}
  $bandejaConhecida.Clear()
  foreach ($k in @(Get-ChildItem $CHAVE_BANDEJA -ErrorAction SilentlyContinue)) {
    $v = Get-ItemProperty $k.PSPath
    if (-not $v.ExecutablePath) { continue }
    $caminho = [NikoControle]::ResolverCaminho([string]$v.ExecutablePath)
    $chave = $caminho.ToLowerInvariant()
    if (-not $rodando.ContainsKey($chave)) { continue }
    if ($IGNORAR_NA_BANDEJA -contains [IO.Path]::GetFileName($chave)) { continue }
    $icone = $(if ($v.IconSnapshot) { 'data:image/png;base64,' + [Convert]::ToBase64String([byte[]]$v.IconSnapshot) } else { $null })
    $anterior = $itens[$chave]
    if ($anterior -and ($anterior.icone -or -not $icone)) { continue }
    $info = InfoDoProcesso ([int]$rodando[$chave][0].Id)
    $dica = [string]$v.InitialTooltip
    $itens[$chave] = @{ caminho = $caminho; nome = $(if ($info.nome) { $info.nome } else { [IO.Path]::GetFileNameWithoutExtension($caminho) }); dica = $(if ($dica) { $dica } else { $null }); icone = $icone }
    $bandejaConhecida[$chave] = $caminho
  }
  return @{ itens = @($itens.Values) }
}

function AbrirDaBandeja($caminho) {
  $chave = ([string]$caminho).ToLowerInvariant()
  if (-not $bandejaConhecida.ContainsKey($chave)) { Bandeja | Out-Null }
  if (-not $bandejaConhecida.ContainsKey($chave)) { throw 'app_desconhecido' }
  $real = $bandejaConhecida[$chave]
  $comJanela = (ProcessosPorCaminho)[$chave] | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
  if ($comJanela) { [NikoControle]::Focar($comJanela.MainWindowHandle) | Out-Null; return }
  $nome = [IO.Path]::GetFileNameWithoutExtension($real)
  $doWindows = $real.StartsWith($env:WINDIR, [StringComparison]::OrdinalIgnoreCase)
  if ($doWindows -or $nome -match $PROCESSOS_DE_FUNDO) { throw 'sem_janela' }
  Start-Process -FilePath $real -WorkingDirectory ([IO.Path]::GetDirectoryName($real))
}

function CaminhoDaBandeja($caminho) {
  $chave = ([string]$caminho).ToLowerInvariant()
  if (-not $bandejaConhecida.ContainsKey($chave)) { Bandeja | Out-Null }
  if (-not $bandejaConhecida.ContainsKey($chave)) { throw 'app_desconhecido' }
  return $bandejaConhecida[$chave]
}

function MostrarNaPasta($caminho) {
  $real = CaminhoDaBandeja $caminho
  Start-Process -FilePath (Join-Path $env:WINDIR 'explorer.exe') -ArgumentList ('/select,"' + $real + '"')
}

function EncerrarDaBandeja($caminho) {
  $real = CaminhoDaBandeja $caminho
  if ($real.StartsWith($env:WINDIR, [StringComparison]::OrdinalIgnoreCase)) { throw 'app_do_windows' }
  $alvos = @((ProcessosPorCaminho)[$real.ToLowerInvariant()] | Where-Object { $_ })
  foreach ($p in $alvos) { try { Stop-Process -Id $p.Id -Force -ErrorAction Stop } catch { } }
  return $alvos.Count
}

$COMANDOS_DO_SISTEMA = @{
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
$TEMPO_DO_CACHE_DE_APPS = 300
$appsInstalados = @{}
$listaDeApps = $null
$appsLidosEm = [DateTime]::MinValue
$iconesDeApps = @{}
$LIMITE_DE_ICONES_GUARDADOS = 400

function ExeDoApp($id) {
  if ($id -like 'lnk:*') { return $null }
  $c = [NikoControle]::ResolverCaminho([string]$id)
  if ($c -match '(?i)^[a-z]:\\.+\.exe$' -and (Test-Path -LiteralPath $c -PathType Leaf)) { return $c }
  return $null
}

function AppsDoMenuIniciar {
  $itens = New-Object System.Collections.ArrayList
  $vistos = @{}
  try {
    foreach ($a in @(Get-StartApps -ErrorAction Stop)) {
      $nome = [string]$a.Name; $id = [string]$a.AppID
      if (-not $nome -or -not $id -or $vistos.ContainsKey($id)) { continue }
      $vistos[$id] = $true
      [void]$itens.Add(@{ id = $id; nome = $nome; admin = [bool](ExeDoApp $id) })
    }
  } catch { }
  if ($itens.Count -gt 0) { return $itens }
  $pastas = @((Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))
  foreach ($pasta in $pastas) {
    foreach ($f in @(Get-ChildItem -LiteralPath $pasta -Filter *.lnk -Recurse -ErrorAction SilentlyContinue)) {
      $id = 'lnk:' + $f.FullName
      if ($vistos.ContainsKey($id)) { continue }
      $vistos[$id] = $true
      [void]$itens.Add(@{ id = $id; nome = $f.BaseName; admin = $false })
    }
  }
  return $itens
}

function ListarApps($forcar) {
  if (-not $forcar -and $script:listaDeApps -and ((Get-Date) - $script:appsLidosEm).TotalSeconds -lt $TEMPO_DO_CACHE_DE_APPS) { return $script:listaDeApps }
  $itens = @(AppsDoMenuIniciar | Where-Object { $_.nome -notmatch '(?i)^(uninstall|desinstalar)\b' } | Sort-Object { $_.nome })
  $script:appsInstalados = @{}
  foreach ($a in $itens) { $script:appsInstalados[$a.id] = $a }
  $script:listaDeApps = @{ apps = $itens }
  $script:appsLidosEm = Get-Date
  return $script:listaDeApps
}

function AppConhecido($id) {
  if (-not $script:appsInstalados.ContainsKey($id)) { ListarApps $true | Out-Null }
  if (-not $script:appsInstalados.ContainsKey($id)) { throw 'app_desconhecido' }
}

function IconeDoAppInstalado($id) {
  if (-not $script:appsInstalados.ContainsKey($id)) { return $null }
  if ($iconesDeApps.ContainsKey($id)) { return $iconesDeApps[$id] }
  if ($iconesDeApps.Count -ge $LIMITE_DE_ICONES_GUARDADOS) { $iconesDeApps.Clear() }
  $valor = $null
  try {
    if ($id -like 'lnk:*') { $valor = [NikoControle]::IconeDoApp($id.Substring(4), 32) }
    else { $valor = [NikoControle]::IconeDoApp('shell:AppsFolder\' + $id, 32) }
  } catch { }
  if (-not $valor) { $exe = ExeDoApp $id; if ($exe) { try { $valor = [NikoControle]::IconeDoApp($exe, 32) } catch { } } }
  $iconesDeApps[$id] = $valor
  return $valor
}

function DonoDaConexao($portaLocal, $portaRemota) {
  $c = Get-NetTCPConnection -LocalPort ([int]$portaLocal) -RemotePort ([int]$portaRemota) -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 0 } | Select-Object -First 1
  if ($c) { return [int]$c.OwningProcess }
  return 0
}

function FocarJanelaDoProcesso($processoId) {
  $atual = [int]$processoId
  for ($nivel = 0; $nivel -lt 10 -and $atual -gt 4; $nivel++) {
    $p = Get-Process -Id $atual -ErrorAction SilentlyContinue
    if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero -and $p.ProcessName -notmatch '^(explorer|niko)$') {
      [NikoControle]::Focar($p.MainWindowHandle) | Out-Null
      return $p.ProcessName
    }
    $info = Get-CimInstance Win32_Process -Filter "ProcessId=$atual" -ErrorAction SilentlyContinue
    if (-not $info) { break }
    $atual = [int]$info.ParentProcessId
  }
  throw 'sem_janela'
}

function AbrirApp($id, $admin) {
  AppConhecido $id
  if ($id -like 'lnk:*') { Start-Process -FilePath $id.Substring(4); return }
  if ($admin) {
    $exe = ExeDoApp $id
    if (-not $exe) { throw 'sem_admin' }
    Start-Process -FilePath $exe -WorkingDirectory ([IO.Path]::GetDirectoryName($exe)) -Verb RunAs
    return
  }
  Start-Process ('shell:AppsFolder\' + $id)
}

while ($true) {
  $linha = [Console]::In.ReadLine()
  if ($null -eq $linha) { break }
  try {
    $pedido = $linha | ConvertFrom-Json
    switch ($pedido.acao) {
      'audio' { $r = Audio }
      'volume' { $r = @{ ok = [NikoControle]::DefinirVolume([int]$pedido.fluxo, [int]$pedido.valor) } }
      'mudo' { $r = @{ ok = [NikoControle]::DefinirMudo([int]$pedido.fluxo, [bool]$pedido.mudo) } }
      'sessao' {
        $pids = [uint32[]]@($pedido.pids | ForEach-Object { [uint32]$_ })
        $r = @{ ajustadas = [NikoControle]::AjustarSessoes($pids, [int]$pedido.volume, [int]$pedido.mudo) }
      }
      'tema' { $r = @{ escuro = (TemaEscuro) } }
      'iniciar' { $r = @{ aberto = [NikoControle]::IniciarAberto() } }
      'definirTema' {
        $claro = $(if ($pedido.escuro) { 0 } else { 1 })
        Set-ItemProperty -Path $CHAVE_TEMA -Name AppsUseLightTheme -Value $claro -Type DWord
        Set-ItemProperty -Path $CHAVE_TEMA -Name SystemUsesLightTheme -Value $claro -Type DWord
        [NikoControle]::AvisarMudancaDeTema()
        $r = @{ escuro = (TemaEscuro) }
      }
      'ferramenta' {
        if ($pedido.nome -eq 'captura') { Start-Process 'ms-screenclip:' }
        elseif ($pedido.nome -eq 'teclado') { Start-Process (Join-Path $env:WINDIR 'System32\osk.exe') }
        elseif ($pedido.nome -eq 'iniciar') {
          if ($pedido.abertoAntes -eq $true -or [NikoControle]::IniciarAberto()) { [NikoControle]::FecharIniciar() }
          else { [NikoControle]::AbrirIniciar() }
        }
        elseif ($pedido.nome -eq 'papelDeParede') { Start-Process 'ms-settings:personalization-background' }
        else { throw 'ferramenta_desconhecida' }
        if ($pedido.nome -eq 'iniciar') {
          Start-Sleep -Milliseconds 150
          $r = @{ ok = $true; aberto = [NikoControle]::IniciarAberto() }
        } else { $r = @{ ok = $true } }
      }
      'energia' {
        switch ($pedido.tipo) {
          'bloquear' { $r = @{ ok = [NikoControle]::Bloquear() } }
          'suspender' { $r = @{ ok = [NikoControle]::Suspender() } }
          'reiniciar' { Start-Process -FilePath (Join-Path $env:WINDIR 'System32\shutdown.exe') -ArgumentList '/r', '/t', '0' -WindowStyle Hidden; $r = @{ ok = $true } }
          'desligar' { Start-Process -FilePath (Join-Path $env:WINDIR 'System32\shutdown.exe') -ArgumentList '/s', '/t', '0' -WindowStyle Hidden; $r = @{ ok = $true } }
          default { throw 'acao_desconhecida' }
        }
      }
      'bandeja' { $r = Bandeja }
      'abrirDaBandeja' { AbrirDaBandeja $pedido.caminho; $r = @{ ok = $true } }
      'pastaDaBandeja' { MostrarNaPasta $pedido.caminho; $r = @{ ok = $true } }
      'encerrarDaBandeja' { $r = @{ ok = $true; encerrados = (EncerrarDaBandeja $pedido.caminho) } }
      'apps' { $r = (ListarApps ($pedido.forcar -eq $true)).Clone() }
      'iconesApps' {
        $lista = @()
        foreach ($id in @($pedido.ids)) { $lista += @{ id = [string]$id; icone = (IconeDoAppInstalado ([string]$id)) } }
        $r = @{ icones = $lista }
      }
      'abrirApp' { AbrirApp ([string]$pedido.id) ($pedido.admin -eq $true); $r = @{ ok = $true } }
      'donoDaConexao' { $r = @{ pid = (DonoDaConexao $pedido.portaLocal $pedido.portaRemota) } }
      'focarProcesso' { $r = @{ ok = $true; janela = (FocarJanelaDoProcesso $pedido.pid) } }
      'comandoDoSistema' {
        $alvo = $COMANDOS_DO_SISTEMA[[string]$pedido.comando]
        if (-not $alvo) { throw 'comando_desconhecido' }
        Start-Process $alvo
        $r = @{ ok = $true }
      }
      default { throw 'acao_desconhecida' }
    }
    $r.id = $pedido.id
    [Console]::Out.WriteLine(($r | ConvertTo-Json -Compress -Depth 5))
  } catch {
    [Console]::Out.WriteLine((@{ id = $pedido.id; erro = $_.Exception.Message } | ConvertTo-Json -Compress))
  }
}
`;

const controle = criarProcessoPowerShell("niko-controle", SCRIPT, "controle_encerrado");
const pedir = controle.pedir;

const FLUXOS = { saida: 0, entrada: 1 } as const;
const FERRAMENTAS = ["captura", "teclado", "iniciar", "papelDeParede"] as const;
const ENERGIA = ["bloquear", "suspender", "reiniciar", "desligar"] as const;

function fluxoDe(valor: unknown): number {
  if (valor !== "saida" && valor !== "entrada") throw new Error("valor_invalido");
  return FLUXOS[valor];
}

function percentual(valor: unknown): number {
  const n = Number(valor);
  if (!Number.isFinite(n)) throw new Error("valor_invalido");
  return Math.max(0, Math.min(100, Math.round(n)));
}

function caminhoDeApp(valor: unknown): string {
  if (typeof valor !== "string" || !valor || valor.length > 400 || /[\u0000-\u001f"]/.test(valor) || !/\.exe$/i.test(valor)) throw new Error("valor_invalido");
  return valor;
}

export const lerAudio = () => pedir({ acao: "audio" });
export const definirVolume = (d: Record<string, unknown>) => pedir({ acao: "volume", fluxo: fluxoDe(d.alvo), valor: percentual(d.volume) });
export const definirMudo = (d: Record<string, unknown>) => pedir({ acao: "mudo", fluxo: fluxoDe(d.alvo), mudo: d.mudo === true });
export const ajustarSessao = (d: Record<string, unknown>) => {
  const pids = Array.isArray(d.pids) ? d.pids.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff).slice(0, 64) : [];
  if (pids.length === 0) throw new Error("valor_invalido");
  const volume = d.volume === undefined ? -1 : percentual(d.volume);
  const mudo = d.mudo === undefined ? -1 : d.mudo === true ? 1 : 0;
  return pedir({ acao: "sessao", pids, volume, mudo });
};
export const lerTema = () => pedir({ acao: "tema" });
export const lerIniciar = () => pedir({ acao: "iniciar" });
export const definirTema = (d: Record<string, unknown>) => pedir({ acao: "definirTema", escuro: d.escuro === true });
export const abrirFerramenta = (d: Record<string, unknown>) => {
  if (!FERRAMENTAS.includes(d.nome as (typeof FERRAMENTAS)[number])) throw new Error("valor_invalido");
  if (d.abertoAntes !== undefined && typeof d.abertoAntes !== "boolean") throw new Error("valor_invalido");
  return pedir({ acao: "ferramenta", nome: d.nome, abertoAntes: d.abertoAntes });
};
export const agirNaEnergia = (d: Record<string, unknown>) => {
  if (!ENERGIA.includes(d.tipo as (typeof ENERGIA)[number])) throw new Error("valor_invalido");
  if (d.confirmacao !== "CONFIRMADO") throw new Error("confirmacao_invalida");
  return pedir({ acao: "energia", tipo: d.tipo });
};
export const lerBandeja = () => pedir({ acao: "bandeja" }, 20000);
export const abrirDaBandeja = (d: Record<string, unknown>) => pedir({ acao: "abrirDaBandeja", caminho: caminhoDeApp(d.caminho) });
export const pastaDaBandeja = (d: Record<string, unknown>) => pedir({ acao: "pastaDaBandeja", caminho: caminhoDeApp(d.caminho) });
export const encerrarDaBandeja = (d: Record<string, unknown>) => {
  if (d.confirmacao !== "CONFIRMADO") throw new Error("confirmacao_invalida");
  return pedir({ acao: "encerrarDaBandeja", caminho: caminhoDeApp(d.caminho) });
};

export const COMANDOS_DO_SISTEMA = ["rede", "wifi", "bluetooth", "som", "tela", "configuracoes", "atualizacoes", "tarefas", "adaptadores", "terminal", "arquivos", "painel"] as const;
const LIMITE_DE_ICONES = 12;

export function idDeApp(valor: unknown): string {
  if (typeof valor !== "string" || !valor || valor.length > 500 || /[\u0000-\u001f]/.test(valor)) throw new Error("valor_invalido");
  return valor;
}

export const listarApps = (d: Record<string, unknown>) => pedir({ acao: "apps", forcar: d.forcar === true }, 40000);
export const iconesDeApps = (d: Record<string, unknown>) => {
  const ids = Array.isArray(d.ids) ? d.ids.slice(0, LIMITE_DE_ICONES).map(idDeApp) : [];
  if (ids.length === 0) throw new Error("valor_invalido");
  return pedir({ acao: "iconesApps", ids }, 30000);
};
export const abrirApp = (d: Record<string, unknown>) => pedir({ acao: "abrirApp", id: idDeApp(d.id), admin: d.admin === true }, 30000);
export const abrirComandoDoSistema = (d: Record<string, unknown>) => {
  if (!COMANDOS_DO_SISTEMA.includes(d.comando as (typeof COMANDOS_DO_SISTEMA)[number])) throw new Error("valor_invalido");
  return pedir({ acao: "comandoDoSistema", comando: d.comando });
};

function porta(valor: unknown): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error("valor_invalido");
  return n;
}

export async function donoDaConexao(portaLocal: number, portaRemota: number): Promise<number> {
  const r = (await pedir({ acao: "donoDaConexao", portaLocal: porta(portaLocal), portaRemota: porta(portaRemota) }, 5000)) as { pid?: unknown };
  return Number.isInteger(r.pid) && (r.pid as number) > 0 ? (r.pid as number) : 0;
}

export function focarJanelaDoProcesso(processoId: number) {
  if (!Number.isInteger(processoId) || processoId <= 4) throw new Error("valor_invalido");
  return pedir({ acao: "focarProcesso", pid: processoId }, 10000);
}

export function encerrarControle() {
  controle.encerrar();
}
