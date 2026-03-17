This is a Next.js + TypeScript + Tailwind admin panel for the Universal WhatsApp Bot platform.

## Getting Started

1. Create env file:

```bash
cp .env.example .env.local
```

2. Set the admin API base URL:

```bash
NEXT_PUBLIC_ADMIN_API_URL=https://<project-ref>.supabase.co/functions/v1
```

3. Run development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

Architecture constraints followed:

- `src/app/page.tsx` is only the entry point
- All UI and business logic live under `src/components`
- API integration uses `axios` + `swr`
- No Redux / no TanStack Query

Google Sheets import flow:

1. Enter Google Sheet ID
2. Parse sheets (`clinics`, `doctors`, `medicines`, `faqs`) using `public-google-sheets-parser`
3. Preview generated JSON
4. Confirm checkbox
5. Import to backend (`POST /admin/projects/:id/import`)

Production build:

```bash
yarn build
```
