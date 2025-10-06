#!/usr/bin/env node

console.log('\n\n');
console.log('═'.repeat(70));
console.log('  🚨 ERROR 400: redirect_uri_mismatch - DIJAGNOZA 🚨');
console.log('═'.repeat(70));

console.log('\n⚠️  GREŠKA:');
console.log('─'.repeat(70));
console.log('  "Access blocked: smzxjnuqfvpzfzmyxpbp.supabase.co\'s request is invalid"');
console.log('  Error 400: redirect_uri_mismatch');

console.log('\n\n🔍 MOGUĆI UZROCI:');
console.log('─'.repeat(70));

console.log('\n  1️⃣  URI još nije propagiran (Google cache)');
console.log('     → Trebalo je da sačekaš 5 minuta nakon SAVE-a');
console.log('     → Google sistem može da traje i do nekoliko sati');

console.log('\n  2️⃣  URI nije TAČNO kopiran u Google Console');
console.log('     → Proveri da li ima trailing slash ili typo');
console.log('     → Mora biti TAČNO: https://smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/callback');

console.log('\n  3️⃣  Koristiš pogrešan Google OAuth Client');
console.log('     → Proverio si Client ID u Supabase?');
console.log('     → Možda imaš više OAuth klijenata u Google Console?');

console.log('\n  4️⃣  Browser cache problem');
console.log('     → Stara OAuth sesija je keširana');
console.log('     → Hard refresh ne pomaže za OAuth');

console.log('\n\n✅ REŠENJE - DETALJNI KORACI:');
console.log('─'.repeat(70));

console.log('\n📍 KORAK 1: PROVERI GOOGLE CLOUD CONSOLE');
console.log('─'.repeat(70));
console.log('  🔗 https://console.cloud.google.com/apis/credentials');
console.log('\n  1. Pronađi svoju OAuth 2.0 Client aplikaciju');
console.log('  2. Otvori je (klikni na ime)');
console.log('  3. Scroll do "Authorized redirect URIs"');
console.log('  4. PROVERI da piše TAČNO:');
console.log('     ✅ https://smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/callback');
console.log('\n  ⚠️  NE SME da ima:');
console.log('     ❌ Trailing slash: .../callback/');
console.log('     ❌ Typo u URL-u');
console.log('     ❌ http:// umesto https://');
console.log('     ❌ Extra spaces');

console.log('\n📍 KORAK 2: PROVERI SUPABASE CLIENT ID');
console.log('─'.repeat(70));
console.log('  🔗 https://supabase.com/dashboard/project/smzxjnuqfvpzfzmyxpbp/auth/providers');
console.log('\n  1. Klikni na "Google" provider');
console.log('  2. Klikni "Edit configuration"');
console.log('  3. Uporedi "Client ID" sa Google Console:');
console.log('     → Idi u Google Console → OAuth Client → kopiraj Client ID');
console.log('     → Paste u Supabase → Google Provider → Client ID');
console.log('  4. Uporedi "Client Secret":');
console.log('     → Idi u Google Console → OAuth Client → kopiraj Client Secret');
console.log('     → Paste u Supabase → Google Provider → Client Secret');
console.log('  5. Proveri da je "Enabled" = ON (zeleno)');
console.log('  6. Klikni "Save"');

console.log('\n📍 KORAK 3: OČISTI BROWSER CACHE');
console.log('─'.repeat(70));
console.log('  1. Otvori DevTools (F12)');
console.log('  2. Right-click na Refresh button');
console.log('  3. Izaberi "Empty Cache and Hard Reload"');
console.log('  ILI:');
console.log('  1. Idi u Settings → Privacy → Clear browsing data');
console.log('  2. Izaberi "Cookies and site data"');
console.log('  3. Izaberi "Cached images and files"');
console.log('  4. Clear data');

console.log('\n📍 KORAK 4: TESTIRAJ U INCOGNITO MODE');
console.log('─'.repeat(70));
console.log('  1. Otvori Incognito/Private window (Ctrl+Shift+N)');
console.log('  2. Idi na: https://pumpajvideodl.com');
console.log('  3. Klikni "Google" button');
console.log('  4. Probaj login');
console.log('\n  Incognito mode nema cache, pa će pokazati pravu grešku');

console.log('\n📍 KORAK 5: SAČEKAJ I PROBAJ PONOVO');
console.log('─'.repeat(70));
console.log('  Ako sve gore proverio i još ne radi:');
console.log('  → Sačekaj 10-15 minuta');
console.log('  → Google sistemu može trebati vreme');
console.log('  → Probaj ponovo u Incognito mode');

console.log('\n\n🔍 DEBUG - PROVERI TAČAN URI KOJI SE KORISTI:');
console.log('─'.repeat(70));
console.log('  1. Otvori https://pumpajvideodl.com');
console.log('  2. Otvori DevTools (F12) → Network tab');
console.log('  3. Klikni "Google" button');
console.log('  4. Pogledaj request ka Google (authorize endpoint)');
console.log('  5. Proveri "redirect_uri" parametar u URL-u');
console.log('  6. Uporedi sa Google Console Authorized redirect URIs');

console.log('\n\n📋 TAČNA KONFIGURACIJA:');
console.log('─'.repeat(70));
console.log('\n  GOOGLE CLOUD CONSOLE:');
console.log('  ┌────────────────────────────────────────────────────────────────┐');
console.log('  │ Authorized redirect URIs:                                      │');
console.log('  │   URIs 1                                                       │');
console.log('  │   https://smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/callback   │');
console.log('  └────────────────────────────────────────────────────────────────┘');
console.log('\n  SUPABASE DASHBOARD:');
console.log('  ┌────────────────────────────────────────────────────────────────┐');
console.log('  │ Google Provider:                                               │');
console.log('  │   Enabled: ON                                                  │');
console.log('  │   Client ID: (iz Google Console)                               │');
console.log('  │   Client Secret: (iz Google Console)                           │');
console.log('  └────────────────────────────────────────────────────────────────┘');

console.log('\n\n⚠️  ČESTA GREŠKA - VIŠE OAuth KLIJENATA:');
console.log('─'.repeat(70));
console.log('  Možda imaš više OAuth 2.0 klijenata u Google Console!');
console.log('\n  Proveri:');
console.log('  1. Idi na: https://console.cloud.google.com/apis/credentials');
console.log('  2. Pogledaj sekciju "OAuth 2.0 Client IDs"');
console.log('  3. Da li imaš više klijenata?');
console.log('  4. Proveri koji Client ID koristiš u Supabase');
console.log('  5. Dodaj Redirect URI u ISPRAVAN OAuth klijent');

console.log('\n\n🔐 ALTERNATIVA - KREIRAJ NOVI OAuth CLIENT:');
console.log('─'.repeat(70));
console.log('  Ako ništa ne radi, kreiraj potpuno novi OAuth Client:');
console.log('\n  1. Idi na: https://console.cloud.google.com/apis/credentials');
console.log('  2. Klikni "+ CREATE CREDENTIALS"');
console.log('  3. Izaberi "OAuth client ID"');
console.log('  4. Application type: "Web application"');
console.log('  5. Name: "pumpajvideodl-production"');
console.log('  6. Authorized redirect URIs:');
console.log('     → https://smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/callback');
console.log('  7. Klikni "CREATE"');
console.log('  8. Kopiraj novi Client ID i Client Secret');
console.log('  9. Paste ih u Supabase Google Provider');
console.log('  10. Save i testiraj odmah (novi klijent ne treba da čeka propagaciju)');

console.log('\n\n═'.repeat(70));
console.log('  🎯 PROVERI KORAK PO KORAK I JAVI ŠTA VIDIŠ! 🎯');
console.log('═'.repeat(70));
console.log('\n\n');
