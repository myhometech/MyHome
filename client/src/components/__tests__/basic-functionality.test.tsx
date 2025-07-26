import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Simple component tests that verify basic functionality
const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  })
  
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

// Mock basic React components for testing
const MockButton = ({ children, onClick }: { children: React.ReactNode, onClick?: () => void }) => (
  <button onClick={onClick}>{children}</button>
)

const MockCard = ({ title, content }: { title: string, content: string }) => (
  <div>
    <h3>{title}</h3>
    <p>{content}</p>
  </div>
)

describe('Basic UI Components', () => {
  it('renders a simple button', () => {
    render(
      <TestWrapper>
        <MockButton>Click me</MockButton>
      </TestWrapper>
    )

    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('renders a card with title and content', () => {
    render(
      <TestWrapper>
        <MockCard title="Test Title" content="Test content" />
      </TestWrapper>
    )

    expect(screen.getByText('Test Title')).toBeInTheDocument()
    expect(screen.getByText('Test content')).toBeInTheDocument()
  })

  it('handles basic user interactions', () => {
    let clicked = false
    const handleClick = () => { clicked = true }

    render(
      <TestWrapper>
        <MockButton onClick={handleClick}>Interactive Button</MockButton>
      </TestWrapper>
    )

    const button = screen.getByText('Interactive Button')
    button.click()

    expect(clicked).toBe(true)
  })
})