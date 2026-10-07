import { pedirSistemaLinux } from "./sistemaLinux";
import { spawn } from "node:child_process";
import { garantirScript } from "./scriptsTemporarios";
import { criarProcessoPowerShell } from "./processoPowerShell";

const SCRIPT = String.raw`
param([switch]$Continuo)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$script:metodoTarefa = $null
function Esperar($tarefa, $tipo) {
  if (-not $script:metodoTarefa) {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $script:metodoTarefa = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*' })[0]
  }
  $t = $script:metodoTarefa.MakeGenericMethod($tipo).Invoke($null, @($tarefa))
  $t.Wait(-1) | Out-Null
  $t.Result
}

function Radios {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  [Windows.Devices.Radios.Radio, Windows.System.Devices, ContentType = WindowsRuntime] | Out-Null
  [Windows.Devices.Radios.RadioAccessStatus, Windows.System.Devices, ContentType = WindowsRuntime] | Out-Null
  Esperar ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus]) | Out-Null
  return (Esperar ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]]))
}
function EstadoRadios {
  try {
    $saida = @{}
    foreach ($x in (Radios)) { $saida[[string]$x.Kind] = ([string]$x.State -eq 'On') }
    return $saida
  } catch { return @{} }
}

function Bateria {
  $b = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $b) { return $null }
  $carregando = @(2, 6, 7, 8, 9) -contains [int]$b.BatteryStatus
  $minutos = [int]$b.EstimatedRunTime
  if ($minutos -gt 6000) { $minutos = $null }
  return @{ nivel = [int]$b.EstimatedChargeRemaining; carregando = $carregando; minutos = $minutos }
}

function Brilho {
  try {
    $m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1
    if ($m) { return [int]$m.CurrentBrightness }
  } catch {}
  return $null
}

function WifiAtual {
  $linhas = netsh wlan show interfaces 2>$null
  $atual = @{ ssid = $null; sinal = $null; conectado = $false; existe = $false }
  foreach ($l in $linhas) {
    if ($l -match '^\s+(Nome|Name)\s+:\s*(.+)$') { $atual.existe = $true }
    if ($l -match '^\s+SSID\s+:\s*(.*)$') { $atual.ssid = $Matches[1].Trim() }
    if ($l -match '^\s+(Sinal|Signal)\s+:\s*(\d+)%') { $atual.sinal = [int]$Matches[2] }
    if ($l -match '^\s+(Estado|State)\s+:\s*(.+)$') { $atual.conectado = ($Matches[2] -match '^(conectado|connected)') }
  }
  return $atual
}

function Perfis {
  $nomes = @()
  foreach ($l in (netsh wlan show profiles 2>$null)) { if ($l -match '(Perfis de Usu|Perfil de Usu|User Profile)[^:]*:\s*(.+)$') { $nomes += $Matches[2].Trim() } }
  return $nomes
}

function AparelhosBluetooth {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  [Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType = WindowsRuntime] | Out-Null
  [Windows.Devices.Enumeration.DeviceInformationKind, Windows.Devices.Enumeration, ContentType = WindowsRuntime] | Out-Null
  [Windows.Devices.Enumeration.DeviceInformationCollection, Windows.Devices.Enumeration, ContentType = WindowsRuntime] | Out-Null
  [Windows.Devices.Bluetooth.BluetoothDevice, Windows.Devices.Bluetooth, ContentType = WindowsRuntime] | Out-Null
  [Windows.Devices.Bluetooth.BluetoothLEDevice, Windows.Devices.Bluetooth, ContentType = WindowsRuntime] | Out-Null
  $seletores = @([Windows.Devices.Bluetooth.BluetoothDevice]::GetDeviceSelectorFromPairingState($true), [Windows.Devices.Bluetooth.BluetoothLEDevice]::GetDeviceSelectorFromPairingState($true))
  $lista = @()
  foreach ($seletor in $seletores) {
    $operacao = [Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync($seletor, [string[]]@('System.Devices.Aep.IsConnected'), [Windows.Devices.Enumeration.DeviceInformationKind]::AssociationEndpoint)
    $aparelhos = Esperar $operacao ([Windows.Devices.Enumeration.DeviceInformationCollection])
    foreach ($aparelho in $aparelhos) {
      $conectado = $null
      foreach ($propriedade in $aparelho.Properties) {
        if ($propriedade.Key -eq 'System.Devices.Aep.IsConnected' -and $null -ne $propriedade.Value) { $conectado = [bool]$propriedade.Value }
      }
      $lista += @{ id = $aparelho.Id; nome = $aparelho.Name; ativo = ($conectado -eq $true); conectado = $conectado }
    }
  }
  return @($lista | Sort-Object -Property @{ Expression = 'ativo'; Descending = $true }, nome)
}

function Executar($entrada) {
switch ($entrada.acao) {
  'tipo' {
    $b = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue
    $chassi = (Get-CimInstance Win32_SystemEnclosure -ErrorAction SilentlyContinue | Select-Object -First 1).ChassisTypes
    $portateis = @(8, 9, 10, 11, 12, 14, 18, 21, 30, 31, 32)
    $notebook = [bool]$b -or (@($chassi | Where-Object { $portateis -contains $_ }).Count -gt 0)
    @{ notebook = $notebook; bateria = [bool]$b } | ConvertTo-Json -Compress
  }
  'estado' {
    @{ bateria = Bateria; brilho = Brilho; wifi = WifiAtual; radios = EstadoRadios } | ConvertTo-Json -Compress -Depth 4
  }
  'redes' {
    $conhecidas = Perfis
    $redes = @(); $atual = $null
    foreach ($l in (netsh wlan show networks mode=bssid 2>$null)) {
      if ($l -match '^SSID \d+\s*:\s*(.*)$') {
        if ($atual) { $redes += $atual }
        $nome = $Matches[1].Trim()
        $atual = @{ ssid = $nome; sinal = 0; segura = $true; salva = ($conhecidas -contains $nome) }
      } elseif ($atual -and $l -match '^\s+(Autentica\S*|Authentication)\s*:\s*(.+)$') {
        $atual.segura = -not ($Matches[2] -match '^(Aberta|Open)')
      } elseif ($atual -and $l -match '^\s+(Sinal|Signal)\s*:\s*(\d+)%') {
        if ([int]$Matches[2] -gt $atual.sinal) { $atual.sinal = [int]$Matches[2] }
      }
    }
    if ($atual) { $redes += $atual }
    @{ redes = @($redes | Where-Object { $_.ssid } | Sort-Object -Property sinal -Descending) } | ConvertTo-Json -Compress -Depth 4
  }
  'conectar' {
    $ssid = [string]$entrada.ssid
    if (-not (Perfis | Where-Object { $_ -eq $ssid })) {
      $nomeXml = [System.Security.SecurityElement]::Escape($ssid)
      $senha = [string]$entrada.senha
      if ($senha) {
        $chave = [System.Security.SecurityElement]::Escape($senha)
        $seguranca = "<authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption><sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>$chave</keyMaterial></sharedKey>"
      } else {
        $seguranca = "<authEncryption><authentication>open</authentication><encryption>none</encryption><useOneX>false</useOneX></authEncryption>"
      }
      $xml = "<?xml version=""1.0""?><WLANProfile xmlns=""http://www.microsoft.com/networking/WLAN/profile/v1""><name>$nomeXml</name><SSIDConfig><SSID><name>$nomeXml</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>auto</connectionMode><MSM><security>$seguranca</security></MSM></WLANProfile>"
      $arquivo = Join-Path $env:TEMP ("niko-wifi-" + [guid]::NewGuid().ToString() + ".xml")
      try {
        Set-Content -Path $arquivo -Value $xml -Encoding UTF8
        netsh wlan add profile filename="$arquivo" user=current | Out-Null
      } finally { Remove-Item $arquivo -Force -ErrorAction SilentlyContinue }
    }
    netsh wlan connect name="$ssid" | Out-Null
    Start-Sleep -Milliseconds 2500
    @{ ok = $true; wifi = WifiAtual } | ConvertTo-Json -Compress -Depth 4
  }
  'esquecer' {
    netsh wlan delete profile name="$([string]$entrada.ssid)" | Out-Null
    @{ ok = $true } | ConvertTo-Json -Compress
  }
  'desconectar' {
    netsh wlan disconnect | Out-Null
    @{ ok = $true } | ConvertTo-Json -Compress
  }
  'brilho' {
    $n = [Math]::Max(0, [Math]::Min(100, [int]$entrada.nivel))
    Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = [uint32]1; Brightness = [byte]$n } | Out-Null
    @{ ok = $true; brilho = $n } | ConvertTo-Json -Compress
  }
  'radio' {
    $alvo = Radios | Where-Object { [string]$_.Kind -eq [string]$entrada.tipo } | Select-Object -First 1
    if (-not $alvo) { throw 'radio_ausente' }
    $estado = if ($entrada.ligado) { 'On' } else { 'Off' }
    Esperar ($alvo.SetStateAsync($estado)) ([Windows.Devices.Radios.RadioAccessStatus]) | Out-Null
    @{ ok = $true; radios = EstadoRadios } | ConvertTo-Json -Compress -Depth 4
  }
  'bluetooth' {
    $lista = @(AparelhosBluetooth)
    @{ aparelhos = $lista } | ConvertTo-Json -Compress -Depth 4
  }
  'computador' {
    $os = Get-CimInstance Win32_OperatingSystem
    $cs = Get-CimInstance Win32_ComputerSystem
    $cpu = @(Get-CimInstance Win32_Processor)
    $ligado = (Get-Date) - $os.LastBootUpTime
    $discos = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { @{ unidade = $_.DeviceID; nome = $_.VolumeName; total_gb = [math]::Round($_.Size / 1GB, 1); livre_gb = [math]::Round($_.FreeSpace / 1GB, 1) } })
    $procs = @(Get-Process | Where-Object { $_.ProcessName -ne 'Idle' -and $_.ProcessName -ne 'System' })
    $grupos = @($procs | Group-Object ProcessName | ForEach-Object {
      $tempo = 0; foreach ($p in $_.Group) { try { $tempo += $p.TotalProcessorTime.TotalSeconds } catch {} }
      @{ nome = $_.Name; processos = $_.Count; memoria_mb = [math]::Round((($_.Group | Measure-Object WorkingSet64 -Sum).Sum) / 1MB); cpu_segundos = [math]::Round($tempo) }
    })
    $porMemoria = @($grupos | Sort-Object { $_.memoria_mb } -Descending | Select-Object -First 12)
    $porCpu = @($grupos | Sort-Object { $_.cpu_segundos } -Descending | Select-Object -First 8)
    $janelas = @($procs | Where-Object { $_.MainWindowTitle } | Select-Object -First 30 | ForEach-Object { @{ programa = $_.ProcessName; titulo = $_.MainWindowTitle } })
    $ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { @{ interface = $_.InterfaceAlias; ip = $_.IPAddress } })
    $bt = @(Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -match '^BTH(ENUM|LE)\\DEV_' -and $_.FriendlyName } | ForEach-Object { @{ nome = $_.FriendlyName; conectado = ($_.Status -eq 'OK') } })
    @{
      nome = $env:COMPUTERNAME
      sistema = $os.Caption + ' ' + $os.Version
      fabricante = $cs.Manufacturer
      modelo = $cs.Model
      processador = ($cpu | Select-Object -First 1).Name
      nucleos = $cs.NumberOfLogicalProcessors
      uso_cpu_pct = [math]::Round(($cpu | Measure-Object -Property LoadPercentage -Average).Average)
      memoria_total_gb = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
      memoria_livre_gb = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
      placa_de_video = @(Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name })
      ligado_ha_horas = [math]::Round($ligado.TotalHours, 1)
      discos = $discos
      bateria = Bateria
      wifi = WifiAtual
      ips = $ips
      bluetooth = $bt
      programas_mais_memoria = $porMemoria
      programas_mais_cpu_acumulada = $porCpu
      janelas_abertas = $janelas
      total_processos = $procs.Count
    } | ConvertTo-Json -Compress -Depth 5
  }
  'configuracoes' {
    $alvo = switch ([string]$entrada.pagina) { 'bluetooth' { 'ms-settings:bluetooth' } 'wifi' { 'ms-settings:network-wifi' } default { 'ms-settings:batterysaver' } }
    Start-Process $alvo
    @{ ok = $true } | ConvertTo-Json -Compress
  }
}
}

if ($Continuo) {
  while ($true) {
    $linha = [Console]::In.ReadLine()
    if ($null -eq $linha) { break }
    if (-not $linha.Trim()) { continue }
    $pedido = $null
    try {
      $pedido = $linha | ConvertFrom-Json
      $saida = Executar $pedido | Select-Object -Last 1
      [Console]::Out.WriteLine('{"id":' + [int]$pedido.id + ',"r":' + $saida + '}')
    } catch {
      [Console]::Out.WriteLine((@{ id = $(if ($pedido) { $pedido.id } else { 0 }); erro = $_.Exception.Message } | ConvertTo-Json -Compress))
    }
  }
} else {
  Executar ([Console]::In.ReadToEnd() | ConvertFrom-Json)
}
`;

let tipoEmCache: Promise<{ notebook: boolean; bateria: boolean }> | null = null;

function caminhoScript() {
  return garantirScript("niko-sistema", SCRIPT);
}

function executar<T>(entrada: Record<string, unknown>, limiteMs = 20000): Promise<T> {
  if (process.platform === "linux") return pedirSistemaLinux(entrada) as Promise<T>;
  if (process.platform !== "win32") return Promise.reject(new Error("somente_windows"));
  return new Promise((resolver, rejeitar) => {
    const processo = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", caminhoScript()], { windowsHide: true });
    let saida = "";
    let erro = "";
    const relogio = setTimeout(() => processo.kill(), limiteMs);
    processo.stdout.on("data", (d) => (saida += d.toString("utf8")));
    processo.stderr.on("data", (d) => (erro += d.toString()));
    processo.on("error", rejeitar);
    processo.on("close", (codigo) => {
      clearTimeout(relogio);
      if (codigo !== 0) return rejeitar(new Error(erro.trim().split("\n")[0] || "falha_sistema"));
      try {
        resolver(JSON.parse(saida.trim().split("\n").pop() ?? "{}") as T);
      } catch {
        rejeitar(new Error("resposta_invalida"));
      }
    });
    processo.stdin.end(JSON.stringify(entrada));
  });
}

function texto(v: unknown, max: number) {
  const s = typeof v === "string" ? v : "";
  if (!s || s.length > max || /[\u0000-\u001f]/.test(s)) throw new Error("valor_invalido");
  return s;
}

export function tipoDoComputador() {
  if (!tipoEmCache) tipoEmCache = executar<{ notebook: boolean; bateria: boolean }>({ acao: "tipo" }).catch(() => ({ notebook: false, bateria: false }));
  return tipoEmCache;
}

const leitorContinuo = criarProcessoPowerShell("niko-sistema", SCRIPT, "sistema_encerrado", ["-Continuo"]);

export const estadoDoSistema = async () => process.platform === "linux" ? pedirSistemaLinux({acao: "estado"}) : ((await leitorContinuo.pedir({ acao: "estado" }, 20000)) as { r: unknown }).r;

export function encerrarSistema() {
  leitorContinuo.encerrar();
}
export const listarRedes = () => executar({ acao: "redes" }, 25000);
function nomeDeRede(v: unknown) {
  const ssid = texto(v, 64);
  if (ssid.includes('"')) throw new Error("valor_invalido");
  return ssid;
}

export const conectarRede = (dados: Record<string, unknown>) => {
  const ssid = nomeDeRede(dados.ssid);
  const senha = typeof dados.senha === "string" && dados.senha ? texto(dados.senha, 63) : "";
  if (senha && senha.length < 8) throw new Error("senha_curta");
  return executar({ acao: "conectar", ssid, senha }, 30000);
};
export const esquecerRede = (dados: Record<string, unknown>) => executar({ acao: "esquecer", ssid: nomeDeRede(dados.ssid) });
export const desconectarRede = () => executar({ acao: "desconectar" });
export const definirBrilho = (dados: Record<string, unknown>) => {
  const nivel = Number(dados.nivel);
  if (!Number.isFinite(nivel)) throw new Error("valor_invalido");
  return executar({ acao: "brilho", nivel: Math.round(nivel) });
};
export const definirRadio = (dados: Record<string, unknown>) => {
  const tipo = dados.tipo === "Bluetooth" ? "Bluetooth" : dados.tipo === "WiFi" ? "WiFi" : null;
  if (!tipo) throw new Error("valor_invalido");
  return executar({ acao: "radio", tipo, ligado: Boolean(dados.ligado) });
};
export const listarBluetooth = () => executar({ acao: "bluetooth" });
let computadorEmCache: { quando: number; dados: Promise<unknown> } | null = null;
export const lerComputador = () => {
  if (!computadorEmCache || Date.now() - computadorEmCache.quando > 15000) {
    const dados = executar({ acao: "computador" }, 30000);
    computadorEmCache = { quando: Date.now(), dados };
    dados.catch(() => (computadorEmCache = null));
  }
  return computadorEmCache.dados;
};
export const abrirConfiguracoesWindows = (dados: Record<string, unknown>) => {
  const pagina = dados.pagina === "bluetooth" || dados.pagina === "wifi" ? dados.pagina : "bateria";
  return executar({ acao: "configuracoes", pagina });
};
