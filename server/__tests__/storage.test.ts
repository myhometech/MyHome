import { describe, it, expect, beforeEach, vi } from 'vitest'
import { storage } from '../storage'
import { db } from '../db'

// Mock the database
vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  }
}))

describe('Storage Layer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('User Operations', () => {
    it('creates a new user', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        passwordHash: 'hashedPassword'
      }

      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([mockUser])
      }
      
      ;(db.insert as any).mockReturnValue(mockInsert)

      const result = await storage.createUser({
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        passwordHash: 'hashedPassword'
      })

      expect(result).toEqual(mockUser)
      expect(mockInsert.values).toHaveBeenCalled()
      expect(mockInsert.returning).toHaveBeenCalled()
    })

    it('gets user by email', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com'
      }

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockUser])
      }

      ;(db.select as any).mockReturnValue(mockSelect)

      const result = await storage.getUserByEmail('test@example.com')

      expect(result).toEqual(mockUser)
      expect(mockSelect.from).toHaveBeenCalled()
      expect(mockSelect.where).toHaveBeenCalled()
    })

    it('gets user by ID', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com'
      }

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockUser])
      }

      ;(db.select as any).mockReturnValue(mockSelect)

      const result = await storage.getUser('user-123')

      expect(result).toEqual(mockUser)
    })
  })

  describe('Document Operations', () => {
    it('gets user documents', async () => {
      const mockDocuments = [{
        id: 1,
        userId: 'user-123',
        name: 'Test Document',
        fileName: 'test.pdf'
      }]

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(mockDocuments)
      }

      ;(db.select as any).mockReturnValue(mockSelect)

      const result = await storage.getDocuments('user-123')

      expect(result).toEqual(mockDocuments)
      expect(mockSelect.from).toHaveBeenCalled()
      expect(mockSelect.where).toHaveBeenCalled()
    })

    it('creates a new document', async () => {
      const mockDocument = {
        id: 1,
        userId: 'user-123',
        name: 'Test Document',
        fileName: 'test.pdf',
        filePath: '/uploads/test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf'
      }

      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([mockDocument])
      }

      ;(db.insert as any).mockReturnValue(mockInsert)

      const result = await storage.createDocument({
        userId: 'user-123',
        name: 'Test Document',
        fileName: 'test.pdf',
        filePath: '/uploads/test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf'
      })

      expect(result).toEqual(mockDocument)
    })

    it('updates document properties', async () => {
      const updatedDocument = {
        id: 1,
        userId: 'user-123',
        name: 'Updated Document',
        expiryDate: '2025-12-31'
      }

      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([updatedDocument])
      }

      ;(db.update as any).mockReturnValue(mockUpdate)

      const result = await storage.updateDocument(1, 'user-123', {
        name: 'Updated Document',
        expiryDate: '2025-12-31'
      })

      expect(result).toEqual(updatedDocument)
      expect(mockUpdate.set).toHaveBeenCalled()
      expect(mockUpdate.where).toHaveBeenCalled()
    })

    it('deletes a document', async () => {
      const mockDelete = {
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 1 }])
      }

      ;(db.delete as any).mockReturnValue(mockDelete)

      await storage.deleteDocument(1, 'user-123')

      expect(mockDelete.where).toHaveBeenCalled()
    })
  })

  describe('Category Operations', () => {
    it('gets user categories', async () => {
      const mockCategories = [{
        id: 1,
        userId: 'user-123',
        name: 'Test Category',
        icon: 'FileText',
        color: 'blue'
      }]

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(mockCategories)
      }

      ;(db.select as any).mockReturnValue(mockSelect)

      const result = await storage.getCategories('user-123')

      expect(result).toEqual(mockCategories)
    })

    it('creates a new category', async () => {
      const mockCategory = {
        id: 1,
        userId: 'user-123',
        name: 'New Category',
        icon: 'Folder',
        color: 'green'
      }

      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([mockCategory])
      }

      ;(db.insert as any).mockReturnValue(mockInsert)

      const result = await storage.createCategory({
        userId: 'user-123',
        name: 'New Category',
        icon: 'Folder',
        color: 'green'
      })

      expect(result).toEqual(mockCategory)
    })
  })


})