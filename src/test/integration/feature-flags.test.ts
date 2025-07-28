import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { registerRoutes } from '../../../server/routes'

describe('Feature Flag Integration', () => {
  let app: express.Application

  beforeEach(async () => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    
    // Mock authenticated user
    app.use((req, res, next) => {
      req.user = { 
        id: 'test-user-123', 
        email: 'test@example.com',
        subscriptionTier: 'free'
      }
      next()
    })
    
    await registerRoutes(app)
  })

  it('returns enabled features for free tier user', async () => {
    const response = await request(app)
      .get('/api/feature-flags/batch-evaluation')

    expect(response.status).toBe(200)
    expect(response.body.enabledFeatures).toContain('DOCUMENT_UPLOAD')
    expect(response.body.enabledFeatures).toContain('BASIC_OCR')
    expect(response.body.enabledFeatures).not.toContain('AI_SUMMARIES')
    expect(response.body.enabledFeatures).not.toContain('EMAIL_FORWARDING')
  })

  it('returns premium features for premium tier user', async () => {
    // Mock premium user
    app.use((req, res, next) => {
      req.user = { 
        id: 'premium-user-123', 
        email: 'premium@example.com',
        subscriptionTier: 'premium'
      }
      next()
    })

    const response = await request(app)
      .get('/api/feature-flags/batch-evaluation')

    expect(response.status).toBe(200)
    expect(response.body.enabledFeatures).toContain('DOCUMENT_UPLOAD')
    expect(response.body.enabledFeatures).toContain('AI_SUMMARIES')
    expect(response.body.enabledFeatures).toContain('EMAIL_FORWARDING')
    expect(response.body.enabledFeatures).toContain('UNLIMITED_STORAGE')
  })

  it('evaluates specific feature flag', async () => {
    const response = await request(app)
      .get('/api/feature-flags/AI_SUMMARIES/evaluate')

    expect(response.status).toBe(200)
    expect(response.body.enabled).toBe(false) // Free tier user
    expect(response.body.reason).toContain('tier')
  })

  it('handles feature flag overrides for specific users', async () => {
    // Mock user with override
    const response = await request(app)
      .post('/api/feature-flags/AI_SUMMARIES/override')
      .send({
        userId: 'test-user-123',
        enabled: true,
        reason: 'Beta testing access'
      })

    expect(response.status).toBe(200)

    // Verify override takes effect
    const evaluationResponse = await request(app)
      .get('/api/feature-flags/AI_SUMMARIES/evaluate')

    expect(evaluationResponse.body.enabled).toBe(true)
    expect(evaluationResponse.body.reason).toContain('override')
  })

  it('blocks premium features for free tier users', async () => {
    // Try to access premium feature
    const response = await request(app)
      .post('/api/documents/ai-analysis')
      .send({
        documentId: 1,
        analysisType: 'advanced'
      })

    expect(response.status).toBe(403)
    expect(response.body.message).toContain('premium')
  })

  it('allows premium features for premium tier users', async () => {
    // Mock premium user
    app.use((req, res, next) => {
      req.user = { 
        id: 'premium-user-123', 
        email: 'premium@example.com',
        subscriptionTier: 'premium'
      }
      next()
    })

    const response = await request(app)
      .post('/api/documents/ai-analysis')
      .send({
        documentId: 1,
        analysisType: 'advanced'
      })

    expect(response.status).toBe(200)
    expect(response.body.analysis).toBeDefined()
  })
})