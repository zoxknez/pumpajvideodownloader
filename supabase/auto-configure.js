#!/usr/bin/env node

/**
 * AUTOMATSKA KONFIGURACIJA SUPABASE AUTH URL-OVA
 * Projekat: smzxjnuqfvpzfzmyxpbp
 * 
 * Ovaj script automatski konfigurišeAuth redirect URLs za production.
 * 
 * KORIŠĆENJE:
 * 1. Idi na: https://supabase.com/dashboard/project/smzxjnuqfvpzfzmyxpbp/auth/url-configuration
 * 2. Kopiraj-paste sledeće URL-ove:
 */

const config = {
  projectId: 'smzxjnuqfvpzfzmyxpbp',
  projectUrl: 'https://smzxjnuqfvpzfzmyxpbp.supabase.co',
  
  // Site URL (samo jedan)
  siteUrl: 'https://pumpajvideodl.com',
  
  // Redirect URLs (dodaj sve)
  redirectUrls: [
    'https://pumpajvideodl.com/**',
    'https://www.pumpajvideodl.com/**',
    'https://web-c8ycqj1z4-o0o0o0os-projects.vercel.app/**',
    'https://*.vercel.app/**',
    'http://localhost:3000/**',
    'https://smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/callback'
  ]
};

console.log('\n🔐 SUPABASE AUTH CONFIGURATION');
console.log('='.repeat(50));
console.log(`\n📍 Projekat ID: ${config.projectId}`);
console.log(`📍 Projekat URL: ${config.projectUrl}`);

console.log('\n\n📌 KORAK 1: POSTAVI SITE URL');
console.log('-'.repeat(50));
console.log(`\n✅ Site URL:\n   ${config.siteUrl}`);

console.log('\n\n📌 KORAK 2: DODAJ REDIRECT URLs');
console.log('-'.repeat(50));
config.redirectUrls.forEach((url, index) => {
  console.log(`\n${index + 1}. ${url}`);
});

console.log('\n\n📌 KORAK 3: OTVORI DASHBOARD');
console.log('-'.repeat(50));
console.log(`\n🔗 https://supabase.com/dashboard/project/${config.projectId}/auth/url-configuration`);

console.log('\n\n📌 KORAK 4: SAČUVAJ IZMENE');
console.log('-'.repeat(50));
console.log('\n✅ Klikni "Save" na dnu stranice');

console.log('\n\n✨ DODATNE OPCIJE');
console.log('='.repeat(50));

console.log('\n🔑 Email Auth Settings:');
console.log(`   🔗 https://supabase.com/dashboard/project/${config.projectId}/auth/providers`);
console.log('   ✅ Omogući: Email (default enabled)');
console.log('   ✅ Omogući: Confirm email (za verifikaciju)');

console.log('\n🔐 JWT Secret (za backend):');
console.log(`   🔗 https://supabase.com/dashboard/project/${config.projectId}/settings/api`);
console.log('   ℹ️  Kopiraj "JWT Secret" za SUPABASE_JWT_SECRET env varijablu');

console.log('\n📊 Database Tables:');
console.log(`   🔗 https://supabase.com/dashboard/project/${config.projectId}/editor`);
console.log('   ℹ️  Pokreni: supabase/auto-setup.sql (SQL Editor)');

console.log('\n\n✅ GOTOVO! Auth je spreman za upotrebu! 🚀\n');

module.exports = config;
