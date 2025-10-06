# Railway deployment automation script
Write-Host "=== Railway Deployment Automation ===" -ForegroundColor Cyan

# Check if Railway CLI is installed
$railwayInstalled = Get-Command railway -ErrorAction SilentlyContinue
if (-not $railwayInstalled) {
    Write-Host "Railway CLI not found. Installing..." -ForegroundColor Yellow
    npm install -g @railway/cli
    Write-Host "Railway CLI installed!" -ForegroundColor Green
}

# Login to Railway (will open browser)
Write-Host "`nLogging into Railway..." -ForegroundColor Cyan
railway login

# Link to project
Write-Host "`nLinking to Railway project..." -ForegroundColor Cyan
railway link

# Set environment variables
Write-Host "`nSetting environment variables..." -ForegroundColor Cyan
railway variables set SUPABASE_URL="https://smzxjnuqfvpzfzmyxpbp.supabase.co"
railway variables set SUPABASE_JWT_SECRET="mqhy49Hqmpq8EtMe8l9/iBOMbYdENzo5L5EMhMXm0t+fH7a0ZhLunfhNVQcinh3PC956XynLZumSWdHzwvCHfg=="

Write-Host "`nREQUIRED: You need to add SUPABASE_SERVICE_ROLE_KEY manually" -ForegroundColor Yellow
Write-Host "1. Go to: https://supabase.com/dashboard/project/smzxjnuqfvpzfzmyxpbp/settings/api" -ForegroundColor Yellow
Write-Host "2. Copy the 'service_role' key" -ForegroundColor Yellow
Write-Host "3. Paste it below when prompted" -ForegroundColor Yellow
$serviceRoleKey = Read-Host "`nPaste SUPABASE_SERVICE_ROLE_KEY here"

if ($serviceRoleKey) {
    railway variables set SUPABASE_SERVICE_ROLE_KEY="$serviceRoleKey"
    Write-Host "Service role key set!" -ForegroundColor Green
}

# Deploy
Write-Host "`nDeploying to Railway..." -ForegroundColor Cyan
railway up

Write-Host "`n=== Deployment initiated! ===" -ForegroundColor Green
Write-Host "Waiting 30 seconds for deployment to complete..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# Test
Write-Host "`nTesting guest endpoint..." -ForegroundColor Cyan
& "$PSScriptRoot\quick-guest-test.ps1"
