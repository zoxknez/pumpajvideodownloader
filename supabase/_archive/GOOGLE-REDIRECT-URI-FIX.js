#!/usr/bin/env node

console.log('\n\n');
console.log('═'.repeat(70));
console.log('  ⚠️  GOOGLE CLOUD CONSOLE - REDIRECT URI SETUP ⚠️');
console.log('═'.repeat(70));

console.log('\n🚨 GREŠKA:');
console.log('─'.repeat(70));
console.log('  "Не можете да се пријавите у ову апликацију јер није у складу');
console.log('  са Google OAuth 2.0 смерницама."');
console.log('\n  Razlog: Redirect URI nije registrovan u Google Cloud Console');

console.log('\n\n✅ REŠENJE - DODAJ REDIRECT URI:');
console.log('─'.repeat(70));

console.log('\n📍 KORAK 1: OTVORI GOOGLE CLOUD CONSOLE');
console.log('─'.repeat(70));
console.log('  🔗 https://console.cloud.google.com/apis/credentials');

console.log('\n📍 KORAK 2: IZABERI SVOJ OAuth 2.0 CLIENT');
console.log('─'.repeat(70));
console.log('  1. Pronađi svoju OAuth 2.0 Client ID aplikaciju');
console.log('  2. Klikni na ime aplikacije da je otvoriš');

console.log('\n📍 KORAK 3: DODAJ AUTHORIZED REDIRECT URIs');
console.log('─'.repeat(70));
console.log('  Scroll do sekcije: "Authorized redirect URIs"');
console.log('  Klikni: "+ ADD URI"');
console.log('\n  Dodaj OVAJ TAČAN URI:');
console.log('  ┌─────────────────────────────────────────────────────────────────┐');
console.log('  │ https://smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/callback      │');
console.log('  └─────────────────────────────────────────────────────────────────┘');
console.log('\n  ⚠️  VAŽNO: Kopiraj URI TAČNO kako je napisan! Bez trailing slash!');

console.log('\n📍 KORAK 4: DODAJ I PRODUCTION DOMAIN (OPCIONO ALI PREPORUČENO)');
console.log('─'.repeat(70));
console.log('  Za development i testing, možeš dodati i:');
console.log('  → http://localhost:3000');
console.log('  → http://localhost:3000/auth/callback');

console.log('\n📍 KORAK 5: SAČUVAJ IZMENE');
console.log('─'.repeat(70));
console.log('  Klikni "SAVE" na dnu stranice');
console.log('  ⏱️  Promene mogu trajati nekoliko minuta da se propagiraju');

console.log('\n\n🔍 PROVERA - GDE NAĆI OAuth CLIENT:');
console.log('─'.repeat(70));
console.log('  1. Idi na: https://console.cloud.google.com/apis/credentials');
console.log('  2. Pogledaj sekciju "OAuth 2.0 Client IDs"');
console.log('  3. Ako nemaš OAuth Client, kreiraj ga:');
console.log('     → Klikni "+ CREATE CREDENTIALS"');
console.log('     → Izaberi "OAuth client ID"');
console.log('     → Application type: "Web application"');
console.log('     → Dodaj Authorized redirect URIs (gore)');

console.log('\n\n📋 KOMPLETNA LISTA REDIRECT URIs (za production):');
console.log('─'.repeat(70));
console.log('  Preporučujem da dodaš SVE ove URI-je:');
console.log('\n  1. Supabase Callback (OBAVEZAN):');
console.log('     https://smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/callback');
console.log('\n  2. Localhost Development (OPCIONO):');
console.log('     http://localhost:3000');
console.log('     http://localhost:3000/auth/callback');
console.log('\n  3. Production Domains (OPCIONO - ako koristiš custom callback):');
console.log('     https://pumpajvideodl.com/auth/callback');
console.log('     https://www.pumpajvideodl.com/auth/callback');

console.log('\n\n🔐 KOPIRANJE Client ID i Secret U SUPABASE:');
console.log('─'.repeat(70));
console.log('  Nakon što dodaš Redirect URIs, proveri Supabase konfiguraciju:');
console.log('\n  1. Idi na: https://supabase.com/dashboard/project/smzxjnuqfvpzfzmyxpbp/auth/providers');
console.log('  2. Scroll do "Google" provider');
console.log('  3. Klikni "Edit configuration"');
console.log('  4. Proveri da li su postavljeni:');
console.log('     → Client ID (iz Google Cloud Console)');
console.log('     → Client Secret (iz Google Cloud Console)');
console.log('  5. Enabled: ON (zeleno)');
console.log('  6. Klikni "Save"');

console.log('\n\n⚠️  ČESTE GREŠKE:');
console.log('─'.repeat(70));
console.log('\n  ❌ Greška: "redirect_uri_mismatch"');
console.log('  ✅ Rešenje: URI mora biti TAČAN:');
console.log('     → Proveri da nema trailing slash (/)');
console.log('     → Proveri da je https:// (ne http://)');
console.log('     → Proveri da je /auth/v1/callback (ne /callback)');
console.log('\n  ❌ Greška: "invalid_client"');
console.log('  ✅ Rešenje: Client ID ili Secret nisu tačni u Supabase');
console.log('\n  ❌ Greška: Promene se ne primenjuju odmah');
console.log('  ✅ Rešenje: Sačekaj 2-5 minuta nakon Save-a u Google Console');

console.log('\n\n🧪 TESTIRANJE NAKON SETUP-a:');
console.log('─'.repeat(70));
console.log('  1. Sačekaj 2-3 minuta nakon Save-a u Google Cloud Console');
console.log('  2. Otvori: https://pumpajvideodl.com');
console.log('  3. Klikni "Google" button');
console.log('  4. Trebalo bi da vidiš Google Account Chooser');
console.log('  5. Izaberi account i autorizuj');
console.log('  6. Trebalo bi da te vrati na pumpajvideodl.com');

console.log('\n\n📚 DODATNI RESURSI:');
console.log('─'.repeat(70));
console.log('  📖 Google OAuth Setup:');
console.log('     https://support.google.com/cloud/answer/6158849');
console.log('\n  📖 Supabase Google Auth:');
console.log('     https://supabase.com/docs/guides/auth/social-login/auth-google');
console.log('\n  📄 Lokalna dokumentacija:');
console.log('     supabase/GOOGLE-OAUTH-SETUP.md');

console.log('\n\n═'.repeat(70));
console.log('  🎯 SLEDEĆI KORAK: DODAJ REDIRECT URI U GOOGLE CLOUD CONSOLE! 🎯');
console.log('═'.repeat(70));
console.log('\n  🔗 https://console.cloud.google.com/apis/credentials');
console.log('\n  📋 KOPIRAJ: https://smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/callback');
console.log('\n\n');
