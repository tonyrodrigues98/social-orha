[CmdletBinding()]
param(
    [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$queryFile = Join-Path $PSScriptRoot 'supabase-snapshot.sql'
$queryText = Get-Content -LiteralPath $queryFile -Raw

if ($queryText -notmatch '(?is)^\s*--.*?begin\s+transaction\s+read\s+only\s*;') {
    throw 'Snapshot query must start a READ ONLY transaction.'
}

if ($queryText -match '(?im)^\s*(insert|update|delete|merge|truncate|alter|create|drop|grant|revoke|comment|copy|call|do|vacuum|reindex|cluster)\b') {
    throw 'Snapshot query contains a forbidden mutating statement.'
}

Push-Location -LiteralPath $repositoryRoot
try {
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & npx.cmd supabase db query --linked --file $queryFile --output json 2>$null
        $nativeExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($nativeExitCode -ne 0) {
        throw "Supabase snapshot failed with exit code $nativeExitCode."
    }

    $serialized = $output -join [Environment]::NewLine
    if ([string]::IsNullOrWhiteSpace($OutputPath)) {
        Write-Output $serialized
        return
    }

    $absoluteOutputPath = if ([IO.Path]::IsPathRooted($OutputPath)) {
        [IO.Path]::GetFullPath($OutputPath)
    } else {
        [IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputPath))
    }

    $outputDirectory = Split-Path -Parent $absoluteOutputPath
    if (-not (Test-Path -LiteralPath $outputDirectory)) {
        New-Item -ItemType Directory -Path $outputDirectory | Out-Null
    }

    [IO.File]::WriteAllText($absoluteOutputPath, $serialized, [Text.UTF8Encoding]::new($false))
    Write-Output "Metadata snapshot written to $absoluteOutputPath"
} finally {
    Pop-Location
}
