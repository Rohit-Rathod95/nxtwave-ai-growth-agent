import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { createApp } from './app.js'
import { validateSupabaseConfig } from './db/supabase.js'

dotenv.config()

const PORT = process.env.PORT || 5000

// Validate Supabase environment configuration on startup
const { isValid, missing } = validateSupabaseConfig()
if (!isValid) {
  console.warn(`[Backend] Supabase credentials not configured. Missing: ${missing.join(', ')}`)
  console.warn('[Backend] Endpoints requiring database access will return HTTP 503 until configured in backend/.env.')
} else {
  console.log('[Backend] Supabase configuration detected.')
}

const app = createApp()

let server = null

// Only start listening if run directly or not under test environment
const currentFilePath = fileURLToPath(import.meta.url)
const entryFilePath = process.argv[1]

if (entryFilePath && (currentFilePath === entryFilePath || process.env.NODE_ENV !== 'test')) {
  server = app.listen(PORT, () => {
    console.log(`[Backend] Server listening on port ${PORT}`)
  })
}

export { app, server }
