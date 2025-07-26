import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { registerRoutes } from '../../server/routes'
import fs from 'fs/promises'
import path from 'path'

// Mock file system operations
vi.mock('fs/promises')
vi.mock('multer')

describe('Document Upload Integration', () => {
  let app: express.Application

  beforeEach(async () => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    
    // Mock authenticated user
    app.use((req, res, next) => {
      req.user = { id: 'test-user-123', email: 'test@example.com' }
      next()
    })
    
    await registerRoutes(app)
  })

  it('uploads a PDF document successfully', async () => {
    // Mock file operations
    ;(fs.writeFile as any).mockResolvedValue(undefined)
    ;(fs.access as any).mockResolvedValue(undefined)

    const response = await request(app)
      .post('/api/documents/upload')
      .attach('file', Buffer.from('fake pdf content'), 'test.pdf')
      .field('name', 'Test Document')
      .field('categoryId', '1')

    expect(response.status).toBe(201)
    expect(response.body.document.name).toBe('Test Document')
    expect(response.body.document.fileName).toBe('test.pdf')
    expect(response.body.document.mimeType).toBe('application/pdf')
  })

  it('processes OCR for uploaded images', async () => {
    // Mock OCR service
    const mockOcrResult = 'Extracted text from image'
    vi.mock('../../server/ocrService', () => ({
      processDocumentOCR: vi.fn().mockResolvedValue(mockOcrResult)
    }))

    const response = await request(app)
      .post('/api/documents/upload')
      .attach('file', Buffer.from('fake image content'), 'scan.jpg')
      .field('name', 'Scanned Document')
      .field('categoryId', '1')

    expect(response.status).toBe(201)
    expect(response.body.document.extractedText).toBe(mockOcrResult)
    expect(response.body.document.ocrProcessed).toBe(true)
  })

  it('rejects files that are too large', async () => {
    const response = await request(app)
      .post('/api/documents/upload')
      .attach('file', Buffer.alloc(12 * 1024 * 1024), 'large.pdf') // 12MB file
      .field('name', 'Large Document')

    expect(response.status).toBe(400)
    expect(response.body.message).toContain('File too large')
  })

  it('rejects unsupported file types', async () => {
    const response = await request(app)
      .post('/api/documents/upload')
      .attach('file', Buffer.from('fake content'), 'document.docx')
      .field('name', 'Word Document')

    expect(response.status).toBe(400)
    expect(response.body.message).toContain('File type not supported')
  })

  it('generates AI summary after upload', async () => {
    // Mock AI service
    const mockSummary = 'This is an AI-generated summary of the document'
    vi.mock('../../server/contentAnalysisService', () => ({
      generateDocumentSummary: vi.fn().mockResolvedValue(mockSummary)
    }))

    const response = await request(app)
      .post('/api/documents/upload')
      .attach('file', Buffer.from('fake pdf content'), 'contract.pdf')
      .field('name', 'Contract Document')
      .field('categoryId', '1')

    expect(response.status).toBe(201)
    expect(response.body.document.summary).toBe(mockSummary)
  })
})