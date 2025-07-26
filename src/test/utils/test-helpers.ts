import { QueryClient } from '@tanstack/react-query'
import { ReactNode } from 'react'

/**
 * Creates a test query client with disabled retries for faster tests
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        cacheTime: 0
      },
      mutations: {
        retry: false
      }
    }
  })
}

/**
 * Mock user object for testing
 */
export const mockUser = {
  id: 'test-user-123',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'user' as const,
  subscriptionTier: 'free' as const
}

/**
 * Mock premium user object for testing
 */
export const mockPremiumUser = {
  ...mockUser,
  id: 'premium-user-123',
  email: 'premium@example.com',
  subscriptionTier: 'premium' as const
}

/**
 * Mock document object for testing
 */
export const mockDocument = {
  id: 1,
  userId: 'test-user-123',
  categoryId: 1,
  name: 'Test Document',
  fileName: 'test.pdf',
  filePath: '/uploads/test.pdf',
  fileSize: 1024,
  mimeType: 'application/pdf',
  tags: ['test'],
  extractedText: 'Test content',
  summary: 'Test summary',
  ocrProcessed: true,
  uploadedAt: '2025-01-01T00:00:00Z',
  expiryDate: null
}

/**
 * Mock category object for testing
 */
export const mockCategory = {
  id: 1,
  userId: 'test-user-123',
  name: 'Test Category',
  icon: 'FileText',
  color: 'blue'
}

/**
 * Delays execution for testing async operations
 */
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Mock file object for upload testing
 */
export const createMockFile = (name: string, type: string, size: number = 1024) => {
  const file = new File([''], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}