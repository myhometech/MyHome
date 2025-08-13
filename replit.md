# MyHome Application

## Overview
MyHome is a comprehensive document management application for homeowners, designed to organize property-related documents. It features a web application (React + Node.js) and a native iOS app, both syncing through a shared backend API with a PostgreSQL database and authentication. The project aims to provide an intuitive platform for document digitization via camera scanning, with future integrations planned for cloud storage services like Google Drive. The business vision is to provide an intuitive platform for document digitization, offering a solution for homeowners to manage property-related information efficiently and securely.

## User Preferences
Preferred communication style: Simple, everyday language.
Project Direction: Building iOS version of MyHome document management app.
Essential Features: Phone camera scanning for document digitization, future Google Drive integration planned.
Interface Design: Clean insights-first layout with single document library section below AI insights, single main heading structure.
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
- **Document Scanning**: VisionKit with `VNDocumentCameraViewController`.
- **Text Recognition**: Vision framework with `VNRecognizeTextRequest`.
- **Storage**: Local file system + API sync with offline support.

### Backend
- **Runtime**: Node.js with Express.js (TypeScript, ES modules).
- **Authentication**: Replit Auth with OpenID Connect (web) + Apple Sign In (iOS), bcrypt hashing, PostgreSQL-backed sessions, route-level middleware. Supports multi-provider authentication. OAuth `state` parameter is used for CSRF protection. Environment-driven callback URLs, configuration guardrails, and startup validation are implemented.
- **File Uploads**: Multer.
- **API Design**: RESTful endpoints with JSON responses.

### Database Layer
- **ORM**: Drizzle ORM.
- **Database**: PostgreSQL (configured for Neon serverless).
- **Schema**: Users, Sessions, Categories, Documents tables.
- **Recent Enhancement (TICKET 3)**: Documents table extended with conversion tracking fields (conversion_status, source_document_id, original_mime_type, conversion_job_id, conversion_metadata) for email attachment processing.
- **TICKET 5 COMPLETE**: Enhanced provenance tracking with new fields: conversion_engine ('cloudconvert'|'puppeteer'|null), conversion_input_sha256 (SHA-256 content hash), conversion_reason (conversion outcome), derived_from_document_id (document derivation chain), and source ('manual'|'email'|'api') for comprehensive audit trails.

### File Management
- **Storage**: Google Cloud Storage (`myhometech-storage` bucket) with AES-256-GCM encryption.
- **Supported Formats**: PDF, JPEG, PNG, WebP, HEIC, HEIF, TIFF, BMP.
- **File Size Limits**: 10MB per file for email ingestion; 50MB for multi-page scans.
- **OCR Processing**: Tesseract.js with intelligent image enhancement.
- **Email Attachments**: Enhanced classification & routing system (TICKET 3) - preserves originals while converting non-PDFs to separate PDF documents, enforces 10MB limits, handles password-protected files with full traceability.

### AI Integration
- **AI Services**: Mistral LLM client for auto-categorization, date extraction, reminder suggestions, and content analysis.
- **Cost Optimization**: Pattern-first categorization and regex-based extraction before AI calls.
- **Vehicle Insights**: AI-powered MOT and tax due date insights with deduplication.

### Feature Flagging
- **Tiers**: Free (basic, limits) and Premium (advanced + AI, unlimited).
- **Components**: `FeatureGate`, `PremiumFeature`, `FeatureLimitAlert`.

### Manual Event Management
- **Functionality**: Full CRUD operations for manual events.
- **UX**: Consistent modal viewer pattern, visual integration with AI insights, asset linking, smart due date processing, multi-file attachments.
- **Synchronization**: React Query for real-time updates.

### Performance & Error Handling
- **Optimization**: Client/server-side image/PDF optimization, virtualized lists (React-window).
- **Robustness**: Global error handling (React Error Boundaries), network status detection, exponential backoff, toast notifications.
- **Memory Optimization**: Manual garbage collection, resource tracking, OCR resource cleanup.

### CloudConvert Integration (Enhanced - 2025-08-13)
- **Critical P0 Fix Applied**: Implemented robust job creation handling for "missing job.id" errors with SDK response shape tolerance (job.id or job.data.id) and comprehensive error logging per ticket specifications.
- **Service Health**: Startup healthcheck validates API key and scopes, sets global `__CC_DISABLED__` flag on failure to prevent conversions while preserving email ingestion.
- **Enhanced Job Creation**: Hardened `createCcHtmlJob()` with detailed HTTP status/response logging, CloudConvert error code capture, and defensive response validation treating non-objects as failures.
- **Retry Logic**: Exponential backoff for 429/5xx errors (max 3 attempts) with comprehensive error classification.
- **Error Handling**: Enhanced CloudConvertError class with retryable flags, structured Sentry logging, and detailed context capture.
- **HTML-to-PDF**: Robust email body conversion pipeline using CloudConvert Chrome engine with A4 layout and print background support via `convertEmailBodyHtmlToPdf()`.
- **Monitoring**: Integrated with metricsService for conversion duration, success rates, and failure pattern tracking.

### Security & Monitoring
- **Security**: Helmet middleware (HTTP headers), Express rate limiting, strict CORS.
- **Monitoring**: Sentry integration for error tracking and performance.
- **Health Checks**: Multi-subsystem health checks.

### Automated Systems
- **Automated Backup**: PostgreSQL and file storage backups to GCS.
- **CI/CD**: GitHub Actions for Docker builds and deployment.

### Email Processing
- **PUPPETEER REMOVAL COMPLETE (Aug 13, 2025)**: System now operates as CloudConvert-only architecture with zero browser dependencies. Removed 46 packages including puppeteer and @puppeteer/browsers. Comprehensive refactor of all email conversion services eliminates browser pools, executable path resolution, and headless browser management.
- **FS DEPENDENCIES REMOVAL COMPLETE (Aug 13, 2025)**: Eliminated all filesystem dependencies from email ingestion storage flow. Removed `require('fs')` calls from `unifiedEmailConversionService.ts` and implemented Buffer-based storage directly to GCS. Now supports non-Node runtime environments where "Dynamic require of 'fs' is not supported".
- **ENHANCED FALLBACK STORAGE COMPLETE (Aug 13, 2025)**: Implemented comprehensive fallback mechanism ensuring zero content loss during CloudConvert failures. When CloudConvert fails, email bodies are stored as text documents and attachments as original files with proper GCS integration and database tracking. Enhanced error handling with defensive programming prevents undefined access errors.
- **CloudConvert-Only Email Processing**: Pure CloudConvert API implementation for all email document conversions. HTML→PDF email body creation and multi-format attachment conversion (Office→PDF, Image→PDF) with robust error handling, retry logic, and engine selection (Chrome for HTML, LibreOffice for Office docs, ImageMagick for images).
- **TICKET 4 COMPLETE**: Unified email conversion service operates exclusively through CloudConvert with PDF_CONVERTER_ENGINE=cloudconvert environment override. Enhanced with comprehensive fallback mechanisms ensuring content preservation when CloudConvert unavailable. Analytics track both conversion success and fallback usage.
- **TICKET 6 COMPLETE**: Enhanced error handling, retries, and user-visible states for CloudConvert operations. Implements 3x exponential backoff retry policy, comprehensive error mapping (401/403→configuration_error, 422→skipped_password_protected, 415→skipped_unsupported, timeout→retried), and user-friendly status badges. Features Sentry integration with CloudConvert job tracking, ensures failures don't block original storage.
- **TICKET 7 COMPLETE**: Comprehensive observability & metrics system providing visibility into CloudConvert conversion performance. Emits structured metrics for pdf.convert.duration_ms{engine=cloudconvert,type}, success_total, error_total{reason}, and retry_total with Sentry breadcrumb integration. REST API endpoints (/api/metrics/performance, /api/metrics/email-summaries) provide dashboard consumption with memory-efficient metrics collection.
- **EMAIL ENGINE DECISION SYSTEM**: Database-backed feature flags enforce CloudConvert-only operation with PDF_CONVERTER_ENGINE environment override taking precedence. EMAIL_BODY_PDF_USE_CLOUDCONVERT and EMAIL_ATTACHMENT_CONVERT_TO_PDF flags maintain CloudConvert preferences with per-user rollout capabilities and comprehensive observability.
- **Email Metadata**: Exposure and filtering system for enhanced document discovery, including backfill for legacy attachments using Mailgun Events API.
- **Worker Configuration**: CloudConvert-based background worker with BullMQ for scalable PDF processing, with inline fallback when Redis unavailable. No browser management or executable detection required.
- **Buffer-Based Storage Architecture**: Email ingestion now uses direct Buffer-to-GCS upload pattern eliminating temporary filesystem operations. Supports email bodies, original attachments, and converted attachments with proper metadata tracking and object key structure.

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
- **PDF Processing**: `pdf-lib`, `puppeteer`
- **Document Conversion**: CloudConvert API integration via `node-fetch`
- **OCR**: `tesseract.js`
- **Cloud Storage**: `@google-cloud/storage`

### Email Services
- **Email Ingestion**: Mailgun webhook integration for email-to-document import.

### Monitoring and Security
- **Error Tracking**: `@sentry/node`, `@sentry/react`
- **Security Headers**: `helmet`
- **Rate Limiting**: `express-rate-limit`