$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$runtime = Join-Path $root 'runtime'
$isArm64 = ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') -or ($env:PROCESSOR_ARCHITEW6432 -eq 'ARM64')
$nodeName = if ($isArm64) { 'node-arm64.exe' } else { 'node.exe' }
$node = Join-Path $runtime $nodeName
$entry = 'app\server\windows-web-start.mjs'
$stdout = Join-Path $runtime 'service-stdout.log'
$stderr = Join-Path $runtime 'service-stderr.log'
$errorFile = Join-Path $runtime 'startup-error.txt'
$launchPid = Join-Path $runtime 'launch-process.pid'

try {
  if (-not (Test-Path -LiteralPath $node -PathType Leaf)) {
    throw "Embedded runtime is missing: $nodeName"
  }
  $env:WINDOWS_WEB_NO_BROWSER = '1'
  if ($isArm64) {
    $voiceCli = Join-Path $runtime 'voice-arm64'
    if (-not (Test-Path -LiteralPath (Join-Path $voiceCli 'sherpa-onnx-offline-tts.exe') -PathType Leaf)) {
      throw 'Windows ARM64 voice runtime is missing.'
    }
    $env:OFFLINE_VOICE_CLI_DIR = $voiceCli
    $env:DJTK_WINDOWS_ARCH = 'arm64'
  } else {
    $env:DJTK_WINDOWS_ARCH = 'x64'
  }
  $process = Start-Process `
    -FilePath $node `
    -ArgumentList @($entry) `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -PassThru
  $process.Id | Set-Content -LiteralPath $launchPid -Encoding Ascii
  Start-Sleep -Milliseconds 400
  if ($process.HasExited -and $process.ExitCode -ne 0) {
    $details = if (Test-Path -LiteralPath $stderr) { Get-Content -LiteralPath $stderr -Raw } else { '' }
    throw "Local service exited with code $($process.ExitCode). $details"
  }
  exit 0
} catch {
  $message = ($_ | Out-String)
  $message | Set-Content -LiteralPath $errorFile -Encoding UTF8
  Write-Error $message
  exit 1
}
