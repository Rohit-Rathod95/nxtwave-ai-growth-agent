
import { getSupabaseClient } from '../db/supabase.js'
import { formatSafeError } from '../utils/sanitizeError.js'


/**
 * Custom error thrown when an email already exists in the database.
 */
export class DuplicateEmailError extends Error {
  constructor(message = 'A registration with this email already exists') {
    super(message)
    this.name = 'DuplicateEmailError'
    this.code = 'DUPLICATE_EMAIL'
  }
}

/**
 * Inserts a new validated registration record into Supabase.
 *
 * @param {object} registrationData Pre-sanitized registration payload
 * @param {object|null} injectedClient Optional client for dependency injection
 * @returns {Promise<object>} The newly created registration record
 */
export async function createRegistration(registrationData, injectedClient = null) {
  const supabase = injectedClient || getSupabaseClient()

  const { data, error } = await supabase
    .from('registrations')
    .insert([registrationData])
    .select('id, name, email, college, graduation_year, created_at, source, utm_source, utm_medium, utm_campaign, record_type')
    .single()

  if (error) {
    // 23505 is PostgreSQL unique_violation code
    if (error.code === '23505' || (error.message && error.message.toLowerCase().includes('unique'))) {
      throw new DuplicateEmailError()
    }
    const safeErr = formatSafeError(error)
    console.error(`[RegistrationService] Failed to insert registration: [${safeErr.code}] ${safeErr.message}`)
    const serviceError = new Error('Failed to create registration record')
    serviceError.code = safeErr.code
    throw serviceError
  }

  return data
}

/**
 * Retrieves paginated registration records, ordered newest first.
 *
 * @param {{ page: number, limit: number, includeTest?: boolean }} options
 * @param {object|null} injectedClient Optional client for dependency injection
 * @returns {Promise<{ records: object[], pagination: { page: number, limit: number, total: number, totalPages: number } }>}
 */
export async function getPaginatedRegistrations({ page = 1, limit = 20, includeTest = false } = {}, injectedClient = null) {
  const supabase = injectedClient || getSupabaseClient()

  const fromIndex = (page - 1) * limit
  const toIndex = fromIndex + limit - 1

  let query = supabase
    .from('registrations')
    .select(
      'id, name, email, college, graduation_year, created_at, source, utm_source, utm_medium, utm_campaign, record_type',
      { count: 'exact' }
    )

  if (!includeTest) {
    query = query.eq('record_type', 'genuine')
  }

  query = query.order('created_at', { ascending: false }).range(fromIndex, toIndex)

  const { data, error, count } = await query

  if (error) {
    const safeErr = formatSafeError(error)
    console.error(`[RegistrationService] Failed to query registrations: [${safeErr.code}] ${safeErr.message}`)
    const serviceError = new Error('Failed to retrieve registrations')
    serviceError.code = safeErr.code
    throw serviceError
  }

  const total = typeof count === 'number' ? count : (data ? data.length : 0)
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit)

  return {
    records: data || [],
    pagination: {
      page,
      limit,
      total,
      totalPages
    }
  }
}

/**
 * Retrieves the total count of genuine registrations, excluding test records.
 *
 * @param {object|null} injectedClient Optional client for dependency injection
 * @returns {Promise<{ count: number }>}
 */
export async function getGenuineRegistrationCount(injectedClient = null) {
  const supabase = injectedClient || getSupabaseClient()

  const { count, error } = await supabase
    .from('registrations')
    .select('*', { count: 'exact', head: true })
    .eq('record_type', 'genuine')

  if (error) {
    const safeErr = formatSafeError(error)
    console.error(`[RegistrationService] Failed to count genuine registrations: [${safeErr.code}] ${safeErr.message}`)
    const serviceError = new Error('Failed to retrieve registration count')
    serviceError.code = safeErr.code
    throw serviceError
  }

  return {
    count: typeof count === 'number' ? count : 0
  }
}
