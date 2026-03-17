# WhatsApp Assistant (Multi-Purpose AI Bot Platform)

A **generic, multi-project WhatsApp chatbot platform** powered by **Supabase Edge Functions** (Deno) and **Google Gemini AI**. This is NOT limited to healthcare — it works for any industry or use case.

**Supports unlimited projects** managed through an admin panel. Each project has:

- Independent AI prompts (system + user templates)
- Project-specific source data (resources, services, FAQs)
- Isolated user sessions and conversation history
- Only ONE project enabled at a time drives the live bot

**Example use cases:**

- 🏥 Healthcare systems (doctors, appointments, medicines)
- 🍕 Restaurants (reservations, menu orders, deliveries)
- 🛒 E-commerce (product catalog, order tracking, support)
- 🏢 Customer service (support tickets, FAQs, escalation)
- 🎓 Education (course info, enrollment, schedule)
- 🚕 Ride-sharing (bookings, prices, driver info)
- **...or anything else** — it's completely configurable

By default, we ship a **healthcare/medical example**, but you can instantly create a new project through the admin API and import your own data.

---

## Architecture

```
┌──────────────┐    Webhook     ┌─────────────────────────┐
│   WhatsApp   │ ─────────────► │  Supabase Edge Function  │
│  (Meta API)  │ ◄───────────── │       /webhook           │
└──────────────┘   Responses    └───────────┬─────────────┘
                                            │
                     ┌──────────────────────┤
                     ▼                      ▼
              ┌─────────────┐     ┌──────────────────┐
              │  Supabase   │     │   Google Gemini   │
              │  Postgres   │     │   (gemini-2.5)    │
              │   Database  │     │   Structured AI   │
              └─────────────┘     └──────────────────┘
```

### How It Works

1. **Admin API** manages projects, login, prompts, and project-scoped source data.
2. **User sends a WhatsApp message** → Meta delivers it to the webhook edge function.
3. **Webhook** resolves the currently enabled project, extracts the message, runs guards (dedup, out-of-order, prompt injection), manages the project-scoped user session, and queues concurrent messages.
4. **Gemini AI** receives the user message + session state + the enabled project's knowledge base (doctors/medicines/FAQs) and returns a structured JSON response with extracted data, a reply message, and a next action.
5. **Response handler** interprets the `nextAction` (show doctors list, confirm appointment, order medicine, etc.) and sends the appropriate WhatsApp interactive message (buttons, lists) or plain text.
6. **Session state** is persisted in Supabase per project, so conversations remain isolated when you switch the enabled project.

### Edge Functions

| Function  | Purpose                                                                           | JWT                        |
| --------- | --------------------------------------------------------------------------------- | -------------------------- |
| `webhook` | Main WhatsApp message handler (GET for Meta verification, POST for messages)      | Disabled (public endpoint) |
| `admin`   | Admin login, project CRUD, project enable toggle, and project source-data imports | Disabled (custom bearer)   |

### Shared Modules (`_shared/`)

| Module                                | Responsibility                                                             |
| ------------------------------------- | -------------------------------------------------------------------------- |
| `supabase-client.ts`                  | Singleton Supabase client from env vars                                    |
| `types.ts`                            | All TypeScript interfaces                                                  |
| `constants.ts`                        | Thresholds, button IDs, limits                                             |
| `extract-message.ts`                  | Parses Meta webhook payload → `SimplifiedMessage`                          |
| `message-guards.ts`                   | Deduplication, out-of-order detection, prompt injection filtering          |
| `whatsapp.ts`                         | Meta Cloud API service (send text, buttons, lists, typing, media download) |
| `session.ts`                          | Session CRUD, staleness checks, data inspection                            |
| `message-queue.ts`                    | FIFO enqueue/drain, audio throttling, queue composition                    |
| `chat-history.ts`                     | Persist sent/received messages for context                                 |
| `inactivity.ts`                       | Store and retrieve inactivity-prompt messages                              |
| `knowledge-base.ts`                   | Cached loaders for doctors, clinics, medicines, FAQs + formatting          |
| `projects.ts`                         | Load the single enabled project                                            |
| `admin-auth.ts`                       | Admin password verification and 30-day JWT issuance                        |
| `gemini.ts`                           | Gemini API caller (structured JSON, audio input), AI orchestrator          |
| `prompts/system-prompt.ts`            | MediBot personality, rules, extraction guidelines                          |
| `prompts/user-prompt.ts`              | Per-turn context assembly (session + KB tables + history)                  |
| `prompts/audio-translation-prompt.ts` | Indian language audio → English translation                                |
| `prompts/faq-prompt.ts`               | FAQ answer rephrasing for natural conversation                             |
| `prompts/ai-response-schema.ts`       | Gemini structured JSON output schema                                       |

---

## Database Schema

12 tables in Supabase Postgres with Row Level Security enabled:

| Table                 | Purpose                                                           |
| --------------------- | ----------------------------------------------------------------- |
| `user_sessions`       | Conversation state per user (booking data, processing flags)      |
| `queued_messages`     | FIFO queue for messages received while processing                 |
| `chat_messages`       | Full chat history (user + assistant messages)                     |
| `inactivity_messages` | Temporarily stored messages during inactivity prompts             |
| `projects`            | Project registry, prompt settings, welcome message, enabled state |
| `admin_users`         | Email/password admin accounts for the admin API                   |
| `doctors`             | Doctor directory (seeded from CSV)                                |
| `clinics`             | Clinic directory (seeded from CSV)                                |
| `medicines`           | Medicine catalog (seeded from CSV)                                |
| `faqs`                | Frequently asked questions (seeded from CSV)                      |
| `appointments`        | Booked appointments                                               |
| `medicine_orders`     | Medicine order records                                            |

Migration files:

- `supabase/migrations/20260309000000_initial_schema.sql`
- `supabase/migrations/20260317000000_admin_projects.sql`

---

## Message Processing Pipeline

```
Incoming Message
      │
      ▼
 Extract from Meta payload
      │
      ▼
 Guards: dedup? out-of-order? injection?
      │
      ▼
 Get/Create session
      │
      ▼
 Special commands? (RESET / DEV_RESET)
      │
      ▼
 Inactivity check (24h threshold)
      │           │
      │     ┌─────┴─────┐
      │     │ Show       │
      │     │ Continue / │
      │     │ Start New  │
      │     └────────────┘
      ▼
 Processing? → Enqueue if busy
      │
      ▼
 Set is_processing = true
      │
      ▼
 Audio? → Translate to English (Gemini)
      │
      ▼
 Interactive selection? → Map to natural language
      │
      ▼
 Process with Gemini AI (structured JSON)
      │
      ▼
 Apply extracted data to session
      │
      ▼
 Drain queued messages (loop)
      │
      ▼
 Send response (text / buttons / list)
      │
      ▼
 Clear is_processing flag
```

---

## Key Features

- **Multi-language voice support** — audio messages in Hindi, Tamil, Telugu, Malayalam, Kannada translated to English via Gemini
- **Message queuing** — concurrent messages queued and batch-processed (FIFO, max 1 audio per batch)
- **Deduplication** — identical messages with same timestamp silently dropped
- **Out-of-order protection** — stale messages rejected based on timestamp comparison
- **Prompt injection filtering** — regex-based detection of common injection patterns, input sanitized
- **Inactivity detection** — 24-hour threshold, user prompted to continue or start fresh
- **Processing timeout** — 5-minute timeout guard on stuck sessions to prevent long-held processing locks
- **Interactive WhatsApp UI** — buttons (max 3), lists (max 10), formatted text with bold/italic
- **Session persistence** — booking state carried across turns (symptoms → doctor → date → confirm)
- **FAQ integration** — AI answers from FAQ knowledge base, rephrased naturally
- **Project-aware runtime** — one enabled project at a time, each with independent prompt + source data
- **Admin bearer auth** — email/password login, custom JWT, 30-day expiry, bearer token for protected admin APIs

---

## Prerequisites

- **Node.js** ≥ 18
- **Deno** ≥ 1.40
- A **Supabase** project (free tier works)
- A **Meta Developer** account with WhatsApp Business API access
- A **Google AI Studio** API key (Gemini)

---

## Setup

### 1. Clone and Install

```bash
git clone <repo-url>
cd whatsapp-chat-bot-demo
npm install
```

### 2. Configure Environment

```bash
cp env.example .env
# Edit .env with your actual credentials
```

| Variable                        | Where to Get It                                    |
| ------------------------------- | -------------------------------------------------- |
| `SUPABASE_URL`                  | Supabase Dashboard → Settings → API                |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase Dashboard → Settings → API (service_role) |
| `ADMIN_JWT_SECRET`              | Any long random string for signing admin JWTs      |
| `SUPABASE_ACCESS_TOKEN`         | https://supabase.com/dashboard/account/tokens      |
| `META_WHATSAPP_TOKEN`           | Meta Developer Console → WhatsApp → API Setup      |
| `META_WHATSAPP_PHONE_NUMBER_ID` | Meta Developer Console → WhatsApp → API Setup      |
| `WEBHOOK_VERIFY_TOKEN`          | Any string you choose (must match Meta config)     |
| `GEMINI_API_KEY`                | https://aistudio.google.com/apikey                 |

### 3. Apply Database Migration

If using a fresh Supabase project, apply the schema via the Supabase dashboard SQL editor or CLI:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Or copy-paste `supabase/migrations/20260309000000_initial_schema.sql` into the SQL editor.

### 4. Seed Knowledge Base

```bash
make seed
# Or individually:
make seed-doctors
make seed-clinics
make seed-medicines
make seed-faqs
```

### 5. Deploy Edge Functions

```bash
make deploy
# Or individually:
make deploy-webhook
make deploy-admin
```

### 6. Push Secrets

```bash
make secrets
```

### 7. Configure Meta Webhook

In the [Meta Developer Console](https://developers.facebook.com/):

1. Go to your WhatsApp app → Configuration
2. Set **Callback URL**: `https://<your-project-ref>.supabase.co/functions/v1/webhook`
3. Set **Verify Token**: same as `WEBHOOK_VERIFY_TOKEN` in your `.env`
4. Subscribe to: **messages**

---

## Local Development

Run the webhook locally on `http://localhost:8000`:

```bash
npm run serve
# or
make serve
```

Test webhook verification:

```bash
curl "http://localhost:8000?hub.mode=subscribe&hub.challenge=test123&hub.verify_token=whatsapp-demo"
# Should return: test123
```

Run the admin API locally on `http://localhost:8001`:

```bash
make serve-admin
```

Default seeded admin credentials:

```text
Email: admin@mail.com
Password: Admin@123456
```

Rotate the default password immediately in the database for any non-demo environment.

## Admin API

All protected admin endpoints require:

```http
Authorization: Bearer <jwt>
```

JWT expiry is **30 days** from login.

### Authentication

#### Login

`POST /functions/v1/admin/login`

```json
{
  "email": "admin@mail.com",
  "password": "Admin@123456"
}
```

Response:

```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "tokenType": "Bearer",
  "expiresAt": "2026-04-16T06:41:01.053Z",
  "admin": {
    "id": "0f65c2b6-...",
    "email": "admin@mail.com",
    "fullName": "Default Admin"
  }
}
```

#### Get Admin Profile

`GET /functions/v1/admin/me`

### Project Management APIs

- `GET /functions/v1/admin/projects` — list all projects
- `POST /functions/v1/admin/projects` — create new project
- `GET /functions/v1/admin/projects/:projectId` — fetch one project
- `PATCH /functions/v1/admin/projects/:projectId` — update project settings
- `POST /functions/v1/admin/projects/:projectId/enable` — enable exactly one project (only one project can be enabled at a time)

Example create/update project:

```json
{
  "name": "Apollo Hospitals",
  "slug": "apollo-hospitals",
  "botName": "Apollo Bot",
  "description": "Healthcare bot for Apollo Hospitals",
  "systemPrompt": "You are a healthcare assistant for Apollo Hospitals...",
  "welcomeMessage": "Welcome to Apollo Health Bot!"
}
```

### Prompt Management APIs

**All prompts now come from the admin panel — no static hardcoded prompts (except audio translation).**

#### Get Project Prompts

`GET /functions/v1/admin/projects/:projectId/prompts`

Response:

```json
{
  "projectId": "...",
  "prompts": {
    "systemPromptTemplate": "You are **{{botName}}**, a healthcare assistant...",
    "userPromptTemplate": "## CURRENT CONTEXT\n- Time: {{currentTime}}\n...",
    "responseSchema": { "type": "OBJECT", "properties": {...} }
  }
}
```

#### Update Project Prompts

`PATCH /functions/v1/admin/projects/:projectId/prompts`

**Supported template placeholders:**

_System Prompt Template:_

- `{{botName}}` — Project bot name
- `{{projectName}}` — Project name
- `{{projectDescription}}` — Project description
- `{{supportEmail}}` — Support email from constants
- `{{supportPhone}}` — Support phone from constants
- `{{projectInstructions}}` — Project-specific instructions

_User Prompt Template:_

- `{{botName}}` — Project bot name
- `{{projectName}}` — Project name
- `{{currentTime}}` — Current timestamp (ISO format)
- `{{inputType}}` — Message type (text, audio, location)
- `{{userName}}` — Patient name from session
- `{{userPhone}}` — User phone number
- `{{sessionState}}` — Formatted session data (symptoms, doctor, dates, etc.)
- `{{conversationHistory}}` — Previous conversation summary
- `{{lastMessage}}` — Last bot message
- `{{knowledgeBase}}` — Formatted doctors, medicines, FAQs
- `{{userInput}}` — Current user message
- `{{isTranslatedFromAudio}}` — Boolean flag
- `{{audioNote}}` — Audio translation note

_Response Schema:_

- Full JSON Schema object used for Gemini structured output
- Define extraction fields (symptoms, doctor_name, medicine_ids, etc.)
- Define next actions (show_doctors, confirm_appointment, order_medicine, etc.)

Example prompt update:

```json
{
  "systemPromptTemplate": "You are **{{botName}}**, a friendly healthcare assistant for {{projectName}}.\\n\\n## YOUR ROLE\\n- Help patients discuss symptoms\\n- Book doctor appointments\\n- Help order medicines\\n\\n## SAFETY\\n- For emergencies: call 108\\n- Never diagnose\\n- For prescriptions: require doctor consultation",
  "userPromptTemplate": "## CONTEXT\\n- Time: {{currentTime}}\\n- Patient: {{userName}}\\n- Project: {{projectName}}\\n\\n## SESSION\\n{{sessionState}}\\n\\n## KNOWLEDGE\\n{{knowledgeBase}}\\n\\n## MESSAGE\\n{{userInput}}",
  "responseSchema": { "type": "OBJECT", "properties": {...} }
}
```

### Data Import APIs

#### Import Project Source Data

`POST /functions/v1/admin/projects/:projectId/import`

Import doctors, clinics, medicines, and FAQs. Use `replaceExisting: false` (default) for non-destructive merge, or `replaceExisting: true` to delete existing data first.

Example import payload (supports both snake_case and camelCase):

```json
{
  "replaceExisting": false,
  "clinics": [
    {
      "id": "central-clinic",
      "name": "Central Clinic",
      "address": "123 Health Street",
      "city": "Chennai",
      "phone": "+91-44-1234-5678",
      "operatingHours": "9:00 AM - 9:00 PM",
      "specializations": "General, Cardiology",
      "rating": 4.8,
      "isActive": true
    }
  ],
  "doctors": [
    {
      "id": "dr-ananya",
      "name": "Dr. Ananya Sharma",
      "specialization": "General Medicine",
      "clinicId": "central-clinic",
      "clinicName": "Central Clinic",
      "experienceYears": 15,
      "qualification": "MD, General Medicine",
      "availableDays": "Monday, Tuesday, Wednesday",
      "availableTimeStart": "10:00",
      "availableTimeEnd": "14:00",
      "consultationFee": 500,
      "languages": "Hindi, English",
      "isActive": true
    }
  ],
  "medicines": [
    {
      "id": "paracetamol-650",
      "name": "Paracetamol 650mg",
      "genericName": "Paracetamol",
      "category": "Pain Relief",
      "dosageForm": "Tablet",
      "strength": "650mg",
      "price": 30,
      "requiresPrescription": false,
      "inStock": true
    }
  ],
  "faqs": [
    {
      "id": "booking-hours",
      "category": "BOOKING",
      "question": "When can I book appointments?",
      "answer": "Appointments can be booked 24/7 through WhatsApp."
    }
  ]
}
```

### Postman Collection

Import the included `MediBot_Admin_API.postman_collection.json` into Postman for easy API testing:

1. Download the file from the repository root
2. Open Postman → Import → Select the file
3. Set environment variables:
   - `BASE_URL` = Your Supabase project URL
   - `ADMIN_TOKEN` = Bearer token from login
   - `PROJECT_ID` = Project UUID to operate on
4. Run requests with pre-built examples

## Docker (Local + Cloud)

Build the container:

```bash
docker build -t whatsapp-webhook .
```

Run locally:

```bash
docker run --rm -p 8000:8000 --env-file .env whatsapp-webhook
```

Deploy on Render (Web Service):

1. Push this repo to GitHub.
2. Create a new Render Web Service from the repo.
3. Use Docker deployment (Render auto-detects the `Dockerfile`).
4. Add all required environment variables from `.env` in Render settings.
5. Set your Meta callback URL to `https://<render-service>.onrender.com`.

Deploy on AWS App Runner (container):

1. Build and push image to ECR.
2. Create an App Runner service from that ECR image.
3. Add the same environment variables used in `.env`.
4. Use the App Runner service URL as your Meta callback URL.

---

## Make Commands

| Command               | Description                                         |
| --------------------- | --------------------------------------------------- |
| `make help`           | Show all available commands                         |
| `make install`        | Install Node.js dependencies                        |
| `make seed`           | Seed all CSV data into Supabase                     |
| `make seed-doctors`   | Seed only doctors table                             |
| `make seed-clinics`   | Seed only clinics table                             |
| `make seed-medicines` | Seed only medicines table                           |
| `make seed-faqs`      | Seed only faqs table                                |
| `make serve`          | Run webhook locally with Deno                       |
| `make serve-admin`    | Run admin API locally with Deno                     |
| `make secrets`        | Push secrets from `.env` to Supabase edge functions |
| `make deploy`         | Deploy all edge functions                           |
| `make deploy-webhook` | Deploy webhook only                                 |
| `make deploy-admin`   | Deploy admin API only                               |

---

## Project Structure

```
#root/
├── .env                          # Environment variables (git-ignored)
├── .vscode/settings.json         # Deno extension config for edge functions
├── Makefile                      # All project commands
├── deno.json                     # Deno config + import map
├── env.example                   # Template for .env
├── package.json                  # Node.js deps + npm scripts
├── data/
│   ├── doctors.csv               # 12 doctors across specializations
│   ├── clinics.csv               # 9 clinics in different cities
│   ├── medicines.csv             # 20 medicines (OTC + prescription)
│   └── faqs.csv                  # 20+ health & platform FAQs
├── scripts/
│   ├── seed-data.mjs             # CSV → Supabase seeder (Node.js)
│   └── push-secrets.mjs          # .env → Supabase secrets pusher
├── supabase/
│   ├── config.toml               # Local Supabase config
│   ├── migrations/
│   │   └── 20260309000000_initial_schema.sql
│   │   └── 20260317000000_admin_projects.sql
│   └── functions/
│       ├── admin/
│       │   └── index.ts          # Admin login + project APIs
│       ├── webhook/
│       │   └── index.ts          # Main webhook handler
│       └── _shared/
│           ├── admin-auth.ts
│           ├── projects.ts
│           ├── supabase-client.ts
│           ├── types.ts
│           ├── constants.ts
│           ├── extract-message.ts
│           ├── message-guards.ts
│           ├── whatsapp.ts
│           ├── session.ts
│           ├── message-queue.ts
│           ├── chat-history.ts
│           ├── inactivity.ts
│           ├── knowledge-base.ts
│           ├── gemini.ts
│           └── prompts/
│               ├── system-prompt.ts
│               ├── user-prompt.ts
│               ├── audio-translation-prompt.ts
│               ├── faq-prompt.ts
│               └── ai-response-schema.ts
└── api.postman_collection.json   # Postman collection for testing
```

---

## Special Commands

Users can send these special WhatsApp messages:

| Command     | Effect                                    |
| ----------- | ----------------------------------------- |
| `RESET`     | Start a new session (preserves user name) |
| `DEV_RESET` | Delete session entirely (clean slate)     |

---

## Customization

### Change Theme (non-medical)

1. Edit `data/*.csv` files with your domain's data
2. Update `supabase/migrations/` schema if columns differ
3. Rewrite `prompts/system-prompt.ts` with new personality/rules
4. Update `prompts/ai-response-schema.ts` with domain-specific extraction fields
5. Modify `types.ts` interfaces to match
6. Update `webhook/index.ts` response handlers for new `nextAction` values

### Add a New Knowledge Base Table

1. Add migration SQL for the new table
2. Add CSV data file in `data/`
3. Add loader + formatter in `knowledge-base.ts`
4. Include in `user-prompt.ts` context assembly
5. Update seed script in `scripts/seed-data.mjs`
