import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EnhancedDocumentViewer } from '@/components/enhanced-document-viewer'

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

describe('EnhancedDocumentViewer', () => {
  const mockOnClose = vi.fn()
  const mockOnUpdate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders document viewer modal', () => {
    render(
      <TestWrapper>
        <EnhancedDocumentViewer
          document={mockDocument}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      </TestWrapper>
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Test Document')).toBeInTheDocument()
  })

  it('displays document preview and properties side by side', () => {
    render(
      <TestWrapper>
        <EnhancedDocumentViewer
          document={mockDocument}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      </TestWrapper>
    )

    // Should have preview section
    expect(screen.getByText(/preview/i)).toBeInTheDocument()
    
    // Should have properties section
    expect(screen.getByText(/properties/i)).toBeInTheDocument()
    expect(screen.getByText('1.0 KB')).toBeInTheDocument()
  })

  it('closes modal when close button is clicked', () => {
    render(
      <TestWrapper>
        <EnhancedDocumentViewer
          document={mockDocument}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      </TestWrapper>
    )

    const closeButton = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeButton)

    expect(mockOnClose).toHaveBeenCalled()
  })

  it('enables inline editing of document properties', async () => {
    render(
      <TestWrapper>
        <EnhancedDocumentViewer
          document={mockDocument}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      </TestWrapper>
    )

    // Click edit button
    const editButton = screen.getByRole('button', { name: /edit/i })
    fireEvent.click(editButton)

    // Should show editable fields
    const nameInput = screen.getByDisplayValue('Test Document')
    expect(nameInput).toBeInTheDocument()

    // Edit the name
    fireEvent.change(nameInput, { target: { value: 'Updated Name' } })

    // Save changes
    const saveButton = screen.getByRole('button', { name: /save/i })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(mockOnUpdate).toHaveBeenCalled()
    })
  })

  it('displays PDF preview for PDF documents', () => {
    render(
      <TestWrapper>
        <EnhancedDocumentViewer
          document={mockDocument}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      </TestWrapper>
    )

    // Should show PDF-specific preview
    expect(screen.getByText(/pdf/i)).toBeInTheDocument()
  })

  it('shows document metadata and tags', () => {
    const documentWithTags = {
      ...mockDocument,
      tags: ['important', 'tax', '2025']
    }

    render(
      <TestWrapper>
        <EnhancedDocumentViewer
          document={documentWithTags}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      </TestWrapper>
    )

    expect(screen.getByText('important')).toBeInTheDocument()
    expect(screen.getByText('tax')).toBeInTheDocument()
    expect(screen.getByText('2025')).toBeInTheDocument()
  })
})