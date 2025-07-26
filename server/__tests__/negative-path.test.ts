import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// Comprehensive negative path testing for API endpoints
describe('Negative Path Testing', () => {
  let app: express.Application

  beforeEach(() => {
    app = express()
    app.use(express.json({ limit: '1mb' }))
    
    // Mock authentication middleware
    const authMiddleware = (req: any, res: any, next: any) => {
      const authHeader = req.headers.authorization
      if (!authHeader || authHeader !== 'Bearer valid-token') {
        return res.status(401).json({ error: 'Authentication required' })
      }
      req.user = { id: 'user-123', email: 'test@example.com' }
      next()
    }

    // Document endpoints with validation
    app.post('/api/documents', authMiddleware, (req, res) => {
      const { name, file } = req.body
      
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Document name is required' })
      }
      
      if (!file) {
        return res.status(400).json({ error: 'File is required' })
      }
      
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        return res.status(413).json({ error: 'File too large. Maximum size is 10MB' })
      }
      
      res.status(201).json({ id: 1, name, fileName: file.name })
    })

    app.get('/api/documents/:id', authMiddleware, (req, res) => {
      const { id } = req.params
      
      if (!/^\d+$/.test(id)) {
        return res.status(400).json({ error: 'Invalid document ID format' })
      }
      
      // Simulate document not found
      if (id === '999') {
        return res.status(404).json({ error: 'Document not found' })
      }
      
      // Simulate access denied
      if (id === '888') {
        return res.status(403).json({ error: 'Access denied to this document' })
      }
      
      res.json({ id: parseInt(id), name: 'Test Document', userId: req.user.id })
    })

    app.patch('/api/documents/:id', authMiddleware, (req, res) => {
      const { id } = req.params
      const { name, expiryDate } = req.body
      
      if (name && name.trim().length === 0) {
        return res.status(400).json({ error: 'Document name cannot be empty' })
      }
      
      if (expiryDate && !isValidDate(expiryDate)) {
        return res.status(400).json({ error: 'Invalid expiry date format' })
      }
      
      res.json({ id: parseInt(id), name, expiryDate })
    })

    app.delete('/api/documents/:id', authMiddleware, (req, res) => {
      const { id } = req.params
      
      // Simulate database error
      if (id === '777') {
        return res.status(500).json({ error: 'Database error occurred' })
      }
      
      res.status(204).send()
    })

    // Categories endpoint
    app.post('/api/categories', authMiddleware, (req, res) => {
      const { name, icon, color } = req.body
      
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Category name is required' })
      }
      
      if (name.length > 50) {
        return res.status(400).json({ error: 'Category name too long (max 50 characters)' })
      }
      
      const validIcons = ['FileText', 'Folder', 'Home', 'Car', 'Heart']
      if (!validIcons.includes(icon)) {
        return res.status(400).json({ error: 'Invalid icon selected' })
      }
      
      res.status(201).json({ id: 1, name, icon, color })
    })

    // Rate limiting simulation
    let requestCount = 0
    app.use('/api/rate-limited', (req, res, next) => {
      requestCount++
      if (requestCount > 5) {
        return res.status(429).json({ 
          error: 'Rate limit exceeded',
          retryAfter: 60
        })
      }
      next()
    })

    app.get('/api/rate-limited/endpoint', (req, res) => {
      res.json({ message: 'Success' })
    })
  })

  // Helper function
  function isValidDate(dateString: string): boolean {
    const date = new Date(dateString)
    return date instanceof Date && !isNaN(date.getTime())
  }

  describe('Authentication Failures', () => {
    it('rejects requests without authentication', async () => {
      const response = await request(app)
        .get('/api/documents/1')

      expect(response.status).toBe(401)
      expect(response.body.error).toBe('Authentication required')
    })

    it('rejects requests with invalid tokens', async () => {
      const response = await request(app)
        .get('/api/documents/1')
        .set('Authorization', 'Bearer invalid-token')

      expect(response.status).toBe(401)
      expect(response.body.error).toBe('Authentication required')
    })
  })

  describe('Document Validation Failures', () => {
    const validAuth = { Authorization: 'Bearer valid-token' }

    it('rejects document creation without name', async () => {
      const response = await request(app)
        .post('/api/documents')
        .set(validAuth)
        .send({ file: { name: 'test.pdf', size: 1024 } })

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Document name is required')
    })

    it('rejects document creation with empty name', async () => {
      const response = await request(app)
        .post('/api/documents')
        .set(validAuth)
        .send({ name: '   ', file: { name: 'test.pdf', size: 1024 } })

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Document name is required')
    })

    it('rejects document creation without file', async () => {
      const response = await request(app)
        .post('/api/documents')
        .set(validAuth)
        .send({ name: 'Test Document' })

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('File is required')
    })

    it('rejects files that are too large', async () => {
      const response = await request(app)
        .post('/api/documents')
        .set(validAuth)
        .send({ 
          name: 'Large Document',
          file: { name: 'large.pdf', size: 15 * 1024 * 1024 } // 15MB
        })

      expect(response.status).toBe(413)
      expect(response.body.error).toContain('File too large')
    })

    it('rejects invalid document ID format', async () => {
      const response = await request(app)
        .get('/api/documents/invalid-id')
        .set(validAuth)

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Invalid document ID format')
    })

    it('handles document not found', async () => {
      const response = await request(app)
        .get('/api/documents/999')
        .set(validAuth)

      expect(response.status).toBe(404)
      expect(response.body.error).toBe('Document not found')
    })

    it('handles access denied to document', async () => {
      const response = await request(app)
        .get('/api/documents/888')
        .set(validAuth)

      expect(response.status).toBe(403)
      expect(response.body.error).toBe('Access denied to this document')
    })

    it('rejects empty name in document update', async () => {
      const response = await request(app)
        .patch('/api/documents/1')
        .set(validAuth)
        .send({ name: '   ' })

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Document name cannot be empty')
    })

    it('rejects invalid expiry date format', async () => {
      const response = await request(app)
        .patch('/api/documents/1')
        .set(validAuth)
        .send({ expiryDate: 'invalid-date' })

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Invalid expiry date format')
    })
  })

  describe('Category Validation Failures', () => {
    const validAuth = { Authorization: 'Bearer valid-token' }

    it('rejects category creation without name', async () => {
      const response = await request(app)
        .post('/api/categories')
        .set(validAuth)
        .send({ icon: 'Folder', color: 'blue' })

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Category name is required')
    })

    it('rejects category name that is too long', async () => {
      const longName = 'A'.repeat(51) // 51 characters
      const response = await request(app)
        .post('/api/categories')
        .set(validAuth)
        .send({ name: longName, icon: 'Folder', color: 'blue' })

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('Category name too long')
    })

    it('rejects invalid icon selection', async () => {
      const response = await request(app)
        .post('/api/categories')
        .set(validAuth)
        .send({ name: 'Test Category', icon: 'InvalidIcon', color: 'blue' })

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Invalid icon selected')
    })
  })

  describe('System Error Handling', () => {
    const validAuth = { Authorization: 'Bearer valid-token' }

    it('handles database errors gracefully', async () => {
      const response = await request(app)
        .delete('/api/documents/777')
        .set(validAuth)

      expect(response.status).toBe(500)
      expect(response.body.error).toBe('Database error occurred')
    })

    it('handles request payload too large', async () => {
      const largePayload = { data: 'x'.repeat(2 * 1024 * 1024) } // 2MB
      const response = await request(app)
        .post('/api/documents')
        .set(validAuth)
        .send(largePayload)

      expect(response.status).toBe(413)
    })
  })

  describe('Rate Limiting', () => {
    it('enforces rate limits and provides retry information', async () => {
      // Make 6 requests to exceed the limit of 5
      for (let i = 0; i < 6; i++) {
        const response = await request(app).get('/api/rate-limited/endpoint')
        
        if (i < 5) {
          expect(response.status).toBe(200)
        } else {
          expect(response.status).toBe(429)
          expect(response.body.error).toBe('Rate limit exceeded')
          expect(response.body.retryAfter).toBe(60)
        }
      }
    })
  })

  describe('Malformed Request Handling', () => {
    const validAuth = { Authorization: 'Bearer valid-token' }

    it('handles malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/documents')
        .set(validAuth)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')

      expect(response.status).toBe(400)
    })

    it('handles missing content-type header', async () => {
      const response = await request(app)
        .post('/api/documents')
        .set(validAuth)
        .send('some plain text')

      expect(response.status).toBe(400)
    })
  })
})