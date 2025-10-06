$rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$secret = [Convert]::ToBase64String($bytes)
Write-Host "Generated APP_JWT_SECRET:" -ForegroundColor Green
Write-Host $secret -ForegroundColor Cyan
Write-Host ""
Write-Host "Add this to Railway Variables:" -ForegroundColor Yellow
Write-Host "Variable Name: APP_JWT_SECRET" -ForegroundColor White
Write-Host "Variable Value: $secret" -ForegroundColor Gray
