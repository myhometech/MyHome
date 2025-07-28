import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { registerRoutes } from '../routes'

// Mock the storage interface
const mockStorage = {
  getUser: vi.fn(),
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  getDocuments: vi.fn(),
  getDocument: vi.fn(),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
  getCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),

}

// Mock external services
vi.mock('../storage', () => ({
  storage: mockStorage
}))

vi.mock('../authService', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashedPassword'),
  verifyPassword: vi.fn().mockResolvedValue(true)
}))

describe('API Routes', () => {
  let app: express.Application

  beforeEach(async () => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    // Skip the server return since we're only testing routes
    await registerRoutes(app as any)
  })

  describe('Authentication Routes', () => {
    it('POST /api/auth/register creates new user', async () => {
      mockStorage.getUserByEmail.mockResolvedValue(null)
      mockStorage.createUser.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User'
      })

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User'
        })

      expect(response.status).toBe(201)
      expect(response.body.user.email).toBe('test@example.com')
      expect(mockStorage.createUser).toHaveBeenCalled()
    })

    it('POST /api/auth/register rejects duplicate email', async () => {
      mockStorage.getUserByEmail.mockResolvedValue({
        id: 'existing-user',
        email: 'test@example.com'
      })

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User'
        })

      expect(response.status).toBe(400)
      expect(response.body.message).toContain('already exists')
    })

    it('POST /api/auth/login validates credentials', async () => {
      mockStorage.getUserByEmail.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hashedPassword'
      })

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })

      expect(response.status).toBe(200)
      expect(response.body.user.email).toBe('test@example.com')
    })
  })

  describe('Document Routes', () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' }

    beforeEach(() => {
      // Mock authentication middleware
      app.use((req, res, next) => {
        req.user = mockUser
        next()
      })
    })

    it('GET /api/documents returns user documents', async () => {
      const mockDocuments = [{
        id: 1,
        userId: 'user-123',
        name: 'Test Document',
        fileName: 'test.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024
      }]

      mockStorage.getDocuments.mockResolvedValue(mockDocuments)

      const response = await request(app)
        .get('/api/documents')

      expect(response.status).toBe(200)
      expect(response.body).toEqual(mockDocuments)
      expect(mockStorage.getDocuments).toHaveBeenCalledWith('user-123')
    })

    it('GET /api/documents/:id returns specific document', async () => {
      const mockDocument = {
        id: 1,
        userId: 'user-123',
        name: 'Test Document',
        fileName: 'test.pdf'
      }

      mockStorage.getDocument.mockResolvedValue(mockDocument)

      const response = await request(app)
        .get('/api/documents/1')

      expect(response.status).toBe(200)
      expect(response.body).toEqual(mockDocument)
      expect(mockStorage.getDocument).toHaveBeenCalledWith(1, 'user-123')
    })

    it('PATCH /api/documents/:id updates document', async () => {
      const updatedDocument = {
        id: 1,
        userId: 'user-123',
        name: 'Updated Document',
        expiryDate: '2025-12-31'
      }

      mockStorage.updateDocument.mockResolvedValue(updatedDocument)

      const response = await request(app)
        .patch('/api/documents/1')
        .send({
          name: 'Updated Document',
          expiryDate: '2025-12-31'
        })

      expect(response.status).toBe(200)
      expect(response.body).toEqual(updatedDocument)
      expect(mockStorage.updateDocument).toHaveBeenCalledWith(
        1, 
        'user-123', 
        { name: 'Updated Document', expiryDate: '2025-12-31' }
      )
    })

    it('DELETE /api/documents/:id removes document', async () => {
      mockStorage.deleteDocument.mockResolvedValue(undefined)

      const response = await request(app)
        .delete('/api/documents/1')

      expect(response.status).toBe(200)
      expect(mockStorage.deleteDocument).toHaveBeenCalledWith(1, 'user-123')
    })
  })

  describe('Category Routes', () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' }

    beforeEach(() => {
      app.use((req, res, next) => {
        req.user = mockUser
        next()
      })
    })

    it('GET /api/categories returns user categories', async () => {
      const mockCategories = [{
        id: 1,
        userId: 'user-123',
        name: 'Test Category',
        icon: 'FileText',
        color: 'blue'
      }]

      mockStorage.getCategories.mockResolvedValue(mockCategories)

      const response = await request(app)
        .get('/api/categories')

      expect(response.status).toBe(200)
      expect(response.body).toEqual(mockCategories)
    })

    it('POST /api/categories creates new category', async () => {
      const newCategory = {
        id: 2,
        userId: 'user-123',
        name: 'New Category',
        icon: 'Folder',
        color: 'green'
      }

      mockStorage.createCategory.mockResolvedValue(newCategory)

      const response = await request(app)
        .post('/api/categories')
        .send({
          name: 'New Category',
          icon: 'Folder',
          color: 'green'
        })

      expect(response.status).toBe(201)
      expect(response.body).toEqual(newCategory)
    })
  })

  describe('Stats Routes', () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' }

    beforeEach(() => {
      app.use((req, res, next) => {
        req.user = mockUser
        next()
      })
    })




  })
})