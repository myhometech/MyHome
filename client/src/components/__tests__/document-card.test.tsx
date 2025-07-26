import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DocumentCard from '@/components/document-card'

const mockDocument = {
  id: 1,
  userId: 'test-user',
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

const mockCategory = {
  id: 1,
  name: 'Test Category',
  icon: 'FileText',
  color: 'blue'
}

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

describe('DocumentCard', () => {
  it('renders document information correctly', () => {
    render(
      <TestWrapper>
        <DocumentCard 
          document={mockDocument} 
          categories={[mockCategory]}
        />
      </TestWrapper>
    )

    expect(screen.getByText('Test Document')).toBeInTheDocument()
    expect(screen.getByText('Test Category')).toBeInTheDocument()
    expect(screen.getByText('1.0 KB')).toBeInTheDocument()
  })

  it('opens document viewer when clicked', () => {
    render(
      <TestWrapper>
        <DocumentCard 
          document={mockDocument} 
          categories={[mockCategory]}
        />
      </TestWrapper>
    )

    const documentCard = screen.getByRole('button')
    fireEvent.click(documentCard)

    // Enhanced document viewer should open
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('enables bulk selection mode', () => {
    const mockToggleSelection = vi.fn()
    
    render(
      <TestWrapper>
        <DocumentCard 
          document={mockDocument} 
          categories={[mockCategory]}
          bulkMode={true}
          isSelected={false}
          onToggleSelection={mockToggleSelection}
        />
      </TestWrapper>
    )

    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)

    expect(mockToggleSelection).toHaveBeenCalled()
  })

  it('shows expiry badge for documents with expiry dates', () => {
    const documentWithExpiry = {
      ...mockDocument,
      expiryDate: '2025-12-31'
    }

    render(
      <TestWrapper>
        <DocumentCard 
          document={documentWithExpiry} 
          categories={[mockCategory]}
        />
      </TestWrapper>
    )

    expect(screen.getByText(/Expires/)).toBeInTheDocument()
  })

  it('handles inline editing of document name', async () => {
    render(
      <TestWrapper>
        <DocumentCard 
          document={mockDocument} 
          categories={[mockCategory]}
        />
      </TestWrapper>
    )

    // Click edit button in dropdown
    const dropdownTrigger = screen.getByRole('button', { name: /more options/i })
    fireEvent.click(dropdownTrigger)

    const editButton = screen.getByText('Edit')
    fireEvent.click(editButton)

    // Should show inline editing input
    const nameInput = screen.getByDisplayValue('Test Document')
    expect(nameInput).toBeInTheDocument()

    // Change the name
    fireEvent.change(nameInput, { target: { value: 'Updated Document Name' } })
    
    // Save the changes
    const saveButton = screen.getByRole('button', { name: /save/i })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(screen.getByText('Updated Document Name')).toBeInTheDocument()
    })
  })
})