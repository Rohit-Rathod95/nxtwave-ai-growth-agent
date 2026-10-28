/**
 * analyticsService.js
 *
 * Provides aggregated analytics over genuine registration records.
 *
 * TIMEZONE STRATEGY:
 *   All date/time calculations are done in UTC. The `created_at` column is stored
 *   as TIMESTAMPTZ with UTC values (see migration 001). Day boundaries are computed
 *   using UTC midnight so behaviour is consistent regardless of the server's local
 *   timezone. Clients that need local-time groupings should convert UTC dates on
 *   the frontend.
 *
 * AGGREGATION STRATEGY:
 *   The Supabase JS client does not expose SQL GROUP BY. Rather than loading every
 *   column of every row we select only the columns each endpoint needs, then
 *   aggregate in Node.js. This keeps payload sizes small while avoiding a heavy ORM
 *   or raw SQL dependency.
 */

import { getSupabaseClient } from '../db/supabase.js'
import { formatSafeError } from '../utils/sanitizeError.js'

/** Campaign registration target (constant across all analytics). */
export const REGISTRATION_TARGET = 500

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns a UTC ISO-8601 string for the start of a calendar day N days ago.
 * @param {number} daysAgo - 0 = start of today UTC, 1 = yesterday, etc.
 * @returns {string}
 */
function utcDayStart(daysAgo = 0) {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return d.toISOString()
}

/**
 * Returns YYYY-MM-DD in UTC for a given ISO timestamp string.
 * @param {string} isoString
 * @returns {string}
 */
function toUTCDateString(isoString) {
  return new Date(isoString).toISOString().slice(0, 10)
}

/**
 * Fetches genuine registrations selecting only the specified columns.
 * Throws with a typed error on DB failure or CONFIG_MISSING.
 *
 * @param {string[]} columns - e.g. ['created_at', 'college']
 * @param {object|null} injectedClient
 * @returns {Promise<object[]>}
 */
async function fetchGenuineRows(columns, injectedClient = null) {
  const supabase = injectedClient || getSupabaseClient()
  const { data, error } = await supabase
    .from('registrations')
    .select(columns.join(', '))
    .eq('record_type', 'genuine')

  if (error) {
    const safeErr = formatSafeError(error)
    console.error(`[AnalyticsService] DB error: [${safeErr.code}] ${safeErr.message}`)
    const serviceError = new Error('Failed to retrieve analytics data')
    serviceError.code = safeErr.code
    throw serviceError
  }

  return data || []
}

// ---------------------------------------------------------------------------
// Public service functions
// ---------------------------------------------------------------------------

/**
 * Returns overview metrics for the analytics dashboard.
 *
 * @param {object|null} injectedClient
 * @returns {Promise<object>}
 */
export async function getAnalyticsOverview(injectedClient = null) {
  const rows = await fetchGenuineRows(['created_at'], injectedClient)

  const total = rows.length
  const todayStart = utcDayStart(0)
  const last7Start = utcDayStart(6)   // today + 6 previous days = 7 days
  const last30Start = utcDayStart(29) // today + 29 previous days = 30 days

  let today = 0
  let last7 = 0
  let last30 = 0

  for (const row of rows) {
    const ts = row.created_at
    if (ts >= todayStart) today++
    if (ts >= last7Start) last7++
    if (ts >= last30Start) last30++
  }

  const targetProgressPercent =
    REGISTRATION_TARGET > 0
      ? parseFloat(((total / REGISTRATION_TARGET) * 100).toFixed(2))
      : 0

  const remainingToTarget = Math.max(0, REGISTRATION_TARGET - total)

  return {
    totalRegistrations: total,
    registrationsToday: today,
    registrationsLast7Days: last7,
    registrationsLast30Days: last30,
    target: REGISTRATION_TARGET,
    targetProgressPercent,
    remainingToTarget
  }
}

/**
 * Returns genuine registrations grouped by UTC calendar date for the last 30 days,
 * including dates with zero registrations.
 *
 * @param {object|null} injectedClient
 * @returns {Promise<{ data: Array<{ date: string, registrations: number }> }>}
 */
export async function getAnalyticsDailyBreakdown(injectedClient = null) {
  const rows = await fetchGenuineRows(['created_at'], injectedClient)

  // Build a map of date -> count for all genuine rows
  const countByDate = new Map()
  for (const row of rows) {
    const date = toUTCDateString(row.created_at)
    countByDate.set(date, (countByDate.get(date) ?? 0) + 1)
  }

  // Generate the last 30 calendar days (UTC), oldest first
  const days = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setUTCHours(0, 0, 0, 0)
    d.setUTCDate(d.getUTCDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    days.push({ date: dateStr, registrations: countByDate.get(dateStr) ?? 0 })
  }

  return { data: days }
}

/**
 * Returns colleges ranked by genuine registration count.
 *
 * @param {{ limit?: number }} options
 * @param {object|null} injectedClient
 * @returns {Promise<{ data: Array<{ college: string, registrations: number }> }>}
 */
export async function getAnalyticsColleges({ limit = 20 } = {}, injectedClient = null) {
  const rows = await fetchGenuineRows(['college'], injectedClient)

  const countByCollege = new Map()
  for (const row of rows) {
    const college = (row.college && row.college.trim()) || 'Unknown'
    countByCollege.set(college, (countByCollege.get(college) ?? 0) + 1)
  }

  const sorted = [...countByCollege.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([college, registrations]) => ({ college, registrations }))

  return { data: sorted }
}

/**
 * Returns registrations grouped by campaign source attribution.
 *
 * Grouping strategy: a single composite key of `utm_source | utm_medium | utm_campaign | source`
 * is built for each registration. Each registration is counted exactly once.
 * Missing (null/empty) fields are displayed as "Unattributed".
 *
 * @param {object|null} injectedClient
 * @returns {Promise<{ data: Array<{ utm_source: string, utm_medium: string, utm_campaign: string, source: string, registrations: number }> }>}
 */
export async function getAnalyticsSources(injectedClient = null) {
  const rows = await fetchGenuineRows(
    ['utm_source', 'utm_medium', 'utm_campaign', 'source'],
    injectedClient
  )

  // Map keyed by composite string to { label fields + count }
  const groups = new Map()

  for (const row of rows) {
    const utmSource = row.utm_source?.trim() || 'Unattributed'
    const utmMedium = row.utm_medium?.trim() || 'Unattributed'
    const utmCampaign = row.utm_campaign?.trim() || 'Unattributed'
    const source = row.source?.trim() || 'Unattributed'

    const key = `${utmSource}||${utmMedium}||${utmCampaign}||${source}`

    if (groups.has(key)) {
      groups.get(key).registrations++
    } else {
      groups.set(key, { utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign, source, registrations: 1 })
    }
  }

  const data = [...groups.values()].sort((a, b) => b.registrations - a.registrations)

  return { data }
}

/**
 * Returns genuine registrations grouped by graduation year.
 * Missing graduation_year values are grouped as 'Unknown'.
 *
 * @param {object|null} injectedClient
 * @returns {Promise<{ data: Array<{ graduation_year: number|string, registrations: number }> }>}
 */
export async function getAnalyticsGraduationYears(injectedClient = null) {
  const rows = await fetchGenuineRows(['graduation_year'], injectedClient)

  const countByYear = new Map()
  for (const row of rows) {
    const year = row.graduation_year ?? 'Unknown'
    countByYear.set(year, (countByYear.get(year) ?? 0) + 1)
  }

  const data = [...countByYear.entries()]
    .sort((a, b) => {
      // Sort numerically, with 'Unknown' always at the end
      if (a[0] === 'Unknown') return 1
      if (b[0] === 'Unknown') return -1
      return a[0] - b[0]
    })
    .map(([graduation_year, registrations]) => ({ graduation_year, registrations }))

  return { data }
}
