# Quick test of production guest endpoint
try {
    $result = Invoke-WebRequest -Method POST -Uri 'https://pumpaj-backend-production.up.railway.app/auth/guest' -UseBasicParsing
    Write-Host "SUCCESS: Status $($result.StatusCode)" -ForegroundColor Green
    $json = $result.Content | ConvertFrom-Json
    Write-Host "Token received: $($json.token.Substring(0, 50))..." -ForegroundColor Green
    Write-Host "Guest user: $($json.user.username)" -ForegroundColor Green
}
catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "FAILED: Status $statusCode" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($statusCode -eq 404) {
        Write-Host "`nRailway still hasn't deployed new version." -ForegroundColor Yellow
        Write-Host "Wait a bit more or check: https://railway.app" -ForegroundColor Yellow
    }
}
