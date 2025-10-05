# How to Get JWT Token for Testing

## Method 1: From Browser (Easiest)

1. Open https://pumpajvideodl.com
2. Login with Google OAuth
3. Open Developer Tools (F12)
4. Go to **Application** tab (Chrome) or **Storage** tab (Firefox)
5. Expand **Local Storage** → `https://pumpajvideodl.com`
6. Find key: `app:token`
7. Copy the value (long JWT string)

## Method 2: From Console

1. Login to https://pumpajvideodl.com
2. Open Console (F12 → Console tab)
3. Type: `localStorage.getItem('app:token')`
4. Copy the token (without quotes)

## Method 3: Programmatic (Supabase)

```bash
# Using cURL
curl -X POST https://smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/token \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{"email":"your@email.com","password":"your-password"}'
```

---

## Using the Token

### PowerShell Smoke Test
```powershell
cd scripts
.\release-smoke.ps1 `
  -BaseUrl "https://pumpaj-backend-production.up.railway.app" `
  -Token "eyJhbGciOi...your-jwt-token..."
```

### Bash Smoke Test
```bash
cd scripts
BASE_URL="https://pumpaj-backend-production.up.railway.app" \
TOKEN="eyJhbGciOi...your-jwt-token..." \
./release-smoke.sh
```

### Postman
1. Import `pumpaj-postman-collection.json`
2. Set variable `token` = `eyJhbGciOi...`
3. Run collection

### k6 Load Test
```bash
k6 run k6-metrics-smoke.js \
  -e BASE_URL=https://pumpaj-backend-production.up.railway.app \
  -e TOKEN=eyJhbGciOi...
```

---

## Token Expiry

- Supabase JWT tokens expire after **1 hour** by default
- If tests fail with `401 Unauthorized`, get a fresh token
- Check expiry: https://jwt.io (paste token, check `exp` field)

---

## Security Note

⚠️ **Never commit tokens to git!**
- Tokens are like passwords
- Always use environment variables or secure vaults
- Rotate tokens regularly
