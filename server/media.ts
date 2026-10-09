import { createProcessPowerShell } from "./powerShellProcess";

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$methodOp = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*' })[0]
function Wait($task, $type) {
  $t = $methodOp.MakeGenericMethod($type).Invoke($null, @($task))
  $t.Wait(-1) | Out-Null
  $t.Result
}
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IContentTypeProvider, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
$manager = Wait ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$lastCover = ''
$coverCurrent = $null
$coverChangedAt = [DateTime]::MinValue
$methodToFlow = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [type[]]@([Windows.Storage.Streams.IInputStream]))
$propertyType = [Windows.Storage.Streams.IContentTypeProvider].GetProperty('ContentType')

function Cover($props) {
  try {
    if (-not $props.Thumbnail) { return $null }
    $flow = Wait ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    $net = $methodToFlow.Invoke($null, @($flow))
    $mem = New-Object System.IO.MemoryStream
    $net.CopyTo($mem)
    $net.Dispose()
    if ($mem.Length -eq 0 -or $mem.Length -gt 2000000) { return $null }
    $type = [string]$propertyType.GetValue($flow)
    if (-not $type.StartsWith('image/')) { $type = 'image/jpeg' }
    return 'data:' + $type + ';base64,' + [Convert]::ToBase64String($mem.ToArray())
  } catch { return $null }
}

function State {
  $s = $manager.GetCurrentSession()
  if (-not $s) { return @{ sessao = $false } }
  $props = Wait ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $info = $s.GetPlaybackInfo()
  $line = $s.GetTimelineProperties()
  $keyCover = [string]$s.SourceAppUserModelId + '|' + [string]$props.Title + '|' + [string]$props.Artist
  if ($keyCover -ne $script:lastCover) {
    $script:lastCover = $keyCover
    $script:coverChangedAt = [DateTime]::Now
    $script:coverCurrent = Cover $props
  } elseif (-not $script:coverCurrent -or ([DateTime]::Now - $script:coverChangedAt).TotalSeconds -lt 4) {
    $script:coverCurrent = Cover $props
  }
  return @{
    sessao = $true
    app = [string]$s.SourceAppUserModelId
    titulo = [string]$props.Title
    artista = [string]$props.Artist
    album = [string]$props.AlbumTitle
    tocando = ([string]$info.PlaybackStatus -eq 'Playing')
    posicao = [math]::Round($line.Position.TotalSeconds, 1)
    duracao = [math]::Round(($line.EndTime - $line.StartTime).TotalSeconds, 1)
    atualizadoEm = $line.LastUpdatedTime.ToUnixTimeMilliseconds()
    podeAvancar = [bool]$info.Controls.IsNextEnabled
    podeVoltar = [bool]$info.Controls.IsPreviousEnabled
    podeBuscar = [bool]$info.Controls.IsPlaybackPositionEnabled
    capa = $script:coverCurrent
  }
}

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  try {
    $request = $line | ConvertFrom-Json
    $s = $manager.GetCurrentSession()
    switch ($request.acao) {
      'alternar' { if ($s) { Wait ($s.TryTogglePlayPauseAsync()) ([bool]) | Out-Null } }
      'proxima' { if ($s) { Wait ($s.TrySkipNextAsync()) ([bool]) | Out-Null } }
      'anterior' { if ($s) { Wait ($s.TrySkipPreviousAsync()) ([bool]) | Out-Null } }
      'posicao' { if ($s) { Wait ($s.TryChangePlaybackPositionAsync([long]([double]$request.segundos * 10000000))) ([bool]) | Out-Null } }
    }
    if ($request.acao -ne 'estado') { Start-Sleep -Milliseconds 250 }
    $r = State
    $r.id = $request.id
    [Console]::Out.WriteLine(($r | ConvertTo-Json -Compress -Depth 3))
  } catch {
    [Console]::Out.WriteLine((@{ id = $request.id; erro = $_.Exception.Message } | ConvertTo-Json -Compress))
  }
}
`;

const media = createProcessPowerShell("niko-midia", SCRIPT, "midia_encerrada");

export function requestMedia(action: "estado" | "alternar" | "proxima" | "anterior" | "posicao", seconds?: number): Promise<unknown> {
  return media.request({ acao: action, segundos: Number(seconds) || 0 });
}

export function stopMedia() {
  media.stop();
}
