import { vi } from 'vitest'

/**
 * Test Data Isolation and Cleanup Utilities
 * 
 * Ensures each test runs with clean, isolated data
 * and properly cleans up after execution.
 */

export interface TestDatabase {
  users: any[]
  documents: any[]
  categories: any[]
  sessions: any[]
}

export class TestDataManager {
  private static instance: TestDataManager
  private testData: TestDatabase = {
    users: [],
    documents: [],
    categories: [],
    sessions: []
  }

  static getInstance(): TestDataManager {
    if (!TestDataManager.instance) {
      TestDataManager.instance = new TestDataManager()
    }
    return TestDataManager.instance
  }

  /**
   * Create isolated test data for a specific test
   */
  createTestData(testName: string): TestDatabase {
    const testPrefix = `test_${testName}_${Date.now()}`
    
    return {
      users: [
        {
          id: `${testPrefix}_user1`,
          email: `user1_${testPrefix}@test.com`,
          firstName: 'Test',
          lastName: 'User',
          subscriptionTier: 'free'
        },
        {
          id: `${testPrefix}_user2`,
          email: `user2_${testPrefix}@test.com`,
          firstName: 'Premium',
          lastName: 'User',
          subscriptionTier: 'premium'
        }
      ],
      documents: [
        {
          id: 1,
          userId: `${testPrefix}_user1`,
          name: 'Test Document 1',
          fileName: 'test1.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
          categoryId: 1,
          tags: ['test', 'sample'],
          uploadedAt: new Date().toISOString()
        },
        {
          id: 2,
          userId: `${testPrefix}_user1`,
          name: 'Test Document 2',
          fileName: 'test2.jpg',
          fileSize: 2048,
          mimeType: 'image/jpeg',
          categoryId: 2,
          tags: ['image', 'test'],
          uploadedAt: new Date().toISOString()
        }
      ],
      categories: [
        {
          id: 1,
          userId: `${testPrefix}_user1`,
          name: 'Test Category',
          icon: 'FileText',
          color: 'blue'
        },
        {
          id: 2,
          userId: `${testPrefix}_user1`,
          name: 'Images',
          icon: 'Image',
          color: 'green'
        }
      ],
      sessions: [
        {
          id: `${testPrefix}_session1`,
          userId: `${testPrefix}_user1`,
          expiresAt: new Date(Date.now() + 86400000) // 24 hours
        }
      ]
    }
  }

  /**
   * Clean up test data after test completion
   */
  async cleanupTestData(testData: TestDatabase): Promise<void> {
    // Simulate database cleanup
    const cleanupPromises = [
      this.cleanupUsers(testData.users),
      this.cleanupDocuments(testData.documents),
      this.cleanupCategories(testData.categories),
      this.cleanupSessions(testData.sessions)
    ]

    await Promise.all(cleanupPromises)
  }

  private async cleanupUsers(users: any[]): Promise<void> {
    // Mock user cleanup
    return new Promise(resolve => {
      setTimeout(() => {
        users.length = 0 // Clear array
        resolve()
      }, 10)
    })
  }

  private async cleanupDocuments(documents: any[]): Promise<void> {
    // Mock document cleanup (including file system cleanup)
    return new Promise(resolve => {
      setTimeout(() => {
        documents.forEach(doc => {
          // Simulate file deletion
          console.log(`Cleanup: Deleted file ${doc.fileName}`)
        })
        documents.length = 0
        resolve()
      }, 20)
    })
  }

  private async cleanupCategories(categories: any[]): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        categories.length = 0
        resolve()
      }, 5)
    })
  }

  private async cleanupSessions(sessions: any[]): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        sessions.length = 0
        resolve()
      }, 5)
    })
  }

  /**
   * Reset all test data (for use between test suites)
   */
  resetAllData(): void {
    this.testData = {
      users: [],
      documents: [],
      categories: [],
      sessions: []
    }
  }
}

/**
 * File system cleanup utilities
 */
export class TestFileManager {
  private static testFiles: string[] = []

  static addTestFile(filePath: string): void {
    TestFileManager.testFiles.push(filePath)
  }

  static async cleanupTestFiles(): Promise<void> {
    // Simulate file system cleanup
    const cleanupPromises = TestFileManager.testFiles.map(filePath => {
      return new Promise<void>(resolve => {
        setTimeout(() => {
          console.log(`Cleanup: Deleted test file ${filePath}`)
          resolve()
        }, 10)
      })
    })

    await Promise.all(cleanupPromises)
    TestFileManager.testFiles.length = 0
  }

  static getTestFilePath(fileName: string): string {
    const testDir = '/tmp/test-uploads'
    const testFile = `${testDir}/${Date.now()}_${fileName}`
    TestFileManager.addTestFile(testFile)
    return testFile
  }
}

/**
 * Test environment reset utilities
 */
export function resetTestEnvironment(): void {
  // Clear localStorage and sessionStorage
  if (typeof localStorage !== 'undefined') {
    localStorage.clear()
  }
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.clear()
  }

  // Reset global variables that might affect tests
  if (typeof globalThis !== 'undefined') {
    delete globalThis.testUser
    delete globalThis.testDocuments
  }

  // Reset any module-level state
  vi.clearAllMocks()
}

/**
 * Mock data factories for consistent test data
 */
export const TestDataFactories = {
  createUser: (overrides: Partial<any> = {}) => ({
    id: `user_${Date.now()}`,
    email: `test${Date.now()}@example.com`,
    firstName: 'Test',
    lastName: 'User',
    subscriptionTier: 'free',
    createdAt: new Date().toISOString(),
    ...overrides
  }),

  createDocument: (overrides: Partial<any> = {}) => ({
    id: Math.floor(Math.random() * 10000),
    userId: `user_${Date.now()}`,
    name: 'Test Document',
    fileName: 'test.pdf',
    filePath: TestFileManager.getTestFilePath('test.pdf'),
    fileSize: 1024,
    mimeType: 'application/pdf',
    categoryId: 1,
    tags: ['test'],
    extractedText: 'Sample extracted text',
    summary: 'Test document summary',
    ocrProcessed: true,
    uploadedAt: new Date().toISOString(),
    expiryDate: null,
    isEncrypted: false,
    ...overrides
  }),

  createCategory: (overrides: Partial<any> = {}) => ({
    id: Math.floor(Math.random() * 1000),
    userId: `user_${Date.now()}`,
    name: 'Test Category',
    icon: 'FileText',
    color: 'blue',
    createdAt: new Date().toISOString(),
    ...overrides
  })
}