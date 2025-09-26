# Pumpaj Web (Next.js)

Minimal web frontend for Pumpaj server with Supabase auth.

Setup
- Copy .env.example to .env.local and fill in:
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
  - NEXT_PUBLIC_API (Railway server URL)
- Install deps and run:

```bash
npm install
npm run dev
```

Open http://localhost:3000/login to sign in, then go to home and start a job.