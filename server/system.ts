import { spawn } from "node:child_process";
import { ensureScript } from "./temporaryScripts";
import { createProcessPowerShell } from "./powerShellProcess";

const SCRIPT = String.raw`
param([switch]$Continuous)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$script:methodTask = $null
function Wait($task, $type) {
  if (-not $script:methodTask) {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $script:methodTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*' })[0]
  }
  $t = $script:methodTask.MakeGenericMethod($type).Invoke($null, @($task))
  $t.Wait(-1) | Out-Null
  $t.Result
}

function Radios {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  [Windows.Devices.Radios.Radio, Windows.System.Devices, ContentType = WindowsRuntime] | Out-Null
  [Windows.Devices.Radios.RadioAccessStatus, Windows.System.Devices, ContentType = WindowsRuntime] | Out-Null
  Wait ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus]) | Out-Null
  return (Wait ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]]))
}
function StateRadios {
  try {
    $output = @{}
    foreach ($x in (Radios)) { $output[[string]$x.Kind] = ([string]$x.State -eq 'On') }
    return $output
  } catch { return @{} }
}

function Battery {
  $b = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $b) { return $null }
  $loading = @(2, 6, 7, 8, 9) -contains [int]$b.BatteryStatus
  $minutes = [int]$b.EstimatedRunTime
  if ($minutes -gt 6000) { $minutes = $null }
  return @{ nivel = [int]$b.EstimatedChargeRemaining; carregando = $loading; minutos = $minutes }
}

function Brightness {
  try {
    $m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1
    if ($m) { return [int]$m.CurrentBrightness }
  } catch {}
  return $null
}

function WifiCurrent {
  $lines = netsh wlan show interfaces 2>$null
  $current = @{ ssid = $null; sinal = $null; conectado = $false; existe = $false }
  foreach ($l in $lines) {
    if ($l -match '^\s+(Nome|Name)\s+:\s*(.+)$') { $current.existe = $true }
    if ($l -match '^\s+SSID\s+:\s*(.*)$') { $current.ssid = $Matches[1].Trim() }
    if ($l -match '^\s+(Sinal|Signal)\s+:\s*(\d+)%') { $current.sinal = [int]$Matches[2] }
    if ($l -match '^\s+(Estado|State)\s+:\s*(.+)$') { $current.conectado = ($Matches[2] -match '^(conectado|connected)') }
  }
  return $current
}

$script:managerNetwork = $null
function Connection {
  $cable = $false
  try {
    foreach ($i in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
      if ($i.OperationalStatus -ne 'Up') { continue }
      if (@('Ethernet', 'GigabitEthernet', 'FastEthernetT', 'FastEthernetFx', 'Ethernet3Megabit') -notcontains [string]$i.NetworkInterfaceType) { continue }
      if ($i.Description -match 'Virtual|VPN|TAP|Hyper-V|VMware|VirtualBox|Loopback|Bluetooth|Radmin|Hamachi|ZeroTier|Tailscale|WireGuard|Npcap') { continue }
      $outputs = @($i.GetIPProperties().GatewayAddresses | Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' -and $_.Address.ToString() -ne '0.0.0.0' })
      if ($outputs.Count -gt 0) { $cable = $true; break }
    }
  } catch {}
  $internet = $null
  try {
    if (-not $script:managerNetwork) { $script:managerNetwork = [Activator]::CreateInstance([Type]::GetTypeFromCLSID([Guid]'DCB00C01-570F-4A9B-8D69-199FDBA5723B')) }
    $internet = [bool]$script:managerNetwork.IsConnectedToInternet
  } catch {}
  return @{ cabo = $cable; internet = $internet }
}

function Profiles {
  $names = @()
  foreach ($l in (netsh wlan show profiles 2>$null)) { if ($l -match '(Perfis de Usu|Perfil de Usu|User Profile)[^:]*:\s*(.+)$') { $names += $Matches[2].Trim() } }
  return $names
}

function DevicesBluetooth {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  [Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType = WindowsRuntime] | Out-Null
  [Windows.Devices.Enumeration.DeviceInformationKind, Windows.Devices.Enumeration, ContentType = WindowsRuntime] | Out-Null
  [Windows.Devices.Enumeration.DeviceInformationCollection, Windows.Devices.Enumeration, ContentType = WindowsRuntime] | Out-Null
  [Windows.Devices.Bluetooth.BluetoothDevice, Windows.Devices.Bluetooth, ContentType = WindowsRuntime] | Out-Null
  [Windows.Devices.Bluetooth.BluetoothLEDevice, Windows.Devices.Bluetooth, ContentType = WindowsRuntime] | Out-Null
  $selectors = @([Windows.Devices.Bluetooth.BluetoothDevice]::GetDeviceSelectorFromPairingState($true), [Windows.Devices.Bluetooth.BluetoothLEDevice]::GetDeviceSelectorFromPairingState($true))
  $list = @()
  foreach ($selector in $selectors) {
    $operation = [Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync($selector, [string[]]@('System.Devices.Aep.IsConnected'), [Windows.Devices.Enumeration.DeviceInformationKind]::AssociationEndpoint)
    $devices = Wait $operation ([Windows.Devices.Enumeration.DeviceInformationCollection])
    foreach ($device in $devices) {
      $connected = $null
      foreach ($property in $device.Properties) {
        if ($property.Key -eq 'System.Devices.Aep.IsConnected' -and $null -ne $property.Value) { $connected = [bool]$property.Value }
      }
      $list += @{ id = $device.Id; nome = $device.Name; ativo = ($connected -eq $true); conectado = $connected }
    }
  }
  return @($list | Sort-Object -Property @{ Expression = 'ativo'; Descending = $true }, nome)
}

function Execute($input) {
switch ($input.acao) {
  'tipo' {
    $b = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue
    $chassis = (Get-CimInstance Win32_SystemEnclosure -ErrorAction SilentlyContinue | Select-Object -First 1).ChassisTypes
    $portables = @(8, 9, 10, 11, 12, 14, 18, 21, 30, 31, 32)
    $notebook = [bool]$b -or (@($chassis | Where-Object { $portables -contains $_ }).Count -gt 0)
    @{ notebook = $notebook; bateria = [bool]$b } | ConvertTo-Json -Compress
  }
  'estado' {
    @{ bateria = Battery; brilho = Brightness; wifi = WifiCurrent; radios = StateRadios; conexao = Connection } | ConvertTo-Json -Compress -Depth 4
  }
  'redes' {
    $known = Profiles
    $networks = @(); $current = $null
    foreach ($l in (netsh wlan show networks mode=bssid 2>$null)) {
      if ($l -match '^SSID \d+\s*:\s*(.*)$') {
        if ($current) { $networks += $current }
        $name = $Matches[1].Trim()
        $current = @{ ssid = $name; sinal = 0; segura = $true; salva = ($known -contains $name) }
      } elseif ($current -and $l -match '^\s+(Autentica\S*|Authentication)\s*:\s*(.+)$') {
        $current.segura = -not ($Matches[2] -match '^(Aberta|Open)')
      } elseif ($current -and $l -match '^\s+(Sinal|Signal)\s*:\s*(\d+)%') {
        if ([int]$Matches[2] -gt $current.sinal) { $current.sinal = [int]$Matches[2] }
      }
    }
    if ($current) { $networks += $current }
    @{ redes = @($networks | Where-Object { $_.ssid } | Sort-Object -Property sinal -Descending) } | ConvertTo-Json -Compress -Depth 4
  }
  'conectar' {
    $ssid = [string]$input.ssid
    if (-not (Profiles | Where-Object { $_ -eq $ssid })) {
      $xmlName = [System.Security.SecurityElement]::Escape($ssid)
      $password = [string]$input.senha
      if ($password) {
        $key = [System.Security.SecurityElement]::Escape($password)
        $security = "<authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption><sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>$key</keyMaterial></sharedKey>"
      } else {
        $security = "<authEncryption><authentication>open</authentication><encryption>none</encryption><useOneX>false</useOneX></authEncryption>"
      }
      $xml = "<?xml version=""1.0""?><WLANProfile xmlns=""http://www.microsoft.com/networking/WLAN/profile/v1""><name>$xmlName</name><SSIDConfig><SSID><name>$xmlName</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>auto</connectionMode><MSM><security>$security</security></MSM></WLANProfile>"
      $file = Join-Path $env:TEMP ("niko-wifi-" + [guid]::NewGuid().ToString() + ".xml")
      try {
        Set-Content -Path $file -Value $xml -Encoding UTF8
        netsh wlan add profile filename="$file" user=current | Out-Null
      } finally { Remove-Item $file -Force -ErrorAction SilentlyContinue }
    }
    netsh wlan connect name="$ssid" | Out-Null
    Start-Sleep -Milliseconds 2500
    @{ ok = $true; wifi = WifiCurrent } | ConvertTo-Json -Compress -Depth 4
  }
  'esquecer' {
    netsh wlan delete profile name="$([string]$input.ssid)" | Out-Null
    @{ ok = $true } | ConvertTo-Json -Compress
  }
  'desconectar' {
    netsh wlan disconnect | Out-Null
    @{ ok = $true } | ConvertTo-Json -Compress
  }
  'brilho' {
    $n = [Math]::Max(0, [Math]::Min(100, [int]$input.nivel))
    Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = [uint32]1; Brightness = [byte]$n } | Out-Null
    @{ ok = $true; brilho = $n } | ConvertTo-Json -Compress
  }
  'radio' {
    $target = Radios | Where-Object { [string]$_.Kind -eq [string]$input.tipo } | Select-Object -First 1
    if (-not $target) { throw 'radio_ausente' }
    $state = if ($input.ligado) { 'On' } else { 'Off' }
    Wait ($target.SetStateAsync($state)) ([Windows.Devices.Radios.RadioAccessStatus]) | Out-Null
    @{ ok = $true; radios = StateRadios } | ConvertTo-Json -Compress -Depth 4
  }
  'bluetooth' {
    $list = @(DevicesBluetooth)
    @{ aparelhos = $list } | ConvertTo-Json -Compress -Depth 4
  }
  'computador' {
    $the = Get-CimInstance Win32_OperatingSystem
    $cs = Get-CimInstance Win32_ComputerSystem
    $cpu = @(Get-CimInstance Win32_Processor)
    $enabled = (Get-Date) - $the.LastBootUpTime
    $disks = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { @{ unidade = $_.DeviceID; nome = $_.VolumeName; total_gb = [math]::Round($_.Size / 1GB, 1); livre_gb = [math]::Round($_.FreeSpace / 1GB, 1) } })
    $procs = @(Get-Process | Where-Object { $_.ProcessName -ne 'Idle' -and $_.ProcessName -ne 'System' })
    $groups = @($procs | Group-Object ProcessName | ForEach-Object {
      $time = 0; foreach ($p in $_.Group) { try { $time += $p.TotalProcessorTime.TotalSeconds } catch {} }
      @{ nome = $_.Name; processos = $_.Count; memoria_mb = [math]::Round((($_.Group | Measure-Object WorkingSet64 -Sum).Sum) / 1MB); cpu_segundos = [math]::Round($time) }
    })
    $byMemory = @($groups | Sort-Object { $_.memoria_mb } -Descending | Select-Object -First 12)
    $byCpu = @($groups | Sort-Object { $_.cpu_segundos } -Descending | Select-Object -First 8)
    $windows = @($procs | Where-Object { $_.MainWindowTitle } | Select-Object -First 30 | ForEach-Object { @{ programa = $_.ProcessName; titulo = $_.MainWindowTitle } })
    $ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { @{ interface = $_.InterfaceAlias; ip = $_.IPAddress } })
    $bt = @(Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -match '^BTH(ENUM|LE)\\DEV_' -and $_.FriendlyName } | ForEach-Object { @{ nome = $_.FriendlyName; conectado = ($_.Status -eq 'OK') } })
    @{
      nome = $env:COMPUTERNAME
      sistema = $the.Caption + ' ' + $the.Version
      fabricante = $cs.Manufacturer
      modelo = $cs.Model
      processador = ($cpu | Select-Object -First 1).Name
      nucleos = $cs.NumberOfLogicalProcessors
      uso_cpu_pct = [math]::Round(($cpu | Measure-Object -Property LoadPercentage -Average).Average)
      memoria_total_gb = [math]::Round($the.TotalVisibleMemorySize / 1MB, 1)
      memoria_livre_gb = [math]::Round($the.FreePhysicalMemory / 1MB, 1)
      placa_de_video = @(Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name })
      ligado_ha_horas = [math]::Round($enabled.TotalHours, 1)
      discos = $disks
      bateria = Battery
      wifi = WifiCurrent
      ips = $ips
      bluetooth = $bt
      programas_mais_memoria = $byMemory
      programas_mais_cpu_acumulada = $byCpu
      janelas_abertas = $windows
      total_processos = $procs.Count
    } | ConvertTo-Json -Compress -Depth 5
  }
  'configuracoes' {
    $target = switch ([string]$input.pagina) { 'bluetooth' { 'ms-settings:bluetooth' } 'wifi' { 'ms-settings:network-wifi' } 'rede' { 'ms-settings:network-status' } default { 'ms-settings:batterysaver' } }
    Start-Process $target
    @{ ok = $true } | ConvertTo-Json -Compress
  }
}
}

if ($Continuous) {
  while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    if (-not $line.Trim()) { continue }
    $request = $null
    try {
      $request = $line | ConvertFrom-Json
      $output = Execute $request | Select-Object -Last 1
      [Console]::Out.WriteLine('{"id":' + [int]$request.id + ',"r":' + $output + '}')
    } catch {
      [Console]::Out.WriteLine((@{ id = $(if ($request) { $request.id } else { 0 }); erro = $_.Exception.Message } | ConvertTo-Json -Compress))
    }
  }
} else {
  Execute ([Console]::In.ReadToEnd() | ConvertFrom-Json)
}
`;

let cachedType: Promise<{ notebook: boolean; bateria: boolean }> | null = null;

function pathScript() {
  return ensureScript("niko-sistema", SCRIPT);
}

function execute<T>(input: Record<string, unknown>, limitMs = 20000): Promise<T> {
  if (process.platform !== "win32") return Promise.reject(new Error("somente_windows"));
  return new Promise((resolve, reject) => {
    const childProcess = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", pathScript()], { windowsHide: true });
    let output = "";
    let error = "";
    const clock = setTimeout(() => childProcess.kill(), limitMs);
    childProcess.stdout.on("data", (d) => (output += d.toString("utf8")));
    childProcess.stderr.on("data", (d) => (error += d.toString()));
    childProcess.on("error", reject);
    childProcess.on("close", (code) => {
      clearTimeout(clock);
      if (code !== 0) return reject(new Error(error.trim().split("\n")[0] || "falha_sistema"));
      try {
        resolve(JSON.parse(output.trim().split("\n").pop() ?? "{}") as T);
      } catch {
        reject(new Error("resposta_invalida"));
      }
    });
    childProcess.stdin.end(JSON.stringify(input));
  });
}

function text(v: unknown, max: number) {
  const s = typeof v === "string" ? v : "";
  if (!s || s.length > max || /[\u0000-\u001f]/.test(s)) throw new Error("valor_invalido");
  return s;
}

export function typeComputer() {
  if (!cachedType) cachedType = execute<{ notebook: boolean; bateria: boolean }>({ acao: "tipo" }).catch(() => ({ notebook: false, bateria: false }));
  return cachedType;
}

const readerContinuous = createProcessPowerShell("niko-sistema", SCRIPT, "sistema_encerrado", ["-Continuo"]);

export const stateSystem = async () => ((await readerContinuous.request({ acao: "estado" }, 20000)) as { r: unknown }).r;

export function stopSystem() {
  readerContinuous.stop();
}
export const listNetworks = () => execute({ acao: "redes" }, 25000);
function nameNetwork(v: unknown) {
  const ssid = text(v, 64);
  if (ssid.includes('"')) throw new Error("valor_invalido");
  return ssid;
}

export const connectNetwork = (payload: Record<string, unknown>) => {
  const ssid = nameNetwork(payload.ssid);
  const password = typeof payload.senha === "string" && payload.senha ? text(payload.senha, 63) : "";
  if (password && password.length < 8) throw new Error("senha_curta");
  return execute({ acao: "conectar", ssid, senha: password }, 30000);
};
export const forgetNetwork = (payload: Record<string, unknown>) => execute({ acao: "esquecer", ssid: nameNetwork(payload.ssid) });
export const disconnectNetwork = () => execute({ acao: "desconectar" });
export const setBrightness = (payload: Record<string, unknown>) => {
  const level = Number(payload.nivel);
  if (!Number.isFinite(level)) throw new Error("valor_invalido");
  return execute({ acao: "brilho", nivel: Math.round(level) });
};
export const setRadio = (payload: Record<string, unknown>) => {
  const type = payload.tipo === "Bluetooth" ? "Bluetooth" : payload.tipo === "WiFi" ? "WiFi" : null;
  if (!type) throw new Error("valor_invalido");
  return execute({ acao: "radio", tipo: type, ligado: Boolean(payload.ligado) });
};
export const listBluetooth = () => execute({ acao: "bluetooth" });
let computerAtCache: { quando: number; dados: Promise<unknown> } | null = null;
export const readComputer = () => {
  if (!computerAtCache || Date.now() - computerAtCache.quando > 15000) {
    const payload = execute({ acao: "computador" }, 30000);
    computerAtCache = { quando: Date.now(), dados: payload };
    payload.catch(() => (computerAtCache = null));
  }
  return computerAtCache.dados;
};
export const openSettingsWindows = (payload: Record<string, unknown>) => {
  const page = payload.pagina === "bluetooth" || payload.pagina === "wifi" || payload.pagina === "rede" ? payload.pagina : "bateria";
  return execute({ acao: "configuracoes", pagina: page });
};
