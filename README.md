# Company HRMS — Workforce Management Platform

Monorepo containing the admin portal (Next.js) and employee mobile app (Flutter).

## Structure

```
apps/admin/   — Next.js 16 admin portal + REST API
apps/mobile/  — Flutter Android employee app
packages/types/ — Shared TypeScript types
```

## Getting started

```bash
# Install dependencies
npm install

# Development (admin portal)
npm run dev

# Seed database (Phase 2+)
npm run seed:all

# Run tests
npm run test
```

## Mobile app

See `apps/mobile/README.md` after Phase 2 implementation.

## Docs

See `docs/` for full architecture, API, and design specifications.
