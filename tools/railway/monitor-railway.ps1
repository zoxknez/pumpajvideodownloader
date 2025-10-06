# Monitor Railway Deployment Status
Write-Host ""
Write-Host "=== RAILWAY DEPLOYMENT MONITOR ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "Checking current server status..." -ForegroundColor Yellow
Write-Host ""

# Test /health endpoint
Write-Host "1. Health Check:" -ForegroundColor White
try {
    $health = Invoke-WebRequest -Uri "https://pumpaj-backend-production.railway.app/health" -UseBasicParsing -TimeoutSec 5
    Write-Host "   Server is UP (Status: $($health.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "   Server is DOWN or unreachable" -ForegroundColor Red
}

# Test /auth/guest endpoint
Write-Host ""
Write-Host "2. Guest Endpoint:" -ForegroundColor White
try {
    $guest = Invoke-WebRequest -Uri "https://pumpaj-backend-production.railway.app/auth/guest" -Method POST -ContentType "application/json" -Body '{"ttlMinutes":60}' -UseBasicParsing -TimeoutSec 5
    Write-Host "   WORKING! (Status: $($guest.StatusCode))" -ForegroundColor Green
    $guestData = $guest.Content | ConvertFrom-Json
    Write-Host "   Guest User: $($guestData.user.username)" -ForegroundColor Gray
    Write-Host "   Token: $($guestData.token.Substring(0, 20))..." -ForegroundColor Gray
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    Write-Host "   FAILED (Status: $status)" -ForegroundColor Red
    
    if ($status -eq 404) {
        Write-Host ""
        Write-Host "DIAGNOSIS: Old code is still running" -ForegroundColor Yellow
        Write-Host "  - New deployment hasn't started yet" -ForegroundColor Gray
        Write-Host "  - OR deployment is still in progress" -ForegroundColor Gray
    } elseif ($status -eq 500) {
        Write-Host ""
        Write-Host "DIAGNOSIS: Code deployed but crashes" -ForegroundColor Yellow
        Write-Host "  - Check Railway logs for error details" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "=== NEXT STEPS ===" -ForegroundColor Cyan
Write-Host "1. Open Railway Deployments tab" -ForegroundColor White
Write-Host "2. Check if latest deployment is 'Deploying' or 'Active'" -ForegroundColor White
Write-Host "3. If stuck, manually trigger 'Redeploy'" -ForegroundColor White
Write-Host ""
Write-Host "Opening Railway dashboard..." -ForegroundColor Green
Start-Process "https://railway.app/project/7d4a92ec-66b8-41a5-a45f-011f83038a97"
