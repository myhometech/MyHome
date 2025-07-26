import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// Simple API tests without complex dependencies
describe('Basic API Functionality', () => {
  let app: express.Application

  beforeEach(() => {
    app = express()
    app.use(express.json())
    
    // Basic health check endpoint
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() })
    })

    // Basic echo endpoint for testing
    app.post('/api/echo', (req, res) => {
      res.json({ message: req.body.message || 'No message provided' })
    })

    // Basic error handling
    app.get('/api/error', (req, res) => {
      res.status(500).json({ error: 'Test error' })
    })
  })

  it('responds to health check', async () => {
    const response = await request(app)
      .get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('ok')
    expect(response.body.timestamp).toBeDefined()
  })

  it('echoes posted messages', async () => {
    const testMessage = 'Hello, testing!'
    
    const response = await request(app)
      .post('/api/echo')
      .send({ message: testMessage })

    expect(response.status).toBe(200)
    expect(response.body.message).toBe(testMessage)
  })

  it('handles missing message in echo', async () => {
    const response = await request(app)
      .post('/api/echo')
      .send({})

    expect(response.status).toBe(200)
    expect(response.body.message).toBe('No message provided')
  })

  it('handles error endpoints properly', async () => {
    const response = await request(app)
      .get('/api/error')

    expect(response.status).toBe(500)
    expect(response.body.error).toBe('Test error')
  })

  it('handles JSON parsing', async () => {
    const testData = { name: 'Test User', email: 'test@example.com' }
    
    const response = await request(app)
      .post('/api/echo')
      .send(testData)

    expect(response.status).toBe(200)
    expect(response.body.message).toBe('No message provided') // Default response when no message field
  })

  it('validates request headers', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Accept', 'application/json')

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toMatch(/json/)
  })
})