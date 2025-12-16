# Config Templates

Use these files as templates for local and remote environments.

- `env.local.example` is tuned for local docker-compose and defaults to localhost Postgres.
- `env.remote.example` is tuned for Fly.io + Supabase; replace placeholders with real project values.

Copy the appropriate file to `.env` (or service-specific env files) before running services.
