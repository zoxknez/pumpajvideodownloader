# Railway Environment Variables Setup Guide

Write-Host ""
Write-Host "=== RAILWAY ENVIRONMENT VARIABLES SETUP ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "You need to add 3 MISSING Supabase variables:" -ForegroundColor Yellow
Write-Host ""

Write-Host "1. SUPABASE_URL" -ForegroundColor White
Write-Host "   Value: https://smzxjnuqfvpzfzmyxpbp.supabase.co" -ForegroundColor Gray
Write-Host ""

Write-Host "2. SUPABASE_JWT_SECRET" -ForegroundColor White
Write-Host "   Location: Supabase Dashboard > Settings > API > JWT Secret" -ForegroundColor Gray
Write-Host "   (Long string starting with 'eyJ...')" -ForegroundColor Gray
Write-Host ""

Write-Host "3. SUPABASE_SERVICE_ROLE_KEY" -ForegroundColor White
Write-Host "   Location: Supabase Dashboard > Settings > API > service_role (secret key)" -ForegroundColor Gray
Write-Host "   (Long string starting with 'eyJ...')" -ForegroundColor Gray
Write-Host ""

Write-Host "=== STEPS ===" -ForegroundColor Cyan
Write-Host "1. Click '+ New Variable' button in Railway" -ForegroundColor White
Write-Host "2. Add each variable name and value" -ForegroundColor White
Write-Host "3. Railway will auto-redeploy after saving" -ForegroundColor White
Write-Host ""

Write-Host "Opening Supabase API settings to copy keys..." -ForegroundColor Green
Start-Sleep -Seconds 2
Start-Process "https://supabase.com/dashboard/project/smzxjnuqfvpzfzmyxpbp/settings/api"

Write-Host ""
Write-Host "Press any key when you've added all 3 variables to Railway..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

Write-Host ""
Write-Host "Testing production endpoint..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

try {
    $response = Invoke-WebRequest -Uri "https://pumpaj-backend-production.railway.app/auth/guest" -Method POST -ContentType "application/json" -Body '{"ttlMinutes":60}' -UseBasicParsing
    Write-Host "SUCCESS! Guest login works: $($response.StatusCode)" -ForegroundColor Green
    Write-Host $response.Content -ForegroundColor Gray
} catch {
    Write-Host "FAILED: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Wait a bit longer for deployment to finish, then run:" -ForegroundColor Yellow
    Write-Host "  .\quick-guest-test.ps1" -ForegroundColor Cyan
}
