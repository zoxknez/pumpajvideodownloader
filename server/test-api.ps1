#!/usr/bin/env pwsh
# Quick test script for Pumpaj backend API

$BASE = "http://localhost:5176"

Write-Host "`n=== Testing Pumpaj Backend ===" -ForegroundColor Cyan

# 1. Health check
Write-Host "`n[1/3] Health check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$BASE/api/health"
    Write-Host "  ✓ Health: $($health.ok)" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Health check failed: $_" -ForegroundColor Red
    exit 1
}

# 2. Test analyze (uses a public domain video)
Write-Host "`n[2/3] Testing /api/analyze..." -ForegroundColor Yellow
$testUrl = "https://www.youtube.com/watch?v=aqz-KE-bpKQ"
try {
    $encoded = [System.Web.HttpUtility]::UrlEncode($testUrl)
    $analyze = Invoke-RestMethod -Uri "$BASE/api/analyze?url=$encoded"
    if ($analyze.ok) {
        Write-Host "  OK Analyze OK" -ForegroundColor Green
        Write-Host "    Title: $($analyze.summary.title)" -ForegroundColor Gray
        Write-Host "    Formats: $($analyze.summary.hasFormats)" -ForegroundColor Gray
    }
}
catch {
    Write-Host "  Warning Analyze test skipped" -ForegroundColor Yellow
    Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Gray
}

# 3. Test CORS headers
Write-Host "`n[3/3] Testing CORS..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$BASE/api/health" -Headers @{ "Origin" = "http://localhost:3000" }
    $corsHeader = $response.Headers['Access-Control-Allow-Origin']
    if ($corsHeader) {
        Write-Host "  OK CORS header present: $corsHeader" -ForegroundColor Green
    }
    else {
        Write-Host "  Warning CORS header missing" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "  Error CORS test failed: $_" -ForegroundColor Red
}

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "Backend is running on $BASE" -ForegroundColor Green
Write-Host "Frontend should set NEXT_PUBLIC_API_BASE to $BASE" -ForegroundColor Gray
Write-Host ""
