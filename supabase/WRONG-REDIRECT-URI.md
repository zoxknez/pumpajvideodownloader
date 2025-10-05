# ⚠️ KRITIČNA GREŠKA: POGREŠAN REDIRECT URI

## 🚨 Problem
Dodao si **POGREŠAN** Redirect URI u Google Cloud Console!

### ❌ Trenutno (POGREŠNO):
```
https://pumpajvideodl.com
```

### ✅ Trebalo bi da bude:
```
https://smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/callback
```

---

## 🔧 Brza Ispravka (3 koraka)

### 1️⃣ Obriši pogrešan URI
U **Google Cloud Console** → OAuth 2.0 Client:
- Pronađi: `https://pumpajvideodl.com`
- Klikni **X** pored njega da ga obrišeš

### 2️⃣ Dodaj ispravan URI
- Klikni: **"+ ADD URI"**
- Paste:
  ```
  https://smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/callback
  ```

### 3️⃣ Sačuvaj
- Klikni **"SAVE"**
- Sačekaj **3-5 minuta** da se promene primene

---

## 💡 Zašto?

Google OAuth flow funkcioniše ovako:

```
User klikne "Google login"
         ↓
Google authentication page
         ↓
User se login-uje
         ↓
Google redirect-uje na: smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/callback
         ↓                    ⬆️ OVAJ URI MORA DA BUDE REGISTROVAN!
Supabase obrađuje callback
         ↓
Supabase redirect-uje na: pumpajvideodl.com/auth/callback
         ↓
Tvoja app obrađuje session
```

**Google ne redirect-uje direktno na tvoj domain!**  
Prvo mora kroz Supabase callback.

---

## 🔍 Kako da znam da je tačno?

Nakon SAVE-a, trebalo bi da vidiš:

```
✅ Authorized redirect URIs:
   URIs 1
   https://smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/callback
```

Ako vidiš bilo šta drugo → **NIJE TAČNO!**

---

## 📚 Dodatne informacije

- 📄 [Supabase Google Auth Guide](https://supabase.com/docs/guides/auth/social-login/auth-google)
- 📄 [Google OAuth 2.0 Docs](https://developers.google.com/identity/protocols/oauth2/web-server)
- 🔧 Lokalni script: `supabase/FIX-WRONG-REDIRECT-URI.js`

---

## ⏱️ Kada će raditi?

- **Obično**: 2-5 minuta nakon SAVE-a
- **Google kaže**: "5 minutes to a few hours"
- **Preporuka**: Sačekaj 3 minuta, pa testiraj

---

## 🧪 Testiranje

Nakon ispravke:
1. Sačekaj 3-5 minuta
2. Otvori: https://pumpajvideodl.com
3. Klikni "Google" button
4. Trebalo bi da vidiš Google Account Chooser (bez greške!)
5. Izaberi account
6. Trebalo bi da te vrati na pumpajvideodl.com

---

**URI je već kopiran u clipboard - samo ga paste-uj! 🚀**
