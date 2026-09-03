param(
  [string]$InstallerPath
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$version = (Get-Content -Raw -LiteralPath (Join-Path $projectRoot "package.json") | ConvertFrom-Json).version
if (-not $InstallerPath) {
  $InstallerPath = Join-Path $projectRoot "src-tauri\target\release\bundle\nsis\Verseform_${version}_x64-setup.exe"
}
$installer = (Resolve-Path $InstallerPath).Path
$testRoot = if ($env:RUNNER_TEMP) {
  Join-Path $env:RUNNER_TEMP "verseform-installer-smoke-$PID"
} else {
  Join-Path $projectRoot "artifacts\installer-smoke-$PID"
}
$installDirectory = Join-Path $testRoot "Verseform"
$documentDirectory = Join-Path $testRoot "User documents"
$userDocument = Join-Path $documentDirectory "Preserve Me.verseform"
$appExecutable = Join-Path $installDirectory "Verseform.exe"
$uninstaller = Join-Path $installDirectory "uninstall.exe"
$app = $null
$installed = $false
$oldHttpProxy = $env:HTTP_PROXY
$oldHttpsProxy = $env:HTTPS_PROXY

$existing = Get-ChildItem "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall" -ErrorAction SilentlyContinue |
  ForEach-Object { Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue } |
  Where-Object { $_.DisplayName -eq "Verseform" }
if ($existing) { throw "Refusing to replace an existing Verseform installation during smoke testing." }

try {
  New-Item -ItemType Directory -Force -Path $installDirectory, $documentDirectory | Out-Null
  Copy-Item -LiteralPath (Join-Path $projectRoot "tests\fixtures\formatted-v2.verseform.json") -Destination $userDocument

  $install = Start-Process -FilePath $installer -ArgumentList @("/S", "/D=$installDirectory") -Wait -PassThru -WindowStyle Hidden
  if ($install.ExitCode -ne 0) { throw "Installer exited with code $($install.ExitCode)." }
  $installed = $true
  if (-not (Test-Path -LiteralPath $appExecutable)) { throw "Installed executable was not found." }

  $registration = Get-ChildItem "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall" |
    ForEach-Object { Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue } |
    Where-Object { $_.DisplayName -eq "Verseform" } |
    Select-Object -First 1
  if (-not $registration -or $registration.DisplayVersion -ne $version) {
    throw "Expected Windows uninstall registration was not found."
  }

  $env:HTTP_PROXY = "http://127.0.0.1:9"
  $env:HTTPS_PROXY = "http://127.0.0.1:9"
  $app = Start-Process -FilePath $appExecutable -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 6
  if ($app.HasExited) { throw "Installed app exited before the offline launch check completed." }
  if (-not (Get-Process -Id $app.Id).Responding) { throw "Installed app did not become responsive." }
} finally {
  $env:HTTP_PROXY = $oldHttpProxy
  $env:HTTPS_PROXY = $oldHttpsProxy
  if ($app -and -not $app.HasExited) {
    [void]$app.CloseMainWindow()
    if (-not $app.WaitForExit(5000)) { Stop-Process -Id $app.Id -Force }
  }
  if ($installed -and (Test-Path -LiteralPath $uninstaller)) {
    $uninstall = Start-Process -FilePath $uninstaller -ArgumentList "/S" -Wait -PassThru -WindowStyle Hidden
    if ($uninstall.ExitCode -ne 0) { throw "Uninstaller exited with code $($uninstall.ExitCode)." }
  }
}

if (Test-Path -LiteralPath $appExecutable) { throw "Uninstall left the installed executable behind." }
$registrationAfter = Get-ChildItem "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall" -ErrorAction SilentlyContinue |
  ForEach-Object { Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue } |
  Where-Object { $_.DisplayName -eq "Verseform" }
if ($registrationAfter) { throw "Uninstall left the Windows registration behind." }
if (-not (Test-Path -LiteralPath $userDocument)) { throw "Uninstall removed the user document." }

Write-Output "Installer smoke passed: install, offline launch, registration, uninstall, and user-document preservation."
