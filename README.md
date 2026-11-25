# IIIT Trichy Sports Platform

Full-stack campus sports management platform for IIIT Tiruchirappalli — covering 9 sports clubs, induction pipelines, semester tournaments, real-time 9-sport event-sourced live match scoring, Prothymos multi-sport player auctions with projector broadcast mode, and historical tournament archives.

## Stack
- **Frontend**: React 18, TypeScript, Vite, React Router
- **Backend**: Node.js, TypeScript, Express, Server-Sent Events (SSE)
- **Database**: PostgreSQL with Drizzle ORM & SQL migrations (`drizzle/`)

## Environment Variables
Copy `.env.example` to `.env` and configure:
- `DATABASE_URL` — PostgreSQL connection string (**required in production**; development falls back to an in-memory demo store when unset).
- `SESSION_SECRET` — High-entropy signing secret of at least 32 characters (**required in production**; server fails fast if missing or weak).
- `ENABLE_DEMO_SWITCHER` — Defaults to `false`. Set to `true` only in local/staging demos to enable the persona switcher (anonymous visitors still start as `Public Guest`).
- `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET` — Optional Google Workspace OAuth credentials to enable `@iiitt.ac.in` Google Sign-In (`/api/auth/google`).
- `APP_BASE_URL` — Public HTTPS origin used to construct the OAuth callback URL (`https://your-domain/api/auth/google/callback`).
- `CORS_ORIGIN` — Comma-separated list of explicit allowed origins (no wildcards).
- `TRUST_PROXY` — Proxy hop count for Express `trust proxy` (defaults to `1` in production).
- `SEED_USER_PASSWORD` — Optional password hashed asynchronously via `scrypt` for seeded accounts during `npm run db:seed`.
- `PORT` — HTTP server port (defaults to `3000`).

## Local Development
```bash
npm install
npm run dev
```

## Database Migrations & Seeding
```bash
# Generate SQL migrations from src/db/schema.ts
npx drizzle-kit generate

# Apply schema / migrations to PostgreSQL
npm run db:push

# Seed initial clubs, tournaments, users, settings, and auction data
npm run db:seed
```

## Build, Typecheck & Production Start
```bash
# Typecheck client + server
npm run lint

# Build client bundle (dist/client) and server JS (dist/server)
npm run build

# Run production server
npm run start
```

## Deployment (Render)
Use the included `render.yaml` Blueprint to provision the Node web service and managed PostgreSQL database. After provisioning:
1. Set `CORS_ORIGIN`, `APP_BASE_URL`, and optional Google OAuth keys in the Render dashboard.
2. Run `npm run db:push && npm run db:seed` against your provisioned `DATABASE_URL`.
3. Verify `GET /api/health` returns `{ ok: true, databaseConnected: true }`.
