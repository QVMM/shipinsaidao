$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')

if ([string]::IsNullOrWhiteSpace($desktop)) {
  throw 'Desktop directory was not found.'
}

function Convert-JsonUnicode {
  param([Parameter(Mandatory = $true)] [string]$Value)
  return ('"' + $Value + '"' | ConvertFrom-Json)
}

function New-SystemShortcut {
  param(
    [Parameter(Mandatory = $true)] [string]$Name,
    [Parameter(Mandatory = $true)] [string]$BatchFile,
    [Parameter(Mandatory = $true)] [string]$Description
  )

  $target = Join-Path $root $BatchFile
  if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
    throw "Missing launcher: $BatchFile"
  }

  $shell = New-Object -ComObject WScript.Shell
  $shortcutPath = Join-Path $desktop "$Name.lnk"
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $target
  $shortcut.WorkingDirectory = $root
  $shortcut.Description = $Description
  $shortcut.WindowStyle = 1
  $shortcut.Save()
}

$startName = Convert-JsonUnicode '\u6253\u5f00\u66ff\u6297\u84df\u5316\u7f51\u9875'
$stopName = Convert-JsonUnicode '\u5173\u95ed\u66ff\u6297\u84df\u5316\u7cfb\u7edf'
$legacyName = Convert-JsonUnicode '\u66ff\u6297\u84df\u5316\u7cfb\u7edf'
$startDescription = Convert-JsonUnicode '\u542f\u52a8\u66ff\u6297\u84df\u5316\u7cfb\u7edf\uff0c\u6216\u91cd\u65b0\u6253\u5f00\u5df2\u8fd0\u884c\u7684\u7cfb\u7edf\u9875\u9762'
$stopDescription = Convert-JsonUnicode '\u5b89\u5168\u5173\u95ed\u66ff\u6297\u84df\u5316\u672c\u5730\u670d\u52a1'

$legacyShortcut = Join-Path $desktop "$legacyName.lnk"
if (Test-Path -LiteralPath $legacyShortcut -PathType Leaf) {
  Remove-Item -LiteralPath $legacyShortcut -Force
}

New-SystemShortcut -Name $startName -BatchFile 'start-system.bat' -Description $startDescription
New-SystemShortcut -Name $stopName -BatchFile 'stop-system.bat' -Description $stopDescription

Write-Host 'Desktop shortcuts created.'
