## Production Setup (Pumpaj)

Ovaj dokument sumira kako podesiti produkciju sa aktuelnim domenima.

Frontend (Vercel): `https://pumpajvideodown.vercel.app`
Backend (Railway): `https://pumpaj-web-production.up.railway.app`
Supabase URL: `https://fvbayulmttmcdeiybeot.supabase.co`
Supabase anon key: (NE upisivati u repo – postaviti kao env varijablu)

### 1. Railway (backend)
Varijable (Settings → Variables):
```
PORT=8080
NIXPACKS_NODE_VERSION=20
CORS_ORIGIN=https://pumpajvideodown.vercel.app
```
Opcionalno (ako želiš restrikciju hostova):
```
ALLOWED_HOSTS=youtube.com,youtu.be
```

### 2. Vercel (frontend web)
Environment Variables (Production):
```
NEXT_PUBLIC_API=https://pumpaj-web-production.up.railway.app
NEXT_PUBLIC_SUPABASE_URL=https://fvbayulmttmcdeiybeot.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<tvoj_anon_key>
```
Ponovi za Preview / Development ili koristi "Environment Copy" opciju.

> Važno: onemogući **Vercel Authentication** u Project → Settings → Protection da bi sajt bio javno dostupan.

### 3. Lokalni razvoj
`web/.env.local` (primer):
```
NEXT_PUBLIC_API=http://localhost:5176
NEXT_PUBLIC_SUPABASE_URL=https://fvbayulmttmcdeiybeot.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
```

Pokretanje svega:
```
npm run dev:start:all:full
```

### 4. Test checklist
1. Otvori backend health: `/health` → `{ "ok": true }`
2. POST `/api/analyze` uz telo `{ "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }`
3. Front (Vercel) → login → start download → SSE napreduje → file dostupno.
4. DevTools Network: pozivi idu na Railway domen (ne Vercel /api proxy).

Brza automatizovana provera:
```
npm run smoke:prod
```

> GitHub Actions workflow [`smoke-prod.yml`](../.github/workflows/smoke-prod.yml) izvršava isti skript svako jutro u 06:00 UTC (i može se ručno pokrenuti). Proverava Vercel landing stranu, backend `/health` (`ok: true`) i `/api/version` strukturu kako bi se rano detektovao pad produkcije.

### 5. Bez Free/Premium plana
Policy sistem trenutno tretira sve korisnike isto (default). Kasnija nadogradnja zahteva: dodavanje plan field u user repo + policy map.

### 6. Bez custom domena (zasad)
Nema dodatnih SSL/alias koraka. Kada budeš želeo custom domen:
1. Dodaš CNAME → Vercel.
2. Backend (ako želiš api subdomen) dodaš custom domain u Railway.
3. Ažuriraš `NEXT_PUBLIC_API` i `CORS_ORIGIN`.

### 7. Debug brzi alati
```
curl -i https://pumpaj-web-production.up.railway.app/health
curl -X POST -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' \
  https://pumpaj-web-production.up.railway.app/api/analyze
```

### 8. Sledeći predlozi (opcioni)
- Retry za analyze (2 pokušaja sa 1.5x backoff)
- Runtime override API base u UI (input + localStorage)
- Toast obaveštenja kada job završi
- Lokalna istorija poslednjih URL (dropdown)

Označi šta želiš sledeće i mogu da implementiram.

---
Datum generisanja: *(automatski)*