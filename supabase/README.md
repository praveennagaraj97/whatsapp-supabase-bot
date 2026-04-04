# Supabase Local Setup

This repository keeps the Supabase schema in `supabase/migrations/` and seeds the project data from `scripts/seed-data.mjs`. The local stack is a database-first workflow: start Supabase locally, apply the migrations, then load the CSV-backed knowledge base.

## What Runs Locally

The local Supabase configuration in `supabase/config.toml` currently enables:

- Postgres on `localhost:54322`
- Supabase API on `http://localhost:54321`
- Supabase Studio on `http://localhost:54323`

Auth and Storage are disabled in this repo's local config, so the local stack is focused on the database and edge-function development loop.

## Prerequisites

Before you begin, make sure you have:

- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Docker](https://docs.docker.com/get-docker/)
- [Node.js](https://nodejs.org/)
- [Deno](https://deno.com/)

## First-Time Setup

### 1. Install Dependencies

From the repository root:

```bash
npm install
```

### 2. Configure Environment

Copy the example env file and fill in the values you want to use locally:

```bash
cp env.example .env
```

For a local Supabase instance, the important values are:

- `SUPABASE_URL` should point to the local API URL returned by `supabase status`
- `SUPABASE_SERVICE_ROLE_KEY` should be the local `service_role` key from `supabase status`
- `SUPABASE_ACCESS_TOKEN` is only needed if you plan to deploy functions or push secrets

The remaining keys are required if you want the webhook to talk to Meta WhatsApp and Gemini from your local environment.

### 3. Start Supabase

```bash
supabase start
```

This starts the local database, API, and Studio. Use `supabase status` after startup to confirm the URLs and local keys.

### 4. Apply the Migrations

```bash
supabase db reset
```

This recreates the local database from the migration files in `supabase/migrations/` and ensures the default project, admin user, and project-scoped schema are present.

### 5. Seed the Knowledge Base

The CSV knowledge base is seeded separately from the SQL migrations:

```bash
make seed
```

This loads the local or remote Supabase instance pointed to by your `.env` file and inserts the rows from:

- `data/doctors.csv`
- `data/clinics.csv`
- `data/medicines.csv`
- `data/faqs.csv`

The seeder expects the default project slug `medibot-default`, which is created by `supabase/migrations/20260317000000_admin_projects.sql`.

### 6. Run the Edge Functions Locally

```bash
make serve
make serve-admin
```

The webhook function runs on `http://localhost:8000` and the admin function runs on `http://localhost:8001`.

### 7. Open Studio

Visit [http://localhost:54323](http://localhost:54323) to inspect the database, tables, and auth state.

## Day-to-Day Workflow

### Reset Everything

Use this after schema changes or when you want a clean database:

```bash
supabase db reset
make seed
```

### Check Local Status

```bash
supabase status
```

### Stop the Local Stack

```bash
supabase stop
```

## How the Repo Is Wired

- `supabase/migrations/20260309000000_initial_schema.sql` defines the base chat tables, RLS policies, and triggers.
- `supabase/migrations/20260317000000_admin_projects.sql` introduces the project registry, project-scoped tables, and the default `medibot-default` project.
- `scripts/seed-data.mjs` reads the CSV files in `data/` and upserts project-scoped knowledge-base rows.
- `supabase/functions/webhook/index.ts` reads the enabled project and processes WhatsApp messages.
- `supabase/functions/admin/index.ts` manages auth, projects, prompts, and knowledge-base imports.

## Default Local Credentials

The migrations create a default admin user for the local/demo setup:

- Email: `admin@mail.com`
- Password: `Admin@123456`

Rotate that password before using the project in any non-demo environment.

## Troubleshooting

- If `supabase start` fails, make sure Docker is running.
- If the seeder cannot find `medibot-default`, run `supabase db reset` first so the migrations are applied.
- If `make seed` fails, confirm that `.env` points to the local API URL and local service-role key from `supabase status`.
- If a function cannot reach Supabase locally, double-check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`.
