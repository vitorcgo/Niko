import { execFile } from "node:child_process";
import { garantirScript } from "./scriptsTemporarios.ts";
import type { ResultadoOcr } from "../tipos.ts";

const TEMPO_LIMITE = 60_000;

const SCRIPT = String.raw`
param([string]$Caminho)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
  $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation${"`"}1' } | Select-Object -First 1
  function Aguardar($operacao, [Type]$tipo) {
    $tarefa = $asTask.MakeGenericMethod($tipo).Invoke($null, @($operacao))
    $null = $tarefa.Wait(-1)
    $tarefa.Result
  }
  $motor = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if ($null -eq $motor) { throw 'sem_idioma_ocr' }
  $arquivo = Aguardar ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Caminho)) ([Windows.Storage.StorageFile])
  $fluxo = Aguardar ($arquivo.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decodificador = Aguardar ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($fluxo)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $maximo = [Windows.Media.Ocr.OcrEngine]::MaxImageDimension
  if ($decodificador.PixelWidth -gt $maximo -or $decodificador.PixelHeight -gt $maximo) { throw 'imagem_grande_ocr' }
  $bitmap = Aguardar ($decodificador.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $resultado = Aguardar ($motor.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $linhas = @($resultado.Lines | ForEach-Object { $_.Text })
  $fluxo.Dispose()
  [Console]::Out.Write((@{ ok = $true; idioma = $motor.RecognizerLanguage.LanguageTag; linhas = $linhas } | ConvertTo-Json -Compress -Depth 4))
} catch {
  $mensagem = $_.Exception.Message
  if ($mensagem -notin @('sem_idioma_ocr', 'imagem_grande_ocr')) { $mensagem = 'falha_ocr' }
  [Console]::Out.Write((@{ ok = $false; erro = $mensagem } | ConvertTo-Json -Compress))
}
`;

export function ocr(caminho: string): Promise<ResultadoOcr> {
  if (process.platform !== "win32") return Promise.reject(new Error("ocr_indisponivel"));
  const script = garantirScript("niko-ocr", `﻿${SCRIPT}`);
  return new Promise((resolver, rejeitar) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-Caminho", caminho],
      { windowsHide: true, timeout: TEMPO_LIMITE, maxBuffer: 16 * 1024 * 1024, encoding: "utf8" },
      (erro, saida) => {
        if (erro && !saida) return rejeitar(new Error(erro.killed ? "tempo_ocr" : "falha_ocr"));
        try {
          const r = JSON.parse(saida.trim()) as { ok: boolean; erro?: string; idioma?: string; linhas?: string[] | string };
          if (!r.ok) return rejeitar(new Error(r.erro ?? "falha_ocr"));
          const linhas = Array.isArray(r.linhas) ? r.linhas : r.linhas ? [r.linhas] : [];
          resolver({ texto: linhas.join("\n"), idioma: r.idioma ?? "" });
        } catch {
          rejeitar(new Error("falha_ocr"));
        }
      },
    );
  });
}