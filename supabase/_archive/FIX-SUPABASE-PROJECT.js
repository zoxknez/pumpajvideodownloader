#!/usr/bin/env node

console.log('\n\n');
console.log('═'.repeat(70));
console.log('  🔧 POPRAVLJEN SUPABASE PROJECT ID! 🔧');
console.log('═'.repeat(70));

console.log('\n⚠️  PROBLEM:');
console.log('─'.repeat(70));
console.log('  Google OAuth je koristio STARI projekat:');
console.log('  ❌ https://fvbayulmttmcdeiybeot.supabase.co (STARI)');
console.log('  ✅ https://smzxjnuqfvpzfzmyxpbp.supabase.co (NOVI - ISPRAVAN)');

console.log('\n\n🔧 URAĐENE POPRAVKE:');
console.log('─'.repeat(70));
console.log('  1. ✅ Obrisane VITE_* environment variables sa Vercela');
console.log('  2. ✅ Obrisane stare NEXT_PUBLIC_SUPABASE_* vrednosti');
console.log('  3. ✅ Dodate nove NEXT_PUBLIC_SUPABASE_* vrednosti:');
console.log('     → NEXT_PUBLIC_SUPABASE_URL: https://smzxjnuqfvpzfzmyxpbp.supabase.co');
console.log('     → NEXT_PUBLIC_SUPABASE_ANON_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6...');
console.log('  4. ✅ Force redeploy na Vercel (--force flag)');
console.log('  5. ✅ Production app: https://pumpajvideodl.com');

console.log('\n\n✅ SADA GOOGLE OAUTH KORISTI ISPRAVAN PROJEKAT:');
console.log('─'.repeat(70));
console.log('  🔗 https://smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/authorize?provider=google...');

console.log('\n\n🧪 TESTIRAJ ODMAH:');
console.log('─'.repeat(70));
console.log('  1. Otvori: https://pumpajvideodl.com');
console.log('  2. Klikni "Google" button');
console.log('  3. Proveri URL - trebalo bi da počinje sa:');
console.log('     ✅ https://smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/authorize');
console.log('  4. Izaberi Google account');
console.log('  5. Redirect nazad na app');

console.log('\n\n📌 VERIFIKACIJA:');
console.log('─'.repeat(70));
console.log('  Deployment URL: https://pumpajvideodl-e4b84htex-o0o0o0os-projects.vercel.app');
console.log('  Production URL: https://pumpajvideodl.com');
console.log('  Inspect:        https://vercel.com/o0o0o0os-projects/pumpajvideodl/DvVgqB3fDuAtdNaKMgxfafrcucbh');

console.log('\n\n🔍 PROVERA ENV VARS:');
console.log('─'.repeat(70));
console.log('  Vercel Dashboard → Project → Settings → Environment Variables');
console.log('  🔗 https://vercel.com/o0o0o0os-projects/pumpajvideodl/settings/environment-variables');
console.log('\n  Trebalo bi da vidiš:');
console.log('    ✅ NEXT_PUBLIC_SUPABASE_URL = https://smzxjnuqfvpzfzmyxpbp.supabase.co');
console.log('    ✅ NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
console.log('    ❌ VITE_SUPABASE_URL (obrisano)');
console.log('    ❌ VITE_SUPABASE_ANON_KEY (obrisano)');

console.log('\n\n⏭️  SLEDEĆI KORACI:');
console.log('─'.repeat(70));
console.log('  1. ✅ Dodaj Redirect URLs u Supabase dashboard');
console.log('     🔗 https://supabase.com/dashboard/project/smzxjnuqfvpzfzmyxpbp/auth/url-configuration');
console.log('     Redirect URLs:');
console.log('       → https://pumpajvideodl.com/**');
console.log('       → https://www.pumpajvideodl.com/**');
console.log('       → https://pumpajvideodl-e4b84htex-o0o0o0os-projects.vercel.app/**');
console.log('       → https://*.vercel.app/**');
console.log('       → http://localhost:3000/**');
console.log('\n  2. ✅ Pokreni SQL schema (supabase/auto-setup.sql)');
console.log('     🔗 https://supabase.com/dashboard/project/smzxjnuqfvpzfzmyxpbp/sql/new');

console.log('\n\n💡 TROUBLESHOOTING:');
console.log('─'.repeat(70));
console.log('  Ako i dalje vidiš STARI projekat URL:');
console.log('    1. Hard refresh na browser (Ctrl+Shift+R)');
console.log('    2. Očisti cache i cookies za pumpajvideodl.com');
console.log('    3. Proveri Network tab u DevTools → Authorization request URL');

console.log('\n\n═'.repeat(70));
console.log('  ✅ ENVIRONMENT VARIABLES SU AŽURIRANI! 🚀');
console.log('═'.repeat(70));
console.log('\n  🎯 Google OAuth sada koristi ISPRAVAN Supabase projekat!');
console.log('\n\n');
