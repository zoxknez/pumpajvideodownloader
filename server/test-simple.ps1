# Quick test for Pumpaj API
$BASE = "http://localhost:5176"

Write-Host "`nTesting Pumpaj Backend`n" -ForegroundColor Cyan

# Health check
Write-Host "[1] Health check..." -ForegroundColor Yellow
try {
    $h = Invoke-RestMethod -Uri "$BASE/api/health"
    Write-Host "  OK - Health: $($h.ok)" -ForegroundColor Green
}
catch {
    Write-Host "  FAIL - $_" -ForegroundColor Red
    exit 1
}

# CORS check
Write-Host "`n[2] CORS check..." -ForegroundColor Yellow
try {
    $r = Invoke-WebRequest -Uri "$BASE/api/health" -Headers @{ "Origin" = "http://localhost:3000" }
    $cors = $r.Headers['Access-Control-Allow-Origin']
    if ($cors) {
        Write-Host "  OK - CORS: $cors" -ForegroundColor Green
    }
    else {
        Write-Host "  WARN - No CORS header" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "  FAIL - $_" -ForegroundColor Red
}

Write-Host "`nBackend ready at $BASE" -ForegroundColor Green
Write-Host "Set NEXT_PUBLIC_API_BASE=$BASE in web/.env.local`n" -ForegroundColor Gray
