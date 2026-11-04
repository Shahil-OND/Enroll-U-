# build_lambdas.ps1
# Script to build and package Python Lambdas and Layers locally without Docker for Windows users.

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Resolve-Path (Join-Path $scriptDir "..")
$buildDir = Join-Path $rootDir "build"
$lambdasSrcDir = Join-Path $rootDir "lambdas"
$layersSrcDir = Join-Path $rootDir "layers"

Write-Host "Cleaning up build directory: $buildDir" -ForegroundColor Cyan
if (Test-Path $buildDir) {
    Remove-Item -Recurse -Force $buildDir
}
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

# 1. Package Shared Layers (layers/common -> build/layers/common/python/)
Write-Host "Packaging Layer: common" -ForegroundColor Cyan
$layerDest = Join-Path $buildDir "layers\common\python"
New-Item -ItemType Directory -Force -Path $layerDest | Out-Null

# Copy layer sources
Copy-Item -Path (Join-Path $layersSrcDir "common\*") -Destination $layerDest -Recurse -Force

# Install dependencies if requirements.txt has entries
$layerReqs = Join-Path $layersSrcDir "common\requirements.txt"
if (Test-Path $layerReqs) {
    $reqContent = Get-Content $layerReqs | Out-String
    if ($reqContent.Trim() -and $reqContent -notmatch '^#\s*TODO') {
        Write-Host "Installing dependencies for layer: common" -ForegroundColor Yellow
        python -m pip install -r $layerReqs -t $layerDest --only-binary=:all: --platform manylinux2014_x86_64 --implementation cp --python-version 312 --upgrade
    }
}

# 2. Package Lambda Functions
$lambdaDirs = Get-ChildItem -Directory -Path $lambdasSrcDir
foreach ($dir in $lambdaDirs) {
    $name = $dir.Name
    Write-Host "Packaging Lambda Function: $name" -ForegroundColor Cyan
    $dest = Join-Path $buildDir "lambdas\$name"
    New-Item -ItemType Directory -Force -Path $dest | Out-Null

    # Copy function sources
    Copy-Item -Path (Join-Path $dir.FullName "\*") -Destination $dest -Recurse -Force

    # Install dependencies if requirements.txt has entries
    $reqFile = Join-Path $dir.FullName "requirements.txt"
    if (Test-Path $reqFile) {
        $reqContent = Get-Content $reqFile | Out-String
        if ($reqContent.Trim() -and $reqContent -notmatch '^\s*#\s*(TODO)?\s*$') {
            Write-Host "Installing dependencies for Lambda: $name" -ForegroundColor Yellow
            python -m pip install -r $reqFile -t $dest --only-binary=:all: --platform manylinux2014_x86_64 --implementation cp --python-version 312 --upgrade
        }
    }
}

Write-Host "Lambdas and Layers build completed successfully!" -ForegroundColor Green
