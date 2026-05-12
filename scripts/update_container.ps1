param(
  [string]$Branch = "cursor/match-map-page-4aca"
)

$ErrorActionPreference = "Stop"

git pull --ff-only origin $Branch
docker compose build --pull owbanpickwebsite
docker compose up -d owbanpickwebsite

Write-Host "Updated and started owbanpickwebsite at http://127.0.0.1:5175/A"
