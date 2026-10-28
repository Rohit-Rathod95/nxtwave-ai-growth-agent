import test from 'node:test'
import assert from 'node:assert'
import { createApp } from '../src/app.js'

test('GET /api/health returns status ok', async (t) => {
  const app = createApp()
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })

  t.after(() => {
    server.close()
  })

  const { port } = server.address()
  const response = await fetch(`http://localhost:${port}/api/health`)

  assert.strictEqual(response.status, 200)
  const data = await response.json()
  assert.deepStrictEqual(data, { status: 'ok' })
})
