# Liest .maestro/.env und startet Maestro mit den richtigen --env Flags
param(
  [string]$Flow = ".maestro\flows"
)

$envFile = ".maestro\.env"
$envArgs = @()

Get-Content $envFile | Where-Object { $_ -notmatch '^\s*#' -and $_ -match '=' } | ForEach-Object {
  $envArgs += "--env"
  $envArgs += $_.Trim()
}

maestro test $Flow @envArgs
