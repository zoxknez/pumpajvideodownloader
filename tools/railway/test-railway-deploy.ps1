# Wait 2 minutes for Railway to detect push and start building
Write-Host "Waiting for Railway to start building (2 minutes)..." -ForegroundColor Yellow
Start-Sleep -Seconds 120

Write-Host "`nTesting production guest endpoint..." -ForegroundColor Cyan
try {
    $result = Invoke-WebRequest -Method POST -Uri 'https://pumpaj-backend-production.up.railway.app/auth/guest' -UseBasicParsing
    Write-Host "Status: $($result.StatusCode)" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Green
    $jsonResult = $result.Content | ConvertFrom-Json
    $jsonResult | ConvertTo-Json -Depth 3
}
catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Railway might still be building. Check dashboard: https://railway.app" -ForegroundColor Yellow
}

Write-Host "`nChecking API version..." -ForegroundColor Cyan
try {
    $versionResult = Invoke-WebRequest -Uri 'https://pumpaj-backend-production.up.railway.app/api/version' -UseBasicParsing
    $version = $versionResult.Content | ConvertFrom-Json
    Write-Host "Version: $($version.version)" -ForegroundColor Green
    Write-Host "Uptime: $($version.uptimeLabel)" -ForegroundColor Green
    Write-Host "Node: $($version.node)" -ForegroundColor Green
}
catch {
    Write-Host "Version check failed: $($_.Exception.Message)" -ForegroundColor Red
}
