# System Architecture & Data Flow

## High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         ADMIN LAYER                               │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐   │
│  │ Admin Panel(UI) │  │ Project Manager  │  │  Prompt Editor  │   │
│  │                 │  │  (create/update) │  │  (dynamic flow) │   │
│  └────────┬────────┘  └────────┬─────────┘  └────────┬────────┘   │
│           │                    │                     │             │
│           └────────────────────┼─────────────────────┘             │
│                                │                                   │
│                      ┌─────────▼─────────┐                        │
│                      │   Admin API fn    │                        │
│                      │  (/admin/*)       │                        │
│                      └─────────┬─────────┘                        │
│                                │                                   │
└────────────────────────────────┼───────────────────────────────────┘
                                 │ HTTP/JWT
                                 │
                ┌────────────────▼─────────────────┐
                │      SUPABASE DATABASE          │
                │  ┌───────────────────────────┐  │
                │  │ projects (config,prompts) │  │
                │  │ admin_users (auth)        │  │
                │  │ source_data (doctors...)  │  │
                │  │ sessions (per-project)    │  │
                │  └───────────────────────────┘  │
                └────────────────────────────────┘


┌────────────────────────────────────────────────────────────────────┐
│                         RUNTIME LAYER                              │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────┐         ┌──────────────────┐                     │
│  │  WhatsApp    │ HTTP    │  Webhook Edge Fn │                     │
│  │  (Meta API)  │◄───────▶│  (/webhook)      │                     │
│  └──────────────┘         └────────┬─────────┘                     │
│                                    │                               │
│                    ┌───────────────┼───────────────┐                │
│                    │ 1. Extract msg│               │                │
│                    │ 2. Get proj   │               │                │
│                    │ 3. Get sess   │               │                │
│                    │ 4. Submit AI  │               │                │
│                    │ 5. Queue resp │               │                │
│                    └───────┬───────┴───────────────┘                │
│                            │                                        │
│               ┌────────────▼──────────────┐                        │
│               │  Google Gemini API        │                        │
│               │  (Structured LLM)         │                        │
│               │  - System Prompt (from DB)│                        │
│               │  - User Prompt (from DB)  │                        │
│               │  - Response Schema (DB)   │                        │
│               └────────────┬──────────────┘                        │
│                            │                                        │
│               ┌────────────▼──────────────┐                        │
│               │  Response Handler         │                        │
│               │  - Parse JSON response    │                        │
│               │  - Format WhatsApp msg    │                        │
│               │  - Send back to user      │                        │
│               └────────────────────────────┘                        │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Admin Flow: Project & Prompt Management

```
┌─────────────────┐
│  Admin User     │
│  Opens Panel    │
└────────┬────────┘
         │
         ▼
    ┌─────────────────────────────────────┐
    │ 1. LOGIN                            │
    │ POST /admin/login                   │
    │ {email, password}                   │
    │─────────────────────────────────────│
    │ ✓ JWT Token (30-day expiry)        │
    │ ✓ Bearer for all requests          │
    └────────┬────────────────────────────┘
             │
             ▼
    ┌─────────────────────────────────────┐
    │ 2. VIEW/MANAGE PROJECTS             │
    │ GET /admin/projects                 │
    │─────────────────────────────────────│
    │ ✓ List all projects + status        │
    │ ✓ Show enabled project              │
    └─┬──────────────────┬────────────────┘
      │                  │
      ▼                  ▼
  ┌───────────────┐  ┌──────────────────┐
  │ CREATE/UPDATE │  │  ENABLE PROJECT  │
  │ Project       │  │                  │
  │ PATCH/:id     │  │  POST /:id/enable│
  │               │  │                  │
  │ {name, slug,  │  │ Only ONE project │
  │  botName,     │  │ active at a time │
  │  prompts}     │  │                  │
  └─────┬─────────┘  └────────┬─────────┘
        │                     │
        └──────────┬──────────┘
                   │
                   ▼
        ┌────────────────────────┐
        │ 3. MANAGE PROMPTS      │
        │ GET/PATCH /:id/prompts │
        │────────────────────────│
        │ systemPromptTemplate:  │
        │   {{botName}}          │
        │   {{projectName}}      │
        │   {{supportEmail}}     │
        │                        │
        │ userPromptTemplate:    │
        │   {{currentTime}}      │
        │   {{sessionState}}     │
        │   {{knowledgeBase}}    │
        │                        │
        │ responseSchema:        │
        │   {JSON structure}     │
        └────────┬───────────────┘
                 │
                 ▼
        ┌────────────────────────┐
        │ 4. IMPORT SOURCE DATA  │
        │ POST /:id/import       │
        │────────────────────────│
        │ {                      │
        │   replaceExisting,     │
        │   clinics: [],         │
        │   doctors: [],         │
        │   medicines: [],       │
        │   faqs: []             │
        │ }                      │
        │                        │
        │ ✓ Data per project    │
        │ ✓ Merge or replace    │
        │ ✓ Cache invalidated   │
        └────────────────────────┘
```

---

## User/WhatsApp Message Flow: Complete Request → Response

```
┌──────────────        ┌─────────────────────────────────────────────────────────┐
│  WhatsApp User │      │ WEBHOOK EDGE FUNCTION - Message Processing             │
│  Sends Message │      │ (/functions/v1/webhook)                                │
└──────┬───────────┐    │                                                         │
       │           │    │ ┌──────────────────────────────────────────────────┐   │
       │           │    │ │ STEP 1: EXTRACT MESSAGE                         │   │
       │"Hi, I'm sick"  │ │ ──────────────────────────────────────────────── │   │
       │           │    │ │ - Parse Meta webhook payload                    │   │
       │           │    │ │ - Extract: from, text, timestamp                │   │
       │           │    │ │ - Input Type: text | audio | location           │   │
       │           │    │ └──────────────────┬───────────────────────────────┘   │
       └─────┬─────┘    │                    │                                   │
             │ HTTP     │                    ▼                                   │
             │ POST     │ ┌──────────────────────────────────────────────────┐   │
             └──────────►│ STEP 2: RESOLVE PROJECT                          │   │
                        │ ──────────────────────────────────────────────────│   │
                        │ - Query: SELECT * FROM projects WHERE is_enabled  │   │
                        │ - Get: ProjectConfig (name, bot_name, prompts)    │   │
                        │ - Cache: per-request (no stale data)              │   │
                        └──────────────────┬───────────────────────────────┘   │
                        │                  │                                   │
                        │                  ▼                                   │
                        │ ┌──────────────────────────────────────────────────┐   │
                        │ │ STEP 3: GET/CREATE USER SESSION                 │   │
                        │ │ ──────────────────────────────────────────────── │   │
                        │ │ - Key: (project_id, user_id)                    │   │
                        │ │ - Load: conversation_context, symptoms, etc.    │   │
                        │ │ - Mark as NEW_SESSION: yes/no                   │   │
                        │ │ - Extract welcome msg if new                    │   │
                        │ └──────────────────┬───────────────────────────────┘   │
                        │                    │                                   │
                        │                    ▼                                   │
                        │ ┌──────────────────────────────────────────────────┐   │
                        │ │ STEP 4: LOAD PROJECT KNOWLEDGE BASE              │   │
                        │ │ ──────────────────────────────────────────────── │   │
                        │ │ - Query: SELECT * FROM doctors WHERE project_id  │   │
                        │ │ - Query: SELECT * FROM medicines WHERE project_id│   │
                        │ │ - Query: SELECT * FROM faqs WHERE project_id     │   │
                        │ │ - Format: Markdown tables for AI context         │   │
                        │ │ - Cache: Per-project in memory                   │   │
                        │ └──────────────────┬───────────────────────────────┘   │
                        │                    │                                   │
                        │                    ▼                                   │
                        │ ┌──────────────────────────────────────────────────┐   │
                        │ │ STEP 5: BUILD AI PROMPTS                         │   │
                        │ │ ──────────────────────────────────────────────── │   │
                        │ │ systemPrompt = loadTemplate(project_id)          │   │
                        │ │   .replace({{botName}}, project.bot_name)       │   │
                        │ │   .replace({{projectName}}, project.name)       │   │
                        │ │   .replace({{supportEmail}}, constants.email)   │   │
                        │ │   ...                                            │   │
                        │ │                                                  │   │
                        │ │ userPrompt = loadTemplate(project_id)            │   │
                        │ │   .replace({{currentTime}}, now())              │   │
                        │ │   .replace({{userName}}, session.user_name)     │   │
                        │ │   .replace({{sessionState}}, format(session))   │   │
                        │ │   .replace({{knowledgeBase}}, doctors+...)      │   │
                        │ │   .replace({{userInput}}, message.text)         │   │
                        │ │   ...                                            │   │
                        │ │                                                  │   │
                        │ │ responseSchema = loadSchema(project_id)          │   │
                        │ │   {type: "OBJECT", properties: {...}}           │   │
                        │ └──────────────────┬───────────────────────────────┘   │
                        │                    │                                   │
                        └────────────────────┼───────────────────────────┘       │
                                             │                                   │
                ┌────────────────────────────▼──────────────────────────┐        │
                │         GOOGLE GEMINI API                            │        │
                │         (gemini-2.5-flash-latest)                    │        │
                │                                                      │        │
                │ model.generateContent({                             │        │
                │   systemInstruction: systemPrompt,                 │        │
                │   contents: [{                                      │        │
                │     role: "user",                                   │        │
                │     parts: [{ text: userPrompt }]                  │        │
                │   }],                                               │        │
                │   config: {                                         │        │
                │     responseMimeType: "application/json",          │        │
                │     responseSchema: responseSchema,                │        │
                │     temperature: 0.3,                              │        │
                │     maxOutputTokens: 2048                          │        │
                │   }                                                │        │
                │ })                                                  │        │
                │                                                      │        │
                │ Returns: {                                          │        │
                │   extractedData: {                                 │        │
                │     symptoms, specialization, doctor_id, ...       │        │
                │   },                                                │        │
                │   message: "Your response text",                   │        │
                │   nextAction: "show_doctors|order_medicine|none",  │        │
                │   status: { outcome: "SUCCESS" },                  │        │
                │   conversationSummary: "...",                      │        │
                │   callFAQs: false                                  │        │
                │ }                                                   │        │
                └────────────────────┬─────────────────────────────────┘        │
                                     │                                          │
                ┌────────────────────▼──────────────────────────┐               │
                │   WEBHOOK PROCESSES RESPONSE                │               │
                │   ┌────────────────────────────────────────┐ │               │
                │   │ 1. Parse AI JSON response              │ │               │
                │   │ 2. Update session state (extracted data)│ │               │
                │   │ 3. Interpret nextAction:               │ │               │
                │   │    - "show_doctors" → format list      │ │               │
                │   │    - "order_medicine" → show options   │ │               │
                │   │    - "none" → plain text message       │ │               │
                │   │ 4. Save to chat_messages (project_id)  │ │               │
                │   │ 5. Format WhatsApp response            │ │               │
                │   │ 6. Queue for sending (optional)        │ │               │
                │   └─────────────────┬──────────────────────┘ │               │
                │                     │                        │               │
                │                     ▼                        │               │
                │   ┌────────────────────────────────────────┐ │               │
                │   │ SEND BACK TO WHATSAPP                  │ │               │
                │   │ HTTP 200 { "messages": [...] }         │ │               │
                │   └────────────────────────────────────────┘ │               │
                └────────────────────┬──────────────────────────┘               │
                                     │                                          │
                ┌────────────────────▼──────────────────────────┐               │
                │ Update Session & Persist                     │               │
                │ ┌──────────────────────────────────────────┐ │               │
                │ │ UPDATE user_sessions SET                │ │               │
                │ │   symptoms = AI.symptoms,               │ │               │
                │ │   conversation_context = ...,           │ │               │
                │ │   last_prompt_response = AI.message,    │ │               │
                │ │   conversation_summary = AI.summary,    │ │               │
                │ │   WHERE project_id = ? AND user_id = ?  │ │               │
                │ │                                          │ │               │
                │ │ INSERT INTO chat_messages               │ │               │
                │ │   (project_id, user_id, message_type, ...) │ │
                │ └──────────────────────────────────────────┘ │               │
                └────────────────────┬──────────────────────────┘               │
                                     │                                          │
                                     ▼                                          │
                              ┌─────────────┐                                   │
                              │ NEXT MESSAGE│◄──────────────────────────────────┘
                              │ SAME USER   │
                              │ SAME PROJECT│
                              └─────────────┘
                                   │
                                   ▼
                            (Loop repeats)
```

---

## Database Schema: How Data Flows Through Tables

```
PROJECTS (Configuration Layer)
┌──────────────────────────────────────────┐
│ id (UUID)          [PK]                  │
│ name               "Restaurant Booking"  │
│ slug               "restaurant-bot"      │
│ bot_name           "OrderBot"            │
│ description        "Table reservations"  │
│ system_prompt      "You are OrderBot..." │
│ system_prompt_template  "{{botName}} template" [NEW]
│ user_prompt_template    "session: {{sessionState}}" [NEW]
│ response_schema    {JSON} [NEW]          │
│ welcome_message    "Welcome to..."       │
│ is_enabled         true/false            │
│ created_at         timestamp             │
│ updated_at         timestamp             │
└──────────────────────────────────────────┘
        │
        ├─→ Seeds per-project data
        │
        └─→ Referenced by:
            - user_sessions (project_id FK)
            - doctors (project_id FK)
            - medicines (project_id FK)
            - faqs (project_id FK)
            - appointments (project_id FK)
            - etc.


USER_SESSIONS (Runtime State - Project Scoped)
┌──────────────────────────────────────────┐
│ project_id (UUID) [FK→projects] [PK1]    │
│ user_id (string)  [PK2]                  │
│ user_name         "John"                 │
│ conversation_context "booking"           │
│ symptoms          "headache, fever"      │
│ doctor_id         "doctor-123"           │
│ doctor_name       "Dr. Sharma"           │
│ preferred_date    "2026-03-20"           │
│ preferred_time    "14:00"                │
│ medicine_ids      ["med-1", "med-2"]     │
│ medicine_names    ["Paracetamol", "..."] │
│ is_processing     false                  │
│ is_intro_sent     true                   │
│ created_at        timestamp              │
│ updated_at        timestamp              │
└──────────────────────────────────────────┘
        │
        └─→ Query by (project_id, user_id)
            So each project has isolated sessions


DOCTORS (Project Scoped Source Data)
┌──────────────────────────────────────────┐
│ id (UUID) [PK]                           │
│ project_id (UUID) [FK→projects]          │
│ source_id (string) [Unique per project]  │
│ name               "Dr. Sharma"          │
│ specialization     "Cardiology"          │
│ clinic_id          "clinic-123"          │
│ available_days     "Mon, Tue, Thu"       │
│ available_time_start "10:00"            │
│ available_time_end "14:00"              │
│ consultation_fee    500                  │
│ is_active          true                  │
│ created_at         timestamp             │
│ updated_at         timestamp             │
└──────────────────────────────────────────┘
        │
        └─→ Query by project_id when loading KB
            Only show doctors for enabled project


CHAT_MESSAGES (Project Scoped Conversation History)
┌──────────────────────────────────────────┐
│ id (UUID) [PK]                           │
│ project_id (UUID) [FK→projects]          │
│ user_id (string)                         │
│ from_type          "user" | "bot"        │
│ message_text       "I have a symptom"    │
│ message_type       "text" | "json"       │
│ created_at         timestamp             │
│ updated_at         timestamp             │
└──────────────────────────────────────────┘
        │
        └─→ Index: (project_id, user_id, created_at)
            Conversation history isolated per project


ADMIN_USERS (Admin Auth)
┌──────────────────────────────────────────┐
│ id (UUID) [PK]                           │
│ email (string unique)                    │
│ full_name          "Admin Name"          │
│ password_hash      "bcrypt(password)"    │
│ is_active          true                  │
│ last_login_at      timestamp             │
│ created_at         timestamp             │
│ updated_at         timestamp             │
└──────────────────────────────────────────┘
        │
        └─→ Login → JWT with 30-day expiry
            Token used for all admin requests
```

---

## Request Lifecycle: End-to-End Timeline

```
TIME    USER               WEBHOOK              DATABASE         GEMINI
────    ────               ───────              ────────         ──────

0ms     Sends "Hi"
          │
          ├──────────HTTP POST──────►

2ms                        Extract message
                           Parse Meta payload
                                │
                                ├──SELECT is_enabled
                                │  project──────────────►
                                │◄──ProjectConfig────────

5ms                        Load enabled project
                           Get (project_id, user_id)
                           session
                                │
                                ├──SELECT user_sessions
                                │  WHERE (proj_id, user_id)─►
                                │◄──Session data─────────

8ms                        Load knowledge base
                           (doctors, medicines, faqs)
                                │
                                ├──SELECT * FROM doctors
                                │  WHERE project_id───────►
                                │◄──60 doctors──────
                                │
                                ├──SELECT * FROM medicines───►
                                │◄──200 medicines──────
                                │
                                ├──SELECT * FROM faqs──────►
                                │◄──40 FAQs────────

12ms                       Build AI prompts
                           Load templates from DB
                           Replace {{placeholders}}
                           Format knowledge base
                                │
                                ├──SELECT system_prompt_template
                                │  user_prompt_template
                                │  response_schema──────────►
                                │◄──Templates + schema──

16ms                       Send to Gemini
                                │
                                ├────────────────────────────►
                                │     {
                                │   systemInstruction: "...",
                                │   contents: [{...}],
                                │   responseSchema: {...}
                                │ }

45ms                       (Gemini processing)
                       ◄────────────────────────────
                            {
                          message: "Which symptoms?",
                          nextAction: "show_doctors",
                          ...
                        }

47ms                       Parse response
                           Update session
                           save message
                                │
                                ├──UPDATE user_sessions
                                │  SET symptoms = "...",
                                │      last_prompt_response = "..."
                                │  WHERE (proj_id, user_id)──►
                                │◄──Updated──────────
                                │
                                ├──INSERT chat_messages
                                │  (project_id, user_id, ...)───►
                                │◄──Saved──────────

50ms                       Format WhatsApp response
                           Send HTTP 200

50ms    Receives "Which
        symptoms?"
          │
        (Processing completes in ~50ms)
```

---

## Project Isolation: Why Multi-Tenancy Works

```
┌─────────────────────────────────────────────────────────────────────┐
│ Enabled Project: "Restaurant Booking" (project_id = proj_123)       │
└─────────────────────────────────────────────────────────────────────┘

USER: +919876543210 (Active on Restaurant Bot)
──────────────────────────────────────────────────
Sends: "I'd like to book a table for 2"

Webhook Flow:
1. Get enabled project → project_id = proj_123
2. Query sessions WHERE (project_id='proj_123', user_id='+919876543210')
3. Load doctors FROM doctors WHERE project_id='proj_123'
   └─→ Returns restaurant staff, not doctors ✓
4. Load faqs FROM faqs WHERE project_id='proj_123'
   └─→ Returns booking FAQs, not medical FAQs ✓
5. Send prompts to Gemini with restaurant context
   └─→ AI responds about table booking, not healthcare ✓


┌─────────────────────────────────────────────────────────────────────┐
│ If Admin Enables Different Project                                  │
├─────────────────────────────────────────────────────────────────────┤
│ POST /admin/projects/{healthcare-project-id}/enable                 │
│ → Old project disabled (is_enabled = false)                        │
│ → Healthcare project enabled (is_enabled = true)                   │
└─────────────────────────────────────────────────────────────────────┘

NEXT MESSAGE from same user:
──────────────────────────────────
Same phone number sends new message

Webhook Flow:
1. Get enabled project → project_id = proj_456 (healthcare!)
2. Query sessions WHERE (project_id='proj_456', user_id='+919876543210')
   └─→ NEW empty session (project is different)
   └─→ Different session state, conversation context
3. Load doctors FROM doctors WHERE project_id='proj_456'
   └─→ Returns healthcare doctors ✓
4. Load faqs FROM faqs WHERE project_id='proj_456'
   └─→ Returns medical FAQs ✓
5. Send healthcare prompts to Gemini
   └─→ AI responds about symptoms, appointments ✓


KEY INSIGHT:
───────────
Same phone number → Different conversations per project
Because: (project_id, user_id) is the unique key
         Switching enabled project = switching conversation threads
```

---

## Cache Strategy

```
┌─────────────────────────────────┐
│ In-Memory Cache (Per Runtime)   │
├─────────────────────────────────┤
│                                 │
│ prompts:                        │
│   projectId → {                 │
│     systemPromptTemplate,       │
│     userPromptTemplate,         │
│     responseSchema              │
│   }                             │
│   (Invalidated: on PATCH)       │
│                                 │
│ knowledgeBase:                  │
│   projectId:doctors → [...]     │
│   projectId:medicines → [...]   │
│   projectId:faqs → [...]        │
│   (Invalidated: on import)      │
│                                 │
│ projects:                       │
│   projectId → ProjectConfig     │
│   (Per-request DB hit, no cache)│
│                                 │
└─────────────────────────────────┘
```

---

## Error Handling Flow

```
┌─────────────────┐
│ Admin Request   │
└────────┬────────┘
         │
         ▼
    ┌─────────────────────┐
    │ NO BEARER TOKEN?    │
    └─────┬────────────┬──┘
          │           │
      NO  │       YES │
         ▼            ▼
    401  │      ┌──────────────────┐
   Unauth│      │ INVALID TOKEN?   │
         │      └─────┬────────┬───┘
         │        NO  │    YES │
         │           ▼        ▼
         │      ┌──────────────────┐
         │      │ DB QUERY ERROR?  │
         │      └─────┬────────┬───┘
         │        NO  │    YES │
         │           ▼        ▼
         │      ┌──────────────────┐
         │      │ SUCCESS          │
         │      │ 200 OK           │
         │      └──────────────────┘
         │
         └─→ 401 Unauthorized, refresh login

Webhook Flow:
┌──────────────────────┐
│ Project not found?   │
└─────┬──────────────┬─┘
      │YES       NO  │
      ▼              ▼
    500  ┌──────────────────┐
   Error │ Session error?   │
         └─────┬──────────┬─┘
             YES     NO   │
              ▼           ▼
            500 ┌──────────────────┐
           Error│ Gemini error?    │
                └─────┬──────────┬─┘
                    YES     NO   │
                     ▼           ▼
                   500 ┌──────────────────┐
                  Error│ SUCCESS! 200 OK  │
                       │ Message queued   │
                       └──────────────────┘
```

---

## Summary: What Makes It Work For Multiple Projects

| Component            | Isolation Method                       | Example                                                    |
| -------------------- | -------------------------------------- | ---------------------------------------------------------- |
| **Sessions**         | (project_id, user_id) composite key    | Restaurant user has different session than healthcare user |
| **Prompts**          | Loaded per-enabled project             | Restaurant templates vs healthcare templates               |
| **Knowledge Base**   | Filtered by project_id                 | Restaurant staff vs doctors                                |
| **Response Schema**  | Loaded per project                     | Restaurant booking fields vs appointment fields            |
| **Chat History**     | Filtered by project_id                 | Conversation histories don't mix                           |
| **Source Data**      | source_id per project                  | Same doctor name in different projects = different records |
| **Only ONE Enabled** | Unique constraint on (is_enabled=true) | Guarantees clean project switching                         |

This architecture allows you to:

- ✅ Run restaurant bot, healthcare bot, customer service bot in same system
- ✅ Switch between projects instantly (one HTTP endpoint call)
- ✅ Manage completely separate workflows per project
- ✅ Reuse codebase for any industry/use case
- ✅ Scale to unlimited projects without code changes
