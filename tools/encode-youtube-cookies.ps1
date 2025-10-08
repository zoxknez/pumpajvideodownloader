# Script to encode YouTube cookies to base64 for Railway env variable
# Usage: .\tools\encode-youtube-cookies.ps1

$cookiesFile = ".\www.youtube.com_cookies.txt"

if (!(Test-Path $cookiesFile)) {
    Write-Error "Cookies file not found: $cookiesFile"
    exit 1
}

# Read file content
$content = Get-Content -Path $cookiesFile -Raw -Encoding UTF8

# Convert to base64
$bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
$base64 = [Convert]::ToBase64String($bytes)

# Display size info
$originalSize = $content.Length
$base64Size = $base64.Length

Write-Host "Original file size: $originalSize bytes" -ForegroundColor Cyan
Write-Host "Base64 encoded size: $base64Size bytes" -ForegroundColor Cyan
Write-Host ""

# Check if it fits Railway env var limit (roughly 4KB)
if ($base64Size -gt 4000) {
    Write-Warning "WARNING: Base64 size is $base64Size bytes - this might exceed Railway env var limit!"
    Write-Host "Consider using COOKIES_FROM_BROWSER=chrome instead" -ForegroundColor Yellow
} else {
    Write-Host "[OK] Size is acceptable for Railway env variable" -ForegroundColor Green
}

Write-Host ""
Write-Host "Copy this value to Railway YOUTUBE_COOKIES_BASE64 env variable:" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Gray
Write-Host $base64
Write-Host "================================================" -ForegroundColor Gray
Write-Host ""

# Also copy to clipboard
$base64 | Set-Clipboard
Write-Host "[OK] Base64 string copied to clipboard!" -ForegroundColor Green
