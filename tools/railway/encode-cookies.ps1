# Base64 Encode YouTube Cookies za Railway Environment Variable

param(
    [string]$InputFile = "youtube-cookies.txt"
)

Write-Host "🔐 Base64 Cookies Encoder za Railway" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Proveri da li fajl postoji
if (-not (Test-Path $InputFile)) {
    # Probaj u root direktorijumu
    $rootPath = Join-Path $PSScriptRoot ".." $InputFile
    if (Test-Path $rootPath) {
        $InputFile = $rootPath
    } else {
        Write-Host "❌ Fajl '$InputFile' ne postoji!" -ForegroundColor Red
        Write-Host ""
        Write-Host "Prvo pokreni: .\tools\export-youtube-cookies.ps1" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "📁 Input: $InputFile" -ForegroundColor White

try {
    # Učitaj sadržaj fajla
    $content = Get-Content -Path $InputFile -Raw -Encoding UTF8
    
    # Konvertuj u Base64
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
    $base64 = [Convert]::ToBase64String($bytes)
    
    Write-Host "✅ Base64 encoding uspešan!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Original size: $($content.Length) bytes" -ForegroundColor Gray
    Write-Host "📊 Encoded size: $($base64.Length) bytes" -ForegroundColor Gray
    Write-Host ""
    
    # Snimi u fajl
    $outputFile = Join-Path $PSScriptRoot "youtube-cookies-base64.txt"
    Set-Content -Path $outputFile -Value $base64 -NoNewline
    
    Write-Host "💾 Saved to: $outputFile" -ForegroundColor Green
    Write-Host ""
    
    # Ispiši za copy-paste
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    Write-Host "📋 RAILWAY ENVIRONMENT VARIABLE:" -ForegroundColor Yellow
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "Variable Name:" -ForegroundColor Cyan
    Write-Host "  YOUTUBE_COOKIES_BASE64" -ForegroundColor White
    Write-Host ""
    Write-Host "Variable Value (kopiraj ceo string):" -ForegroundColor Cyan
    Write-Host $base64 -ForegroundColor White
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    Write-Host ""
    
    # Copy to clipboard ako je dostupno
    try {
        Set-Clipboard -Value $base64
        Write-Host "✅ Base64 string kopiran u clipboard!" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Clipboard nije dostupan - kopiraj ručno" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "🚀 Kako podesiti na Railway-u:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. Otvori Railway dashboard: https://railway.app/dashboard" -ForegroundColor White
    Write-Host "2. Izaberi svoj service (pumpajvideodownloader)" -ForegroundColor White
    Write-Host "3. Variables tab" -ForegroundColor White
    Write-Host "4. Dodaj novu variable:" -ForegroundColor White
    Write-Host "   Name: YOUTUBE_COOKIES_BASE64" -ForegroundColor Cyan
    Write-Host "   Value: <paste from clipboard>" -ForegroundColor Cyan
    Write-Host "5. Sačuvaj i Railway će automatski restartovati service" -ForegroundColor White
    Write-Host ""
    Write-Host "🔍 Verifikuj da li radi:" -ForegroundColor Yellow
    Write-Host "   railway logs" -ForegroundColor White
    Write-Host "   # Traži log: 'youtube_cookies_decoded'" -ForegroundColor Gray
    Write-Host ""
    
} catch {
    Write-Host "❌ Greška prilikom encoding-a!" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host "✨ Gotovo! Cookies su spremni za Railway deployment." -ForegroundColor Green
Write-Host ""
