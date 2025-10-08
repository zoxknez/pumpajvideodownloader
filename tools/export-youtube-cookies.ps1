# YouTube Cookies Export Helper
# Koristi yt-dlp da automatski izvuče cookies iz browsera

Write-Host "🍪 YouTube Cookies Export Helper" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Proveri da li je yt-dlp instaliran
$ytdlpPath = Get-Command yt-dlp -ErrorAction SilentlyContinue
if (-not $ytdlpPath) {
    Write-Host "❌ yt-dlp nije instaliran!" -ForegroundColor Red
    Write-Host "Instaliraj sa: winget install yt-dlp" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ yt-dlp pronađen: $($ytdlpPath.Source)" -ForegroundColor Green
Write-Host ""

# Izbor browsera
Write-Host "Izaberi browser iz kog želiš da izvučeš cookies:" -ForegroundColor Yellow
Write-Host "1) Chrome"
Write-Host "2) Edge"
Write-Host "3) Firefox"
Write-Host "4) Brave"
Write-Host ""
$choice = Read-Host "Unesi broj (1-4)"

$browser = switch ($choice) {
    "1" { "chrome" }
    "2" { "edge" }
    "3" { "firefox" }
    "4" { "brave" }
    default { 
        Write-Host "❌ Nevažeći izbor!" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "📥 Izvlačim cookies iz $browser browsera..." -ForegroundColor Cyan

# Output path
$outputPath = Join-Path $PSScriptRoot "youtube-cookies.txt"

# Pokušaj da izvučeš cookies
try {
    # yt-dlp može da izvuče cookies direktno iz browsera
    & yt-dlp --cookies-from-browser $browser --cookies $outputPath --skip-download "https://www.youtube.com/watch?v=dQw4w9WgXcQ" 2>&1 | Out-Null
    
    if (Test-Path $outputPath) {
        Write-Host "✅ Cookies uspešno exportovani!" -ForegroundColor Green
        Write-Host ""
        Write-Host "📁 Lokacija: $outputPath" -ForegroundColor White
        Write-Host ""
        
        # Prikaži veličinu fajla
        $fileSize = (Get-Item $outputPath).Length
        Write-Host "📊 Veličina: $fileSize bytes" -ForegroundColor Gray
        
        Write-Host ""
        Write-Host "🚀 Sledeći koraci:" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Opcija 1️⃣ - Base64 encode za Railway env variable:" -ForegroundColor Cyan
        Write-Host "  .\tools\railway\encode-cookies.ps1" -ForegroundColor White
        Write-Host ""
        Write-Host "Opcija 2️⃣ - Manual upload na Railway volume:" -ForegroundColor Cyan
        Write-Host "  railway run bash" -ForegroundColor White
        Write-Host "  cat > /app/data/youtube-cookies.txt" -ForegroundColor White
        Write-Host "  # Paste content, then Ctrl+D" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Opcija 3️⃣ - Railway CLI upload (ako imaš volume):" -ForegroundColor Cyan
        Write-Host "  railway run cp youtube-cookies.txt /app/data/" -ForegroundColor White
        Write-Host ""
        
    } else {
        Write-Host "❌ Cookies fajl nije kreiran!" -ForegroundColor Red
        Write-Host ""
        Write-Host "Mogući razlozi:" -ForegroundColor Yellow
        Write-Host "- Browser nije pokrenut" -ForegroundColor Gray
        Write-Host "- Nisi ulogovan na YouTube" -ForegroundColor Gray
        Write-Host "- Browser profil nije default" -ForegroundColor Gray
        exit 1
    }
    
} catch {
    Write-Host "❌ Greška prilikom izvlačenja cookies-a!" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Alternativa - koristi browser extension:" -ForegroundColor Yellow
    Write-Host "Chrome/Edge: https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc" -ForegroundColor Blue
    Write-Host "Firefox: https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/" -ForegroundColor Blue
    exit 1
}

Write-Host ""
Write-Host "⚠️  SECURITY NOTICE:" -ForegroundColor Red
Write-Host "   - Ovaj fajl sadrži tvoje YouTube session podatke!" -ForegroundColor Yellow
Write-Host "   - NIKAD ga ne commit-uj u Git!" -ForegroundColor Yellow
Write-Host "   - Koristi throw-away Google nalog ako je moguće" -ForegroundColor Yellow
Write-Host ""
