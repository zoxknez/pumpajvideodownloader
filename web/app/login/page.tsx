'use client';
import { useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();
  async function onLogin() {
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message); else router.push('/');
  }
  return (
    <div className="max-w-sm mx-auto p-4 space-y-3">
      <input className="w-full border rounded p-2" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
      <input className="w-full border rounded p-2" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
      <button className="px-4 py-2 rounded bg-blue-600 text-white w-full" onClick={onLogin}>Login</button>
    </div>
  );
}
