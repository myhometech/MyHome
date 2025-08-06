# MyHome Application

## Overview
MyHome is a comprehensive document management application for homeowners, designed to organize property-related documents. It features a web application (React + Node.js) and a native iOS app, both syncing through a shared backend API with a PostgreSQL database and authentication. The project aims to provide an intuitive platform for document digitization via camera scanning, with future integrations planned for cloud storage services like Google Drive.

## User Preferences
Preferred communication style: Simple, everyday language.
Project Direction: Building iOS version of MyHome document management app.
Essential Features: Phone camera scanning for document digitization, future Google Drive integration planned.
Interface Design: Clean insights-first layout with single document library section below AI insights, single main heading structure.
Document Cards: Subtle colored file type icons only (emerald for images, red for PDFs, blue for documents) with clean white backgrounds.
Modal Interaction: Consistent viewing pattern - click to open modal, use 3-dot menu for actions (edit/delete).

### Application Behavior Preferences
1. **Document Upload**: Auto-suggest categories using AI analysis with user confirmation before saving
2. **Premium Features**: Hide premium features completely from free users for clean interface
3. **Free User Limits**: Block uploads when free users hit 50-document limit with upgrade message
4. **Email Forwarding**: Show as discrete dashboard option linking to settings (not prominent)
5. **Email Import Notifications**: Notification badge/counter + tag documents as "imported via email"
6. **Mobile Camera**: Allow offline scanning with local storage, sync/process when online
7. **Document Deletion**: Premium trash bin (30-day) + confirmation dialogs for all users

## System Architecture

### Web Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Routing**: Wouter
- **State Management**: TanStack Query (React Query)
- **UI Framework**: Radix UI components with Tailwind CSS styling
- **Component Library**: shadcn/ui
- **Feature Management**: Subscription-based feature flagging system with FeatureGate components
- **Unified Interface**: Insights-first UX with AI insights positioned above document library in single scrollable view
- **Component Structure**: UnifiedDocumentCard for document management and UnifiedInsightsDashboard for AI insights display
- **Modal System**: Comprehensive document viewer modal system with separate state management for insights-triggered document viewing, preventing conflicts with main page document selection

### Vehicle Management System
- **Vehicle Insights**: AI-powered MOT and tax due date insights with priority classification
- **Duplicate Prevention**: Intelligent deduplication based on VRN, type, and due date matching
- **Template Fallback**: Resilient insight generation with template backup when AI services fail
- **DVLA Integration**: Ready for real-time vehicle data enrichment and validation

### iOS Native Architecture
- **Framework**: SwiftUI for iOS 16.0+
- **Authentication**: Sign in with Apple integration
- **Document Scanning**: VisionKit with VNDocumentCameraViewController
- **Text Recognition**: Vision framework with VNRecognizeTextRequest
- **Storage**: Local file system + API sync
- **State Management**: ObservableObject with Combine framework
- **Offline Support**: Local document storage with background sync

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Authentication**: Replit Auth with OpenID Connect (web) + Apple Sign In (iOS)
- **Session Management**: Express sessions with PostgreSQL storage
- **File Uploads**: Multer
- **API Design**: RESTful endpoints with JSON responses

### Database Layer
- **ORM**: Drizzle ORM
- **Database**: PostgreSQL (configured for Neon serverless)
- **Schema**: Users, Sessions, Categories, Documents tables.

### Authentication System
- **Provider**: Simple email/password authentication
- **Password Security**: bcrypt hashing
- **Session Storage**: PostgreSQL-backed sessions
- **Authorization**: Route-level authentication middleware
- **User Management**: Manual registration and login system
- **Subscription Tiers**: Free and Premium tiers with feature access control. Supports multi-provider authentication (Google, Apple, Twitter).

### Feature Flagging System
- **Tiers**: Free (basic) and Premium (advanced + AI features)
- **Components**: FeatureGate, PremiumFeature, FeatureLimitAlert
- **Limits**: Free tier: 50 documents, 100MB storage; Premium: unlimited.
- **Categories**: Core, Advanced, AI, Automation, Collaboration.

### File Management
- **Storage**: Google Cloud Storage (myhometech-storage bucket) with automatic bucket creation and management.
- **Supported Formats**: PDF, JPEG, PNG, WebP (and iPhone-specific formats like HEIC, HEIF, TIFF, BMP).
- **File Size Limit**: 10MB per file for email ingestion; 50MB for multi-page document scans.
- **Security**: File type validation, secure filename generation, AES-256-GCM encryption for all uploaded documents.
- **Cloud Integration**: Automated backups to myhometech-backups bucket with configurable retention.

### Document Organization
- **Categories**: Predefined and user-creatable categories.
- **Search**: Text-based search with PostgreSQL GIN indexes for full-text search.
- **Filtering**: Category-based filtering.
- **Views**: Grid and list view modes.
- **Tags**: Optional tagging system.

### AI Integration
- **AI Services**: Powered by Mistral LLM client (migrated from OpenAI for cost optimization).
- **Capabilities**: Auto-categorization, AI-enhanced date extraction, AI-enhanced reminder suggestions, AI-powered content analysis (smart preview chips).
- **Cost Optimization**: Utilizes pattern-first categorization and regex-based date extraction before AI calls, with confidence thresholds for AI integration.

### Document Scanning & Processing
- **Advanced Scanning**: Auto edge detection, multi-page scanning, perspective correction, auto-cropping, and multi-page PDF generation with embedded searchable OCR text.
- **OCR Processing**: Tesseract.js integration with intelligent image enhancement and text recognition.
- **Image Processing**: Gaussian blur, Sobel edge detection, auto-rotation, contrast/brightness auto-enhancement, noise reduction, image sharpening.

### Performance & Error Handling
- **Image/PDF Optimization**: Client-side image compression, server-side image processing (Sharp), PDF-lib integration for PDF optimization.
- **Virtualized Lists**: React-window for infinite loading and memory-efficient rendering.
- **Global Error Handling**: React Error Boundaries, network status detection, exponential backoff retry logic for API calls, toast notifications for user feedback.
- **Memory Optimization**: Manual garbage collection with NODE_OPTIONS="--expose-gc", comprehensive resource tracking system, OCR resource cleanup with try/finally blocks, automatic buffer and file handle management.
- **Resource Management**: Centralized ResourceTracker utility for files, buffers, workers, and streams with automatic cleanup on process exit, stale resource cleanup, and WeakRef support for better GC performance.

### Manual Event Management System
- **Full CRUD Operations**: Complete create, read, update, delete functionality for manual events.
- **Modal Viewer Pattern**: ManualEventViewer component provides consistent viewing experience matching document pattern - click to view, 3-dot menu for actions.
- **Visual Integration**: Manual events display alongside AI insights with distinct visual indicators (Manual badges, PenTool icons).
- **Asset Linking**: Events can be linked to user properties (houses/cars) with visual indicators.
- **Due Date Management**: Smart due date processing with urgency colors (overdue=red, today=orange, tomorrow=yellow, future=green).
- **Multi-File Attachments**: Support for document attachments with drag-drop upload interface.
- **Real-time Synchronization**: React Query integration with automatic cache invalidation across all views.
- **Comprehensive Display**: Unified insights dashboard, detailed insights page with tabbed views, and integrated search functionality.
- **Consistent UX**: Manual events follow same interaction pattern as documents - click opens modal view with dropdown menu access to editing.

### Smart Contextual Help System
- **Comprehensive Help Tooltips**: Smart contextual help throughout the interface with different tooltip types (info, warning, success).
- **Feature Guidance**: Help tooltips for AI Insights, Document Library, bulk operations, categories, and upload functionality.
- **Contextual Content**: Different help contexts including feature-intro, action-guide, and troubleshooting guidance.
- **Reusable Component**: SmartHelpTooltip component supports different variants (default, compact, detailed) and positioning.
- **Extensive Help Database**: Comprehensive help content covering document management, AI insights, manual events, and vehicle management features.

### Security & Monitoring
- **Security Headers**: Helmet middleware for HTTP security headers (HSTS, CSP, X-Frame-Options).
- **Rate Limiting**: Express rate limiting with specialized webhook rate limiting.
- **CORS Policy**: Strict CORS.
- **Error Tracking**: Sentry integration for comprehensive error tracking and performance monitoring.
- **Health Monitoring**: Multi-subsystem health checks (database, memory, disk, environment).
- **Mailgun Security**: Comprehensive webhook security with IP whitelisting, HMAC signature verification, content-type validation, and enhanced logging for email-to-document ingestion pipeline.

### Automated Systems
- **Automated Backup**: PostgreSQL and file storage backups to GCS with configurable retention.
- **CI/CD**: GitHub Actions for automated Docker builds and deployment.
- **Storage Migration**: Migration scripts for transition to cloud-only storage.

## External Dependencies

### Core Framework Dependencies
- **React Ecosystem**: `react`, `react-dom`, `@tanstack/react-query`
- **Backend**: `express`, `typescript`, `tsx`
- **Database**: `drizzle-orm`, `@neondatabase/serverless`, `pg`
- **Authentication**: `openid-client`, `passport`, `express-session`, `bcrypt`
- **LLM Client**: `@mistralai/mistralai`
- **Stripe**: `stripe`

### UI and Styling
- **Component Library**: `@radix-ui/* components`, `shadcn/ui`
- **Styling**: `tailwindcss`, `class-variance-authority`
- **Icons**: `lucide-react`
- **Utilities**: `clsx`, `tailwind-merge`

### File Handling and Processing
- **Upload Processing**: `multer`, `buffer`
- **Image Processing**: `sharp`, `browser-image-compression`
- **PDF Processing**: `pdf-lib`, `puppeteer` (for email-to-PDF conversion)
- **OCR**: `tesseract.js`
- **Cloud Storage**: `@google-cloud/storage` (for Google Cloud Storage)

### Email Services
- **Email Ingestion**: Complete Mailgun webhook integration with enterprise-grade security (IP whitelisting, HMAC verification, rate limiting). System fully functional in development and ready for production deployment.

### Monitoring and Security
- **Error Tracking**: `@sentry/node`, `@sentry/react`
- **Security Headers**: `helmet`
- **Rate Limiting**: `express-rate-limit`

### Testing (Internal Dependencies for Development/CI)
- `vitest`, `@testing-library/react`, `msw`, `supertest`