// 🚨 QUICK FIX - Paste this in Console (F12)
// Fixes wrong backend URL issue

console.clear();
console.log('🔧 Fixing Backend URL...\n');

// Check current state
console.log('1️⃣ Current State:');
const currentOverride = localStorage.getItem('pumpaj:apiBaseOverride');
console.log('   localStorage override:', currentOverride || 'NOT SET');

if (currentOverride) {
    console.log('   ❌ BAD: localStorage has wrong URL:', currentOverride);
}

// Remove bad override
console.log('\n2️⃣ Removing localStorage override...');
localStorage.removeItem('pumpaj:apiBaseOverride');
console.log('   ✅ Removed!');

// Verify
console.log('\n3️⃣ Verification:');
console.log('   After removal:', localStorage.getItem('pumpaj:apiBaseOverride') || 'NULL (good!)');

// Check if env var exists
console.log('\n4️⃣ Environment Check:');
console.log('   NEXT_PUBLIC_API_BASE:', process.env.NEXT_PUBLIC_API_BASE || '⚠️ NOT SET');

// Expected backend URL
const correctBackend = 'https://pumpaj-backend-production.up.railway.app';
console.log('   Expected backend:', correctBackend);

// Instructions
console.log('\n5️⃣ Next Steps:');
if (!process.env.NEXT_PUBLIC_API_BASE) {
    console.log('   ⚠️ Environment variable NOT SET on Vercel!');
    console.log('   Go to: https://vercel.com/o0o0o0os-projects/web/settings/environment-variables');
    console.log('   Add: NEXT_PUBLIC_API_BASE = ' + correctBackend);
} else if (process.env.NEXT_PUBLIC_API_BASE !== correctBackend) {
    console.log('   ⚠️ Environment variable is WRONG:', process.env.NEXT_PUBLIC_API_BASE);
    console.log('   Should be:', correctBackend);
} else {
    console.log('   ✅ Environment variable is CORRECT!');
}

console.log('\n6️⃣ Reloading in 3 seconds...');
setTimeout(() => {
    console.log('🔄 Reloading...');
    location.reload();
}, 3000);

console.log('\n✅ Fix applied! Wait for reload...');
