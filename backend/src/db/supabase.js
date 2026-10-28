import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

let cachedClient = null

/**
 * Normalizes a Supabase URL.
 * If a PostgreSQL connection string is inadvertently provided (e.g. postgresql://...@db.<ref>.supabase.co:5432/postgres),
 * this helper extracts the project ref and constructs the canonical HTTPS REST endpoint.
 *
 * @param {string} rawUrl
 * @returns {string}
 */
export function normalizeSupabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return ''
  const trimmed = rawUrl.trim()

  if (trimmed.startsWith('postgresql://') || trimmed.startsWith('postgres://')) {
    const supabaseMatch = trimmed.match(/@db\.([a-z0-9_-]+)\.supabase\.co/i)
    if (supabaseMatch) {
      return `https://${supabaseMatch[1]}.supabase.co`
    }
  }

  return trimmed
}

/**
 * Validates whether required Supabase configuration is present and valid.
 * Checks SUPABASE_URL (must be a valid http/https URL) and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY).
 *
 * @returns {{ isValid: boolean, missing: string[] }}
 */
export function validateSupabaseConfig() {
  const rawUrl = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const missing = []

  if (!rawUrl || !rawUrl.trim()) {
    missing.push('SUPABASE_URL')
  }

  if (!key || !key.trim()) {
    missing.push('SUPABASE_SECRET_KEY')
  }

  if (missing.length > 0) {
    return {
      isValid: false,
      missing
    }
  }

  const normalizedUrl = normalizeSupabaseUrl(rawUrl)
  try {
    const parsed = new URL(normalizedUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        isValid: false,
        missing: ['SUPABASE_URL (must be a valid HTTP or HTTPS URL, e.g. https://<project-ref>.supabase.co)']
      }
    }
  } catch {
    return {
      isValid: false,
      missing: ['SUPABASE_URL (malformed URL)']
    }
  }

  return {
    isValid: true,
    missing: []
  }
}

/**
 * Returns an initialized Supabase client configured with server-side credentials.
 * Throws an Error if credentials are not configured or invalid, and no override is provided.
 *
 * @param {object|null} overrideClient Optional injected client (used in testing)
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function getSupabaseClient(overrideClient = null) {
  if (overrideClient) {
    return overrideClient
  }

  if (cachedClient) {
    return cachedClient
  }

  const { isValid, missing } = validateSupabaseConfig()
  if (!isValid) {
    const error = new Error(`Database configuration incomplete or invalid. Missing/invalid: ${missing.join(', ')}`)
    error.code = 'CONFIG_MISSING'
    throw error
  }

  const normalizedUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL)
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY).trim()

  try {
    cachedClient = createClient(normalizedUrl, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  } catch (err) {
    const error = new Error(`Failed to initialize Supabase client: ${err.message}`)
    error.code = 'CONFIG_MISSING'
    throw error
  }

  return cachedClient
}

/**
 * Helper to override the cached client for unit testing.
 * @param {object|null} client
 */
export function setCachedSupabaseClient(client) {
  cachedClient = client
}

/**
 * Resets the cached Supabase client.
 */
export function resetCachedSupabaseClient() {
  cachedClient = null
}
