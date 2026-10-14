!macro EncerrarProcessosDoNiko
  System::Call 'Kernel32::SetEnvironmentVariable(t "NIKO_PASTA", t "$INSTDIR")'
  nsExec::Exec `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$p = $$env:NIKO_PASTA.TrimEnd([char]92) + [char]92; Get-CimInstance Win32_Process -Filter 'Name = ''niko.exe'' OR Name = ''node.exe''' | Where-Object { $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith($$p, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep -Milliseconds 800"`
  Pop $0
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro EncerrarProcessosDoNiko
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro EncerrarProcessosDoNiko
!macroend
