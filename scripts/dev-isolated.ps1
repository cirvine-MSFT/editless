#!/usr/bin/env pwsh
<#
.SYNOPSIS
Launch VS Code with an isolated development environment for EditLess extension testing.

.DESCRIPTION
Creates an isolated VS Code environment with its own user data and extensions directories.
This ensures a clean slate for testing extension behavior without interference from your
personal VS Code configuration, settings, or other installed extensions.

The isolation strategy:
- User data (settings, keybindings, state) → .editless-dev/user-data/
- Extensions (other extensions are disabled) → system default, but --disable-extensions flag used
- EditLess extension → loaded from dist/ via --extensionDevelopmentPath

This is particularly useful for:
- Testing first-run experience
- Reproducing bugs in clean environments
- Verifying extension activation and settings defaults
- Ensuring no conflicts with other extensions

.PARAMETER Clean
Reset the isolated environment by deleting .editless-dev/ before launching.

.EXAMPLE
.\scripts\dev-isolated.ps1
Launch VS Code with isolated dev environment (preserves existing state).

.EXAMPLE
.\scripts\dev-isolated.ps1 -Clean
Reset the isolated environment and launch fresh.
#>

param(
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $PSScriptRoot
$devDir = Join-Path $rootDir ".editless-dev"
$userDataDir = Join-Path $devDir "user-data"
$distDir = Join-Path $rootDir "dist"

# Ensure the extension is built
if (-not (Test-Path $distDir)) {
    Write-Host "⚠️  Extension not built. Run 'npm run build' first." -ForegroundColor Yellow
    exit 1
}

# Clean the isolated environment if requested
if ($Clean -and (Test-Path $devDir)) {
    Write-Host "🧹 Cleaning isolated environment..." -ForegroundColor Cyan
    Remove-Item -Path $devDir -Recurse -Force
}

# Create isolated directories
if (-not (Test-Path $userDataDir)) {
    Write-Host "📁 Creating isolated user data directory..." -ForegroundColor Cyan
    New-Item -Path $userDataDir -ItemType Directory -Force | Out-Null
}

Write-Host "🚀 Launching VS Code with isolated dev environment..." -ForegroundColor Green
Write-Host "   User data: $userDataDir" -ForegroundColor DarkGray
Write-Host "   Extension: $rootDir" -ForegroundColor DarkGray
Write-Host ""

# Launch VS Code with isolated environment
& code `
    --user-data-dir=$userDataDir `
    --disable-extensions `
    --extensionDevelopmentPath=$rootDir

Write-Host "✅ VS Code launched. Close this terminal when done testing." -ForegroundColor Green
