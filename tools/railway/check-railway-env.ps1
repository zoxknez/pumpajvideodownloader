# Quick Railway Environment Variable Checklist
Write-Host "`n=== RAILWAY ENVIRONMENT VARIABLES CHECKLIST ===" -ForegroundColor Cyan
Write-Host "`nRequired variables for guest auth to work:" -ForegroundColor Yellow
Write-Host "  ✓ SUPABASE_URL (should be set)" -ForegroundColor Green
Write-Host "  ✓ SUPABASE_JWT_SECRET (should be set)" -ForegroundColor Green
Write-Host "  ⚠ SUPABASE_SERVICE_ROLE_KEY (likely MISSING!)" -ForegroundColor Red

Write-Host "`n=== ACTION NEEDED ===" -ForegroundColor Cyan
Write-Host "1. Go to Railway dashboard: https://railway.app" -ForegroundColor White
Write-Host "2. Select 'pumpaj-backend-production' service" -ForegroundColor White
Write-Host "3. Go to 'Variables' tab" -ForegroundColor White
Write-Host "4. Check if SUPABASE_SERVICE_ROLE_KEY exists" -ForegroundColor White
Write-Host "5. If missing, get it from Supabase:" -ForegroundColor White
Write-Host "   - Run: .\get-supabase-key.ps1" -ForegroundColor Yellow
Write-Host "   - Copy the 'service_role' key" -ForegroundColor Yellow
Write-Host "   - Add to Railway as: SUPABASE_SERVICE_ROLE_KEY" -ForegroundColor Yellow

Write-Host "`n=== REDEPLOY ===" -ForegroundColor Cyan
Write-Host "After adding the variable:" -ForegroundColor White
Write-Host "1. Go to 'Deployments' tab" -ForegroundColor White
Write-Host "2. Click on latest deployment" -ForegroundColor White
Write-Host "3. Click 'Redeploy' button" -ForegroundColor White

Write-Host "`nPress any key to open Railway dashboard..." -ForegroundColor Green
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
Start-Process "https://railway.app/project/7d4a92ec-66b8-41a5-a45f-011f83038a97"
