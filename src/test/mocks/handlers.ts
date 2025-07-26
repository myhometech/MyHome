import { http, HttpResponse } from 'msw'

export const handlers = [
  // Auth endpoints
  http.get('/api/auth/user', () => {
    return HttpResponse.json({
      id: 'test-user-123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'user',
      subscriptionTier: 'free'
    })
  }),

  http.post('/api/auth/login', () => {
    return HttpResponse.json({ success: true })
  }),

  http.post('/api/auth/logout', () => {
    return HttpResponse.json({ success: true })
  }),

  // Documents endpoints
  http.get('/api/documents', () => {
    return HttpResponse.json([
      {
        id: 1,
        userId: 'test-user-123',
        name: 'Test Document',
        fileName: 'test.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        uploadedAt: '2025-01-01T00:00:00Z',
        categoryId: 1,
        tags: ['test'],
        extractedText: 'Test content',
        summary: 'Test summary',
        ocrProcessed: true,
        expiryDate: null
      }
    ])
  }),

  http.get('/api/documents/stats', () => {
    return HttpResponse.json({
      totalDocuments: 5,
      totalSize: 5120,
      categoryCounts: [{ categoryId: 1, count: 5 }]
    })
  }),

  http.get('/api/documents/expiry-alerts', () => {
    return HttpResponse.json({
      expired: [],
      expiringSoon: []
    })
  }),

  // Categories endpoints
  http.get('/api/categories', () => {
    return HttpResponse.json([
      {
        id: 1,
        userId: 'test-user-123',
        name: 'Test Category',
        icon: 'FileText',
        color: 'blue'
      }
    ])
  }),

  // Feature flags endpoints
  http.get('/api/feature-flags/batch-evaluation', () => {
    return HttpResponse.json({
      enabledFeatures: ['DOCUMENT_UPLOAD', 'BASIC_OCR', 'DOCUMENT_SEARCH']
    })
  }),

  // Stripe endpoints
  http.get('/api/stripe/subscription-status', () => {
    return HttpResponse.json({
      tier: 'free',
      status: 'active'
    })
  }),

  // OpenAI mock (for OCR and AI features)
  http.post('https://api.openai.com/v1/chat/completions', () => {
    return HttpResponse.json({
      choices: [{
        message: {
          content: 'Mocked AI response for testing'
        }
      }]
    })
  })
]