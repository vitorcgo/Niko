import type { IncomingMessage } from "node:http";
import { execFile } from "node:child_process";
import { rmSync, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ensureScript } from "./temporaryScripts";

const LIMIT_IMAGE = 25 * 1024 * 1024;
const TIME_LIMIT = 60_000;

const SCRIPT = String.raw`
param([string]$Path)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
  $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation${"`"}1' } | Select-Object -First 1
  function AwaitResult($operation, [Type]$type) {
    $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
    $null = $task.Wait(-1)
    $task.Result
  }
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if ($null -eq $engine) { throw 'sem_idioma_ocr' }
  $file = AwaitResult ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
  $flow = AwaitResult ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = AwaitResult ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($flow)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $maximum = [Windows.Media.Ocr.OcrEngine]::MaxImageDimension
  if ($decoder.PixelWidth -gt $maximum -or $decoder.PixelHeight -gt $maximum) { throw 'imagem_grande_ocr' }
  $bitmap = AwaitResult ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result = AwaitResult ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $lines = @($result.Lines | ForEach-Object { $_.Text })
  $flow.Dispose()
  [Console]::Out.Write((@{ ok = $true; idioma = $engine.RecognizerLanguage.LanguageTag; linhas = $lines } | ConvertTo-Json -Compress -Depth 4))
} catch {
  $message = $_.Exception.Message
  if ($message -notin @('sem_idioma_ocr', 'imagem_grande_ocr')) { $message = 'falha_ocr' }
  [Console]::Out.Write((@{ ok = $false; erro = $message } | ConvertTo-Json -Compress))
}
`;

export interface ResultOcr {
  texto: string;
  idioma: string;
}

function receiveImage(req: IncomingMessage, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const output = createWriteStream(destination);
    req.on("data", (p: Buffer) => {
      size += p.length;
      if (size > LIMIT_IMAGE) {
        req.destroy();
        output.destroy();
        reject(new Error("imagem_grande_ocr"));
      }
    });
    req.on("error", reject);
    output.on("error", reject);
    output.on("finish", () => (size === 0 ? reject(new Error("arquivo_vazio")) : resolve()));
    req.pipe(output);
  });
}

function runOcr(path: string): Promise<ResultOcr> {
  if (process.platform !== "win32") return Promise.reject(new Error("ocr_indisponivel"));
  const script = ensureScript("niko-ocr", `﻿${SCRIPT}`);
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-Caminho", path],
      { windowsHide: true, timeout: TIME_LIMIT, maxBuffer: 16 * 1024 * 1024, encoding: "utf8" },
      (error, output) => {
        if (error && !output) return reject(new Error(error.killed ? "tempo_ocr" : "falha_ocr"));
        try {
          const r = JSON.parse(output.trim()) as { ok: boolean; erro?: string; idioma?: string; linhas?: string[] | string };
          if (!r.ok) return reject(new Error(r.erro ?? "falha_ocr"));
          const lines = Array.isArray(r.linhas) ? r.linhas : r.linhas ? [r.linhas] : [];
          resolve({ texto: lines.join("\n"), idioma: r.idioma ?? "" });
        } catch {
          reject(new Error("falha_ocr"));
        }
      },
    );
  });
}

export async function ocrRequest(req: IncomingMessage): Promise<ResultOcr> {
  const path = join(tmpdir(), `niko-ocr-${randomUUID()}.png`);
  try {
    await receiveImage(req, path);
    return await runOcr(path);
  } finally {
    rmSync(path, { force: true });
  }
}
