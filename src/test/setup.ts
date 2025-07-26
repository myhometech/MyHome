import '@testing-library/jest-dom'
import { beforeAll, afterEach, afterAll, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { server } from './mocks/server'

// Setup accessibility testing utilities
const setupA11yTesting = async () => {
  try {
    const { default: axe } = await import('axe-core')
    // Configure axe for WCAG 2.1 AA compliance
    axe.configure({
      rules: {
        'color-contrast': { enabled: true },
        'keyboard': { enabled: true },
        'focus-order': { enabled: true }
      }
    })
    globalThis.axe = axe
  } catch (error) {
    console.warn('axe-core not available, accessibility tests will be skipped')
    globalThis.axe = null
  }
}

// Initialize accessibility testing
setupA11yTesting()

// Setup MSW
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

beforeEach(() => {
  // Reset any test state
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})