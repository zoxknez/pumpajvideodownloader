# Run from repo root: powershell -ExecutionPolicy Bypass -File tools\clean.ps1
$ErrorActionPreference = 'SilentlyContinue'

# Frontend dist
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue .\dist

# Server build & logs
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue .\server\dist
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue .\server\logs

# Temp files
Get-ChildItem -Recurse -Include *.log,*.tmp,*.bak | Remove-Item -Force -ErrorAction SilentlyContinue
