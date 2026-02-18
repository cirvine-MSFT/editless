#!/usr/bin/env pwsh
<#
.SYNOPSIS
Create a git worktree for an issue and launch an isolated VS Code instance.

.DESCRIPTION
One-command workflow for EditLess feature development:
1. Creates a git worktree at ../editless.wt/{slug} (relative to the main clone)
2. Checks out branch squad/{issue}-{slug}
3. Runs npm install + npm run build (unless -NoBuild)
4. Launches VS Code with isolation flags so your daily driver stays clean

Works from either the main clone or an existing worktree.

.PARAMETER Issue
GitHub issue number (required).

.PARAMETER Slug
Branch slug (kebab-case). If omitted, auto-generated from the issue title via gh CLI.

.PARAMETER Profile
VS Code profile name for lighter isolation (uses --profile instead of --user-data-dir).
Defaults to "Dev". Pass "" or $null to use --user-data-dir instead.

.PARAMETER Clean
Nuke the .editless-dev/ directory in the worktree before launching.

.PARAMETER NoBuild
Skip npm install and npm run build. Use when re-entering an existing worktree.

.EXAMPLE
.\scripts\dev-worktree.ps1 -Issue 42

.EXAMPLE
.\scripts\dev-worktree.ps1 -Issue 42 -Slug "fix-auth-timeout"

.EXAMPLE
.\scripts\dev-worktree.ps1 -Issue 42 -Profile "Dev"

.EXAMPLE
.\scripts\dev-worktree.ps1 -Issue 42 -NoBuild

.EXAMPLE
.\scripts\dev-worktree.ps1 -Issue 42 -Clean
#>

param(
    [Parameter(Mandatory)]
    [int]$Issue,

    [string]$Slug,

    [string]$Profile = "Dev",

    [switch]$Clean,

    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"

# --- Resolve the main clone root ---
# Works whether invoked from the main clone, a worktree, or via scripts/ path.
function Find-MainCloneRoot {
    $scriptDir = $PSScriptRoot
    if (-not $scriptDir) { $scriptDir = Get-Location }

    # Walk up to find the git dir
    $candidate = Split-Path -Parent $scriptDir  # one level up from scripts/
    $gitDir = Join-Path $candidate ".git"

    if (Test-Path $gitDir) {
        # .git could be a file (worktree) or a directory (main clone)
        $item = Get-Item $gitDir -Force
        if ($item.PSIsContainer) {
            return $candidate  # main clone
        }
        # It's a worktree — .git file contains "gitdir: <path>"
        $content = (Get-Content $gitDir -Raw).Trim()
        if ($content -match 'gitdir:\s*(.+)') {
            $linkedGitDir = $Matches[1].Trim()
            # Resolve relative paths
            if (-not [System.IO.Path]::IsPathRooted($linkedGitDir)) {
                $linkedGitDir = Join-Path $candidate $linkedGitDir
            }
            # The linked gitdir is usually <main-clone>/.git/worktrees/<name>
            $mainGit = Split-Path (Split-Path $linkedGitDir -Parent) -Parent
            $mainRoot = Split-Path $mainGit -Parent
            if (Test-Path (Join-Path $mainRoot ".git")) {
                return $mainRoot
            }
        }
    }

    Write-Error "Could not locate the main git clone. Run this from the editless repo or a worktree."
    exit 1
}

$mainClone = Find-MainCloneRoot
$worktreeParent = Join-Path (Split-Path $mainClone -Parent) "editless.wt"

Write-Host "📍 Main clone: $mainClone" -ForegroundColor DarkGray
Write-Host "📍 Worktree parent: $worktreeParent" -ForegroundColor DarkGray

# --- Resolve slug from issue title if not provided ---
if (-not $Slug) {
    Write-Host "🔍 Fetching issue #$Issue title..." -ForegroundColor Cyan
    try {
        $title = & gh issue view $Issue --repo cirvine-MSFT/editless --json title --jq ".title" 2>&1
        if ($LASTEXITCODE -ne 0) { throw "gh failed: $title" }
        # Convert to kebab-case: lowercase, replace non-alphanumeric with dashes, trim
        $Slug = ($title.ToLower() -replace '[^a-z0-9]+', '-').Trim('-')
        # Cap length to keep branch names manageable
        if ($Slug.Length -gt 50) { $Slug = $Slug.Substring(0, 50).TrimEnd('-') }
        Write-Host "   Slug: $Slug" -ForegroundColor DarkGray
    }
    catch {
        Write-Error "Failed to fetch issue title. Provide -Slug manually or check gh auth."
        exit 1
    }
}

$branchName = "squad/$Issue-$Slug"
$worktreePath = Join-Path $worktreeParent $Slug

# --- Create worktree if it doesn't already exist ---
if (Test-Path $worktreePath) {
    Write-Host "✅ Worktree already exists: $worktreePath" -ForegroundColor Green
}
else {
    Write-Host "🌳 Creating worktree..." -ForegroundColor Cyan
    Write-Host "   Path:   $worktreePath" -ForegroundColor DarkGray
    Write-Host "   Branch: $branchName" -ForegroundColor DarkGray

    if (-not (Test-Path $worktreeParent)) {
        New-Item -Path $worktreeParent -ItemType Directory -Force | Out-Null
    }

    # Create the worktree with a new branch off main
    Push-Location $mainClone
    try {
        git worktree add $worktreePath -b $branchName origin/main 2>&1 | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkGray }
        if ($LASTEXITCODE -ne 0) {
            # Branch may already exist — try without -b
            Write-Host "   Branch may already exist, trying checkout..." -ForegroundColor Yellow
            git worktree add $worktreePath $branchName 2>&1 | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkGray }
            if ($LASTEXITCODE -ne 0) {
                Write-Error "Failed to create worktree."
                exit 1
            }
        }
    }
    finally {
        Pop-Location
    }
    Write-Host "✅ Worktree created" -ForegroundColor Green
}

# --- Clean if requested ---
$devDir = Join-Path $worktreePath ".editless-dev"
if ($Clean -and (Test-Path $devDir)) {
    Write-Host "🧹 Cleaning .editless-dev/..." -ForegroundColor Cyan
    Remove-Item -Path $devDir -Recurse -Force
}

# --- Install dependencies and build ---
if (-not $NoBuild) {
    Push-Location $worktreePath
    try {
        Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
        npm install --no-audit --no-fund 2>&1 | Select-Object -Last 3 | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkGray }
        if ($LASTEXITCODE -ne 0) {
            Write-Error "npm install failed."
            exit 1
        }

        Write-Host "🔨 Building extension..." -ForegroundColor Cyan
        npm run build 2>&1 | Select-Object -Last 3 | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkGray }
        if ($LASTEXITCODE -ne 0) {
            Write-Error "npm run build failed."
            exit 1
        }
        Write-Host "✅ Build complete" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Host "⏭️  Skipping install/build (-NoBuild)" -ForegroundColor Yellow
}

# --- Launch VS Code ---
Write-Host ""
Write-Host "🚀 Launching VS Code..." -ForegroundColor Green
Write-Host "   Workspace: $worktreePath" -ForegroundColor DarkGray

$codeArgs = @()

if ($Profile) {
    Write-Host "   Profile:   $Profile" -ForegroundColor DarkGray
    $codeArgs += "--profile"
    $codeArgs += $Profile
}
else {
    $userDataDir = Join-Path $devDir "user-data"
    if (-not (Test-Path $userDataDir)) {
        New-Item -Path $userDataDir -ItemType Directory -Force | Out-Null
    }
    Write-Host "   User data: $userDataDir" -ForegroundColor DarkGray
    $codeArgs += "--user-data-dir=$userDataDir"
}

$codeArgs += "--disable-extensions"
$codeArgs += "--extensionDevelopmentPath=$worktreePath"
$codeArgs += $worktreePath

& code @codeArgs

Write-Host ""
Write-Host "✅ Done. VS Code launched for issue #$Issue ($branchName)" -ForegroundColor Green
Write-Host "   To re-enter without rebuilding: .\scripts\dev-worktree.ps1 -Issue $Issue -Slug `"$Slug`" -NoBuild" -ForegroundColor DarkGray
