import express from 'express'
import cors from 'cors'
import { registrationRouter } from './routes/registrationRoutes.js'
import { analyticsRouter } from './routes/analyticsRoutes.js'

/**
 * Creates and configures the Express application instance.
 *
 * @param {object} [options]
 * @param {object|null} [options.supabaseClient] Injected Supabase client (e.g., for testing)
 * @returns {express.Express}
 */
export function createApp(options = {}) {
  const app = express()

  if (options.supabaseClient) {
    app.locals.supabaseClient = options.supabaseClient
  }

  app.use(cors())
  app.use(express.json())

  // Health check endpoint (preserved from Phase 1)
  // Does not falsely report database status unless specifically verified
  app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok' })
  })

  // Registrations API endpoints
  app.use('/api/registrations', registrationRouter)

  // Analytics API endpoints
  app.use('/api/analytics', analyticsRouter)

  // 404 catch-all
  app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' })
  })

  // Safe error handling middleware
  app.use((err, req, res, next) => {
    // Avoid leaking stack traces or internal configuration
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
