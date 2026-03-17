# Admin Panel Integration Guide

This document explains how to build an admin panel to manage **multi-purpose WhatsApp bot projects** using the Admin API. Works for healthcare, restaurants, e-commerce, customer service, or any other use case.

## Architecture Overview

```
┌─────────────────────┐     ┌──────────────────────┐
│   Admin Dashboard   │────▶│  Admin API Functions │
│   (Your UI)         │(HTTP)│  (Supabase Deno)    │
└─────────────────────┘     └──────────────────────┘
         │                            │
         │                            │
         └───────────────────────────┬┘
                                     │
                                     ▼
                            ┌─────────────────┐
                            │  Supabase DB    │
                            │  (Projects,     │
                            │   Prompts,      │
                            │   Source Data)  │
                            └─────────────────┘
```

## Step-by-Step Integration

### 1. Authentication

**Login Flow:**

```
┌─────────────────────────────────────────┐
│ Admin Dashboard                         │
│ 1. User enters email + password         │
│ 2. POST /admin/login with credentials   │
│ 3. Receive JWT token (30-day expiry)    │
│ 4. Store token in localStorage/cookies  │
│ 5. Include Bearer token in all requests │
└─────────────────────────────────────────┘
```

**Example Login Implementation (JavaScript/React):**

```javascript
async function adminLogin(email, password) {
  const response = await fetch(`${ADMIN_API_URL}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.statusText}`);
  }

  const data = await response.json();
  localStorage.setItem('adminToken', data.token);
  localStorage.setItem('tokenExpiry', data.expiresAt);
  return data;
}

async function makeAdminRequest(method, path, body = null) {
  const token = localStorage.getItem('adminToken');

  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${ADMIN_API_URL}${path}`, options);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.statusText}`);
  }

  return response.json();
}
```

### 2. Project Management

**List Projects:**

```javascript
async function listProjects() {
  const data = await makeAdminRequest('GET', '/admin/projects');
  return data.projects;
}

// Render as table/list with:
// - Project name, bot name, description
// - Enabled status (badge)
// - Edit, Enable, View Prompts buttons
```

**Create Project:**

```javascript
async function createProject(projectData) {
  const data = await makeAdminRequest('POST', '/admin/projects', {
    name: projectData.name,
    slug: projectData.slug.toLowerCase(),
    botName: projectData.botName,
    description: projectData.description,
    systemPrompt: projectData.systemPrompt,
    welcomeMessage: projectData.welcomeMessage,
    isEnabled: false, // New projects start disabled
  });
  return data.project;
}
```

**Enable Project:**

```javascript
async function enableProject(projectId) {
  const data = await makeAdminRequest(
    'POST',
    `/admin/projects/${projectId}/enable`,
    {},
  );
  // Only one project can be enabled at a time
  // Previous enabled project is automatically disabled
  return data.project;
}
```

**Update Project:**

```javascript
async function updateProject(projectId, updates) {
  const data = await makeAdminRequest('PATCH', `/admin/projects/${projectId}`, {
    name: updates.name,
    botName: updates.botName,
    description: updates.description,
    systemPrompt: updates.systemPrompt,
    welcomeMessage: updates.welcomeMessage,
  });
  return data.project;
}
```

### 3. Prompt Management (NEW)

**Get Project Prompts:**

```javascript
async function getProjectPrompts(projectId) {
  const data = await makeAdminRequest(
    'GET',
    `/admin/projects/${projectId}/prompts`,
  );
  return data.prompts; // { systemPromptTemplate, userPromptTemplate, responseSchema }
}
```

**Update Project Prompts:**

```javascript
async function updateProjectPrompts(projectId, prompts) {
  const data = await makeAdminRequest(
    'PATCH',
    `/admin/projects/${projectId}/prompts`,
    {
      systemPromptTemplate: prompts.systemPromptTemplate,
      userPromptTemplate: prompts.userPromptTemplate,
      responseSchema: prompts.responseSchema,
    },
  );
  return data.prompts;
}
```

**UI Components to Build:**

1. **System Prompt Editor**
   - Text area with template placeholders reference
   - Live preview showing how {{placeholders}} will be replaced
   - Save/Cancel buttons

2. **User Prompt Editor**
   - Instructions showing available placeholders
   - Template structured with sections (CONTEXT, SESSION STATE, KNOWLEDGE BASE, etc.)
   - Visual guide for what each section means

3. **Response Schema Editor**
   - JSON editor (use Monaco Editor or similar)
   - Schema validation before save
   - Dropdown templates for common structures

### 4. Data Import

**Import Project Data:**

```javascript
async function importProjectData(
  projectId,
  sourceData,
  replaceExisting = false,
) {
  const data = await makeAdminRequest(
    'POST',
    `/admin/projects/${projectId}/import`,
    {
      replaceExisting,
      clinics: sourceData.clinics || [],
      doctors: sourceData.doctors || [],
      medicines: sourceData.medicines || [],
      faqs: sourceData.faqs || [],
    },
  );

  // data.imported contains counts: { clinics, doctors, medicines, faqs }
  return data;
}
```

**File Upload Process:**

```
┌──────────────────────────────┐
│ 1. User uploads JSON file    │
│ 2. Parse JSON in browser     │
│ 3. Validate structure        │
│ 4. Show preview (counts)     │
│ 5. Ask: Replace or Merge?    │
│ 6. Call importProjectData()  │
│ 7. Show success + counts     │
└──────────────────────────────┘
```

**Example CSV to JSON Parser (for building import files):**

```javascript
// Converts CSV uploaded by user to API JSON format
function parseCSVtoImportData(csvContent) {
  const lines = csvContent.trim().split('\n');
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());

  const doctors = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim());
    const row = {};
    headers.forEach((h, idx) => (row[h] = values[idx]));

    doctors.push({
      id: row['id'] || `doctor-${i}`,
      name: row['name'],
      specialization: row['specialization'],
      clinicId: row['clinic_id'],
      experienceYears: parseInt(row['experience_years'] || 0),
      // ... map other fields
    });
  }

  return {
    clinics: [],
    doctors,
    medicines: [],
    faqs: [],
  };
}
```

### 5. UI Layout Example

```
┌─────────────────────────────────────────────────────┐
│ MediBot Admin Dashboard                   [Logout] │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Projects                        [+ New Project] │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ Name              | Bot Name  | Enabled | Actions │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ MediBot Default   | MediBot   | ✓       | ⚙ Edit  │ │
│ │ Apollo Hospitals  | Apollo    |         | ⚙ Edit  │ │
│ │ MaxCare Network   | MaxCare   |         | ⚙ Edit  │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Selected Project Settings                       │ │
│ ├─────────────────────────────────────────────────┤ │
│ │                                                 │ │
│ │ Project Name: [MediBot Default            ]     │ │
│ │ Bot Name: [MediBot                    ]         │ │
│ │ Welcome Msg: [Welcome to MediBot!...    ]       │ │
│ │                                                 │ │
│ │ [Edit Prompts] [Import Data] [Save Changes]     │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 6. Template Placeholder Reference

**When editing System Prompt, users can use:**

- `{{botName}}` - Project's bot name (e.g., "MediBot")
- `{{projectName}}` - Project name (e.g., "Default Healthcare Bot")
- `{{projectDescription}}` - Project description
- `{{supportEmail}}` - Support email address
- `{{supportPhone}}` - Support phone number
- `{{projectInstructions}}` - Custom instructions from project fields

**When editing User Prompt, users can use:**

- `{{botName}}`, `{{projectName}}` - As above
- `{{currentTime}}` - ISO timestamp
- `{{inputType}}` - "text", "audio", or "location"
- `{{userName}}` - Patient name from session
- `{{userPhone}}` - User's phone number
- `{{sessionState}}` - Formatted patient/booking data from session
- `{{conversationHistory}}` - Previous conversation summary
- `{{lastMessage}}` - Last message from bot
- `{{knowledgeBase}}` - Doctors, medicines, FAQs formatted for AI
- `{{userInput}}` - Current user message
- `{{isTranslatedFromAudio}}` - true/false flag
- `{{audioNote}}` - Explanation about audio translation

## Error Handling

```javascript
// Standard error responses from Admin API:
// 400: Bad request (missing/invalid fields)
// 401: Unauthorized (missing/expired token)
// 404: Not found (project doesn't exist)
// 500: Server error (database issue)

async function makeAdminRequest(method, path, body = null) {
  // ... existing code ...

  const response = await fetch(`${ADMIN_API_URL}${path}`, options);

  if (!response.ok) {
    const error = await response.json();
    if (response.status === 401) {
      // Token expired, redirect to login
      localStorage.removeItem('adminToken');
      window.location.href = '/login';
    }
    throw new Error(error.error || `Request failed: ${response.statusText}`);
  }

  return response.json();
}
```

## Using Postman Collection

1. Download: `MediBot_Admin_API.postman_collection.json`
2. In Postman: Collection → Import
3. Set environment variables:
   - `BASE_URL` = `https://your-project.supabase.co/functions/v1`
   - `ADMIN_TOKEN` = (auto-filled from login response)
   - `PROJECT_ID` = (set when testing specific project)
4. Use pre-built requests to test API before building UI

## Security Best Practices

1. **Never expose admin panel on public internet** - Use VPN or IP allowlisting
2. **Rotate default password immediately** - Change default admin password at setup
3. **Implement rate limiting** - Limit login attempts to prevent brute force
4. **HTTPS only** - Admin APIs must run over HTTPS in production
5. **Token expiry handling** - Automatically log out users when token expires
6. **Audit logging** - Log all admin API calls for compliance

## Default Credentials

⚠️ **CHANGE IMMEDIATELY AT SETUP**

Default admin account is created at deployment time with generated credentials. To rotate password:

1. Connect to Supabase SQL editor
2. Generate new bcrypt hash: Use any bcrypt online tool or: `deno eval 'import bcrypt from "npm:bcryptjs"; console.log(bcrypt.hashSync("NEW_PASSWORD", 10));'`
3. Execute:

```sql
UPDATE admin_users
SET password_hash = 'NEW_BCRYPT_HASH'
WHERE email = 'your-admin-email@yourdomain.com';
```

## Next Steps

1. ✅ Implement login page
2. ✅ Implement projects list page
3. ✅ Implement project editor (basic settings)
4. ✅ Implement prompt editor with live preview
5. ✅ Implement data import form
6. ✅ Add confirmation dialogs for destructive actions
7. ✅ Add success/error notifications
8. ✅ Test all endpoints with Postman first
9. ✅ Deploy admin panel to your hosting

Happy building! 🚀
