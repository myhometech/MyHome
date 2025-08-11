# Email Body → PDF Implementation Plan

## Current System Analysis ✅

Based on code analysis of MyHome's email ingestion system:

### Existing Infrastructure
- ✅ **Mailgun Webhook**: Handles MIME parsing, provides `body-plain` and `body-html`
- ✅ **Puppeteer**: Already installed for PDF generation
- ✅ **GCS Storage**: Cloud storage with encryption ready
- ✅ **Document Schema**: Has `uploadSource: 'email'` field
- ✅ **Security**: HMAC signature verification, IP whitelisting

### Missing Components
- ❌ **messageId Tracking**: No deduplication by email messageId
- ❌ **Email Body Storage**: Email bodies not persisted (only attachments)
- ❌ **HTML Sanitization**: Direct HTML storage without cleaning
- ❌ **Document Relations**: No linking between email body PDFs and attachments

## Implementation Strategy

### Phase 1: Schema Extensions

```typescript
// Add to documents table
export const documents = pgTable("documents", {
  // ... existing fields
  
  // Email-specific fields
  messageId: varchar("message_id", { length: 255 }), // Mailgun messageId
  bodyHash: varchar("body_hash", { length: 64 }), // SHA-256 of email body
  emailContext: jsonb("email_context"), // Store email metadata
  sourceDocumentId: integer("source_document_id").references(() => documents.id), // For relations
}, (table) => [
  // ... existing indexes
  index("idx_documents_message_id").on(table.messageId),
  index("idx_documents_body_hash").on(table.bodyHash),
]);

// New relations table
export const documentRelations = pgTable("document_relations", {
  id: serial("id").primaryKey(),
  sourceDocumentId: integer("source_document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  relatedDocumentId: integer("related_document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  relationType: varchar("relation_type", { length: 20 }).notNull(), // 'email_attachment', 'email_body'
  createdAt: timestamp("created_at").defaultNow(),
});
```

### Phase 2: Email Body PDF Service

```typescript
// server/emailBodyPdfService.ts
export class EmailBodyPdfService {
  
  async renderEmailToPdf(emailData: {
    subject: string;
    bodyHtml?: string;
    bodyPlain: string;
    sender: string;
    receivedAt: string;
  }): Promise<Buffer> {
    // 1. Sanitize HTML with DOMPurify
    // 2. Create email template with header (subject, from, date)
    // 3. Render with Puppeteer to PDF
    // 4. Compress if > 10MB
  }

  async createEmailBodyDocument(
    userId: string,
    emailData: MailgunMessage,
    existingAttachmentIds: number[] = []
  ): Promise<{ documentId: number; gcsPath: string }> {
    // 1. Check for existing messageId
    // 2. Generate bodyHash for duplicate detection
    // 3. Render email to PDF
    // 4. Upload to GCS
    // 5. Create document record
    // 6. Link to attachment documents
  }
}
```

### Phase 3: Webhook Integration

Modify `/api/email-ingest` to handle emails without attachments:

```typescript
// In routes.ts email-ingest handler
if (message.attachments.length === 0 && (message.bodyHtml || message.bodyPlain)) {
  // V2: Auto-create email body PDF
  const emailBodyService = new EmailBodyPdfService();
  const result = await emailBodyService.createEmailBodyDocument(userId, message);
  
  // Log creation
  EmailUploadLogger.logEmailBodyPdfGenerated({
    userId,
    messageId: message.messageId,
    documentId: result.documentId,
    hasHtml: !!message.bodyHtml
  });
}
```

### Phase 4: Frontend Integration

Add "Store email as PDF" action to document viewer:

```typescript
// Only show for documents where uploadSource === 'email'
{document.uploadSource === 'email' && document.emailContext?.messageId && (
  <Button onClick={() => handleCreateEmailBodyPdf(document.emailContext.messageId)}>
    <FileText className="h-4 w-4 mr-2" />
    Store Email as PDF
  </Button>
)}
```

### Phase 5: API Endpoints

```typescript
// New endpoints
POST /api/email/render-to-pdf
GET /api/documents/:id/relations
POST /api/documents/:id/create-email-body-pdf
```

## Implementation Details

### Security & Compliance
- **External Images**: Block by default (Puppeteer `waitUntil: 'networkidle0'` with timeout)
- **HTML Sanitization**: Use DOMPurify server-side before rendering
- **PII Redaction**: No special handling (same as attachment emails)

### File Naming & Metadata
- **Filename**: `Email - {Subject || "No Subject"} - {YYYY-MM-DD}.pdf`
- **Category**: Default to existing user's default category
- **Tags**: Auto-tag with "email", sender domain
- **EmailContext**: Store sender, subject, receivedAt, messageId, hasAttachments

### Deduplication Strategy
```typescript
// Check order:
// 1. messageId (if available from Mailgun)
// 2. bodyHash (SHA-256 of normalized HTML + plain text)
// 3. sender + subject + date within 1 hour window
```

### PDF Template Structure
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Email: {subject}</title>
  <style>/* Clean email styling */</style>
</head>
<body>
  <header class="email-header">
    <h1>{subject || 'No Subject'}</h1>
    <div class="metadata">
      <p><strong>From:</strong> {sender}</p>
      <p><strong>Received:</strong> {receivedAt} (UTC) | {receivedAtLocal} (BST)</p>
      <p><strong>Message ID:</strong> {messageId}</p>
    </div>
  </header>
  <main class="email-body">
    {sanitizedHtmlBody || formattedPlainText}
  </main>
</body>
</html>
```

## Testing Strategy

### Test Email Types Needed
1. **HTML with inline images** (`cid:` references)
2. **Plain text only** (newsletters, receipts)
3. **Complex HTML** (marketing emails)
4. **International characters** (UTF-8, emoji)
5. **Receipt-style emails** (structured data)

### Analytics Events
```typescript
// Track these events:
email_ingest_body_pdf_generated
email_ingest_body_pdf_skipped  
email_ingest_body_pdf_failed
email_pdf_create_clicked
email_pdf_created_manual
email_pdf_creation_failed
```

## Deployment Checklist

- [ ] Database migration with new fields
- [ ] Update Drizzle schema and generate types  
- [ ] Implement EmailBodyPdfService
- [ ] Add DOMPurify server-side sanitization
- [ ] Update email ingestion route
- [ ] Add frontend "Store as PDF" button
- [ ] Create new API endpoints
- [ ] Add comprehensive error handling
- [ ] Test with all 5 email types
- [ ] Monitor PDF generation performance
- [ ] Set up analytics tracking

## Success Metrics

- **Auto-Generation**: % of no-attachment emails converted to PDF
- **Manual Creation**: Usage of "Store email as PDF" feature
- **Performance**: Average PDF generation time < 5 seconds
- **Quality**: User satisfaction with PDF output
- **Storage**: Total storage impact from email body PDFs