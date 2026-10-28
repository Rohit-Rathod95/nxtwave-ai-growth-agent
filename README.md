# nxtwave-ai-growth-agent

An AI-powered growth agent using Supabase PostgreSQL, React, Node.js, and Python to analyze campaign performance and recommend data-driven actions.

---

## 🎯 Campaign Constraints & Goals

- **Registration Target**: 500 final-year engineering students
- **Workshop**: Free online technical workshop
- **Budget Limit**: ₹2,000 INR (strict ceiling)
- **Duration**: 7 days
- **Data Integrity**: Zero simulated, seeded, or fabricated records. Fresh databases start completely empty. Public API registrations always default to `record_type = 'genuine'`.
- **Outreach Scope**: No synthetic outreach automation.

---

## 🏛️ Database Selection: Supabase PostgreSQL vs. Firebase

For this campaign and agent architecture, **Supabase PostgreSQL** was selected over Firebase Firestore:

1. **Relational Integrity & Schema Validation**:
   - PostgreSQL provides database-level `UNIQUE` constraints (enforcing normalized email deduplication) and check constraints (`record_type IN ('genuine', 'test')`, length, and graduation year ranges) directly at the storage layer.
2. **ACID Aggregations & Analytics**:
   - Querying real-time registration velocity, genuine counts (`WHERE record_type = 'genuine'`), and paginated cohorts is an optimal relational operation. In contrast, Firestore charges per document read and lacks native SQL aggregations like `COUNT(*)` over filtered indexed rows without complex composite index management.
3. **Future AI Agent Integration (Phase 4)**:
   - Supabase offers full SQL querying, relational joins, and `pgvector` support for embedding-based retrieval when the LangGraph/ReAct growth agent evaluates campaign performance.

---

## 🏗️ Project Structure

```text
nxtwave-ai-growth-agent/
├── backend/
│   ├── src/
│   │   ├── app.js            # Express application factory & middleware
│   │   ├── server.js         # Entry point and server lifecycle
│   │   ├── db/
│   │   │   └── supabase.js   # Centralized Supabase client module
│   │   ├── routes/
│   │   │   └── registrationRoutes.js # API endpoints (/api/registrations)
│   │   ├── services/
│   │   │   └── registrationService.js # Business logic & Supabase queries
│   │   └── utils/
│   │       └── validation.js # Email normalization & payload sanitization
│   ├── supabase/
│   │   └── migrations/
│   │       └── 001_create_registrations.sql # SQL migration with RLS policies
│   ├── test/
│   │   ├── helpers/
│   │   │   └── mockSupabase.js # Isolated in-memory mock harness
│   │   ├── health.test.js    # Health endpoint verification
│   │   └── registrations.test.js # 14 comprehensive API unit/mock tests
│   ├── .env.example          # Placeholders for PORT, SUPABASE_URL, SUPABASE_SECRET_KEY
│   └── package.json          # Express dependencies (@supabase/supabase-js) & scripts
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Phase 1 UI & Health check client
│   │   ├── App.css
│   │   └── main.jsx
│   ├── .env.example          # Frontend environment template (VITE_API_URL)
│   └── package.json          # React + Vite dependencies and scripts
├── data/
│   └── README.md             # Data guidelines (no mock/seeded data permitted)
├── docs/
│   └── architecture.md       # Architecture, database schema, and API contracts
├── .gitignore                # Excludes node_modules, dist, .env*, venv, secrets
├── package.json              # Root orchestration scripts
└── README.md                 # Complete documentation & setup instructions
```

---

## 📋 Prerequisites

- **Node.js**: `v20.x` or higher (verified on `v22.19.0`)
- **npm**: `v10.x` or higher (verified on `11.11.0`)
- **Shell**: PowerShell (Windows) or Bash / Zsh (Linux / macOS)
- **Supabase Account**: (Free tier at [supabase.com](https://supabase.com))

---

## 🔑 Supabase Setup & Environment Configuration

### Step 1: Create a Supabase Project
1. Log in to your [Supabase Dashboard](https://app.supabase.com).
2. Click **New project**, choose an organization, and name your project (e.g. `nxtwave-ai-growth-agent`).
3. Set a strong database password and select the region nearest your audience.

### Step 2: Retrieve Credentials
1. In the Supabase project dashboard, navigate to **Project Settings** > **API**.
2. Copy the following values:
   - **Project URL**: (e.g., `https://abcdefghijklm.supabase.co`)
   - **Secret Key**: Use the `service_role` secret key (under Project API keys). *Never expose this key to frontend clients or git.*

### Step 3: Apply the SQL Migration
1. In the Supabase dashboard, click the **SQL Editor** tab on the left sidebar.
2. Open the file [`backend/supabase/migrations/001_create_registrations.sql`](file:///d:/nxtwave-ai-growth-agent/backend/supabase/migrations/001_create_registrations.sql).
3. Copy its entire content into the Supabase SQL Editor and click **Run**.
4. Verify the `registrations` table is created under the **Table Editor**. It will start with 0 rows (zero seed data).

*(Alternatively, if using the Supabase CLI: `supabase db push` or `supabase migration up`).*

### Step 4: Configure `backend/.env` on Windows PowerShell
Create your local environment file from the template:
```powershell
# Copy the example template
Copy-Item backend\.env.example backend\.env
```
Edit `backend\.env` with your favorite editor or via PowerShell:
```env
PORT=5000
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SECRET_KEY=your-supabase-service-role-secret-key
```
> [!IMPORTANT]
> `backend/.env` is strictly ignored by Git via `.gitignore`. Never commit or paste real secrets into chat or source control.

---

## 🚀 Setup & Execution Commands (Windows PowerShell)

### Step 1: Install Dependencies
```powershell
# In project root:
cd frontend
npm install
cd ..\backend
npm install
cd ..
```

### Step 2: Run Automated Tests
```powershell
# From project root:
npm run test:backend

# Or directly in backend:
cd backend
npm test
```
**Test Results**: 14 tests covering:
- Health check baseline preservation
- Successful registration with required fields
- Optional UTM parameters & source handling
- Client tampering prevention (forcing `record_type: 'genuine'`)
- Validation rejections (missing fields, invalid email, out-of-range graduation year)
- Duplicate email conflict rejection (`409 Conflict`)
- Empty database behavior
- Pagination and newest-first ordering
- Genuine count calculation excluding test records
- Missing configuration fallback (`503 Service Unavailable`)

### Step 3: Start the Backend & Frontend

#### Terminal 1 — Start Backend Server:
```powershell
# From project root:
npm run dev:backend

# Or from backend folder:
cd backend
npm run dev
```
Backend will be live at: `http://localhost:5000`

#### Terminal 2 — Start Frontend Application:
```powershell
# From project root:
npm run dev:frontend

# Or from frontend folder:
cd frontend
npm run dev
```
Frontend will be live at: `http://localhost:5173`

---

## 📡 API Endpoints Reference

### 1. `GET /api/health`
Health check endpoint.
```bash
curl http://localhost:5000/api/health
```
Response (`200 OK`):
```json
{
  "status": "ok"
}
```

### 2. `POST /api/registrations`
Register a student for the free online workshop.

**Headers**: `Content-Type: application/json`

**Payload**:
```json
{
  "name": "Aarav Sharma",
  "email": "aarav.sharma@engineering.ac.in",
  "college": "National Institute of Technology",
  "graduationYear": 2026,
  "source": "linkedin",
  "utmSource": "social",
  "utmMedium": "cpc",
  "utmCampaign": "workshop_launch"
}
```

**Responses**:
- `201 Created`: Returns newly created record (`record_type: "genuine"`).
- `400 Bad Request`: Validation failure (missing required fields, malformed email, or invalid graduation year).
- `409 Conflict`: Normalized email already registered (`"A registration with this email already exists"`).
- `503 Service Unavailable`: Supabase credentials not configured in `backend/.env`.

### 3. `GET /api/registrations`
Returns paginated registrations sorted newest first. Excludes test records.
- Query Parameters: `page` (default `1`), `limit` (default `20`, max `100`).

```bash
curl "http://localhost:5000/api/registrations?page=1&limit=20"
```

Response (`200 OK`):
```json
{
  "records": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### 4. `GET /api/registrations/count`
Returns the total count of genuine registrations, strictly excluding test records.

```bash
curl http://localhost:5000/api/registrations/count
```

Response (`200 OK`):
```json
{
  "count": 1
}
```

---

## 🧪 Testing Strategy: Mocked vs. Live Verification

- **Mocked / Isolated Unit Tests**:
  All 14 tests in `backend/test/registrations.test.js` utilize an in-memory query builder mock (`createMockSupabaseClient`). This verifies endpoint routing, HTTP status codes, email normalization, validation rules, duplicate detection, pagination, and error isolation without mutating or polluting live database tables.
- **Live Supabase Connectivity**:
  Live database connectivity requires configuring real project credentials in `backend/.env` and executing the migration in your Supabase dashboard. In the absence of live project credentials, the backend safely detects the missing configuration at startup, logs a clean notice, and protects database endpoints with `HTTP 503` without leaking sensitive stack traces.

---

## 🗺️ Planned Development Phases

- [x] **Phase 1: Foundation & Setup**
  - Project scaffolding, frontend Vite app, Express ES modules API, health endpoint.
- [x] **Phase 2: Database Storage & Real Registration API (Current)**
  - Supabase PostgreSQL schema with constraints, indexes, and RLS policies.
  - Server-side Supabase client with environment validation.
  - `POST /api/registrations`, `GET /api/registrations`, `GET /api/registrations/count`.
  - Comprehensive automated test suite (14 passing tests).
- [ ] **Phase 3: Campaign Performance Tracking & Analytics**
  - Registration velocity and conversion rate tracking towards 500 target.
  - Budget expenditure monitor against ₹2,000 threshold.
- [ ] **Phase 4: AI Growth Agent Intelligence**
  - LangGraph / ReAct agent implementation.
- [ ] **Phase 5: Automation (Optional)**
  - n8n workflow integration if timeline permits.
