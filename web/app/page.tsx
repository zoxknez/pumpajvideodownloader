// app/login/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// ⬇️ Prilagodi import prema tvojoj strukturi (ako je fajl npr. src/components/AuthProvider.tsx):
// import { AuthProvider, LoginGate } from '@/components/AuthProvider';
import { AuthProvider, LoginGate } from '@/components/AuthProvider';

function LoggedInRedirect() {
  const router = useRouter();
  useEffect(() => {
    // Kada je korisnik ulogovan, LoginGate renderuje decu → elegantan redirect na početnu
    router.replace('/');
  }, [router]);
  return null;
}

export default function LoginPage() {
  return (
    <AuthProvider>
      {/* LoginGate iz tvog fajla već renderuje:
          - GORNJI HEADER (brend, badževi, jezički prekidač…)
          - LEVU SEKCIJU (app showcase sa slajdovima/highlightima)
          - DESNU SEKCIJU (kompletan login/registracija UI)
          Kada je korisnik ulogovan, prikazuje decu — ovde radimo redirect. */}
      <LoginGate>
        <LoggedInRedirect />
      </LoginGate>
    </AuthProvider>
  );
}
