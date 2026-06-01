param(
  [switch]$SkipInstall,
  [switch]$NoForceSync,
  [string]$NodeMajor = "24"
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "== $Message =="
}

function Resolve-RepoRoot {
  $scriptDir = Split-Path -Parent $PSCommandPath
  return (Resolve-Path (Join-Path $scriptDir "..")).Path
}

function Add-SevenZipToPath {
  $existing = Get-Command 7zz, 7z -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($existing) {
    Write-Host "7-Zip: $($existing.Source)"
    return
  }

  $candidates = @(
    "C:\Program Files\7-Zip",
    "C:\Program Files (x86)\7-Zip"
  )

  foreach ($dir in $candidates) {
    $sevenZip = Join-Path $dir "7z.exe"
    if (Test-Path -LiteralPath $sevenZip) {
      $env:Path = "$dir;$env:Path"
      Write-Host "7-Zip added to PATH: $sevenZip"
      return
    }
  }

  throw "7-Zip was not found. Install 7-Zip or add 7z.exe/7zz.exe to PATH."
}

function Use-NvmNodeForThisProcess {
  param([string]$Major)

  if (-not $env:NVM_HOME) {
    Write-Warning "NVM_HOME is not set; using Node from PATH."
    return
  }

  $versionDir = Get-ChildItem -LiteralPath $env:NVM_HOME -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match "^v$([regex]::Escape($Major))\." } |
    Sort-Object Name -Descending |
    Select-Object -First 1

  if (-not $versionDir) {
    Write-Warning "Node.js $Major is not installed under NVM_HOME. Install it with: nvm install $Major 64"
    return
  }

  $env:Path = "$($versionDir.FullName);$env:Path"
  Write-Host "Node for this process: $($versionDir.FullName)"
}

function Invoke-Checked {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )

  Write-Host "> $FilePath $($Arguments -join ' ')"
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE`: $FilePath $($Arguments -join ' ')"
  }
}

$repoRoot = Resolve-RepoRoot
Set-Location $repoRoot

Write-Step "Prerequisites"
Use-NvmNodeForThisProcess $NodeMajor
$nodeVersion = (node --version)
$npmVersion = (npm --version)
Write-Host "Node: $nodeVersion"
Write-Host "npm:  $npmVersion"
if ($nodeVersion -notmatch "^v$([regex]::Escape($NodeMajor))\.") {
  Write-Warning "CI uses Node.js $NodeMajor. Current Node is $nodeVersion; repack may still work, but Node $NodeMajor is preferred."
}
Add-SevenZipToPath

if (-not $SkipInstall) {
  Write-Step "Install npm dependencies"
  Invoke-Checked "npm" @("install")
} else {
  Write-Step "Install npm dependencies"
  Write-Host "Skipped by -SkipInstall"
}

Write-Step "Sync Windows upstream resources"
$syncArgs = @("scripts/sync-upstream.js", "--skip-mac")
if (-not $NoForceSync) {
  $syncArgs += "--force"
}
Invoke-Checked "node" $syncArgs

Write-Step "Apply Windows patches"
Invoke-Checked "npm" @("run", "patch:win")

Write-Step "Build Windows artifact"
Invoke-Checked "npm" @("run", "build:win-x64")

Write-Step "Artifacts"
if (Test-Path -LiteralPath "out") {
  Get-ChildItem -LiteralPath "out" -File -Filter "*.zip" |
    Sort-Object FullName |
    Select-Object FullName, Length, LastWriteTime |
    Format-Table -AutoSize

  $appDir = Join-Path $repoRoot "out\win\Codex-win32-x64"
  if (Test-Path -LiteralPath $appDir) {
    $fileCount = (Get-ChildItem -LiteralPath $appDir -Recurse -File | Measure-Object).Count
    Write-Host "Expanded app directory: $appDir ($fileCount files)"
  }
} else {
  Write-Warning "No out/ directory was produced."
}
