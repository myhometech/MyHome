import { render, RenderResult } from '@testing-library/react'
import { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Accessibility testing utilities
 */

export async function checkA11y(container: HTMLElement) {
  if (!globalThis.axe) {
    // Fallback: basic accessibility checks without axe-core
    const basicChecks = performBasicA11yChecks(container)
    if (basicChecks.violations.length > 0) {
      throw new Error(`Basic accessibility violations: ${JSON.stringify(basicChecks.violations)}`)
    }
    return
  }
  
  const results = await globalThis.axe.run(container)
  
  if (results.violations.length > 0) {
    const violations = results.violations.map(violation => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      help: violation.help,
      nodes: violation.nodes.length
    }))
    
    throw new Error(
      `Accessibility violations found:\n${JSON.stringify(violations, null, 2)}`
    )
  }
}

function performBasicA11yChecks(container: HTMLElement) {
  const violations = []
  
  // Check for missing alt text on images
  const images = container.querySelectorAll('img')
  images.forEach((img, index) => {
    if (!img.alt) {
      violations.push(`Image ${index + 1} missing alt text`)
    }
  })
  
  // Check for buttons without accessible names
  const buttons = container.querySelectorAll('button')
  buttons.forEach((button, index) => {
    const hasLabel = button.textContent?.trim() || 
                    button.getAttribute('aria-label') || 
                    button.getAttribute('aria-labelledby')
    if (!hasLabel) {
      violations.push(`Button ${index + 1} missing accessible name`)
    }
  })
  
  // Check for form inputs without labels
  const inputs = container.querySelectorAll('input, select, textarea')
  inputs.forEach((input, index) => {
    const hasLabel = input.getAttribute('aria-label') ||
                    input.getAttribute('aria-labelledby') ||
                    container.querySelector(`label[for="${input.id}"]`)
    if (!hasLabel) {
      violations.push(`Input ${index + 1} missing label`)
    }
  })
  
  return { violations }
}

export function renderWithA11y(component: ReactElement): RenderResult & { checkA11y: () => Promise<void> } {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  })

  const result = render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  )

  return {
    ...result,
    checkA11y: () => checkA11y(result.container)
  }
}

/**
 * Test helper for keyboard navigation
 */
export function simulateKeyboardNavigation(element: HTMLElement, keys: string[]) {
  keys.forEach(key => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key }))
    element.dispatchEvent(new KeyboardEvent('keyup', { key }))
  })
}

/**
 * Test helper for focus management
 */
export function expectFocusManagement(container: HTMLElement) {
  const focusableElements = container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  )
  
  return {
    toHaveCorrectTabOrder: () => {
      const tabIndexes = Array.from(focusableElements).map(el => 
        parseInt((el as HTMLElement).tabIndex.toString()) || 0
      )
      
      const sortedIndexes = [...tabIndexes].sort((a, b) => a - b)
      expect(tabIndexes).toEqual(sortedIndexes)
    },
    
    toHaveVisibleFocus: () => {
      focusableElements.forEach(el => {
        (el as HTMLElement).focus()
        const computedStyle = window.getComputedStyle(el)
        const hasVisibleFocus = computedStyle.outline !== 'none' || 
                               computedStyle.boxShadow !== 'none'
        expect(hasVisibleFocus).toBe(true)
      })
    }
  }
}