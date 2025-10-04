// AuthForm.tsx
// OVAJ FAJL JE SAMO KOMPATIBILNI WRAPPER.
// Prava login/register logika i UI su u <LoginGate> (vidi AuthProvider.tsx).
// Možeš i potpuno ukloniti ovaj fajl i svuda koristiti <LoginGate> direktno.

import React from 'react';
import { LoginGate } from './AuthProvider';

type Props = {
  /** Ako proslediš children, LoginGate će ga prikazati tek nakon uspešne prijave. */
  children?: React.ReactNode;
};

/**
 * Kompatibilni wrapper oko <LoginGate>.
 * Ako nema children, renderuje samo login/register ekran (što je očekivano za /login rutu).
 */
export function AuthForm({ children }: Props) {
  return <LoginGate>{children ?? <div />}</LoginGate>;
}

export default AuthForm;

// (Opcionalno) Re-export da možeš u ostatku koda da uvoziš direktno iz ovog fajla
export { LoginGate };
