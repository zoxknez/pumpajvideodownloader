# Contributing

Thanks for considering a contribution! Here’s the quick path:

1. Fork the repo and create a feature branch.
2. Dev environment
   - Node 18+
   - Install deps: `npm install` and `npm install --prefix server`
   - Start dev: `npm run dev:start:all`
3. Make changes with tests/types green:
   - `npm run typecheck && npm run typecheck:server`
   - `npm test`
   - Lint: `npm run lint`
4. Commit using conventional-ish messages and open a PR.

Code style: TypeScript strict where possible, keep public APIs stable, and avoid unrelated refactors in the same PR.

Security note: Don’t include secrets in code or issues. Report sensitive problems privately if needed.
