/**
 * analytics.test.js
 *
 * Isolated tests for all five analytics endpoints.
 *
 * ALL tests use the in-memory mock Supabase client — no live database.
 * Test records (record_type = 'test') must be excluded from every analytics result.
 * Genuine records (record_type = 'genuine') must be counted correctly.
 *
 * Timezone note: created_at strings use UTC ISO-8601.
 *   'today'   = a timestamp with today's UTC date
 *   'recent'  = within the last 7 days
 *   'old'     = older than 30 days
 */

import test from 'node:test'
import assert from 'node:assert'
import { createApp } from '../src/app.js'
import { createMockSupabaseClient } from './helpers/mockSupabase.js'

// ---------------------------------------------------------------------------
// Test server helper (same pattern as registrations.test.js)
// ---------------------------------------------------------------------------

async function spawnTestServer(mockClient = null) {
  const app = createApp({ supabaseClient: mockClient })
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const { port } = server.address()
  return {
    baseUrl: `http://localhost:${port}`,
    close: () => server.close()
  }
}

// ---------------------------------------------------------------------------
// Shared fixture data
// ---------------------------------------------------------------------------

/** Returns a UTC ISO timestamp for N days ago from the start of today (UTC midnight). */
function utcTs(daysAgo = 0, hourOffset = 12) {
  const d = new Date()
  d.setUTCHours(hourOffset, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return d.toISOString()
}

/** Returns a YYYY-MM-DD UTC string for N days ago. */
function utcDate(daysAgo = 0) {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

const FIXTURES = [
  // Genuine registrations — varying dates, colleges, sources, years
  {
    id: 'g1', name: 'A', email: 'a@test.edu', college: 'NIT Warangal',
    graduation_year: 2026, record_type: 'genuine',
    source: 'linkedin', utm_source: 'social', utm_medium: 'cpc', utm_campaign: 'launch',
    created_at: utcTs(0) // today
  },
  {
    id: 'g2', name: 'B', email: 'b@test.edu', college: 'NIT Warangal',
    graduation_year: 2026, record_type: 'genuine',
    source: null, utm_source: null, utm_medium: null, utm_campaign: null,
    created_at: utcTs(1) // 1 day ago (within 7)
  },
  {
    id: 'g3', name: 'C', email: 'c@test.edu', college: 'IIT Bombay',
    graduation_year: 2025, record_type: 'genuine',
    source: 'instagram', utm_source: 'social', utm_medium: 'organic', utm_campaign: 'launch',
    created_at: utcTs(3) // 3 days ago (within 7)
  },
  {
    id: 'g4', name: 'D', email: 'd@test.edu', college: 'IIT Bombay',
    graduation_year: 2025, record_type: 'genuine',
    source: null, utm_source: 'email', utm_medium: 'newsletter', utm_campaign: 'weekly',
    created_at: utcTs(10) // 10 days ago (within 30, outside 7)
  },
  {
    id: 'g5', name: 'E', email: 'e@test.edu', college: 'BITS Pilani',
    graduation_year: 2027, record_type: 'genuine',
    source: null, utm_source: null, utm_medium: null, utm_campaign: null,
    created_at: utcTs(35) // 35 days ago — outside 30-day window
  },
  // Test record — MUST be excluded from all analytics
  {
    id: 't1', name: 'Tester', email: 'tester@test.edu', college: 'NIT Warangal',
    graduation_year: 2026, record_type: 'test',
    source: null, utm_source: null, utm_medium: null, utm_campaign: null,
    created_at: utcTs(0)
  }
]

// Only genuine rows for expectation calculations
const GENUINE = FIXTURES.filter((r) => r.record_type === 'genuine')

// ===========================================================================
// GET /api/analytics/overview
// ===========================================================================

test('[ISOLATED TEST] GET /api/analytics/overview - correct counts and target progress', async (t) => {
  const mockClient = createMockSupabaseClient(FIXTURES)
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const res = await fetch(`${baseUrl}/api/analytics/overview`)
  assert.strictEqual(res.status, 200)

  const body = await res.json()
  assert.strictEqual(body.totalRegistrations, 5) // 5 genuine, 1 test excluded
  assert.strictEqual(body.target, 500)
  assert.strictEqual(body.remainingToTarget, 495)
  assert.strictEqual(body.targetProgressPercent, 1)

  // today count: g1 is today
  assert.strictEqual(body.registrationsToday, 1)
  // last 7 days: g1 (0d), g2 (1d), g3 (3d)
  assert.strictEqual(body.registrationsLast7Days, 3)
  // last 30 days: g1, g2, g3, g4 (10d) — g5 at 35d excluded
  assert.strictEqual(body.registrationsLast30Days, 4)
})

test('[ISOLATED TEST] GET /api/analytics/overview - empty database returns zeros', async (t) => {
  const mockClient = createMockSupabaseClient([])
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const res = await fetch(`${baseUrl}/api/analytics/overview`)
  assert.strictEqual(res.status, 200)

  const body = await res.json()
  assert.strictEqual(body.totalRegistrations, 0)
  assert.strictEqual(body.registrationsToday, 0)
  assert.strictEqual(body.registrationsLast7Days, 0)
  assert.strictEqual(body.registrationsLast30Days, 0)
  assert.strictEqual(body.target, 500)
  assert.strictEqual(body.remainingToTarget, 500)
  assert.strictEqual(body.targetProgressPercent, 0)
})

test('[ISOLATED TEST] GET /api/analytics/overview - remainingToTarget never below zero', async (t) => {
  // 600 genuine records should not produce a negative remaining
  const manyRecords = Array.from({ length: 600 }, (_, i) => ({
    id: `g${i}`,
    name: `Student ${i}`,
    email: `s${i}@test.edu`,
    college: 'College',
    graduation_year: 2026,
    record_type: 'genuine',
    source: null, utm_source: null, utm_medium: null, utm_campaign: null,
    created_at: utcTs(0)
  }))

  const mockClient = createMockSupabaseClient(manyRecords)
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const res = await fetch(`${baseUrl}/api/analytics/overview`)
  const body = await res.json()
  assert.strictEqual(body.remainingToTarget, 0)
  assert.strictEqual(body.totalRegistrations, 600)
  assert.ok(body.targetProgressPercent >= 100)
})

test('[ISOLATED TEST] GET /api/analytics/overview - test records excluded', async (t) => {
  const mockClient = createMockSupabaseClient(FIXTURES)
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const res = await fetch(`${baseUrl}/api/analytics/overview`)
  const body = await res.json()
  // FIXTURES has 6 rows: 5 genuine + 1 test. Must see 5.
  assert.strictEqual(body.totalRegistrations, 5)
})

test('[ISOLATED TEST] GET /api/analytics/overview - database error returns 500', async (t) => {
  const mockClient = createMockSupabaseClient([], {
    queryError: { code: 'PGRST500', message: 'relation "registrations" does not exist' }
  })
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const res = await fetch(`${baseUrl}/api/analytics/overview`)
  assert.strictEqual(res.status, 500)
  const body = await res.json()
  assert.ok(body.error)
  assert.ok(!body.error.includes('registrations'))
})

// ===========================================================================
// GET /api/analytics/daily
// ===========================================================================

test('[ISOLATED TEST] GET /api/analytics/daily - returns 30 date entries', async (t) => {
  const mockClient = createMockSupabaseClient(FIXTURES)
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const res = await fetch(`${baseUrl}/api/analytics/daily`)
  assert.strictEqual(res.status, 200)

  const body = await res.json()
  assert.ok(Array.isArray(body.data))
  assert.strictEqual(body.data.length, 30)

  // All entries must have date and registrations
  for (const entry of body.data) {
    assert.ok(typeof entry.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date), `date format invalid: ${entry.date}`)
    assert.ok(typeof entry.registrations === 'number' && entry.registrations >= 0)
  }
})

test('[ISOLATED TEST] GET /api/analytics/daily - today has correct count', async (t) => {
  const mockClient = createMockSupabaseClient(FIXTURES)
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const res = await fetch(`${baseUrl}/api/analytics/daily`)
  const body = await res.json()

  const todayStr = utcDate(0)
  const todayEntry = body.data.find((e) => e.date === todayStr)
  assert.ok(todayEntry, `No entry found for today (${todayStr})`)
  // g1 is today, t1 (test) must be excluded
  assert.strictEqual(todayEntry.registrations, 1)
})

test('[ISOLATED TEST] GET /api/analytics/daily - empty database returns all zeros', async (t) => {
  const mockClient = createMockSupabaseClient([])
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const res = await fetch(`${baseUrl}/api/analytics/daily`)
  const body = await res.json()

  assert.strictEqual(body.data.length, 30)
  for (const entry of body.data) {
    assert.strictEqual(entry.registrations, 0)
  }
})

test('[ISOLATED TEST] GET /api/analytics/daily - dates are ordered oldest first', async (t) => {
  const mockClient = createMockSupabaseClient(FIXTURES)
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const res = await fetch(`${baseUrl}/api/analytics/daily`)
  const body = await res.json()

  for (let i = 1; i < body.data.length; i++) {
    assert.ok(
      body.data[i].date > body.data[i - 1].date,
      `Dates out of order: ${body.data[i - 1].date} then ${body.data[i].date}`
    )
  }
})

// ===========================================================================
// GET /api/analytics/colleges
// ===========================================================================

test('[ISOLATED TEST] GET /api/analytics/colleges - ranked by count, test excluded', async (t) => {
  const mockClient = createMockSupabaseClient(FIXTURES)
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const res = await fetch(`${baseUrl}/api/analytics/colleges`)
  assert.strictEqual(res.status, 200)

  const body = await res.json()
  assert.ok(Array.isArray(body.data))

  // NIT Warangal: g1 + g2 = 2 genuine (t1 is test, excluded)
  // IIT Bombay: g3 + g4 = 2
  // BITS Pilani: g5 = 1
  const nit = body.data.find((c) => c.college === 'NIT Warangal')
  const iit = body.data.find((c) => c.college === 'IIT Bombay')
  const bits = body.data.find((c) => c.college === 'BITS Pilani')

  assert.ok(nit, 'NIT Warangal missing')
  assert.ok(iit, 'IIT Bombay missing')
  assert.ok(bits, 'BITS Pilani missing')

  assert.strictEqual(nit.registrations, 2)
  assert.strictEqual(iit.registrations, 2)
  assert.strictEqual(bits.registrations, 1)

  // Must be descending order (or stable for ties)
  for (let i = 1; i < body.data.length; i++) {
    assert.ok(body.data[i].registrations <= body.data[i - 1].registrations)
  }
})

test('[ISOLATED TEST] GET /api/analytics/colleges - limit parameter respected', async (t) => {
  const mockClient = createMockSupabaseClient(FIXTURES)
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const res = await fetch(`${baseUrl}/api/analytics/colleges?limit=1`)
  assert.strictEqual(res.status, 200)

  const body = await res.json()
  assert.strictEqual(body.data.length, 1)
})

test('[ISOLATED TEST] GET /api/analytics/colleges - invalid limit returns 400', async (t) => {
  const mockClient = createMockSupabaseClient(FIXTURES)
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  for (const badLimit of ['0', '101', 'abc', '-1']) {
    const res = await fetch(`${baseUrl}/api/analytics/colleges?limit=${badLimit}`)
    assert.strictEqual(res.status, 400, `Expected 400 for limit=${badLimit}`)
    const body = await res.json()
    assert.ok(body.error)
  }
})

test('[ISOLATED TEST] GET /api/analytics/colleges - empty database returns empty array', async (t) => {
  const mockClient = createMockSupabaseClient([])
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const res = await fetch(`${baseUrl}/api/analytics/colleges`)
  const body = await res.json()
  assert.deepStrictEqual(body.data, [])
})

// ===========================================================================
// GET /api/analytics/sources
// ===========================================================================

test('[ISOLATED TEST] GET /api/analytics/sources - groups correctly, no duplicates', async (t) => {
  const mockClient = createMockSupabaseClient(FIXTURES)
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const res = await fetch(`${baseUrl}/api/analytics/sources`)
  assert.strictEqual(res.status, 200)

  const body = await res.json()
  assert.ok(Array.isArray(body.data))

  // Total across all groups must equal genuine count (5)
  const total = body.data.reduce((sum, g) => sum + g.registrations, 0)
  assert.strictEqual(total, 5)

  // No group should have 0 registrations
  for (const group of body.data) {
    assert.ok(group.registrations > 0)
    assert.ok(typeof group.utm_source === 'string')
    assert.ok(typeof group.utm_medium === 'string')
    assert.ok(typeof group.utm_campaign === 'string')
    assert.ok(typeof group.source === 'string')
  }
})

test('[ISOLATED TEST] GET /api/analytics/sources - null fields show as Unattributed', async (t) => {
  const mockClient = createMockSupabaseClient(FIXTURES)
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const res = await fetch(`${baseUrl}/api/analytics/sources`)
  const body = await res.json()

  // g2, g4 (partial), g5 have some null fields — should appear as Unattributed not null/undefined
  for (const group of body.data) {
    assert.ok(group.utm_source !== null && group.utm_source !== undefined)
    assert.ok(group.utm_medium !== null && group.utm_medium !== undefined)
    assert.ok(group.utm_campaign !== null && group.utm_campaign !== undefined)
    assert.ok(group.source !== null && group.source !== undefined)
  }
})

test('[ISOLATED TEST] GET /api/analytics/sources - empty database returns empty array', async (t) => {
  const mockClient = createMockSupabaseClient([])
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const res = await fetch(`${baseUrl}/api/analytics/sources`)
  const body = await res.json()
  assert.deepStrictEqual(body.data, [])
})

// ===========================================================================
// GET /api/analytics/graduation-years
// ===========================================================================

test('[ISOLATED TEST] GET /api/analytics/graduation-years - grouped correctly, test excluded', async (t) => {
  const mockClient = createMockSupabaseClient(FIXTURES)
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const res = await fetch(`${baseUrl}/api/analytics/graduation-years`)
  assert.strictEqual(res.status, 200)

  const body = await res.json()
  assert.ok(Array.isArray(body.data))

  // Genuine: g3+g4=2025 (2), g1+g2=2026 (2, test t1 excluded), g5=2027 (1)
  const y2025 = body.data.find((r) => r.graduation_year === 2025)
  const y2026 = body.data.find((r) => r.graduation_year === 2026)
  const y2027 = body.data.find((r) => r.graduation_year === 2027)

  assert.ok(y2025, '2025 group missing')
  assert.ok(y2026, '2026 group missing')
  assert.ok(y2027, '2027 group missing')

  assert.strictEqual(y2025.registrations, 2)
  assert.strictEqual(y2026.registrations, 2) // t1 is test, not counted
  assert.strictEqual(y2027.registrations, 1)
})

test('[ISOLATED TEST] GET /api/analytics/graduation-years - ascending order', async (t) => {
  const mockClient = createMockSupabaseClient(FIXTURES)
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const res = await fetch(`${baseUrl}/api/analytics/graduation-years`)
  const body = await res.json()

  const numericYears = body.data.filter((r) => r.graduation_year !== 'Unknown')
  for (let i = 1; i < numericYears.length; i++) {
    assert.ok(numericYears[i].graduation_year >= numericYears[i - 1].graduation_year)
  }
})

test('[ISOLATED TEST] GET /api/analytics/graduation-years - empty database returns empty array', async (t) => {
  const mockClient = createMockSupabaseClient([])
  const { baseUrl, close } = await spawnTestServer(mockClient)
  t.after(close)

  const res = await fetch(`${baseUrl}/api/analytics/graduation-years`)
  const body = await res.json()
  assert.deepStrictEqual(body.data, [])
})

// ===========================================================================
// Cross-cutting: database errors on all analytics endpoints
// ===========================================================================

test('[ISOLATED TEST] All analytics endpoints return 500 on database error', async (t) => {
  const errorClient = createMockSupabaseClient([], {
    queryError: { code: 'PGRST500', message: 'relation "registrations" does not exist' }
  })
  const { baseUrl, close } = await spawnTestServer(errorClient)
  t.after(close)

  const endpoints = [
    '/api/analytics/overview',
    '/api/analytics/daily',
    '/api/analytics/colleges',
    '/api/analytics/sources',
    '/api/analytics/graduation-years'
  ]

  for (const endpoint of endpoints) {
    const res = await fetch(`${baseUrl}${endpoint}`)
    assert.strictEqual(res.status, 500, `Expected 500 from ${endpoint}`)
    const body = await res.json()
    assert.ok(body.error, `Missing error field from ${endpoint}`)
    // Must not leak internal db error detail
    assert.ok(!body.error.includes('relation'), `Leaking DB error from ${endpoint}`)
  }
})

test('[ISOLATED TEST] All analytics endpoints return 503 when DB not configured', async (t) => {
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

  const endpoints = [
    '/api/analytics/overview',
    '/api/analytics/daily',
    '/api/analytics/colleges',
    '/api/analytics/sources',
    '/api/analytics/graduation-years'
  ]

  for (const endpoint of endpoints) {
    const res = await fetch(`${baseUrl}${endpoint}`)
    assert.strictEqual(res.status, 503, `Expected 503 from ${endpoint}`)
    const body = await res.json()
    assert.strictEqual(body.error, 'Database service is not configured')
  }
})
