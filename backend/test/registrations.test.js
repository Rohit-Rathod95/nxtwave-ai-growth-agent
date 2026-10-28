import test from 'node:test'
import assert from 'node:assert'
import { createApp } from '../src/app.js'
import { createMockSupabaseClient } from './helpers/mockSupabase.js'
import { normalizeSupabaseUrl, validateSupabaseConfig } from '../src/db/supabase.js'
import { sanitizeLogMessage, formatSafeError } from '../src/utils/sanitizeError.js'

// Helper to spawn an ephemeral test server instance
async function spawnTestServer(mockClient = null) {
  const app = createApp({ supabaseClient: mockClient })
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const { port } = server.address()
  const baseUrl = `http://localhost:${port}`

  return {
    baseUrl,
    close: () => server.close()
  }
}

test('[ISOLATED TEST] GET /api/health preserves Phase 1 baseline', async (t) => {
  const { baseUrl, close } = await spawnTestServer()
  t.after(close)

  const res = await fetch(`${baseUrl}/api/health`)
  assert.strictEqual(res.status, 200)
  const body = await res.json()
  assert.deepStrictEqual(body, { status: 'ok' })
})

test('[ISOLATED TEST] POST /api/registrations - successful registration with required fields', async (t) => {
  const mockClient = createMockSupabaseClient()
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const payload = {
    name: 'Aarav Sharma',
    email: 'Aarav.Sharma@Engineering.ac.in',
    college: 'National Institute of Technology',
    graduationYear: 2026
  }

  const res = await fetch(`${baseUrl}/api/registrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  assert.strictEqual(res.status, 201)
  const body = await res.json()
  assert.strictEqual(body.success, true)
  assert.ok(body.data.id)
  assert.strictEqual(body.data.name, 'Aarav Sharma')
  // Verified normalization: lowercase and trimmed
  assert.strictEqual(body.data.email, 'aarav.sharma@engineering.ac.in')
  assert.strictEqual(body.data.college, 'National Institute of Technology')
  assert.strictEqual(body.data.graduation_year, 2026)
  assert.strictEqual(body.data.record_type, 'genuine')
})

test('[ISOLATED TEST] POST /api/registrations - handles optional UTM and source parameters', async (t) => {
  const mockClient = createMockSupabaseClient()
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const payload = {
    name: 'Priya Patel',
    email: 'priya.patel@college.edu',
    college: 'State Technical University',
    graduationYear: 2025,
    source: 'linkedin',
    utmSource: 'social',
    utmMedium: 'cpc',
    utmCampaign: 'workshop_phase1'
  }

  const res = await fetch(`${baseUrl}/api/registrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  assert.strictEqual(res.status, 201)
  const body = await res.json()
  assert.strictEqual(body.data.source, 'linkedin')
  assert.strictEqual(body.data.utm_source, 'social')
  assert.strictEqual(body.data.utm_medium, 'cpc')
  assert.strictEqual(body.data.utm_campaign, 'workshop_phase1')
})

test('[ISOLATED TEST] POST /api/registrations - prevents client from overriding record_type', async (t) => {
  const mockClient = createMockSupabaseClient()
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const payload = {
    name: 'Sneha Reddy',
    email: 'sneha.reddy@univ.ac.in',
    college: 'Engineering College',
    graduationYear: 2026,
    record_type: 'test' // public API must disregard this and enforce 'genuine'
  }

  const res = await fetch(`${baseUrl}/api/registrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  assert.strictEqual(res.status, 201)
  const body = await res.json()
  assert.strictEqual(body.data.record_type, 'genuine')
})

test('[ISOLATED TEST] POST /api/registrations - rejects missing required fields with HTTP 400', async (t) => {
  const mockClient = createMockSupabaseClient()
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const incompletePayloads = [
    {},
    { email: 'user@example.com', college: 'Univ', graduationYear: 2026 },
    { name: 'User', college: 'Univ', graduationYear: 2026 },
    { name: 'User', email: 'user@example.com', graduationYear: 2026 },
    { name: 'User', email: 'user@example.com', college: 'Univ' }
  ]

  for (const payload of incompletePayloads) {
    const res = await fetch(`${baseUrl}/api/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    assert.strictEqual(res.status, 400)
    const body = await res.json()
    assert.strictEqual(body.error, 'Validation Error')
    assert.ok(Array.isArray(body.details) && body.details.length > 0)
  }
})

test('[ISOLATED TEST] POST /api/registrations - rejects invalid email formats and graduation years', async (t) => {
  const mockClient = createMockSupabaseClient()
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const invalidInputs = [
    { name: 'Test', email: 'not-an-email', college: 'Univ', graduationYear: 2026 },
    { name: 'Test', email: 'missing@domain', college: 'Univ', graduationYear: 2026 },
    { name: 'Test', email: 'user@domain.com', college: 'Univ', graduationYear: 'twenty-six' },
    { name: 'Test', email: 'user@domain.com', college: 'Univ', graduationYear: 2018 }, // Out of range (< 2020)
    { name: 'Test', email: 'user@domain.com', college: 'Univ', graduationYear: 2040 }  // Out of range (> 2035)
  ]

  for (const payload of invalidInputs) {
    const res = await fetch(`${baseUrl}/api/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    assert.strictEqual(res.status, 400)
  }
})

test('[ISOLATED TEST] POST /api/registrations - rejects duplicate email with HTTP 409', async (t) => {
  const mockClient = createMockSupabaseClient()
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const payload = {
    name: 'Rohan Verma',
    email: 'rohan.verma@nit.ac.in',
    college: 'National Institute of Technology',
    graduationYear: 2026
  }

  // First insertion succeeds
  const firstRes = await fetch(`${baseUrl}/api/registrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  assert.strictEqual(firstRes.status, 201)

  // Duplicate insertion with differing case and extra whitespace must be rejected
  const duplicateRes = await fetch(`${baseUrl}/api/registrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      email: '  ROHAN.VERMA@NIT.AC.IN  '
    })
  })
  assert.strictEqual(duplicateRes.status, 409)
  const dupBody = await duplicateRes.json()
  assert.strictEqual(dupBody.error, 'A registration with this email already exists')
})

test('[ISOLATED TEST] GET /api/registrations - empty database returns empty paginated list', async (t) => {
  const mockClient = createMockSupabaseClient([])
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const res = await fetch(`${baseUrl}/api/registrations`)
  assert.strictEqual(res.status, 200)
  const body = await res.json()
  assert.deepStrictEqual(body.records, [])
  assert.deepStrictEqual(body.pagination, {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  })
})

test('[ISOLATED TEST] GET /api/registrations - pagination and newest-first ordering', async (t) => {
  const seededRecords = [
    {
      id: 'uuid-1',
      name: 'First Student',
      email: 'first@test.edu',
      college: 'College A',
      graduation_year: 2025,
      record_type: 'genuine',
      created_at: '2026-10-20T10:00:00Z'
    },
    {
      id: 'uuid-2',
      name: 'Second Student',
      email: 'second@test.edu',
      college: 'College B',
      graduation_year: 2026,
      record_type: 'genuine',
      created_at: '2026-10-21T10:00:00Z'
    },
    {
      id: 'uuid-3',
      name: 'Third Student',
      email: 'third@test.edu',
      college: 'College C',
      graduation_year: 2026,
      record_type: 'genuine',
      created_at: '2026-10-22T10:00:00Z'
    }
  ]

  const mockClient = createMockSupabaseClient(seededRecords)
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  // Request page 1 with limit 2
  const res = await fetch(`${baseUrl}/api/registrations?page=1&limit=2`)
  assert.strictEqual(res.status, 200)
  const body = await res.json()

  assert.strictEqual(body.records.length, 2)
  // Newest first check: third student (created Oct 22) must be first
  assert.strictEqual(body.records[0].name, 'Third Student')
  assert.strictEqual(body.records[1].name, 'Second Student')
  assert.deepStrictEqual(body.pagination, {
    page: 1,
    limit: 2,
    total: 3,
    totalPages: 2
  })
})

test('[ISOLATED TEST] GET /api/registrations - rejects invalid pagination parameters', async (t) => {
  const mockClient = createMockSupabaseClient()
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const invalidQueries = ['page=0', 'page=-5', 'limit=0', 'limit=150', 'page=abc']

  for (const q of invalidQueries) {
    const res = await fetch(`${baseUrl}/api/registrations?${q}`)
    assert.strictEqual(res.status, 400)
    const body = await res.json()
    assert.strictEqual(body.error, 'Invalid pagination parameters')
  }
})

test('[ISOLATED TEST] GET /api/registrations/count - correctly excludes test records', async (t) => {
  const records = [
    { id: '1', email: 'g1@test.edu', record_type: 'genuine', created_at: new Date().toISOString() },
    { id: '2', email: 'g2@test.edu', record_type: 'genuine', created_at: new Date().toISOString() },
    { id: '3', email: 't1@test.edu', record_type: 'test', created_at: new Date().toISOString() },
    { id: '4', email: 't2@test.edu', record_type: 'test', created_at: new Date().toISOString() }
  ]

  const mockClient = createMockSupabaseClient(records)
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const res = await fetch(`${baseUrl}/api/registrations/count`)
  assert.strictEqual(res.status, 200)
  const body = await res.json()
  // 4 total records, but only 2 genuine records
  assert.strictEqual(body.count, 2)
})

test('[ISOLATED TEST] GET /api/registrations/count - empty database returns 0', async (t) => {
  const mockClient = createMockSupabaseClient([])
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const res = await fetch(`${baseUrl}/api/registrations/count`)
  assert.strictEqual(res.status, 200)
  const body = await res.json()
  assert.strictEqual(body.count, 0)
})

test('[ISOLATED TEST] Database configuration missing returns HTTP 503 without leaking credentials', async (t) => {
  // Spawn test server with NO client and ensuring environment variables are temporarily unset
  const originalUrl = process.env.SUPABASE_URL
  const originalKey = process.env.SUPABASE_SECRET_KEY
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SECRET_KEY

  t.after(() => {
    if (originalUrl) process.env.SUPABASE_URL = originalUrl
    if (originalKey) process.env.SUPABASE_SECRET_KEY = originalKey
  })

  const { baseUrl, close } = await spawnTestServer(null)
  t.after(close)

  const countRes = await fetch(`${baseUrl}/api/registrations/count`)
  assert.strictEqual(countRes.status, 503)
  const countBody = await countRes.json()
  assert.strictEqual(countBody.error, 'Database service is not configured')

  const postRes = await fetch(`${baseUrl}/api/registrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'John Doe',
      email: 'john@example.com',
      college: 'ABC College',
      graduationYear: 2026
    })
  })
  assert.strictEqual(postRes.status, 503)
  const postBody = await postRes.json()
  assert.strictEqual(postBody.error, 'Database service is not configured')
})

test('[ISOLATED TEST] normalizeSupabaseUrl converts postgres URI to HTTPS REST endpoint', () => {
  const pgUri = 'postgresql://postgres:secretpass@db.shzkznpshaipnatascie.supabase.co:5432/postgres'
  const normalized = normalizeSupabaseUrl(pgUri)
  assert.strictEqual(normalized, 'https://shzkznpshaipnatascie.supabase.co')

  const standardUrl = 'https://myproject.supabase.co'
  assert.strictEqual(normalizeSupabaseUrl(standardUrl), standardUrl)
})

test('[ISOLATED TEST] validateSupabaseConfig rejects invalid/malformed SUPABASE_URL', (t) => {
  const originalUrl = process.env.SUPABASE_URL
  const originalKey = process.env.SUPABASE_SECRET_KEY

  t.after(() => {
    if (originalUrl) process.env.SUPABASE_URL = originalUrl
    if (originalKey) process.env.SUPABASE_SECRET_KEY = originalKey
  })

  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test'

  // Malformed URL
  process.env.SUPABASE_URL = 'not-a-valid-url'
  const malformedCheck = validateSupabaseConfig()
  assert.strictEqual(malformedCheck.isValid, false)
  assert.ok(malformedCheck.missing.some(m => m.includes('malformed')))

  // Disallowed protocol (e.g. ftp)
  process.env.SUPABASE_URL = 'ftp://files.example.com'
  const ftpCheck = validateSupabaseConfig()
  assert.strictEqual(ftpCheck.isValid, false)
  assert.ok(ftpCheck.missing.some(m => m.includes('HTTP or HTTPS')))
})

test('[ISOLATED TEST] GET /api/registrations/count - unexpected database query failure returns generic HTTP 500', async (t) => {
  const mockClient = createMockSupabaseClient([], {
    queryError: {
      code: 'PGRST500',
      message: 'relation "registrations" does not exist'
    }
  })
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const res = await fetch(`${baseUrl}/api/registrations/count`)
  assert.strictEqual(res.status, 500)
  const body = await res.json()
  // Generic error response preserved without leaking internal database error
  assert.deepStrictEqual(body, {
    error: 'An unexpected error occurred while retrieving registration count'
  })
})

test('[ISOLATED TEST] sanitizeLogMessage and formatSafeError redact passwords, tokens, and emails', () => {
  const rawMsg = 'Error connecting to postgresql://user:mysecretpwd@db.proj.supabase.co:5432/db for user john.doe@university.edu with token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisToken'
  const sanitized = sanitizeLogMessage(rawMsg)

  assert.ok(!sanitized.includes('mysecretpwd'), 'Password must be redacted')
  assert.ok(!sanitized.includes('john.doe@university.edu'), 'Email must be redacted')
  assert.ok(!sanitized.includes('doNotLeakThisToken'), 'JWT must be redacted')
  assert.ok(sanitized.includes('[REDACTED_PASSWORD]'))
  assert.ok(sanitized.includes('[REDACTED_EMAIL]'))
  assert.ok(sanitized.includes('[REDACTED_JWT]'))

  const formatted = formatSafeError({ code: 'PGRST123', message: 'Secret key=sb_secret_12345 error' })
  assert.strictEqual(formatted.code, 'PGRST123')
  assert.ok(!formatted.message.includes('sb_secret_12345'))
  assert.ok(formatted.message.includes('[REDACTED_SECRET]'))
})
