# MyHome Application

## Overview
MyHome is a comprehensive document management application for homeowners, designed to organize property-related documents. It features a web application (React + Node.js) and a native iOS app, both syncing through a shared backend API with a PostgreSQL database and authentication. The project aims to provide an intuitive platform for document digitization via camera scanning, with future integrations planned for cloud storage services like Google Drive. The business vision is to provide an intuitive platform for document digitization, offering a solution for homeowners to manage property-related information efficiently and securely.

## Recent Major Changes (August 2025)
- **Multi-Tier Subscription System**: Implemented comprehensive three-tier pricing (Beginner £2.99, Pro £7.99, Duo £9.99) with individual and shared household plans
- **Flexible Stripe Pricing Integration**: Created dynamic pricing system that fetches real Stripe prices via API while maintaining default fallbacks for development
- **Dynamic SubscriptionTier Architecture**: Refactored from hardcoded enum to dynamic string type, enabling new tier addition through environment configuration only (no code deployments required)
- **Household Management**: Added complete shared workspace functionality for Duo subscribers with member invitation system
- **Enhanced Stripe Integration**: Updated webhook handling to support multiple pricing tiers and automatic household creation
- **Feature Flagging Evolution**: Modernized to support array-based tier definitions for granular feature access control
- **TICKET 1 Complete**: Settings UI overhaul - renamed "Billing" to "Account" and added "Shared Access" tab with comprehensive household member management interface
- **TICKET 2 Complete**: Backend pending invite system with tokenized invitations, email notifications via SendGrid, and automatic household membership creation
- **TICKET 3 Complete**: Full role-based access control system with owner/duo_partner/household_user roles, permission middleware, and frontend role enforcement
- **TICKET 4 Complete**: Comprehensive audit logging system with document_events table, AuditLogger service, and API endpoints for tracking document upload, delete, rename, and AI insight actions
- **TICKET 5 Complete**: Frontend invite accept flow with /invite/accept route, welcome screen for valid invitations, error handling for invalid/expired tokens, and seamless household joining UX
- **Mobile Header Optimization**: Fixed horizontal scrolling issues on mobile by hiding search bar, removing redundant icons (settings/profile available in hamburger menu), implementing icon-only buttons, and responsive spacing
- **AI Insights Mobile Optimization**: Comprehensive mobile redesign of insights dashboard with compact cards (reduced padding from p-4 to p-2), responsive grid layout (2 columns on mobile, 4 on desktop), smaller icons (h-5 instead of h-8), condensed text with mobile-specific breakpoints, and improved readability on small screens

## User Preferences
Preferred communication style: Simple, everyday language.
Project Direction: Building iOS version of MyHome document management app.
Essential Features: Phone camera scanning for document digitization, future Google Drive integration planned.
Interface Design: Clean insights-first layout with single document library section below AI insights, single main heading structure. Mobile-optimized with compact sizing (reduced text sizes, smaller icons, tighter spacing) to prevent zoomed-in feeling. Mobile sidebar uses 56-width with light overlay for integrated feel.
Document Cards: Subtle colored file type icons only (emerald for images, calm red for PDFs, blue for documents) with warm ivory backgrounds (#FAF4EF).
Modal Interaction: Consistent viewing pattern - click to open modal, use 3-dot menu for actions (edit/delete).
Color Palette: Primary Blue (HSL(207, 90%, 54%) / #1E90FF) with warm supporting colors for a homely feel: Warm Background (#FAF4EF linen/ivory), Trust Base (#2B2F40 slate blue), Sage Green (#A5C9A1), Dusty Lavender (#A1A4D6), and Soft Coral (#E28F83). Document type colors: Emerald for images, calm red (#E74C3C) for PDFs, blue for documents.

### Application Behavior Preferences
1. Document Upload: Auto-suggest categories using AI analysis with user confirmation before saving
2. Premium Features: Hide premium features completely from free users for clean interface
3. Free User Limits: Block uploads when free users hit 50-document limit with upgrade message
4. Email Forwarding: Show as discrete dashboard option linking to settings (not prominent)
5. Email Import Notifications: Notification badge/counter + tag documents as "imported via email"
6. Mobile Camera: Allow offline scanning with local storage, sync/process when online
7. Document Deletion: Premium trash bin (30-day) + confirmation dialogs for all users

## System Architecture

### Web Frontend
- **Framework**: React 18 with TypeScript, Vite, Wouter for routing, TanStack Query for state management.
- **UI/UX**: Radix UI components with Tailwind CSS (shadcn/ui), unified insights-first UX, comprehensive document viewer modal system.
- **Feature Management**: Subscription-based feature flagging with `FeatureGate` components.

### iOS Native
- **Framework**: SwiftUI for iOS 16.0+.
- **Authentication**: Sign in with Apple integration.
- **Document Scanning**: Genius Scan integration with enhanced error handling and PDF processing capabilities.
- **Text Recognition**: Vision framework with `VNRecognizeTextRequest`.
- **Storage**: Local file system + API sync with offline support.
- **File Handling**: Enhanced PDF processing, automatic file type detection, document import from external apps, comprehensive error handling for "PDF not created" issues.

### Backend
- **Runtime**: Node.js with Express.js (TypeScript, ES modules).
- **Authentication**: Replit Auth with OpenID Connect (web) + Apple Sign In (iOS), bcrypt hashing, PostgreSQL-backed sessions, route-level middleware. Supports multi-provider authentication with OAuth `state` parameter for CSRF protection.
- **File Uploads**: Multer.
- **API Design**: RESTful endpoints with JSON responses.

### Database Layer
- **ORM**: Drizzle ORM.
- **Database**: PostgreSQL (configured for Neon serverless).
- **Schema**: Users, Sessions, Categories, Documents tables, with extensions for conversion tracking and provenance.

### File Management
- **Storage**: Google Cloud Storage (`myhometech-eu` bucket, europe-west2 region) with AES-256-GCM encryption.
- **Supported Formats**: PDF, JPEG, PNG, WebP, HEIC, HEIF, TIFF, BMP.
- **File Size Limits**: 10MB per file for email ingestion; 50MB for multi-page scans.
- **OCR Processing**: Tesseract.js with intelligent image enhancement.
- **Email Attachments**: Enhanced classification & routing system preserving originals, converting non-PDFs to separate PDF documents, handling password-protected files, and enforcing size limits.

### AI Integration
- **AI Services**: Mistral LLM client for auto-categorization, date extraction, reminder suggestions, and content analysis.
- **Cost Optimization**: Pattern-first categorization and regex-based extraction before AI calls.
- **Vehicle Insights**: AI-powered MOT and tax due date insights with deduplication.

### Multi-Tier Subscription System  
- **Tiers**: Free (basic, 50 docs), Beginner (200 docs, £2.99/mo), Pro (5K docs, AI features, £7.99/mo), Duo (10K docs, 2 users, £9.99/mo).
- **Dynamic Architecture**: `SubscriptionTier = string` type enables arbitrary tier names via configuration without code changes.
- **Extensibility**: New tiers (e.g., Enterprise, Partner) can be added through environment variables only - no deployments required.
- **Pricing**: Dynamic pricing system that fetches real Stripe prices via API with intelligent fallback to default configuration.
- **Configuration**: Environment-based price ID mapping (STRIPE_BEGINNER_PRICE_ID, STRIPE_PRO_PRICE_ID, STRIPE_DUO_PRICE_ID) with single source of truth in `PLAN_MAPPING`.
- **Components**: `FeatureGate`, `PremiumFeature`, `FeatureLimitAlert` supporting array-based tier definitions for granular access control.
- **Household Management**: Complete invitation system, member management, and shared workspace for Duo subscribers.

### Manual Event Management
- **Functionality**: Full CRUD operations for manual events.
- **UX**: Consistent modal viewer pattern, visual integration with AI insights, asset linking, smart due date processing, multi-file attachments.
- **Synchronization**: React Query for real-time updates.

### Performance & Error Handling
- **Optimization**: Client/server-side image/PDF optimization, virtualized lists (React-window).
- **Robustness**: Global error handling (React Error Boundaries), network status detection, exponential backoff, toast notifications.
- **Memory Optimization**: Manual garbage collection, resource tracking, OCR resource cleanup.

### Document Conversion (CloudConvert Integration)
- **Primary Engine**: CloudConvert API for all document conversions (HTML to PDF, Office to PDF, Image to PDF).
- **Robustness**: Implements comprehensive retry logic with exponential backoff (for 429/5xx errors), robust error handling, and structured logging.
- **Error Handling**: Enhanced `CloudConvertError` class with retryable flags and detailed context capture.
- **Fallback Mechanism**: Ensures zero content loss during CloudConvert failures; email bodies are stored as text and attachments as original files with proper tracking.
- **Monitoring**: Integrated with metricsService for conversion duration, success rates, and failure pattern tracking.

### Security & Monitoring
- **Security**: Helmet middleware (HTTP headers), Express rate limiting, strict CORS.
- **Monitoring**: Sentry integration for error tracking and performance.
- **Health Checks**: Multi-subsystem health checks.

### Automated Systems
- **Automated Backup**: PostgreSQL and file storage backups to GCS.
- **CI/CD**: GitHub Actions for Docker builds and deployment.

### Email Processing
- **Architecture**: CloudConvert-only implementation for email body and attachment conversions, eliminating browser dependencies and filesystem operations by using buffer-based storage directly to GCS.
- **Features**: Converts email bodies (HTML to PDF) and various attachments (Office to PDF, Image to PDF).
- **Error Handling**: Enhanced with comprehensive fallback mechanisms to preserve content when CloudConvert is unavailable.
- **Observability**: Metrics system tracks conversion performance (duration, success rates, errors, retries).
- **Metadata**: Exposure and filtering system for enhanced document discovery.

### UI Flows
- **Upload Modal**: Consolidated and streamlined upload modal flow.

## External Dependencies

### Core Framework
- **React Ecosystem**: `react`, `react-dom`, `@tanstack/react-query`
- **Backend**: `express`, `typescript`, `tsx`
- **Database**: `drizzle-orm`, `@neondatabase/serverless`, `pg`
- **Authentication**: `openid-client`, `passport`, `express-session`, `bcrypt`
- **LLM Client**: `@mistralai/mistralai`
- **Payments**: `stripe`

### UI and Styling
- **Component Library**: `@radix-ui/* components`, `shadcn/ui`
- **Styling**: `tailwindcss`, `class-variance-authority`
- **Icons**: `lucide-react`

### File Handling and Processing
- **Upload Processing**: `multer`, `buffer`
- **Image Processing**: `sharp`, `browser-image-compression`
- **PDF Processing**: `pdf-lib`
- **Document Conversion**: CloudConvert API integration via `node-fetch`
- **OCR**: `tesseract.js`
- **Cloud Storage**: `@google-cloud/storage`

### Email Services
- **Email Ingestion**: Mailgun webhook integration for email-to-document import.

### Monitoring and Security
- **Error Tracking**: `@sentry/node`, `@sentry/react`
- **Security Headers**: `helmet`
- **Rate Limiting**: `express-rate-limit`