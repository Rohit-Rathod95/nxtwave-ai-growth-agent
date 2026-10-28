/**
 * Standard email format regex adhering to standard RFC 5322 specifications.
 */
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

/**
 * Normalizes email: trims surrounding whitespace and converts to lowercase.
 *
 * @param {string} email
 * @returns {string}
 */
export function normalizeEmail(email) {
  if (typeof email !== 'string') return ''
  return email.trim().toLowerCase()
}

/**
 * Validates registration creation payload.
 *
 * @param {object} body
 * @returns {{ isValid: boolean, errors: string[], sanitized: object|null }}
 */
export function validateRegistrationPayload(body) {
  const errors = []

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      errors: ['Request payload must be a JSON object'],
      sanitized: null
    }
  }

  // 1. Name validation
  const rawName = body.name
  if (rawName === undefined || rawName === null || typeof rawName !== 'string') {
    errors.push('name is required and must be a string')
  } else {
    const trimmedName = rawName.trim()
    if (trimmedName.length < 1 || trimmedName.length > 120) {
      errors.push('name must be between 1 and 120 characters')
    }
  }

  // 2. Email validation
  const rawEmail = body.email
  let normalizedEmail = ''
  if (rawEmail === undefined || rawEmail === null || typeof rawEmail !== 'string') {
    errors.push('email is required and must be a string')
  } else {
    normalizedEmail = normalizeEmail(rawEmail)
    if (normalizedEmail.length < 5 || normalizedEmail.length > 255) {
      errors.push('email must be between 5 and 255 characters')
    } else if (!EMAIL_REGEX.test(normalizedEmail)) {
      errors.push('email format is invalid')
    }
  }

  // 3. College validation
  const rawCollege = body.college
  if (rawCollege === undefined || rawCollege === null || typeof rawCollege !== 'string') {
    errors.push('college is required and must be a string')
  } else {
    const trimmedCollege = rawCollege.trim()
    if (trimmedCollege.length < 2 || trimmedCollege.length > 200) {
      errors.push('college must be between 2 and 200 characters')
    }
  }

  // 4. Graduation year validation
  const rawGraduationYear = body.graduationYear
  let parsedGraduationYear = null
  if (rawGraduationYear === undefined || rawGraduationYear === null) {
    errors.push('graduationYear is required')
  } else {
    const num = Number(rawGraduationYear)
    if (!Number.isInteger(num)) {
      errors.push('graduationYear must be an integer')
    } else if (num < 2020 || num > 2035) {
      errors.push('graduationYear must be between 2020 and 2035')
    } else {
      parsedGraduationYear = num
    }
  }

  // Optional fields sanitation (max 100 chars, trimmed or null)
  const sanitizeOptional = (val, max = 100) => {
    if (val === undefined || val === null) return null
    if (typeof val !== 'string') return null
    const trimmed = val.trim()
    return trimmed.length > 0 ? trimmed.slice(0, max) : null
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      sanitized: null
    }
  }

  return {
    isValid: true,
    errors: [],
    sanitized: {
      name: body.name.trim(),
      email: normalizedEmail,
      college: body.college.trim(),
      graduation_year: parsedGraduationYear,
      source: sanitizeOptional(body.source),
      utm_source: sanitizeOptional(body.utmSource),
      utm_medium: sanitizeOptional(body.utmMedium),
      utm_campaign: sanitizeOptional(body.utmCampaign),
      // Always enforced server-side; client input cannot tamper with record_type
      record_type: 'genuine'
    }
  }
}

/**
 * Validates pagination query parameters.
 *
 * @param {object} query
 * @returns {{ isValid: boolean, error?: string, page: number, limit: number }}
 */
export function validatePaginationParams(query) {
  const pageRaw = query.page !== undefined ? query.page : 1
  const limitRaw = query.limit !== undefined ? query.limit : 20

  const page = Number(pageRaw)
  const limit = Number(limitRaw)

  if (!Number.isInteger(page) || page < 1) {
    return {
      isValid: false,
      error: 'Query parameter "page" must be a positive integer greater than or equal to 1',
      page: 1,
      limit: 20
    }
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return {
      isValid: false,
      error: 'Query parameter "limit" must be an integer between 1 and 100',
      page,
      limit: 20
    }
  }

  return {
    isValid: true,
    page,
    limit
  }
}
