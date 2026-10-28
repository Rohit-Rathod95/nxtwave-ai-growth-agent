import express from 'express'
import {
  validateRegistrationPayload,
  validatePaginationParams
} from '../utils/validation.js'
import {
  createRegistration,
  getPaginatedRegistrations,
  getGenuineRegistrationCount,
  DuplicateEmailError
} from '../services/registrationService.js'
import { formatSafeError } from '../utils/sanitizeError.js'

export const registrationRouter = express.Router()

/**
 * POST /api/registrations
 * Validates and stores a new student registration record.
 */
registrationRouter.post('/', async (req, res) => {
  try {
    const { isValid, errors, sanitized } = validateRegistrationPayload(req.body)
    if (!isValid) {
      return res.status(400).json({
        error: 'Validation Error',
        details: errors
      })
    }

    const client = req.app.locals.supabaseClient || null
    const result = await createRegistration(sanitized, client)

    return res.status(201).json({
      success: true,
      data: result
    })
  } catch (err) {
    if (err instanceof DuplicateEmailError) {
      return res.status(409).json({
        error: err.message
      })
    }

    if (err.code === 'CONFIG_MISSING') {
      return res.status(503).json({
        error: 'Database service is not configured'
      })
    }

    const safeErr = formatSafeError(err)
    console.error(`[RegistrationRoutes] POST /api/registrations error: [${safeErr.code}] ${safeErr.message}`)

    // Safe error response without leaking stack traces or database connection details
    return res.status(500).json({
      error: 'An unexpected error occurred while processing the registration'
    })
  }
})

/**
 * GET /api/registrations
 * Returns paginated registration records, ordered newest first. Excludes test records.
 */
registrationRouter.get('/', async (req, res) => {
  try {
    const pagination = validatePaginationParams(req.query)
    if (!pagination.isValid) {
      return res.status(400).json({
        error: 'Invalid pagination parameters',
        details: pagination.error
      })
    }

    const client = req.app.locals.supabaseClient || null
    const result = await getPaginatedRegistrations(
      { page: pagination.page, limit: pagination.limit },
      client
    )

    return res.status(200).json(result)
  } catch (err) {
    if (err.code === 'CONFIG_MISSING') {
      return res.status(503).json({
        error: 'Database service is not configured'
      })
    }

    const safeErr = formatSafeError(err)
    console.error(`[RegistrationRoutes] GET /api/registrations error: [${safeErr.code}] ${safeErr.message}`)

    return res.status(500).json({
      error: 'An unexpected error occurred while retrieving registrations'
    })
  }
})

/**
 * GET /api/registrations/count
 * Returns total genuine registrations count (excluding test records).
 */
registrationRouter.get('/count', async (req, res) => {
  try {
    const client = req.app.locals.supabaseClient || null
    const result = await getGenuineRegistrationCount(client)

    return res.status(200).json(result)
  } catch (err) {
    if (err.code === 'CONFIG_MISSING') {
      return res.status(503).json({
        error: 'Database service is not configured'
      })
    }

    const safeErr = formatSafeError(err)
    console.error(`[RegistrationRoutes] GET /api/registrations/count error: [${safeErr.code}] ${safeErr.message}`)

    return res.status(500).json({
      error: 'An unexpected error occurred while retrieving registration count'
    })
  }
})
