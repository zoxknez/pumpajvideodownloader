# Railway CLI Vodič

Kompletan pasoš kako da upravljaš Railway backend (i eventualno frontend) servisima iz terminala.

> Napomena: Nemoj deliti Railway token. AI ne može direktno da ga koristi; ti izvršavaš komande.

---
## 1. Instalacija
```bash
npm i -g @railway/cli
# provera
railway --version
```

Ako ne želiš globalno:
```bash
npx railway --version
```

## 2. Login
Interaktivno:
```bash
railway login
```
Otvoriće browser → potvrdi pristup.

Headless (sa tokenom):  
Railway Dashboard → User (gore desno) → Account → "New Token".  
Zatim u PowerShell-u privremeno:
```powershell
$env:RAILWAY_TOKEN="PASTE_TOKEN"
railway whoami
```
Trajno: System Properties → Environment Variables → User → dodaj `RAILWAY_TOKEN`.

## 3. Linkovanje projekta
U root repo-a (ovaj folder):
```bash
railway link
```
Biće ti ponuđeno:
- Izaberi postojeći projekat (ili kreiraj novi)
- Izaberi environment (npr. production)

CLI kreira `.railway` folder sa JSON konfiguracijom.
Ako želiš da tim deli link:
```bash
git add .railway
git commit -m "chore: add railway project link"
```

## 4. Pregled postojećih servisa
```bash
railway status
railway environments
railway variables
```

## 5. Dodavanje / menjanje env varijabli
Interaktivno:
```bash
railway variables set PORT=8080 NIXPACKS_NODE_VERSION=20
railway variables set CORS_ORIGIN=https://tvoj-frontend.com
```
Listanje:
```bash
railway variables
```
Brisanje:
```bash
railway variables delete CORS_ORIGIN
```

### Bulk import iz .env fajla
```bash
railway run cat /proc/1/environ   # (debug: vidi šta je unutra)
# Nema direktan 'push', radi se pojedinačno 'set'
```

## 6. Deploy pokretanje
Ako koristiš GitHub hook, deployment ide automatski. Ručno ručni build (Nixpacks):
```bash
railway up
```
Ili target specifikacija (ako ima više servisa):
```bash
railway up --service "ime-servisa"
```

## 7. Logovi
Stream uživo:
```bash
railway logs --service "ime-servisa" --tail
```
Poslednjih 200 linija:
```bash
railway logs --service "ime-servisa" --num 200
```
Filtriranje (grep lokalno):
```bash
railway logs --service "ime-servisa" --num 500 | grep yt-dlp
```

## 8. Shell / exec u kontejner
```bash
railway shell --service "ime-servisa"
# primer: provera procesa
ps aux
```
Napomena: Neki planovi ograničavaju interaktivni shell.

## 9. Scale / replike
Na besplatnom planu tipično samo 1 replika. Ako plan podržava:
```bash
railway scale --service "ime-servisa" 2
```

## 10. Domene
Listanje domena:
```bash
railway domains --service "ime-servisa"
```
Dodavanje custom domena (ako plan podržava):
```bash
railway domains add --service "ime-servisa" api.tvoj-domen.com
```
Stanje verifikacije:
```bash
railway domains verify --service "ime-servisa" api.tvoj-domen.com
```

## 11. Healthcheck debug
Ako endpoint ne radi:
```bash
curl -i https://pumpaj-web-production.up.railway.app/health
```
Ako `PORT` nije pogođen, Railway log često će pokazati da ništa ne sluša.

## 12. Promena build / start komandi
Railway UI → Service → Settings. CLI još nema kompletan edit za te komande; ali možeš potvrditi generisanu Nixpacks konfiguraciju:
```bash
railway nixpacks plan --service "ime-servisa"
```

## 13. Privremeno pokretanje komandе u kontejneru
(Ne menja start komandu – samo jednokratno)
```bash
railway run --service "ime-servisa" "node -v"
```

## 14. Debug yt-dlp subprocess
U logovima traži evente `yt_dlp_error_*` ili `yt_dlp_close_*`.  
Za ručni test binarnog poziva unutar shell-a:
```bash
which yt-dlp || where yt-dlp
yt-dlp --version
```

## 15. Backup env varijabli
Brzi eksport (lokalni fajl):
```bash
railway variables > railway-env-backup.txt
```

## 16. Uklanjanje linka lokalno
```bash
rd /s /q .railway   # Windows PowerShell (oprez!)
```

## 17. Brzi checklist za tvoj projekat
- Backend servis: build `npm install && npm run build --workspace server`
- Start: `npm run start --workspace server`
- Varijable: `PORT=8080`, `NIXPACKS_NODE_VERSION=20`, opcioni `CORS_ORIGIN`
- Health radi: `/health` → `{ "ok": true }`
- Frontend env (Vercel): `NEXT_PUBLIC_API=https://<railway-backend>.up.railway.app`

## 18. Tipične greške
| Simptom | Uzrok | Rešenje |
|---------|-------|---------|
| 404 na /api/analyze | Frontend gađa svoj domen | Podesi `NEXT_PUBLIC_API` / query `?apiBase=` |
| 502 / nema odgovora | PORT nije 8080 ili app ne sluša | Set `PORT=8080` i redeploy |
| yt-dlp exit code | URL nevalidan ili rate-limit | Probaj drugi URL / dodaj retry |
| CORS error | `CORS_ORIGIN` preuzak | Dodaj domen u listu |

---
Ako želiš dodatak (npr. script za automatski sync env varijabli), javi. 
