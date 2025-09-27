# Vercel CLI Postavka (Sigurni koraci)

Ovaj dokument opisuje kako da lokalno (ili na serveru koji kontrolišeš) upravljaš Vercel projektom kroz terminal. **Ne deli token nikome** – AI asistent ne može direktno da ga koristi; ti izvršavaš komande.

## 1. Instalacija Vercel CLI
```bash
npm i -g vercel
# ili ako ne želiš globalno:
npx vercel --version
```
Provera:
```bash
vercel --version
```

## 2. Prijava / Autentifikacija
Pokreni:
```bash
vercel login
```
Unesi email → potvrdi kod iz mejla.

Alternativa (token):  
U Vercel Dashboard → Settings (gore desno na avatar) → Tokens → "Create Token".  
Zatim u terminalu:
```bash
set VERCEL_TOKEN=PASTE_TOKEN_HERE        # PowerShell privremeno
# ili trajno (User env) u Windows System Settings > Environment Variables
```
Sa tokenom možeš preskočiti interaktivni login:
```bash
vercel --token %VERCEL_TOKEN% whoami
```

## 3. Linkovanje projekta
U root ovog repoa:
```bash
vercel link
```
Odgovori na pitanja:
- "Set up and deploy?" → No (ako želiš samo link sada) ili Yes (ako odmah radiš prvi deploy)
- Odaberi Team (ako postoji) → odaberi projekat ili kreiraj novi

CLI kreira `.vercel/project.json` (NE briši). Dodaj u git (ako želiš da tim deli link info):
```bash
git add .vercel/project.json
git commit -m "chore: add vercel project link"
```

## 4. Podešavanje Environment varijabli (CLI)
Prvo prikaži postojeće:
```bash
vercel env ls
```
Dodavanje (Production):
```bash
vercel env add NEXT_PUBLIC_API production
# CLI će tražiti vrednost – nalepi npr: https://pumpaj-web-production.up.railway.app

vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
```
Za Preview i Development ponovi sa:
```bash
vercel env add VAR_NAME preview
vercel env add VAR_NAME development
```
Ili bulk import iz `.env` fajla:
```bash
vercel env pull .env.local    # povlači remote -> lokalno
# ili push (nema direktno, radi se add pojedinačno) 
```

## 5. Deployment
Standardni deploy (automatski prepozna framework):
```bash
vercel --prod
```
Ako želiš da koristiš token bez interakcije:
```bash
vercel --prod --token %VERCEL_TOKEN%
```

## 6. Provera posle deploy-a
```bash
vercel ls                      # lista deploy-e
vercel inspect <deployment-url>
```

## 7. Brzi rollback
```bash
vercel rollback <deployment-id-or-alias>
```
Prvo nađi ID:
```bash
vercel ls
```

## 8. Postavljanje alias-a (custom domen)
Ako već imaš custom domen povezan u dashboardu:
```bash
vercel alias set <deployment-url> tvoj-domen.com
```

## 9. Automatizacija (CI skripta primer)
U GitHub Actions (primer job step):
```yaml
- name: Deploy to Vercel
  run: |
    npm i -g vercel
    vercel pull --yes --environment=production --token ${{ secrets.VERCEL_TOKEN }}
    vercel build --prod --token ${{ secrets.VERCEL_TOKEN }}
    vercel deploy --prebuilt --prod --token ${{ secrets.VERCEL_TOKEN }}
```
U repo secrets dodaj `VERCEL_TOKEN`.

## 10. Sigurnosne preporuke
- Token drži samo u lokalnom shell-u ili GitHub/Vercel secrets – nikada ga ne kači u repo.
- Redovno rotiraj token (Delete → Create new).  
- Ako slučajno iscure, povuci token odmah: Dashboard → Tokens → Revoke.

## 11. Debug blank stranice
Ako se frontend ne otvara:
```bash
vercel logs <deployment-url> --since=1h
```
Ili lokalno reproduciraj build:
```bash
cd web
npm install
npm run build
npm run start
```

## 12. Čišćenje lokalne link konfiguracije
Ako želiš da ukloniš link:
```bash
rd /s /q .vercel   # Windows PowerShell (oprez!)
```

---
Ako treba analogan dokument i za Railway CLI, javi pa dodam.
