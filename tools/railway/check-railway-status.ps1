# Quick Railway Status Check
Write-Host "`n=== RAILWAY DEPLOYMENT STATUS ===" -ForegroundColor Cyan

Write-Host "`n1. Testing /health endpoint..." -ForegroundColor Yellow
try {
    $health = Invoke-WebRequest -Uri "https://pumpaj-backend-production.railway.app/health" -UseBasicParsing -TimeoutSec 10
    Write-Host "   ✓ Server is UP: $($health.StatusCode)" -ForegroundColor Green
    Write-Host "   Response: $($health.Content)" -ForegroundColor Gray
} catch {
    Write-Host "   ✗ Server is DOWN or unreachable" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n2. Testing /api/version endpoint..." -ForegroundColor Yellow
try {
    $version = Invoke-WebRequest -Uri "https://pumpaj-backend-production.railway.app/api/version" -UseBasicParsing -TimeoutSec 10
    Write-Host "   ✓ Version endpoint works: $($version.StatusCode)" -ForegroundColor Green
    $versionData = $version.Content | ConvertFrom-Json
    Write-Host "   API Version: $($versionData.version)" -ForegroundColor Gray
    Write-Host "   Node Version: $($versionData.nodeVersion)" -ForegroundColor Gray
    Write-Host "   Build Time: $($versionData.buildTime)" -ForegroundColor Gray
} catch {
    Write-Host "   ✗ Version endpoint failed" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n3. Testing /auth/guest endpoint..." -ForegroundColor Yellow
try {
    $guest = Invoke-WebRequest -Uri "https://pumpaj-backend-production.railway.app/auth/guest" -Method POST -ContentType "application/json" -Body '{"ttlMinutes":60}' -UseBasicParsing -TimeoutSec 10
    Write-Host "   ✓ Guest endpoint works: $($guest.StatusCode)" -ForegroundColor Green
    Write-Host "   Response: $($guest.Content)" -ForegroundColor Gray
} catch {
    Write-Host "   ✗ Guest endpoint failed: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.BaseStream.Position = 0
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Error Body: $responseBody" -ForegroundColor Red
        $reader.Close()
    }
}

Write-Host "`n=== NEXT STEPS ===" -ForegroundColor Cyan
Write-Host "If guest endpoint shows 404:" -ForegroundColor Yellow
Write-Host "  1. Check Railway dashboard for active deployment" -ForegroundColor White
Write-Host "  2. Look at Railway logs for startup errors" -ForegroundColor White
Write-Host "  3. Verify environment variables are set correctly" -ForegroundColor White
Write-Host "`nIf guest endpoint shows 500:" -ForegroundColor Yellow
Write-Host "  1. Missing SUPABASE_SERVICE_ROLE_KEY env variable" -ForegroundColor White
Write-Host "  2. Check Railway logs for specific error message" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to open Railway logs..." -ForegroundColor Green
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
$railwayUrl = "https://railway.app/project/7d4a92ec-66b8-41a5-a45f-011f83038a97"
Start-Process $railwayUrl
