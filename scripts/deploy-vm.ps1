[CmdletBinding()]
param(
    [string]$VmHost = "192.168.40.139",
    [string]$VmUser = "blank",
    [string]$VmHostKey = "ssh-ed25519 255 SHA256:4GFn6mkWmDDgLoSQiZwz8aY0P6CFM8hHlDn/Vbj1llM",
    [string]$RemoteHome = "/home/blank",
    [string]$RemoteAppDir = "/home/blank/socialsecure",
    [string]$Pm2App = "socialsecure",
    [string]$ArtifactPrefix = "news-feed-local-fix",
    [switch]$KeepLocalArtifact
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-CommandExists {
    param([Parameter(Mandatory = $true)][string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

function Resolve-Password {
    if ($env:SOCIALSECURE_VM_PASSWORD) {
        return $env:SOCIALSECURE_VM_PASSWORD
    }

    $secure = Read-Host "Enter VM password for $VmUser@$VmHost" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

Assert-CommandExists -Name "tar"
Assert-CommandExists -Name "pscp"
Assert-CommandExists -Name "plink"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot

try {
    $password = Resolve-Password
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $artifactName = "$ArtifactPrefix-$stamp.tgz"

    Write-Host "[1/3] Packaging local workspace into $artifactName ..."
    $tarArgs = @(
        "-czf", $artifactName,
        "--exclude=.git",
        "--exclude=node_modules",
        "--exclude=frontend/node_modules",
        "--exclude=frontend/build",
        "--exclude=*.tgz",
        "."
    )
    & tar @tarArgs
    if ($LASTEXITCODE -ne 0) {
        throw "tar failed with exit code $LASTEXITCODE"
    }

    Write-Host "[2/3] Uploading artifact to $VmUser@$VmHost ..."
    & pscp -batch -hostkey $VmHostKey -pw $password $artifactName "${VmUser}@${VmHost}:$RemoteHome/"
    if ($LASTEXITCODE -ne 0) {
        throw "pscp failed with exit code $LASTEXITCODE"
    }

    Write-Host "[3/3] Deploying on VM and restarting pm2 app '$Pm2App' ..."
    $remoteCommands = @(
        "set -e",
        "mkdir -p '$RemoteAppDir'",
        "tar -xzf '$RemoteHome/$artifactName' -C '$RemoteAppDir'",
        "cd '$RemoteAppDir'",
        "npm install --omit=dev",
        "npm --prefix frontend install",
        "npm --prefix frontend run build",
        "pm2 restart '$Pm2App' --update-env",
        "pm2 save",
        "sleep 2",
        "echo PM2_STATUS",
        "pm2 ls",
        "echo HEALTH_CHECK",
        "curl -sS http://127.0.0.1:5000/health"
    ) -join "; "

    & plink -batch -hostkey $VmHostKey -pw $password "$VmUser@$VmHost" $remoteCommands
    if ($LASTEXITCODE -ne 0) {
        throw "plink deploy failed with exit code $LASTEXITCODE"
    }

    Write-Host "Deployment complete."
}
finally {
    Pop-Location

    if (-not $KeepLocalArtifact) {
        Get-ChildItem -Path "$repoRoot\$ArtifactPrefix-*.tgz" -File -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Select-Object -Skip 1 |
            Remove-Item -Force -ErrorAction SilentlyContinue
    }
}
