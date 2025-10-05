// Quick test da vidiš šta se dešava u browseru
// Paste u Console (F12) na https://pumpajvideodl.com

console.clear();
console.log('🔍 Debug Supabase Auth State\n');

// 1. Check environment variables
console.log('1️⃣ Environment Variables:');
console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT SET');
console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.substring(0, 20) + '...' || 'NOT SET');

// 2. Check localStorage
console.log('\n2️⃣ LocalStorage:');
console.log('app:token:', localStorage.getItem('app:token') ? 'EXISTS' : 'NULL');
Object.keys(localStorage).filter(k => k.includes('supabase')).forEach(key => {
  console.log(key + ':', localStorage.getItem(key)?.substring(0, 50) + '...');
});

// 3. Check Supabase client
console.log('\n3️⃣ Checking Supabase Session...');
(async () => {
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(
      'https://smzxjnuqfvpzfzmyxpbp.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtenhqbnVxZnZwemZ6bXl4cGJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjgxMTk3NjAsImV4cCI6MjA0MzY5NTc2MH0.wvnLlI-l-C11kVS8j1OW0ZZ-Zl_G7_C-WZCpYVGx19g'
    );
    
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('❌ Error:', error.message);
    } else if (session) {
      console.log('✅ Session Active:');
      console.log('  User ID:', session.user.id);
      console.log('  Email:', session.user.email);
      console.log('  Expires:', new Date(session.expires_at * 1000).toLocaleString());
    } else {
      console.log('⚠️ No active session');
    }
  } catch (err) {
    console.error('❌ Failed to check session:', err);
  }
})();

// 4. Network requests
console.log('\n4️⃣ Recent Network Activity:');
console.log('Check Network tab for:');
console.log('  - /auth/v1/user (should be 200 if logged in)');
console.log('  - /api/me (should skip if Supabase session exists)');

console.log('\n✅ Debug complete! Check output above.');
