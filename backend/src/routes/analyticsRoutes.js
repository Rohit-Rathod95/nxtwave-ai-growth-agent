import express from 'express'
import {
  getAnalyticsOverview,
  getAnalyticsDailyBreakdown,
  getAnalyticsColleges,
  getAnalyticsSources,
  getAnalyticsGraduationYears
} from '../services/analyticsService.js'
import { formatSafeError } from '../utils/sanitizeError.js'

export const analyticsRouter = express.Router()

// ---------------------------------------------------------------------------
// Shared error-handling helper
// ---------------------------------------------------------------------------

/**
 * Wraps an async analytics handler, translating service errors to safe HTTP
 * responses using the same conventions as registrationRoutes.js.
 *
 * @param {string} endpoint - Used in log prefix for identification
 * @param {Function} handler - async (req, res) => void
 */
function analyticsHandler(endpoint, handler) {
  return async (req, res) => {
    try {
      await handler(req, res)
    } catch (err) {
      if (err.code === 'CONFIG_MISSING') {
        return res.status(503).json({ error: 'Database service is not configured' })
      }
      const safeErr = formatSafeError(err)
      console.error(`[AnalyticsRoutes] ${endpoint} error: [${safeErr.code}] ${safeErr.message}`)
      return res.status(500).json({ error: 'An unexpected error occurred while retrieving analytics' })
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/analytics/overview
// ---------------------------------------------------------------------------

/**
 * Returns high-level registration metrics against the campaign target.
 * All time windows are computed in UTC.
 */
analyticsRouter.get(
  '/overview',
  analyticsHandler('GET /api/analytics/overview', async (req, res) => {
    const client = req.app.locals.supabaseClient || null
    const result = await getAnalyticsOverview(client)
    return res.status(200).json(result)
  })
)

// ---------------------------------------------------------------------------
// GET /api/analytics/daily
// ---------------------------------------------------------------------------

/**
 * Returns genuine registrations grouped by UTC calendar date for the last 30 days.
 * Dates with zero registrations are included.
 */
analyticsRouter.get(
  '/daily',
  analyticsHandler('GET /api/analytics/daily', async (req, res) => {
    const client = req.app.locals.supabaseClient || null
    const result = await getAnalyticsDailyBreakdown(client)
    return res.status(200).json(result)
  })
)

// ---------------------------------------------------------------------------
// GET /api/analytics/colleges
// ---------------------------------------------------------------------------

/**
 * Returns colleges ranked by registration count (highest first).
 * Accepts optional ?limit query param (integer 1–100, default 20).
 */
analyticsRouter.get(
  '/colleges',
  analyticsHandler('GET /api/analytics/colleges', async (req, res) => {
    const rawLimit = req.query.limit !== undefined ? req.query.limit : 20
    const limit = Number(rawLimit)
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({
        error: 'Invalid query parameter',
        details: '"limit" must be an integer between 1 and 100'
      })
    }

    const client = req.app.locals.supabaseClient || null
    const result = await getAnalyticsColleges({ limit }, client)
    return res.status(200).json(result)
  })
)

// ---------------------------------------------------------------------------
// GET /api/analytics/sources
// ---------------------------------------------------------------------------

/**
 * Returns registrations grouped by attribution (utm_source, utm_medium,
 * utm_campaign, source). Each registration is counted exactly once.
 * Missing fields are labelled "Unattributed".
 */
analyticsRouter.get(
  '/sources',
  analyticsHandler('GET /api/analytics/sources', async (req, res) => {
    const client = req.app.locals.supabaseClient || null
    const result = await getAnalyticsSources(client)
    return res.status(200).json(result)
  })
)

// ---------------------------------------------------------------------------
// GET /api/analytics/graduation-years
// ---------------------------------------------------------------------------

/**
 * Returns genuine registrations grouped by graduation year, ascending.
 * Rows with a missing graduation_year are grouped as 'Unknown'.
 */
analyticsRouter.get(
  '/graduation-years',
  analyticsHandler('GET /api/analytics/graduation-years', async (req, res) => {
    const client = req.app.locals.supabaseClient || null
    const result = await getAnalyticsGraduationYears(client)
    return res.status(200).json(result)
  })
)
