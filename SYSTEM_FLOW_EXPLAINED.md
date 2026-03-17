# System Flow Diagrams & Overview

This document provides visual explanations of how the entire system works - from the admin panel to the live bot to the AI engine.

## 1. Main System Architecture (Admin + Runtime)

The system has **TWO LAYERS**:

```
┌─────────────────────────────────────────────────────────────┐
│                    ADMIN LAYER                             │
│  Admin Panel → Login → Manage Projects → Edit Prompts      │
│  → Import Data → Enable Project                            │
└─────────────────────────────────────────────────────────────┘
                              ↓
                         Database
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    RUNTIME LAYER                           │
│  WhatsApp Message → Webhook → Resolve Project              │
│  → Load Session/KB → Get/Build Prompts → Call Gemini       │
│  → Format Response → Send back to user                     │
└─────────────────────────────────────────────────────────────┘
```

### Flow Step-by-Step

**ADMIN FLOW (One-time setup per project):**

1. Admin logs in with email/password
2. Admin creates a new project (Restaurant Bot, Healthcare Bot, etc.)
3. Admin edits AI prompts using templates with {{placeholders}}
4. Admin imports source data (restaurants staff docs, meals, etc.)
5. Admin enables the project (now it's LIVE)

**RUNTIME FLOW (Every WhatsApp message):**

1. User sends message on WhatsApp
2. Meta API delivers it to your webhook
3. Webhook extracts the message
4. Webhook queries database for the **currently enabled project**
5. Webhook loads the user's session (isolated per project)
6. Webhook loads knowledge base (doctors, restaurants, products) for that project
7. Webhook loads prompt templates from database
8. Webhook replaces {{placeholders}} with actual runtime values
9. Webhook sends to Google Gemini with system + user prompts
10. Gemini returns structured JSON response
11. Webhook formats response as WhatsApp message
12. Webhook sends back to user

---

## 2. Project Isolation: The Multi-Purpose Magic

### Key Insight: "Composite Key" for Isolation

```
Project A (Restaurant)              Project B (Healthcare)
┌──────────────────────┐            ┌──────────────────────┐
│ project_id=AAA       │            │ project_id=BBB       │
│ slug=pizza-palace    │            │ slug=city-hospital   │
│ bot_name=PizzaBot    │            │ bot_name=HealthBot   │
│ domain:Restaurant    │            │ domain:Healthcare    │
│ enabled=TRUE  ←─────→│ ONE Only   │  enabled=FALSE       │
└──────────────────────┘            └──────────────────────┘

SAME USER PHONE: +919876543210

Session A:                          Session B:
(project_id=AAA, user_id=+91...)  (project_id=BBB, user_id=+91...)
- wants_table=true                 - symptoms="fever"
- preferred_time="19:00"           - preferred_doctor="Dr. Sharma"
- party_size=4                     - appointment_date="2026-03-20"

Knowledge Base A:                   Knowledge Base B:
- Menu items                        - Doctors
- Staff/tables                      - Clinics
- Delivery areas                    - Medicines
                                    - FAQs
```

### What This Means

Same phone number has **completely separate conversations** depending on which project is enabled:

```
Message 1: "I need a table" → Restaurant Bot → "Sure! For how many?"
(If we switch enabled project...)
Message 2: "I need a table" → Healthcare Bot → "Did you mean appointment? See doctors..."
(If we switch to E-commerce...)
Message 3: "I need a table" → E-Commerce Bot → "Sorry, we don't have 'table' items. Try searching for furniture..."
```

---

## 3. Prompt Template System: The Flexibility Engine

### How Templates Work

```
ADMIN PANEL:                              RUNTIME:
┌──────────────────────────────────────┐  ┌──────────────────────────────────┐
│ System Prompt Template:              │  │ 1. Load template                 │
│ "You are {{botName}}, a            │  │ "You are {{botName}}, a ..."    │
│ {{industry}} assistant for          │  │                                  │
│ {{projectName}}.                    │  │ 2. Gather runtime values:        │
│ {{projectInstructions}}"            │  │ botName = "PizzaBot"             │
│                                      │  │ industry = "restaurant"          │
│ User Prompt Template:                │  │ projectName = "Pizza Palace"     │
│ "Time: {{currentTime}}               │  │ currentTime = "2026-03-17..."    │
│ User: {{userName}}                   │  │ userName = "John"                │
│ Context: {{sessionState}}            │  │ sessionState = "booking table"   │
│ Knowledge: {{knowledgeBase}}         │  │ knowledgeBase = "Menu items..."  │
│ Input: {{userInput}}"                │  │ userInput = "Book a table"       │
│                                      │  │                                  │
│ Response Schema:                     │  │ 3. Replace all placeholders      │
│ { "type": "OBJECT",                 │  │ Final: "You are PizzaBot, a      │
│   "properties": {...}                │  │ restaurant assistant for...      │
│ }                                    │  │                                  │
└──────────────────────────────────────┘  │ 4. Send final prompts to Gemini  │
                                           └──────────────────────────────────┘
```

### Available Placeholders

**System Prompt Placeholders:**

- `{{botName}}` → Project's bot name (e.g., "PizzaBot")
- `{{projectName}}` → Project name (e.g., "Pizza Palace")
- `{{projectDescription}}` → Optional description
- `{{supportEmail}}` → Support email
- `{{supportPhone}}` → Support phone
- `{{projectInstructions}}` → Custom instructions

**User Prompt Placeholders:**

- `{{botName}}`, `{{projectName}}` → As above
- `{{currentTime}}` → ISO timestamp when message arrived
- `{{inputType}}` → "text", "audio", or "location"
- `{{userName}}` → Patient/customer name from session
- `{{userPhone}}` → User's phone number
- `{{sessionState}}` → Formatted session data (e.g., "wants table for 4, 7pm")
- `{{conversationHistory}}` → Summary of previous conversation
- `{{knowledgeBase}}` → Doctors/menu/products formatted as markdown
- `{{userInput}}` → The actual message user just sent
- `{{isTranslatedFromAudio}}` → "true" or "false"
- `{{audioNote}}` → Note about audio translation

---

## 4. Complete Message Processing Timeline

```
TIME    EVENT
────    ─────────────────────────────────────────────────────
0ms     User sends "Book a table for 4 on Friday" via WhatsApp
        ↓
2ms     Webhook receives HTTP POST from Meta
        Parses: from=+91987654321, text="Book a table...", timestamp
        ↓
3ms     Database query: SELECT * FROM projects WHERE is_enabled=true
        → Finds: Pizza Palace project (project_id=AAA)
        → Loads: bot_name="PizzaBot", system_prompt_template="You are {{botName}}..."
        ↓
5ms     Database query: SELECT * FROM user_sessions
        WHERE project_id='AAA' AND user_id='+91987654321'
        → Finds existing session, loads: user_name="John"
        ↓
7ms     Database queries:
        - SELECT * FROM doctors WHERE project_id='AAA'
        - SELECT * FROM medicines WHERE project_id='AAA'
        - SELECT * FROM faqs WHERE project_id='AAA'
        → Returns: Staff (in this project), no medicines, booking FAQs
        ↓
10ms    Webhook builds final prompts:
        - system_prompt_template.replace({{botName}}, "PizzaBot")
        - system_prompt_template.replace({{projectName}}, "Pizza Palace")
        - system_prompt_template.replace({{projectInstructions}}, "...")
        - user_prompt_template.replace({{currentTime}}, "2026-03-17T14:30:00Z")
        - user_prompt_template.replace({{userName}}, "John")
        - user_prompt_template.replace({{knowledgeBase}}, "Staff: Mario (Manager)...")
        - Loads responseSchema from database
        ↓
12ms    Webhook calls Google Gemini API:
        POST to gemini-2.5-flash with:
        {
          systemInstruction: "You are PizzaBot, a restaurant assistant...",
          contents: [{
            role: "user",
            parts: [{ text: "Time: 2026-03-17T14:30:00Z\nUser: John\n..." }]
          }],
          config: {
            responseMimeType: "application/json",
            responseSchema: { type: "OBJECT", properties: {...} },
            temperature: 0.3,
            maxOutputTokens: 2048
          }
        }
        ↓
40ms    Gemini processes and returns:
        {
          message: "Great! I can help you book a table. How many guests?",
          nextAction: "show_tables",
          extractedData: {
            party_size: 4,
            preferred_date: "Friday"
          },
          status: { outcome: "SUCCESS" }
        }
        ↓
42ms    Webhook processes response:
        - Parses JSON
        - Interprets nextAction="show_tables"
        - Formats WhatsApp interactive button message
        - Updates session: preferred_party_size=4
        - Saves to chat_messages table
        ↓
45ms    Webhook sends HTTP 200 with WhatsApp message back
        ↓
50ms    User receives: "Great! I can help you book a table. How many guests?"
        With buttons: [4 guests] [6 guests] [8 guests]
        ↓
(User clicks → Loop repeats for next message)
```

---

## 5. Why This Design Works for Multiple Industries

| Aspect        | How It Works                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Prompts**   | Completely customizable templates per project. Same AI engine, different instructions.                                                   |
| **Data**      | Isolated by `project_id`. Restaurant staff ≠ Doctors ≠ Products.                                                                         |
| **Sessions**  | `(project_id, user_id)` key ensures conversations don't mix.                                                                             |
| **Switching** | Admin changes `is_enabled=true` from Project A to Project B. Next message goes to different project. Same user phone, different context. |
| **Scaling**   | Add unlimited projects without changing code. All projects share same infrastructure.                                                    |
| **Fallback**  | Static audio translation prompt (no DB dependency). System can degrade gracefully.                                                       |

---

## 6. Data Flow: Request → Response

```
REQUEST IN:
┌────────────────────────────────────────────┐
│ HTTP POST /webhook                         │
│ {                                          │
│   object: "whatsapp_business_account",    │
│   entry: [{                                │
│     changes: [{                            │
│       value: {                             │
│         messages: [{                       │
│            from: "+919876543210",         │
│            text: { body: "Hi" }           │
│         }]                                │
│       }                                    │
│     }]                                     │
│   }]                                       │
│ }                                          │
└────────────────────────────────────────────┘
           ↓ (Processing)
┌────────────────────────────────────────────┐
│ DATABASE CHANGES:                          │
│                                            │
│ INSERT INTO chat_messages (                │
│   project_id='AAA',                       │
│   user_id='+919876543210',                │
│   message_type='user',                    │
│   message_text='Hi'                       │
│ );                                         │
│                                            │
│ UPDATE user_sessions SET (                │
│   last_user_message='Hi',                 │
│   last_message_timestamp='2026-03-17...'  │
│ ) WHERE (project_id='AAA', user_id='...') │
│                                            │
│ INSERT INTO chat_messages (                │
│   project_id='AAA',                       │
│   user_id='+919876543210',                │
│   message_type='bot',                     │
│   message_text='Hello! How can I help?'   │
│ );                                         │
└────────────────────────────────────────────┘
           ↓
RESPONSE OUT:
┌────────────────────────────────────────────┐
│ HTTP 200 OK                                │
│ {                                          │
│   messaging_product: "whatsapp",          │
│   to: "+919876543210",                    │
│   type: "text",                           │
│   text: {                                 │
│     body: "Hello! How can I help?"       │
│   }                                       │
│ }                                          │
└────────────────────────────────────────────┘
           ↓
USER RECEIVES:
Hello! How can I help?
```

---

## 7. Admin Panel Architecture

```
┌─────────────── ADMIN PANEL UI ──────────────────┐
│                                                  │
│  Projects List                                  │
│  ├─ Pizza Palace [ENABLED] [⚙ Edit] [+ Prompts]│
│  ├─ City Hospital [EDIT] [+ Prompts]            │
│  └─ TechShop [EDIT] [+ Prompts]                 │
│                                                  │
│  Project Editor                                 │
│  ├─ Name: [Pizza Palace           ]            │
│  ├─ Bot Name: [PizzaBot           ]            │
│  ├─ Slug: [pizza-palace           ]            │
│  ├─ Description: [Restaurant...   ]            │
│  └─ [Save] [Enable] [Import Data]              │
│                                                  │
│  Prompt Editor                                  │
│  ├─ System Template:                           │
│  │  [You are {{botName}}...]                   │
│  │  [? Available placeholders]                 │
│  │  [Preview]                                  │
│  ├─ User Template:                             │
│  │  [Time: {{currentTime}}...]                 │
│  │  [? Available placeholders]                 │
│  │  [Preview]                                  │
│  ├─ Response Schema:                           │
│  │  [{JSON Editor}]                           │
│  └─ [Save]                                     │
│                                                  │
│  Data Import                                   │
│  ├─ Upload JSON file                           │
│  ├─ [Preview]                                  │
│  ├─ ☐ Replace existing data                    │
│  └─ [Import] [X Cancel]                        │
│                                                  │
└──────────────────────────────────────────────────┘
           ↓ HTTP Calls ↓
┌─────── ADMIN API ENDPOINTS ──────┐
│ POST /admin/login                │
│ GET /admin/projects              │
│ POST /admin/projects             │
│ PATCH /admin/projects/:id        │
│ POST /admin/projects/:id/enable  │
│ GET /admin/projects/:id/prompts  │
│ PATCH /admin/projects/:id/prompts│
│ POST /admin/projects/:id/import  │
└──────────────────────────────────┘
       ↓ Database Queries ↓
    Supabase Postgres
```

---

## Summary: Why This Matters

This architecture enables:

✅ **Multi-Purpose**: Same code, different projects (restaurant, healthcare, e-commerce)  
✅ **Dynamic Prompts**: Change AI behavior without code deployment  
✅ **Project Isolation**: User sessionsstay separate per active project  
✅ **Fast Switching**: Enable different project in milliseconds  
✅ **Scalable**: Add unlimited projects without performance impact  
✅ **Admin-Managed**: Non-technical admins can create projects and customize behavior  
✅ **Type-Safe**: Full TypeScript types for all database schemas  
✅ **Cached**: Knowledge base + prompts cached in memory for speed  
✅ **Fallback**: Audio translation works even if database is down

This is fundamentally different from single-purpose bots because:

- **Single-purpose bot** = Fixed prompts in code, fixed data structure. Deploy code to change behavior.
- **This platform** = Database-driven projects, dynamic templates, instant switching. Zero downtime.

Now your single WhatsApp bot infrastructure can serve **unlimited use cases** 🚀
