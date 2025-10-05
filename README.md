# Pumpaj Login (1:1, desktop -> web)

Ovo je *identičan* (1/1) login/registration ekran kao u desktop verziji.
Uključen je **LoginGate** (isto kao u `components/AuthProvider.tsx`) i `PumpajMessage.tsx`.

## Kako ubaciti u Next.js (App Router)

1) Kopiraj `components/` i `app/login/page.tsx` u svoj Next projekat.
   - Ako koristiš osnovni alias, `@/components/...` će raditi odmah.
   - Ako nemaš alias, u `page.tsx` zameni import na relativnu putanju:
     `import { LoginGate } from '../../components/AuthProvider'` (prilagodi dubinu).

2) **API backend:** `AuthProvider.tsx` koristi postojeći API (`API_BASE`, /auth/... rute).
   - Ako već imaš `lib/api.ts` kao u desktop/web projektu, drži isti endpoint.
   - Ukoliko koristiš potpuno drugi auth (npr. Supabase), javi i poslaću adapter
     koji zadržava *isti UI*, a menja samo `login/register` pozive.

3) Otvori `/login` rutu. UI, header, bedževi, "ABOUT THE [logo] APP" i kompletan stil su 1/1.

> Napomena:
> - `AuthForm.tsx` iz desktop-a je samo wrapper; ovde koristiš direktno `<LoginGate>`.
> - Ako želiš da "About" bedž prikazuje tvoje kontakt ikone, u `AuthProvider.tsx` to već postoji (1/1).

Srećno! 🚀# Deployment trigger - 2025-10-05 13:33:14
