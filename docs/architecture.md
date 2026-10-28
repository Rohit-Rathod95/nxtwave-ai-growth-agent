# System Architecture & Database Design (Phase 2)

## 1. Campaign Specifications
- **Target Goal**: Register 500 final-year engineering students for a free online workshop.
- **Budget Limit**: ₹2,000 INR (strict expenditure cap).
- **Campaign Duration**: 7 days.
- **Data Integrity Policy**: Zero simulated, seeded, or fabricated records. Fresh databases start completely empty. Public API registrations always default to `record_type = 'genuine'`.

---

## 2. Database Selection: Supabase PostgreSQL vs. Firebase

For the AI Growth Agent campaign, **Supabase PostgreSQL** was chosen over NoSQL alternatives (such as Firebase Firestore):

1. **Relational Integrity & Schema Validation**:
   - Campaign registrations require strict, database-level unique constraints (e.g., unique normalized email across concurrent requests).
   - PostgreSQL provides robust native check constraints (`char_length`, `graduation_year` ranges, enumerated `record_type`) preventing corrupt or malformed submissions directly at the storage engine level.
2. **Aggregations & Analytics Compatibility**:
   - Tracking registration velocity, funnel conversion rates, and genuine registration counts (`WHERE record_type = 'genuine'`) requires ACID-compliant relational aggregation.
   - Firestore charges per document read and lacks native SQL aggregations like `COUNT(*)` over indexed columns with complex multi-field filtering without specialized composite indexes.
3. **Future AI Agent Integration (Phase 4)**:
   - Supabase PostgreSQL natively supports standard SQL queries, relational joins, and `pgvector` for embedding storage when the autonomous LangGraph/ReAct growth agent analyzes campaign performance and audience cohorts.

---

## 3. Database Schema & Migration

Migration file: `backend/supabase/migrations/001_create_registrations.sql`

```sql
CREATE TABLE IF NOT EXISTS registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    college TEXT NOT NULL,
    graduation_year INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    source TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    record_type TEXT DEFAULT 'genuine' NOT NULL,

    CONSTRAINT uq_registrations_email UNIQUE (email),
    CONSTRAINT chk_registrations_record_type CHECK (record_type IN ('genuine', 'test')),
    CONSTRAINT chk_registrations_name_len CHECK (char_length(trim(name)) >= 1 AND char_length(name) <= 120),
    CONSTRAINT chk_registrations_email_len CHECK (char_length(trim(email)) >= 5 AND char_length(email) <= 255),
    CONSTRAINT chk_registrations_college_len CHECK (char_length(trim(college)) >= 2 AND char_length(college) <= 200),
    CONSTRAINT chk_registrations_grad_year CHECK (graduation_year >= 2020 AND graduation_year <= 2035)
);

CREATE INDEX IF NOT EXISTS idx_registrations_created_at ON registrations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_registrations_record_type ON registrations (record_type);
CREATE INDEX IF NOT EXISTS idx_registrations_email_lookup ON registrations (email);
```

### Security & Row Level Security (RLS) Access Model
- **Server-Side Privileged Operations**: All registrations (creation, paginated listing, count) are performed server-side by the Express API using the server secret key (`service_role` key).
- **Public / Client Isolation**: Direct public (`anon`) read, insert, update, and delete are denied via RLS policies (`CREATE POLICY "Deny anon read" ...`).
- **Secret Protection**: Supabase secret keys are restricted to `backend/.env` and are never bundled into the client build or logged.

---

## 4. API Endpoints Contract

### `GET /api/health`
Preserves Phase 1 health check.
- **Response**: `200 OK`
```json
{
  "status": "ok"
}
```

---

### `POST /api/registrations`
Creates a verified student registration record.
- **Request Body**:
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
- **Responses**:
  - `201 Created`:
    ```json
    {
      "success": true,
      "data": {
        "id": "e81d7696-2679-43c2-8fe7-7d924d551e06",
        "name": "Aarav Sharma",
        "email": "aarav.sharma@engineering.ac.in",
        "college": "National Institute of Technology",
        "graduation_year": 2026,
        "created_at": "2026-10-28T08:45:00.000Z",
        "source": "linkedin",
        "utm_source": "social",
        "utm_medium": "cpc",
        "utm_campaign": "workshop_launch",
        "record_type": "genuine"
      }
    }
    ```
  - `400 Bad Request`: Missing required fields, invalid email format, or invalid graduation year.
    ```json
    {
      "error": "Validation Error",
      "details": ["email format is invalid"]
    }
    ```
  - `409 Conflict`: Duplicate email attempt.
    ```json
    {
      "error": "A registration with this email already exists"
    }
    ```
  - `503 Service Unavailable`: Supabase credentials not configured in `backend/.env`.

---

### `GET /api/registrations`
Returns paginated registrations ordered newest first (`ORDER BY created_at DESC`). Test records are excluded.
- **Query Parameters**:
  - `page` (optional integer >= 1, default `1`)
  - `limit` (optional integer between 1 and 100, default `20`)
- **Responses**:
  - `200 OK`:
    ```json
    {
      "records": [
        {
          "id": "e81d7696-2679-43c2-8fe7-7d924d551e06",
          "name": "Aarav Sharma",
          "email": "aarav.sharma@engineering.ac.in",
          "college": "National Institute of Technology",
          "graduation_year": 2026,
          "created_at": "2026-10-28T08:45:00.000Z",
          "source": "linkedin",
          "utm_source": "social",
          "utm_medium": "cpc",
          "utm_campaign": "workshop_launch",
          "record_type": "genuine"
        }
      ],
      "pagination": {
        "page": 1,
        "limit": 20,
        "total": 1,
        "totalPages": 1
      }
    }
    ```
  - `400 Bad Request`: Invalid pagination parameters.

---

### `GET /api/registrations/count`
Returns the total genuine registrations count (excluding test records).
- **Response**: `200 OK`
```json
{
  "count": 42
}
```
