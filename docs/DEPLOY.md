# Pumpaj Deployment Checklist

Use this document before every release to make sure the web (Next.js) and desktop (Electron) experiences are ready for production.

## 1. Environment variables

### Supabase (web login)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- (Optional) `SUPABASE_SERVICE_ROLE_KEY` on the backend if you perform privileged actions.

### Backend / API bridge
- `NEXT_PUBLIC_API` – public URL of the Express server that the web UI should call.
- `VITE_API_BASE` – legacy Vite dev override (not required in production when the app is proxied through Express/Electron).
- `CORS_ORIGIN` – comma separated allow-list (`https://app.example.com`) or `*` in dev.
- `APP_JWT_*` (issuer/audience/keys or secret) if you are issuing signed tokens outside Supabase.

### Desktop specific
- No additional env required if you bundle the server with binaries, but keep the following in mind:
  - Ensure `binaries/yt-dlp.exe`, `binaries/ffmpeg.exe`, and `binaries/ffprobe.exe` ship with the Electron distribution.
  - Update `electron/main.js` if you change default ports or paths.

## 2. Build matrix

Run the full verification pipeline from the repo root (mirrors CI):

```powershell
npm install
npm run verify
```

This executes:
1. `npm run lint`
2. `npm run typecheck`
3. `npm run typecheck:server`
4. `npm run build:server` → Compiles the Express backend.
5. `npm run build` → Vite desktop bundle (written to `dist/`).
6. `npm run build -w web` → Next.js static export (written to `web/.next`).
7. `npm run test --workspaces=false --if-present`

Every step must finish without warnings or errors. The Next build automatically performs TypeScript type checking. If you only need the dual builds (and have already linted/type-checked), run `npm run build:all` instead.

## 3. Smoke tests

### Backend health
```powershell
curl https://api.example.com/health
```
Expect `{ "ok": true }`.

### Web UI
1. Deploy the Next output to your host (e.g., Vercel, static hosting with an edge function proxy, etc.).
2. Visit the deployed URL, sign in through Supabase, and ensure the Pumpaj UI renders fully.
3. Paste a YouTube URL and run an analysis; confirm progress SSE updates and the job finishes.

### Desktop package
1. Run `npm run dist:win` (creates portable and zip artifacts in `release/`).
2. Launch the portable executable:
   - Queue a job and confirm downloads land in the expected folder.
   - Test the IPC actions (`Open Downloads`, pause/resume queue, etc.).

## 4. Observability & Logs

- Check `server/logs/app.log` for slow jobs, yt-dlp errors, or rate limit messages. Clean the log if deploying new binaries.
- Confirm that Supabase audit logs show successful sign-ins.

## 5. Post-deploy sanity checklist

- [ ] Next.js web app reachable over HTTPS.
- [ ] Supabase magic-link/login flow works from production domain.
- [ ] Downloaded files have expected filenames and extensions.
- [ ] SSE progress stream stays connected behind CDN/edge.
- [ ] Desktop build contains up-to-date ffmpeg/yt-dlp binaries.
- [ ] Policy limits (FREE/PREMIUM) behave as expected.

Keep this file updated whenever the deployment flow changes.
