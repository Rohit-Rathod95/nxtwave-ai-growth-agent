/**
 * Utility for sanitizing error messages and log outputs.
 * Ensures database passwords, API keys, JWT tokens, and user PII
 * (e.g. email addresses) are never written to server logs.
 */

const SENSITIVE_PATTERNS = [
  // Redact connection strings with passwords: postgresql://user:pass@host:port/db
  { pattern: /(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/gi, replacement: '$1[REDACTED_PASSWORD]$2' },
  // Redact Supabase secret / service role / anon keys: sb_secret_..., sbp_..., sb_...
  { pattern: /sb(?:_secret|p)?_[a-zA-Z0-9_\-]+/gi, replacement: '[REDACTED_SECRET]' },
  // Redact JWT-like strings
  { pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, replacement: '[REDACTED_JWT]' },
  // Redact Bearer / API keys / secrets
  { pattern: /(?:bearer|api[-_]?key|secret[-_]?key|authorization|token)[\s:=]+[a-zA-Z0-9_\-\.]+/gi, replacement: '[REDACTED_SECRET]' },
  // Redact email addresses to prevent PII leakage
  { pattern: /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/gi, replacement: '[REDACTED_EMAIL]' }
]

/**
 * Sanitizes an error message string or object to remove sensitive data.
 *
 * @param {string|unknown} input
 * @returns {string}
 */
export function sanitizeLogMessage(input) {
  if (typeof input !== 'string') {
    if (!input) return ''
    try {
      input = JSON.stringify(input)
    } catch {
      return String(input)
    }
  }

  let sanitized = input
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement)
  }
  return sanitized
}

/**
 * Formats an error safely for server logging.
 *
 * @param {Error|object|unknown} err
 * @returns {{ code: string, message: string }}
 */
export function formatSafeError(err) {
  if (!err) {
    return { code: 'UNKNOWN_ERROR', message: 'Unknown error occurred' }
  }

  const code = err.code || err.status || 'UNKNOWN_ERROR'
  const rawMessage = err.message || (typeof err === 'string' ? err : 'Internal error')
  const message = sanitizeLogMessage(rawMessage)

  return { code: String(code), message }
}
