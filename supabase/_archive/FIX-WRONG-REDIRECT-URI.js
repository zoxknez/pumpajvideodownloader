#!/usr/bin/env node

console.log('\n\n');
console.log('═'.repeat(70));
console.log('  ⚠️  POGREŠAN REDIRECT URI - HITNA ISPRAVKA! ⚠️');
console.log('═'.repeat(70));

console.log('\n🚨 TRENUTNA GREŠKA:');
console.log('─'.repeat(70));
console.log('  Dodao si: ❌ https://pumpajvideodl.com');
console.log('  Trebalo je: ✅ https://smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/callback');
console.log('\n  Razlog: Google OAuth mora da redirect-uje na SUPABASE callback URL,');
console.log('          ne na tvoj production domain!');

console.log('\n\n✅ ISPRAVKA (3 KORAKA):');
console.log('─'.repeat(70));

console.log('\n📍 KORAK 1: OBRIŠI POGREŠAN URI');
console.log('─'.repeat(70));
console.log('  1. U Google Cloud Console (već otvoreno)');
console.log('  2. Pronađi "Authorized redirect URIs"');
console.log('  3. Obriši: https://pumpajvideodl.com');
console.log('     (klikni X pored URI-ja)');

console.log('\n📍 KORAK 2: DODAJ ISPRAVAN URI');
console.log('─'.repeat(70));
console.log('  1. Klikni: "+ ADD URI"');
console.log('  2. Paste OVAJ URI (već je u clipboard-u):');
console.log('\n  ┌─────────────────────────────────────────────────────────────────┐');
console.log('  │ https://smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/callback      │');
console.log('  └─────────────────────────────────────────────────────────────────┘');
console.log('\n  ⚠️  VAŽNO: Kopiraj CELU URL adresu, sa /auth/v1/callback na kraju!');

console.log('\n📍 KORAK 3: SAČUVAJ');
console.log('─'.repeat(70));
console.log('  Klikni "SAVE" na dnu stranice');

console.log('\n\n💡 OBJAŠNJENJE - KAKO RADI OAUTH FLOW:');
console.log('─'.repeat(70));
console.log('\n  1️⃣  User klikne "Sign in with Google" na: pumpajvideodl.com');
console.log('      ↓');
console.log('  2️⃣  Browser redirect-uje na Google login page');
console.log('      ↓');
console.log('  3️⃣  User se login-uje i odobri aplikaciju');
console.log('      ↓');
console.log('  4️⃣  Google redirect-uje nazad na: smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/callback');
console.log('      (OVDE MORA DA BUDE REGISTROVANO!)');
console.log('      ↓');
console.log('  5️⃣  Supabase obrađuje callback i kreira session');
console.log('      ↓');
console.log('  6️⃣  Supabase redirect-uje nazad na: pumpajvideodl.com/auth/callback');
console.log('      ↓');
console.log('  7️⃣  Tvoja app obrađuje session i redirect-uje user na homepage');

console.log('\n\n📋 OPCIONO - DODAJ I LOCALHOST (za development):');
console.log('─'.repeat(70));
console.log('  Ako želiš da testirajš lokalno, dodaj i:');
console.log('    → http://localhost:3000');
console.log('    → http://localhost:3000/auth/callback');
console.log('\n  Ali OBAVEZNO mora da bude i Supabase callback URL!');

console.log('\n\n🔍 PROVERA - DA LI SI DODAO ISPRAVAN URI:');
console.log('─'.repeat(70));
console.log('  Nakon što klikneš SAVE, trebalo bi da vidiš:');
console.log('\n  ✅ Authorized redirect URIs:');
console.log('     URIs 1');
console.log('     https://smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/callback');
console.log('\n  ⚠️  Ako vidiš bilo šta drugo, NIJE TAČNO!');

console.log('\n\n⏱️  VREME PRIMENE:');
console.log('─'.repeat(70));
console.log('  Google kaže: "It may take 5 minutes to a few hours"');
console.log('  Obično traje: 2-5 minuta');
console.log('  Preporuka: Sačekaj 3 minuta, pa probaj ponovo');

console.log('\n\n🧪 TESTIRANJE NAKON ISPRAVKE:');
console.log('─'.repeat(70));
console.log('  1. Sačekaj 3-5 minuta');
console.log('  2. Idi na: https://pumpajvideodl.com');
console.log('  3. Klikni "Google" button');
console.log('  4. Trebalo bi da vidiš Google Account Chooser (bez greške)');
console.log('  5. Izaberi account');
console.log('  6. Trebalo bi da te vrati na pumpajvideodl.com');

console.log('\n\n⚠️  AKO I DALJE NE RADI:');
console.log('─'.repeat(70));
console.log('\n  Greška: "redirect_uri_mismatch"');
console.log('  Rešenje: Proveri da li je URI TAČAN u Google Console:');
console.log('    ✅ https://smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/callback');
console.log('    ❌ https://pumpajvideodl.com');
console.log('    ❌ https://pumpajvideodl.com/auth/callback');
console.log('\n  Greška: "invalid_client"');
console.log('  Rešenje: Client ID/Secret nisu tačni u Supabase dashboard');
console.log('    → Proveri: https://supabase.com/dashboard/project/smzxjnuqfvpzfzmyxpbp/auth/providers');

console.log('\n\n📚 REFERENCE:');
console.log('─'.repeat(70));
console.log('  📖 Supabase Google Auth Docs:');
console.log('     https://supabase.com/docs/guides/auth/social-login/auth-google');
console.log('\n  📖 Google OAuth 2.0 Docs:');
console.log('     https://developers.google.com/identity/protocols/oauth2/web-server');

console.log('\n\n═'.repeat(70));
console.log('  🎯 HITNO: OBRIŠI POGREŠAN URI I DODAJ ISPRAVAN! 🎯');
console.log('═'.repeat(70));
console.log('\n  🔗 Google Console: https://console.cloud.google.com/apis/credentials');
console.log('\n  📋 KOPIRAJ (u clipboard-u): https://smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/callback');
console.log('\n  ⚠️  NE ZABORAVI: Obriši https://pumpajvideodl.com prvo!');
console.log('\n\n');
