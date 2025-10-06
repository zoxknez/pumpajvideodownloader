# Supabase Service Role Key Finder
Write-Host "=== Fetching Supabase Service Role Key ===" -ForegroundColor Cyan

$supabaseUrl = "https://smzxjnuqfvpzfzmyxpbp.supabase.co"
$projectRef = "smzxjnuqfvpzfzmyxpbp"

Write-Host "`nProject: $projectRef" -ForegroundColor Yellow
Write-Host "URL: $supabaseUrl" -ForegroundColor Yellow

Write-Host "`nTo get the service_role key:" -ForegroundColor Cyan
Write-Host "1. Open: https://supabase.com/dashboard/project/$projectRef/settings/api" -ForegroundColor White
Write-Host "2. Scroll to 'Project API keys'" -ForegroundColor White
Write-Host "3. Find 'service_role' key (NOT anon key)" -ForegroundColor White
Write-Host "4. Click 'Copy' button" -ForegroundColor White
Write-Host "5. Run: .\deploy-railway.ps1" -ForegroundColor White

Write-Host "`nOpening Supabase dashboard in browser..." -ForegroundColor Yellow
Start-Process "https://supabase.com/dashboard/project/$projectRef/settings/api"

Write-Host "`nNote: The service_role key starts with 'eyJ' and is very long" -ForegroundColor Yellow
Write-Host "It's different from the anon key (which you already have in .env.local)" -ForegroundColor Yellow
