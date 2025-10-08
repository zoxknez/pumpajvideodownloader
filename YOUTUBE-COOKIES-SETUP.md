# YouTube Cookies Setup za Railway Production

## Problem
YouTube je uveo bot detection koji blokira yt-dlp zahteve bez validnih cookies-a:
```
ERROR: Sign in to confirm you're not a bot
```

## Rešenje: Dodaj YouTube cookies

### Metoda 1: Cookies iz browsera (preporučeno za development)

Postavi environment variable na Railway-u:
```bash
COOKIES_FROM_BROWSER=chrome
# ili: firefox, edge, safari, brave, chromium
```

yt-dlp će automatski izvući cookies iz tvog browsera ako je instaliran na Railway kontejneru.

⚠️ **NAPOMENA:** Ovo može da ne radi na Railway jer server nema pristup tvom lokalnom browseru.

---

### Metoda 2: Export cookies file (PREPORUČENO za production)

#### Korak 1: Instaliraj browser extension

**Chrome/Edge:**
- [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)

**Firefox:**
- [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

#### Korak 2: Export YouTube cookies

1. Otvori YouTube u browseru (bilo koji video)
2. **Uloguj se sa svojim Google nalogom**
3. Klikni na extension ikonicu
4. Klikni "Export" ili "Get cookies.txt"
5. Snimi fajl kao `youtube-cookies.txt`

#### Korak 3: Upload cookies na Railway

**Opcija A: Environment variable (za mali cookies file):**

```bash
# Kopiraj ceo sadržaj youtube-cookies.txt i stavi u env
YOUTUBE_COOKIES_CONTENT="<paste entire content here>"
```

**Opcija B: Persistent volume (preporučeno):**

1. U Railway dashboard-u:
   - Otvori svoj service
   - Settings → Volumes
   - Add Volume: `/app/data`

2. Upload cookies file:
```bash
railway run bash
cat > /app/data/youtube-cookies.txt << 'EOF'
# Paste cookies content here
EOF
```

3. Postavi environment variable:
```bash
YOUTUBE_COOKIES_PATH=/app/data/youtube-cookies.txt
```

**Opcija C: Base64 encode (srednje elegantno):**

Lokalno:
```powershell
$content = Get-Content youtube-cookies.txt -Raw
$bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
$base64 = [Convert]::ToBase64String($bytes)
Write-Output $base64
```

Railway env variable:
```bash
YOUTUBE_COOKIES_BASE64=<paste base64 string>
```

Pa dodaj startup script u `server/index.ts`:
```typescript
// Decode base64 cookies on startup
if (process.env.YOUTUBE_COOKIES_BASE64) {
  const decoded = Buffer.from(process.env.YOUTUBE_COOKIES_BASE64, 'base64').toString('utf8');
  fs.writeFileSync('/tmp/youtube-cookies.txt', decoded);
  process.env.YOUTUBE_COOKIES_PATH = '/tmp/youtube-cookies.txt';
}
```

---

### Metoda 3: Manual cookies extraction (napredni korisnici)

1. Otvori DevTools (F12) na youtube.com
2. Network tab → reload stranicu
3. Desni klik na bilo koji request → Copy → Copy as cURL
4. Iz cURL komande izvuci cookies i napravi `youtube-cookies.txt` u Netscape formatu:

```
# Netscape HTTP Cookie File
.youtube.com	TRUE	/	TRUE	0	CONSENT	YES+
.youtube.com	TRUE	/	FALSE	1234567890	VISITOR_INFO1_LIVE	abcdefg
```

---

## Testiranje

Nakon postavljanja cookies-a, testiraj:

```bash
curl -X POST https://pumpajvideodownloader-production.up.railway.app/api/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

Trebalo bi da vidiš JSON umesto greške.

---

## Održavanje

**Cookies expire** nakon nekog vremena (obično 6-12 meseci). Kada vidiš bot detection error ponovo:

1. Re-exportuj cookies iz browsera
2. Upload novi fajl na Railway
3. Restartuj service

---

## Security Notes

⚠️ **PAŽNJA:** Cookies file sadrži session podatke tvog Google naloga!

- **Nikad ne commit-uj** `youtube-cookies.txt` u Git
- Već je dodat u `.gitignore`
- Ne deli cookies file javno
- Koristi throw-away Google nalog ako je moguće
- Revoke pristup: https://myaccount.google.com/permissions

---

## Alternative: Avoid YouTube bot detection

Ako ne želiš da koristiš cookies, razmoži:

1. **Use proxy/VPN** - Railway environment variable:
   ```bash
   HTTPS_PROXY=http://proxy-server:port
   ```

2. **Rate limiting** - uspori zahteve ka YouTube-u (već implementirano u rate limiters)

3. **Fallback servisi** - za production razmotri:
   - Invidious API (YouTube alternative frontend)
   - Piped API
   - NewPipe Extractor

---

## Troubleshooting

### "Sign in to confirm you're not a bot"
→ Cookies nisu validni ili su expired. Re-exportuj iz browsera.

### "HTTP Error 403: Forbidden"
→ IP adresa Railway-a je banned. Probaj proxy ili pričekaj.

### "No such file or directory: /app/data/youtube-cookies.txt"
→ Proveri da li je volume mounted i da li je file path tačan.

### Cookies format error
→ Proveri da je fajl u Netscape formatu (6 tab-separated kolona).

---

## Quick Railway Setup (copy-paste ready)

```bash
# 1. Export cookies iz Chrome/Firefox extension
# 2. U Railway dashboard → Environment Variables:

YOUTUBE_COOKIES_PATH=/app/data/youtube-cookies.txt

# 3. Upload file (via Railway CLI ili volume):
railway run bash
cat > /app/data/youtube-cookies.txt
# Paste content, then Ctrl+D

# 4. Restart service
railway up
```

---

## References

- [yt-dlp Cookies FAQ](https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp)
- [YouTube Cookies Export Guide](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies)
- [Railway Volumes Docs](https://docs.railway.app/reference/volumes)
