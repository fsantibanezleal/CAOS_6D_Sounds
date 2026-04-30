# Auralis -- local dev runner (Windows / PowerShell 5.1+)
# ASCII-only string literals (PS 5.1 reads .ps1 as CP-1252 without a UTF-8 BOM;
# em-dashes / arrows in strings can silently terminate them).

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet("dev", "build", "preview", "ingest", "seed", "clean", "stop", "help")]
    [string]$Command = "help"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Show-Help {
    Write-Host ""
    Write-Host "Auralis -- local dev runner" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Subcommands:"
    Write-Host "  dev       Start backend (uvicorn :8104) + frontend dev server (Vite :5173)"
    Write-Host "  build     Build the frontend bundle into frontend/dist"
    Write-Host "  preview   Build the frontend then run the FastAPI server alone"
    Write-Host "  ingest    Run the data pipeline (extract features + embeddings + manifest)"
    Write-Host "  seed      Generate synthetic seed clips and run ingest"
    Write-Host "  clean     Remove build outputs and caches"
    Write-Host "  stop      Kill local Python and Node processes started by 'dev'"
    Write-Host "  help      Show this message"
    Write-Host ""
    Write-Host "Equivalents in bash: scripts/local.sh <subcommand>"
}

function Ensure-Venv {
    if (-not (Test-Path ".venv")) {
        Write-Host "Creating .venv ..." -ForegroundColor DarkGray
        python -m venv .venv
    }
    & .\.venv\Scripts\python.exe -m pip install --upgrade pip wheel | Out-Null
    & .\.venv\Scripts\python.exe -m pip install -r requirements.txt | Out-Null
}

function Ensure-PipelineVenv {
    if (-not (Test-Path ".venv-pipeline")) {
        Write-Host "Creating .venv-pipeline ..." -ForegroundColor DarkGray
        python -m venv .venv-pipeline
    }
    & .\.venv-pipeline\Scripts\python.exe -m pip install --upgrade pip wheel | Out-Null
    & .\.venv-pipeline\Scripts\python.exe -m pip install -r data-pipeline\requirements.txt | Out-Null
}

function Ensure-Frontend {
    if (-not (Test-Path "frontend\node_modules")) {
        Push-Location frontend
        try {
            $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
            if ($pnpm) { pnpm install } else { npm install }
        } finally { Pop-Location }
    }
}

switch ($Command) {
    "dev" {
        Ensure-Venv
        Ensure-Frontend
        Write-Host "[backend] uvicorn :8104  (in background)" -ForegroundColor Green
        $back = Start-Process -PassThru -NoNewWindow -FilePath ".\.venv\Scripts\python.exe" `
            -ArgumentList "-m","uvicorn","app.main:app","--reload","--host","127.0.0.1","--port","8104"
        Start-Sleep -Seconds 1
        Push-Location frontend
        try {
            $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
            if ($pnpm) { pnpm dev } else { npm run dev }
        } finally {
            Pop-Location
            if ($back -and -not $back.HasExited) { Stop-Process -Id $back.Id -Force }
        }
    }

    "build" {
        Ensure-Frontend
        Push-Location frontend
        try {
            $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
            if ($pnpm) { pnpm build } else { npm run build }
        } finally { Pop-Location }
    }

    "preview" {
        Ensure-Venv
        & "$PSCommandPath" build
        Write-Host "Backend serving the built SPA at http://127.0.0.1:8104" -ForegroundColor Green
        & .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8104
    }

    "ingest" {
        Ensure-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\ingest.py
    }

    "seed" {
        Ensure-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\synthetic_seeds.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\ingest.py --seed-synthetic
    }

    "clean" {
        Get-ChildItem -Recurse -Force -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force
        if (Test-Path "frontend\dist") { Remove-Item -Recurse -Force "frontend\dist" }
        if (Test-Path "frontend\.vite") { Remove-Item -Recurse -Force "frontend\.vite" }
        Write-Host "Cleaned build outputs." -ForegroundColor Green
    }

    "stop" {
        Get-Process -Name "uvicorn","python","node","pnpm","npm" -ErrorAction SilentlyContinue |
            Where-Object { $_.MainWindowTitle -match "auralis" -or $_.Path -match "_CAOS_6D_Sounds" } |
            ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
        Write-Host "Stopped local dev processes." -ForegroundColor Green
    }

    default { Show-Help }
}
