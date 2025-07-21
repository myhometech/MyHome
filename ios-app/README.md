# HomeDocs iOS App

A native iOS document management application for homeowners to scan, organize, and store property-related documents.

## Features

### Core Functionality
- **Document Scanning**: Professional-quality document scanning using iOS VNDocumentCameraViewController
- **Smart Organization**: Automatic categorization with 8 predefined categories (Utilities, Insurance, Taxes, etc.)
- **Search & Filter**: Powerful search across document names and content with category filtering
- **Cloud Sync**: Real-time synchronization with existing HomeDocs backend
- **Offline Access**: View and organize documents without internet connection

### iOS-Specific Features
- **Sign in with Apple**: Secure authentication using Apple ID
- **Files App Integration**: Documents accessible through iOS Files app
- **Spotlight Search**: System-wide document search capabilities
- **Siri Shortcuts**: Voice commands for quick document scanning
- **Widgets**: Home screen widgets showing document stats
- **Face ID/Touch ID**: Biometric security for document access
- **Live Text**: Automatic text recognition and extraction from scanned documents

## Technical Requirements

### Development Environment
- **Xcode**: 15.0 or later
- **iOS Deployment Target**: iOS 16.0+
- **Swift**: 5.9+
- **Frameworks**: SwiftUI, Combine, CloudKit, Vision, VisionKit

### Backend Integration
- **API Endpoint**: Uses existing Node.js/Express backend
- **Authentication**: Integrates with Sign in with Apple
- **File Storage**: Hybrid approach - local storage with cloud backup
- **Real-time Sync**: WebSocket connection for live updates

## Architecture

### MVVM Pattern
```
Views (SwiftUI) → ViewModels (ObservableObject) → Models (Codable) → Services (API/Storage)
```

### Key Components
1. **DocumentScannerView**: Camera-based document scanning
2. **DocumentListView**: Grid/list view of documents with search
3. **CategoryFilterView**: Category-based filtering system
4. **DocumentDetailView**: Full document preview and actions
5. **SettingsView**: App preferences and account management

### Data Flow
1. **Local First**: Documents stored locally with Core Data
2. **Background Sync**: Automatic sync when network available
3. **Conflict Resolution**: Last-write-wins with user notification
4. **Offline Mode**: Full functionality without internet

## Setup Instructions

### 1. Clone and Setup
```bash
# Create new Xcode project
# Copy the iOS app files from this specification
# Configure signing and capabilities
```

### 2. Configure Backend Integration
```swift
// Update APIService.swift with your backend URL
let baseURL = "https://your-homedocs-backend.replit.app"
```

### 3. Enable Required Capabilities
- Sign in with Apple
- Camera access
- Document scanning
- CloudKit (optional)
- Background App Refresh

### 4. Run and Test
- Test document scanning functionality
- Verify backend API integration
- Test offline/online sync scenarios

## File Structure

```
HomeDocs/
├── App/
│   ├── HomeDocsApp.swift           # App entry point
│   └── ContentView.swift           # Root view
├── Models/
│   ├── Document.swift              # Document data model
│   ├── Category.swift              # Category data model
│   └── User.swift                  # User data model
├── Views/
│   ├── DocumentScannerView.swift   # Document scanning
│   ├── DocumentListView.swift      # Document grid/list
│   ├── DocumentDetailView.swift    # Document preview
│   ├── CategoryFilterView.swift    # Category filtering
│   └── SettingsView.swift          # App settings
├── ViewModels/
│   ├── DocumentViewModel.swift     # Document management logic
│   ├── ScannerViewModel.swift      # Scanning logic
│   └── SettingsViewModel.swift     # Settings logic
├── Services/
│   ├── APIService.swift            # Backend communication
│   ├── DocumentStorage.swift       # Local storage
│   ├── AuthService.swift           # Authentication
│   └── SyncService.swift           # Data synchronization
├── Utils/
│   ├── ImageProcessing.swift       # Image enhancement
│   ├── FileManager+Extensions.swift
│   └── UserDefaults+Extensions.swift
└── Resources/
    ├── Assets.xcassets             # App icons and images
    └── Info.plist                  # App configuration
```

## Next Steps

1. **Create Xcode Project**: New iOS app with SwiftUI
2. **Implement Core Views**: Start with DocumentScannerView
3. **Backend Integration**: Connect to existing API
4. **Testing**: Test on physical device for camera functionality
5. **App Store**: Prepare for submission

## Migration from Web App

Users can:
1. **Sign in**: Use same account across web and iOS
2. **Sync Documents**: All documents automatically sync
3. **Seamless Experience**: Start on web, continue on iOS

This iOS app provides the full functionality of the web version with enhanced mobile-specific features and iOS system integration.