# Pumpaj Video Downloader - Release Smoke Test (PowerShell)
# Usage: .\release-smoke.ps1 -BaseUrl "https://api.domain.com" -Token "jwt..." -YtUrl "https://youtube.com/..."

param(
    [string]$BaseUrl = "https://pumpaj-backend-production.up.railway.app",
    [string]$Token = "",
    [string]$YtUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
)

Write-Host "[SMOKE TEST] Pumpaj Release Smoke Test" -ForegroundColor Yellow
Write-Host "Base URL: $BaseUrl"
if ($Token) {
    Write-Host "Token: $($Token.Substring(0, [Math]::Min(20, $Token.Length)))..."
}
Write-Host ""

$TestsPassed = 0
$TestsFailed = 0

# Test 1: Health check
Write-Host "[1/6] Health check..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/health" -Method GET -UseBasicParsing -TimeoutSec 10
    if ($response.StatusCode -eq 200) {
        Write-Host "[OK] Health OK" -ForegroundColor Green
        $TestsPassed++
    }
} catch {
    Write-Host "[FAIL] Health FAILED: $_" -ForegroundColor Red
    $TestsFailed++
}

# Test 2: Version info
Write-Host "[2/6] Version info..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/version" -Method GET -TimeoutSec 10
    if ($response.version) {
        Write-Host "[OK] Version: $($response.version)" -ForegroundColor Green
        $TestsPassed++
    } else {
        Write-Host "[FAIL] Version FAILED (no version field)" -ForegroundColor Red
        $TestsFailed++
    }
} catch {
    Write-Host "[FAIL] Version FAILED: $_" -ForegroundColor Red
    $TestsFailed++
}

# Test 3: Metrics (with auth)
Write-Host "[3/6] Metrics (auth required)..." -ForegroundColor Yellow
if (-not $Token) {
    Write-Host "⚠️  Skipped (no token)" -ForegroundColor Yellow
} else {
    try {
        $headers = @{
            "Authorization" = "Bearer $Token"
        }
        $response = Invoke-RestMethod -Uri "$BaseUrl/api/jobs/metrics" -Method GET -Headers $headers -TimeoutSec 10
        Write-Host "[OK] Metrics OK (Total jobs: $($response.totalJobs))" -ForegroundColor Green
        $TestsPassed++
    } catch {
        Write-Host "[FAIL] Metrics FAILED: $_" -ForegroundColor Red
        $TestsFailed++
    }
}

# Test 4: Analyze URL
Write-Host "[4/6] Analyze URL..." -ForegroundColor Yellow
if (-not $Token) {
    Write-Host "⚠️  Skipped (no token)" -ForegroundColor Yellow
} else {
    try {
        $headers = @{
            "Authorization" = "Bearer $Token"
            "Content-Type" = "application/json"
        }
        $body = @{ url = $YtUrl } | ConvertTo-Json
        $response = Invoke-RestMethod -Uri "$BaseUrl/api/analyze" -Method POST -Headers $headers -Body $body -TimeoutSec 30
        if ($response.title) {
            Write-Host "[OK] Analyze OK: $($response.title)" -ForegroundColor Green
            $TestsPassed++
        } else {
            Write-Host "[FAIL] Analyze FAILED (no title)" -ForegroundColor Red
            $TestsFailed++
        }
    } catch {
        Write-Host "[FAIL] Analyze FAILED: $_" -ForegroundColor Red
        $TestsFailed++
    }
}

# Test 5: History
Write-Host "[5/6] History..." -ForegroundColor Yellow
if (-not $Token) {
    Write-Host "⚠️  Skipped (no token)" -ForegroundColor Yellow
} else {
    try {
        $headers = @{
            "Authorization" = "Bearer $Token"
        }
        $response = Invoke-RestMethod -Uri "$BaseUrl/api/history" -Method GET -Headers $headers -TimeoutSec 10
        $count = $response.Count
        Write-Host "[OK] History OK ($count entries)" -ForegroundColor Green
        $TestsPassed++
    } catch {
        Write-Host "[FAIL] History FAILED: $_" -ForegroundColor Red
        $TestsFailed++
    }
}

# Test 6: CORS preflight
Write-Host "[6/6] CORS preflight..." -ForegroundColor Yellow
try {
    $headers = @{
        "Origin" = "https://pumpajvideodl.com"
        "Access-Control-Request-Method" = "POST"
    }
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/analyze" -Method OPTIONS -Headers $headers -UseBasicParsing -TimeoutSec 10
    $corsHeader = $response.Headers["Access-Control-Allow-Origin"]
    if ($corsHeader) {
        Write-Host "[OK] CORS OK: $corsHeader" -ForegroundColor Green
        $TestsPassed++
    } else {
        Write-Host "[FAIL] CORS FAILED (no Access-Control-Allow-Origin header)" -ForegroundColor Red
        $TestsFailed++
    }
} catch {
    Write-Host "[FAIL] CORS FAILED: $_" -ForegroundColor Red
    $TestsFailed++
}

# Summary
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "[PASS] Tests Passed: $TestsPassed" -ForegroundColor Green
Write-Host "[FAIL] Tests Failed: $TestsFailed" -ForegroundColor Red
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

if ($TestsFailed -eq 0) {
    Write-Host "[SUCCESS] Smoke test complete! All tests passed." -ForegroundColor Green
    exit 0
} else {
    Write-Host "[WARNING] Some tests failed. Check logs above." -ForegroundColor Yellow
    exit 1
}
