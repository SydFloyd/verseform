param(
  [string]$ManifestPath,
  [string]$OutputDirectory
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $ManifestPath) {
  $ManifestPath = Join-Path $projectRoot ".github\release-baselines\v0.1.0.json"
}
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $projectRoot "artifacts\alpha"
}

$manifestFile = (Resolve-Path -LiteralPath $ManifestPath).Path
$manifest = Get-Content -Raw -LiteralPath $manifestFile | ConvertFrom-Json
$uri = [Uri]$manifest.installer.url
if ($uri.Scheme -ne "https" -or $uri.Host -ne "github.com") {
  throw "The upgrade baseline must use an HTTPS github.com release URL."
}
if ($manifest.installer.signed -ne $false) {
  throw "The recorded Alpha baseline must remain explicitly unsigned."
}

$expectedHash = ([string]$manifest.installer.sha256).ToLowerInvariant()
$expectedSize = [long]$manifest.installer.size
if ($expectedHash -notmatch "^[0-9a-f]{64}$" -or $expectedSize -le 0) {
  throw "The upgrade baseline manifest has invalid integrity metadata."
}

$directory = New-Item -ItemType Directory -Force -Path $OutputDirectory
$destination = Join-Path $directory.FullName ([string]$manifest.installer.name)
$temporary = "$destination.download-$PID"

try {
  Invoke-WebRequest -Uri $uri.AbsoluteUri -OutFile $temporary
  $download = Get-Item -LiteralPath $temporary
  $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $temporary).Hash.ToLowerInvariant()
  if ($download.Length -ne $expectedSize) {
    throw "Alpha baseline size mismatch: expected $expectedSize bytes, received $($download.Length)."
  }
  if ($actualHash -ne $expectedHash) {
    throw "Alpha baseline SHA-256 mismatch."
  }
  Move-Item -LiteralPath $temporary -Destination $destination -Force
} finally {
  if (Test-Path -LiteralPath $temporary) {
    Remove-Item -LiteralPath $temporary -Force
  }
}

Write-Output "Verified durable Alpha $($manifest.version) baseline: $destination ($expectedHash)."
