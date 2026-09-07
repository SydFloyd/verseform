$ErrorActionPreference = 'Stop'

# Load only the readiness function: these checks must never install or uninstall an app.
$sourcePath = Join-Path $PSScriptRoot '../scripts/smoke-upgrade.ps1'
$parseErrors = $null
$tokens = $null
$source = [System.Management.Automation.Language.Parser]::ParseFile($sourcePath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw 'The upgrade smoke script has syntax errors.' }
$definition = $source.Find({ param($node)
  $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Start-And-ProveResponsive'
}, $true)
if (-not $definition) { throw 'The upgrade readiness function is missing.' }
. ([ScriptBlock]::Create($definition.Extent.Text))

# Replace process/clock boundaries so delayed startup and permanent hangs are deterministic.
function Start-Process([string]$FilePath, [switch]$PassThru, [string]$WindowStyle) {
  if ($WindowStyle -ne 'Hidden') { throw 'Test processes must remain hidden.' }
  return $script:testProcess
}
function Start-Sleep([int]$Seconds) {
  $script:observedSeconds += $Seconds
  $script:testProcess.HasExited = $script:observedSeconds -ge $script:exitAt
}
function Get-Process([int]$Id) {
  return [pscustomobject]@{ Responding = $script:observedSeconds -ge $script:responsiveAt }
}
function Stop-TestApp($Process) { $script:stopped = $true }

function Assert-ReadinessCase([int]$ReadyAt, [int]$ExitAt, [int]$ExpectedSeconds, [string]$ExpectedError) {
  $script:observedSeconds = 0
  $script:responsiveAt = $ReadyAt
  $script:exitAt = $ExitAt
  $script:stopped = $false
  $script:testProcess = [pscustomobject]@{ Id = 123; HasExited = $false }
  $failure = $null
  $result = $null
  try { $result = Start-And-ProveResponsive 'unused-test-path.exe' }
  catch { $failure = $_.Exception.Message }
  if ($script:observedSeconds -ne $ExpectedSeconds) { throw "Unexpected observation time: $script:observedSeconds." }
  if ($ExpectedError) {
    if (-not $failure -or -not $failure.Contains($ExpectedError)) { throw "Expected failure '$ExpectedError', received '$failure'." }
    if (-not $script:stopped -or $result) { throw 'Failed startup must clean up the process without returning it.' }
  } else {
    if ($failure -or -not [object]::ReferenceEquals($result, $script:testProcess) -or $script:stopped) {
      throw "Responsive startup did not return the exact live process: $failure"
    }
  }
}

Assert-ReadinessCase -ReadyAt 1 -ExitAt 100 -ExpectedSeconds 6
Assert-ReadinessCase -ReadyAt 9 -ExitAt 100 -ExpectedSeconds 9
Assert-ReadinessCase -ReadyAt 100 -ExitAt 100 -ExpectedSeconds 30 -ExpectedError 'within 30 seconds'
Assert-ReadinessCase -ReadyAt 100 -ExitAt 3 -ExpectedSeconds 3 -ExpectedError 'exited before'
Write-Output 'Installer readiness passed: initial observation, delayed readiness, timeout cleanup, and early-exit cleanup.'
