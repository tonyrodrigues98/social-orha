[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$queryFile = Join-Path $PSScriptRoot 'supabase-validate.sql'
$queryText = Get-Content -LiteralPath $queryFile -Raw

if ($queryText -notmatch '(?is)^\s*--.*?begin\s+transaction\s+read\s+only\s*;') {
    throw 'Validation query must start a READ ONLY transaction.'
}

if ($queryText -match '(?im)^\s*(insert|update|delete|merge|truncate|alter|create|drop|grant|revoke|comment|copy|call|do|vacuum|reindex|cluster)\b') {
    throw 'Validation query contains a forbidden mutating statement.'
}

Push-Location -LiteralPath $repositoryRoot
try {
    Write-Output 'Migration parity (read-only):'
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & npx.cmd supabase migration list --linked 2>$null
        $migrationExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($migrationExitCode -ne 0) {
        throw "Unable to list linked migrations; exit code $migrationExitCode."
    }

    Write-Output 'Release checks (read-only):'
    $ErrorActionPreference = 'Continue'
    try {
        $rawResult = & npx.cmd supabase db query --linked --file $queryFile --output json 2>$null
        $queryExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($queryExitCode -ne 0) {
        throw "Supabase validation failed with exit code $queryExitCode."
    }

    $result = ($rawResult -join [Environment]::NewLine) | ConvertFrom-Json
    $rows = @($result.rows)
    $rows | Format-Table -AutoSize check_name, passed, details | Out-Host

    $failedChecks = @($rows | Where-Object { -not $_.passed })
    if ($failedChecks.Count -gt 0) {
        Write-Error "$($failedChecks.Count) Supabase release check(s) failed. No changes were made." -ErrorAction Continue
        exit 2
    }

    Write-Output 'All Supabase release checks passed. No changes were made.'
} finally {
    Pop-Location
}
