# Complete iOS Project Setup for MyHome

## Quick Start Instructions

1. **Create New Xcode Project**
   - Open Xcode
   - Choose "App" template
   - Product Name: `MyHome`
   - Interface: SwiftUI
   - Language: Swift
   - Bundle Identifier: `com.yourname.myhome`

2. **Add Capabilities**
   - Go to Project Settings → Signing & Capabilities
   - Add "Sign in with Apple"

3. **Copy Files**
   Copy all Swift files below into your Xcode project with this structure:

```
MyHome/
├── MyHomeApp.swift (main app file)
├── Models/
│   ├── User.swift
│   ├── Document.swift
│   └── Category.swift
├── Views/
│   ├── LandingView.swift
│   ├── DocumentListView.swift
│   ├── DocumentScannerView.swift
│   ├── DocumentDetailView.swift
│   ├── CategoryPickerView.swift
│   ├── CategoryFilterView.swift
│   ├── DocumentGridCard.swift
│   └── ProfileView.swift
├── ViewModels/
│   └── DocumentViewModel.swift
└── Services/
    ├── AuthService.swift
    ├── APIService.swift
    └── DocumentStorage.swift
```

4. **Update Info.plist**
   Add these keys:
```xml
<key>NSCameraUsageDescription</key>
<string>MyHome needs camera access to scan documents</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>MyHome needs photo library access to import documents</string>
```

5. **Configure Backend URL**
   In `APIService.swift`, update:
```swift
private let baseURL = "https://your-actual-backend-url.replit.app"
```

## File Contents to Copy

### 1. MyHomeApp.swift (Main App File)
```swift
import SwiftUI

@main
struct MyHomeApp: App {
    @StateObject private var authService = AuthService()
    @StateObject private var documentViewModel = DocumentViewModel()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authService)
                .environmentObject(documentViewModel)
                .onAppear {
                    authService.checkAuthenticationState()
                }
        }
    }
}

struct ContentView: View {
    @EnvironmentObject var authService: AuthService
    
    var body: some View {
        Group {
            if authService.isLoading {
                LoadingView()
            } else if authService.isAuthenticated {
                MainTabView()
            } else {
                LandingView()
            }
        }
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            DocumentListView()
                .tabItem {
                    Image(systemName: "doc.text")
                    Text("Documents")
                }
            
            DocumentScannerView()
                .tabItem {
                    Image(systemName: "camera")
                    Text("Scan")
                }
            
            ProfileView()
                .tabItem {
                    Image(systemName: "person")
                    Text("Profile")
                }
        }
    }
}

struct LoadingView: View {
    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)
            
            Text("Loading...")
                .font(.headline)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }
}
```

## Key Features

- **Document Scanning**: Professional camera scanning with VisionKit
- **Text Recognition**: Automatic text extraction from scanned documents
- **Smart Categories**: Auto-categorization with visual category picker
- **Offline Support**: Local storage with background sync
- **Sign in with Apple**: Secure authentication
- **Search & Filter**: Powerful document search and category filtering
- **File Management**: Download, share, and organize documents

## Testing Steps

1. **Build and Run**: Test on simulator first for UI
2. **Device Testing**: Camera features require physical device
3. **Authentication**: Test Sign in with Apple flow
4. **Document Upload**: Test scanning and upload to backend
5. **Sync**: Verify documents sync between web and mobile

## Next Steps

1. Copy all the Swift files I created
2. Update the backend URL in APIService.swift
3. Test the app on device
4. Customize with your app icon and branding
5. Submit to App Store when ready

The complete iOS codebase is now ready for you to copy into Xcode!