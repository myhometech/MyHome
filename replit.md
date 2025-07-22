# MyHome Application

## Overview

MyHome is a comprehensive document management application for homeowners to organize property-related documents. The project includes a complete web application (React + Node.js) and a native iOS app with advanced camera scanning capabilities. Both versions sync through a shared backend API with PostgreSQL database and simple authentication.

**Latest Update**: Changed branding from 'HomeDocs' to 'MyHome' throughout the application. Updated all client-side components, iOS documentation, and project files to reflect the new brand name. Also simplified authentication system to use only email/password authentication with bcrypt hashing and PostgreSQL session storage.

## User Preferences

Preferred communication style: Simple, everyday language.
Project Direction: Building iOS version of MyHome document management app.
Essential Features: Phone camera scanning for document digitization, future Google Drive integration planned.

## System Architecture

### Web Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for development and bundling
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query (React Query) for server state
- **UI Framework**: Radix UI components with Tailwind CSS styling
- **Component Library**: shadcn/ui for consistent design system

### iOS Native Architecture
- **Framework**: SwiftUI for iOS 16.0+
- **Authentication**: Sign in with Apple integration
- **Document Scanning**: VisionKit with VNDocumentCameraViewController
- **Text Recognition**: Vision framework with VNRecognizeTextRequest
- **Storage**: CoreData alternative with local file system + API sync
- **State Management**: ObservableObject with Combine framework
- **Offline Support**: Local document storage with background sync

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Authentication**: Replit Auth with OpenID Connect (web) + Apple Sign In (iOS)
- **Session Management**: Express sessions with PostgreSQL storage
- **File Uploads**: Multer for handling multipart form data
- **API Design**: RESTful endpoints with JSON responses

## Key Components

### Database Layer
- **ORM**: Drizzle ORM for type-safe database queries
- **Database**: PostgreSQL (configured for Neon serverless)
- **Schema**: 
  - Users table (required for Replit Auth)
  - Sessions table (required for session storage)
  - Categories table for document organization
  - Documents table for file metadata and storage

### Authentication System
- **Provider**: Simple email/password authentication only
- **Password Security**: bcrypt hashing with salt rounds
- **Session Storage**: PostgreSQL-backed sessions with express-session
- **Authorization**: Route-level authentication middleware
- **User Management**: Manual registration and login system

### File Management
- **Storage**: Local filesystem with configurable upload directory
- **Supported Formats**: PDF, JPEG, PNG, WebP
- **File Size Limit**: 10MB per file
- **Security**: File type validation and secure filename generation

### Document Organization
- **Categories**: Predefined categories with icons and colors
- **Search**: Text-based search functionality
- **Filtering**: Category-based filtering
- **Views**: Grid and list view modes
- **Tags**: Optional tagging system for documents

## Data Flow

1. **Authentication Flow**:
   - User initiates login via Replit Auth
   - OIDC authentication with Replit services
   - Session creation in PostgreSQL
   - User profile synchronization

2. **Document Upload Flow**:
   - File selection via drag-and-drop or file picker
   - Client-side validation (file type, size)
   - Multipart form submission to backend
   - Server-side validation and storage
   - Database record creation
   - Client state invalidation and refresh

3. **Document Retrieval Flow**:
   - API requests with authentication headers
   - Database queries with optional filtering
   - JSON response with document metadata
   - Client-side rendering with React components

## External Dependencies

### Core Framework Dependencies
- **React Ecosystem**: react, react-dom, @tanstack/react-query
- **Backend**: express, typescript, tsx for development
- **Database**: drizzle-orm, @neondatabase/serverless
- **Authentication**: openid-client, passport, express-session

### UI and Styling
- **Component Library**: @radix-ui/* components
- **Styling**: tailwindcss, class-variance-authority
- **Icons**: lucide-react
- **Utilities**: clsx, tailwind-merge

### File Handling
- **Upload Processing**: multer
- **File Validation**: Built-in Node.js modules

## Deployment Strategy

### Development Environment
- **Development Server**: Vite dev server with HMR
- **Backend Server**: tsx for TypeScript execution
- **Database**: Development PostgreSQL instance
- **Session Store**: PostgreSQL-based session storage

### Production Build
- **Frontend**: Vite production build to `dist/public`
- **Backend**: esbuild compilation to `dist/index.js`
- **Static Assets**: Served via Express static middleware
- **Environment**: NODE_ENV-based configuration

### Environment Configuration
- **Required Variables**:
  - `DATABASE_URL`: PostgreSQL connection string
  - `SESSION_SECRET`: Session encryption key
  - `GOOGLE_CLIENT_ID`: Google OAuth client ID
  - `GOOGLE_CLIENT_SECRET`: Google OAuth client secret
  - `OPENAI_API_KEY`: OpenAI API key for OCR and AI features
- **Optional Variables**:
  - `REPL_ID`: Replit environment identifier (for legacy auth)
  - `ISSUER_URL`: OIDC issuer endpoint (for legacy auth)
  - `SENDGRID_API_KEY`: Email service for notifications
  - `PERPLEXITY_API_KEY`: Enhanced AI document analysis

### Scaling Considerations
- Database migrations via Drizzle Kit
- Session cleanup and management
- File storage scaling (currently local filesystem)
- CDN integration for static assets

The application follows a standard full-stack architecture with clear separation of concerns, type safety throughout, and modern development practices for maintainability and scalability.