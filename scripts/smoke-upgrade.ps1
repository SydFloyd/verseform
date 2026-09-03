param(
  [string]$PreviousInstallerPath,
  [string]$InstallerPath
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$version = (Get-Content -Raw -LiteralPath (Join-Path $projectRoot "package.json") | ConvertFrom-Json).version
if (-not $PreviousInstallerPath) {
  $PreviousInstallerPath = Join-Path $projectRoot "artifacts\alpha\Verseform_0.1.0_x64-setup.exe"
}
if (-not $InstallerPath) {
  $InstallerPath = Join-Path $projectRoot "src-tauri\target\release\bundle\nsis\Verseform_${version}_x64-setup.exe"
}
$previousInstaller = (Resolve-Path -LiteralPath $PreviousInstallerPath).Path
$installer = (Resolve-Path -LiteralPath $InstallerPath).Path

$testRoot = if ($env:RUNNER_TEMP) {
  Join-Path $env:RUNNER_TEMP "verseform-upgrade-smoke-$PID"
} else {
  Join-Path $projectRoot "artifacts\upgrade-smoke-$PID"
}
$installDirectory = Join-Path $testRoot "Verseform"
$documentDirectory = Join-Path $testRoot "User documents"
$userDocument = Join-Path $documentDirectory "Preserve Across Upgrade.verseform"
$appExecutable = Join-Path $installDirectory "Verseform.exe"
$uninstaller = Join-Path $installDirectory "uninstall.exe"

$localDataRoot = [IO.Path]::GetFullPath($env:LOCALAPPDATA).TrimEnd([IO.Path]::DirectorySeparatorChar)
$profileRoot = [IO.Path]::GetFullPath((Join-Path $localDataRoot "com.verseform.editor"))
if ([IO.Path]::GetDirectoryName($profileRoot) -ne $localDataRoot) {
  throw "Refusing to use an unexpected Verseform profile path."
}
if (Test-Path -LiteralPath $profileRoot) {
  throw "Refusing to alter an existing Verseform local profile during upgrade testing."
}

function Get-VerseformRegistration {
  Get-ChildItem "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall" -ErrorAction SilentlyContinue |
    ForEach-Object { Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue } |
    Where-Object { $_.DisplayName -eq "Verseform" } |
    Select-Object -First 1
}

function Stop-TestApp([System.Diagnostics.Process]$Process) {
  if ($Process -and -not $Process.HasExited) {
    [void]$Process.CloseMainWindow()
    if (-not $Process.WaitForExit(5000)) { Stop-Process -Id $Process.Id -Force }
  }
}

function Start-And-ProveResponsive([string]$Executable) {
  $process = Start-Process -FilePath $Executable -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 6
  if ($process.HasExited) { throw "Installed app exited before the upgrade launch check completed." }
  if (-not (Get-Process -Id $process.Id).Responding) { throw "Installed app did not become responsive." }
  return $process
}

function Write-Utf8Json([string]$Path, [object]$Value) {
  $json = $Value | ConvertTo-Json -Depth 100
  [IO.File]::WriteAllText($Path, "$json`n", [Text.UTF8Encoding]::new($false))
}

function Get-Sha256([string]$Path) {
  $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace("-", "")
  } finally {
    $algorithm.Dispose()
    $stream.Dispose()
  }
}

function Assert-SeedHashes([hashtable]$Expected) {
  foreach ($entry in $Expected.GetEnumerator()) {
    if (-not (Test-Path -LiteralPath $entry.Key)) { throw "Upgrade removed $($entry.Key)." }
    $actual = Get-Sha256 $entry.Key
    if ($actual -ne $entry.Value) { throw "Upgrade changed $($entry.Key)." }
  }
}

$existing = Get-VerseformRegistration
if ($existing) { throw "Refusing to replace an existing Verseform installation during upgrade testing." }

$app = $null
$installed = $false
$createdProfile = $false
$oldHttpProxy = $env:HTTP_PROXY
$oldHttpsProxy = $env:HTTPS_PROXY
$phase = "initialization"

try {
  $phase = "creating isolated test data"
  Write-Output "Upgrade smoke: $phase."
  New-Item -ItemType Directory -Force -Path $installDirectory, $documentDirectory | Out-Null
  Copy-Item -LiteralPath (Join-Path $projectRoot "tests\fixtures\formatted-v2.verseform.json") -Destination $userDocument

  $phase = "installing retained Alpha"
  Write-Output "Upgrade smoke: $phase."
  $alphaInstall = Start-Process -FilePath $previousInstaller -ArgumentList @("/S", "/D=$installDirectory") -Wait -PassThru -WindowStyle Hidden
  if ($alphaInstall.ExitCode -ne 0) { throw "Alpha installer exited with code $($alphaInstall.ExitCode)." }
  $installed = $true
  if (-not (Test-Path -LiteralPath $appExecutable)) { throw "Alpha executable was not found." }
  $phase = "validating Alpha registration"
  $alphaRegistration = Get-VerseformRegistration
  if (-not $alphaRegistration -or $alphaRegistration.DisplayVersion -ne "0.1.0") {
    throw "Expected Alpha registration was not found."
  }

  $phase = "seeding Alpha profile, recovery, and scripture cache"
  Write-Output "Upgrade smoke: $phase."
  $recoveryDirectory = Join-Path $profileRoot "recovery"
  $chapterDirectory = Join-Path $profileRoot "scripture-cache-v1\chapters"
  New-Item -ItemType Directory -Force -Path $recoveryDirectory, $chapterDirectory | Out-Null
  $createdProfile = $true
  $fixtureDocument = Get-Content -Raw -LiteralPath $userDocument | ConvertFrom-Json
  $profilePath = Join-Path $profileRoot "profile.json"
  $recoveryPath = Join-Path $recoveryDirectory "alpha-recovery.json"
  $catalogPath = Join-Path $profileRoot "scripture-cache-v1\catalog.json"
  $chapterPath = Join-Path $chapterDirectory "ENGNASB_JHN_3.json"
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  Write-Utf8Json $profilePath @{
    recentDocuments = @(@{
      path = $userDocument
      displayName = [IO.Path]::GetFileName($userDocument)
      lastOpenedAtMs = $now
    })
    preferredTranslation = "ENGNASB"
  }
  Write-Utf8Json $recoveryPath @{
    document = $fixtureDocument
    sourcePath = $null
    savedContentHash = "alpha-saved"
    contentHash = "alpha-recovery"
    capturedAtMs = $now
  }
  Write-Utf8Json $catalogPath @{
    fetchedAtMs = $now
    body = '[{"abbr":"ENGNASB","title":"New American Standard Bible"}]'
  }
  Write-Utf8Json $chapterPath @{
    fetchedAtMs = $now
    body = '[{"JN3.16":"For God so loved the world."}]'
  }

  $env:HTTP_PROXY = "http://127.0.0.1:9"
  $env:HTTPS_PROXY = "http://127.0.0.1:9"
  $phase = "launching Alpha offline"
  Write-Output "Upgrade smoke: $phase."
  $app = Start-And-ProveResponsive $appExecutable
  Stop-TestApp $app
  $app = $null

  $phase = "capturing the Alpha preservation baseline"
  $seedPaths = @($userDocument, $profilePath, $recoveryPath, $catalogPath, $chapterPath)
  $seedHashes = @{}
  foreach ($path in $seedPaths) { $seedHashes[$path] = Get-Sha256 $path }

  $phase = "installing Beta over Alpha"
  Write-Output "Upgrade smoke: $phase."
  $betaInstall = Start-Process -FilePath $installer -ArgumentList @("/S", "/D=$installDirectory") -Wait -PassThru -WindowStyle Hidden
  if ($betaInstall.ExitCode -ne 0) { throw "Beta installer exited with code $($betaInstall.ExitCode)." }
  if (-not (Test-Path -LiteralPath $appExecutable)) { throw "Beta executable was not found after upgrade." }
  $phase = "validating Beta registration"
  $betaRegistration = Get-VerseformRegistration
  if (-not $betaRegistration -or $betaRegistration.DisplayVersion -ne $version) {
    throw "Expected Beta registration was not found after upgrade."
  }
  $phase = "validating data immediately after upgrade"
  Assert-SeedHashes $seedHashes

  $phase = "launching upgraded Beta offline"
  Write-Output "Upgrade smoke: $phase."
  $app = Start-And-ProveResponsive $appExecutable
  Stop-TestApp $app
  $app = $null
  $phase = "validating data after Beta launch"
  Assert-SeedHashes $seedHashes

  $phase = "uninstalling upgraded Beta"
  Write-Output "Upgrade smoke: $phase."
  $uninstall = Start-Process -FilePath $uninstaller -ArgumentList "/S" -Wait -PassThru -WindowStyle Hidden
  if ($uninstall.ExitCode -ne 0) { throw "Beta uninstaller exited with code $($uninstall.ExitCode)." }
  $installed = $false
  if (Test-Path -LiteralPath $appExecutable) { throw "Uninstall left the upgraded executable behind." }
  if (Get-VerseformRegistration) { throw "Uninstall left the upgraded Windows registration behind." }
  $phase = "validating data after uninstall"
  Assert-SeedHashes $seedHashes
} catch {
  $failureMessage = "Upgrade smoke failed during ${phase}: $($_.Exception.Message)"
  if ($env:GITHUB_ACTIONS) {
    $escaped = $failureMessage.Replace("%", "%25").Replace("`r", "%0D").Replace("`n", "%0A")
    Write-Output "::error title=Alpha-to-Beta upgrade failed::$escaped"
  }
  throw $failureMessage
} finally {
  $env:HTTP_PROXY = $oldHttpProxy
  $env:HTTPS_PROXY = $oldHttpsProxy
  Stop-TestApp $app
  if ($installed -and (Test-Path -LiteralPath $uninstaller)) {
    $cleanup = Start-Process -FilePath $uninstaller -ArgumentList "/S" -Wait -PassThru -WindowStyle Hidden
    if ($cleanup.ExitCode -ne 0) { Write-Warning "Upgrade-test cleanup uninstaller exited with code $($cleanup.ExitCode)." }
  }
  if ($createdProfile -and (Test-Path -LiteralPath $profileRoot)) {
    if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($profileRoot)) -ne $localDataRoot) {
      throw "Refusing to clean an unexpected profile path."
    }
    Remove-Item -LiteralPath $profileRoot -Recurse -Force
  }
}

Write-Output "Upgrade smoke passed: Alpha install, seeded document/profile/recovery/cache preservation, Beta upgrade, offline launch, uninstall, and user-data preservation."
