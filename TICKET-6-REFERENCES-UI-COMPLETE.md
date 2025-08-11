# Ticket 6: References UI - Show Linked Email Body/Attachments Complete

## Summary

Successfully implemented the comprehensive References UI that displays bidirectional document relationships between email body PDFs and attachment documents. The component provides accessible navigation, loading states, error handling, and analytics tracking as specified.

## ✅ Implemented Features

### Frontend Component (`DocumentReferences.tsx`)

- **Component Structure**: Card-based UI with collapsible sections
- **Data Fetching**: Two-endpoint strategy:
  - `/api/documents/:id/references` - Get document references
  - `/api/documents/batch-summary` - Get referenced document metadata
- **Progressive Loading**: Skeleton states while fetching references and document details
- **Error Handling**: Retry functionality with user-friendly error messages
- **Accessibility**: Full keyboard navigation, ARIA labels, screen reader support

### Backend Endpoints

- **References Endpoint**: `/api/documents/:id/references`
  - Validates document access and user permissions
  - Parses `references` field from document records
  - Returns structured reference list with type, relation, and metadata
- **Batch Summary Endpoint**: `/api/documents/batch-summary`
  - Accepts array of document IDs (max 50 for performance)
  - Returns lightweight document metadata for references
  - Includes `isEmailBodyPdf` detection based on naming patterns and context

### UI/UX Features

- **Smart Labeling**: 
  - "Email body (PDF)" for email body PDFs
  - "Email attachment" for email attachments
  - Color-coded badges (blue for body, green for attachments)
- **Expand/Collapse**: Shows 5 references by default, "Show all (N)" for more
- **Touch-Friendly**: Mobile-optimized touch targets (≥44px)
- **Visual Hierarchy**: Icons, names, dates, file sizes in clean layout
- **Hover Interactions**: Open buttons appear on hover with external link icons

### Analytics & Observability

- **View Tracking**: `references_viewed` with documentId and count
- **Click Tracking**: `reference_clicked` with documentId, referencedId, and type
- **Error Monitoring**: Failed reference fetches logged with context
- **Performance**: Batch fetching and caching to minimize API calls

## 🔧 Technical Implementation

### Reference Data Structure
```json
{
  "type": "email",
  "relation": "source|related",
  "documentId": 123,
  "metadata": {
    "messageId": "msg_id"
  }
}
```

### Component Props
```typescript
interface DocumentReferencesProps {
  documentId: number;
  references?: DocumentReference[];
  className?: string;
  onDocumentClick?: (documentId: number) => void;
  onNavigate?: (documentId: number) => void;
}
```

### Performance Optimizations
- **Conditional Rendering**: Only renders when references exist
- **Batch Requests**: Single API call for multiple document summaries
- **Query Caching**: TanStack Query caching for reference data
- **Skeleton Loading**: Progressive loading states prevent layout shifts

### Integration Points
- **Enhanced Document Viewer**: Placed below email metadata panel
- **Document Detail Pages**: Shows for both email PDFs and attachments
- **Navigation**: Flexible callback system for different routing approaches

## 🎯 Acceptance Criteria Met

- [x] References card appears on both Email-Body PDF and linked attachments (bidirectional)
- [x] Shows correct count and lists accessible referenced docs with name/type/date
- [x] Clicking opens the target document (configurable navigation callback)
- [x] Handles loading/empty/error states gracefully with Retry functionality
- [x] Works with up to 50 references without performance issues (batched fetch, memoized)
- [x] Full A11y: keyboard navigation and screen reader labels verified
- [x] Analytics events fire on view and click (no PII exposure)

## 🚀 Component Usage Examples

**Basic Usage:**
```tsx
<DocumentReferences 
  documentId={123}
  onDocumentClick={(docId) => navigate(`/documents/${docId}`)}
/>
```

**With Preloaded References:**
```tsx
<DocumentReferences 
  documentId={123}
  references={existingReferences}
  className="mt-4"
  onDocumentClick={(docId) => openModal(docId)}
/>
```

## 📊 User Experience Flow

1. User views document detail page (email attachment or body PDF)
2. References card appears below metadata if references exist
3. Shows loading skeletons while fetching reference details
4. Displays up to 5 references with expand option for more
5. User clicks "Open" → navigates to referenced document
6. Analytics events track user engagement with references

## 🔗 Dependencies

- ✅ Document Reference System (bidirectional linking)
- ✅ Backend endpoints for references and batch summaries
- ✅ Enhanced Document Viewer integration
- ✅ TanStack Query for data fetching and caching
- ✅ Radix UI components for accessibility

## 🎨 Visual Design

- **Card Layout**: Clean card with header showing count
- **List Items**: Icon + document info + action button
- **Color Coding**: Blue badges for email body PDFs, green for attachments
- **Responsive**: Adapts to mobile and desktop layouts
- **Loading States**: Skeleton UI prevents layout shifts
- **Error States**: Clear error messages with retry functionality

The References UI provides a seamless bidirectional navigation experience between email body PDFs and their attachments, completing the comprehensive email document management system.