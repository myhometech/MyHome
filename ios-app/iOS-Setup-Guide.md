# MyHome iOS App Setup Guide

## Getting Started

This guide will help you create the native iOS version of MyHome using the code structure I've provided.

## Prerequisites

- **macOS** with Xcode 15.0 or later
- **iOS 16.0+** deployment target
- **Apple Developer Account** (for device testing and App Store)
- **HomeDocs Backend** running (your current Replit backend)

## Step 1: Create New Xcode Project

1. Open Xcode
2. Create a new project
3. Choose **iOS** → **App**
4. Configure your project:
   - Product Name: `MyHome`
   - Interface: `SwiftUI`
   - Language: `Swift`
   - Use Core Data: `No` (we'll use our custom storage)

## Step 2: Add the iOS Code

1. **Copy Files**: Take all the Swift files from the `ios-app/` folder I created
2. **Add to Xcode**: Drag and drop them into your Xcode project
3. **Create Folder Structure**:
   ```
   MyHome/
   ├── App/
   ├── Models/
   ├── Views/
   ├── ViewModels/
   ├── Services/
   └── Utils/
   ```

## Step 3: Configure Capabilities

In your project settings, enable these capabilities:

### Sign in with Apple
1. Go to **Signing & Capabilities**
2. Click **+ Capability**
3. Add **Sign in with Apple**

### Camera Access
1. Open `Info.plist`
2. Add these keys:
   ```xml
   <key>NSCameraUsageDescription</key>
   <string>HomeDocs needs camera access to scan documents</string>
   
   <key>NSPhotoLibraryUsageDescription</key>
   <string>HomeDocs needs photo library access to import documents</string>
   ```

### Document Scanning
The app uses `VisionKit` which is automatically available on iOS 13+.

## Step 4: Update Backend Configuration

1. **Open `APIService.swift`**
2. **Update the base URL**:
   ```swift
   private let baseURL = "https://your-actual-backend-url.replit.app"
   ```

3. **Test Backend Connection**:
   - Make sure your Replit backend is running
   - Test the `/api/categories` endpoint works
   - Verify authentication endpoints are accessible

## Step 5: Add Missing Views

I've created the core structure. You'll need to add these additional views:

### CategoryFilterView
```swift
struct CategoryFilterView: View {
    let categories: [Category]
    @Binding var selectedCategory: Category?
    
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                CategoryButton(title: "All", isSelected: selectedCategory == nil) {
                    selectedCategory = nil
                }
                
                ForEach(categories) { category in
                    CategoryButton(title: category.name, isSelected: selectedCategory?.id == category.id) {
                        selectedCategory = category
                    }
                }
            }
            .padding(.horizontal)
        }
    }
}
```

### DocumentGridCard & DocumentListCard
```swift
struct DocumentGridCard: View {
    let document: Document
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Document icon and type
            HStack {
                Image(systemName: document.fileIcon)
                    .foregroundColor(.blue)
                Spacer()
                Text(document.formattedFileSize)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
            
            Text(document.name)
                .font(.headline)
                .lineLimit(2)
            
            Text(document.uploadedAt, style: .date)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }
}
```

## Step 6: Test Core Functionality

### Basic Testing Order:
1. **Authentication**: Test Sign in with Apple
2. **Categories**: Verify categories load from backend
3. **Document Scanning**: Test camera functionality
4. **Document Upload**: Test image upload to backend
5. **Document List**: Verify documents display correctly
6. **Search & Filter**: Test search and category filtering

### Device Testing:
- **Camera features require physical device** (not simulator)
- Test on iPhone with good camera quality
- Verify document scanning accuracy

## Step 7: Backend Integration Testing

1. **API Endpoints**: Test all endpoints work with iOS app
2. **Authentication**: Verify Sign in with Apple integrates with your auth system
3. **File Upload**: Ensure multipart form upload works correctly
4. **Error Handling**: Test offline scenarios and network errors

## Step 8: iOS-Specific Enhancements

### Add Siri Shortcuts
```swift
import Intents

// Add this to your main app file
func setupSiriShortcuts() {
    let intent = ScanDocumentIntent()
    intent.suggestedInvocationPhrase = "Scan a document"
    
    let interaction = INInteraction(intent: intent, response: nil)
    interaction.donate { error in
        if let error = error {
            print("Failed to donate shortcut: \(error)")
        }
    }
}
```

### Add Spotlight Search
```swift
import CoreSpotlight
import MobileCoreServices

func indexDocumentForSpotlight(_ document: Document) {
    let attributeSet = CSSearchableItemAttributeSet(itemContentType: kUTTypeText as String)
    attributeSet.title = document.name
    attributeSet.contentDescription = "Document in HomeDocs"
    
    let item = CSSearchableItem(uniqueIdentifier: "document_\(document.id)", domainIdentifier: "homedocs.documents", attributeSet: attributeSet)
    
    CSSearchableIndex.default().indexSearchableItems([item]) { error in
        if let error = error {
            print("Indexing error: \(error)")
        }
    }
}
```

## Step 9: Polish and Testing

### Visual Polish:
- Test on different iPhone sizes
- Verify dark mode support
- Test accessibility features
- Optimize for iPad (if desired)

### Performance:
- Test with large numbers of documents
- Optimize image loading and caching
- Test offline functionality

### App Store Preparation:
- Add app icons (all required sizes)
- Create screenshots for App Store
- Write app description
- Set up app metadata

## Step 10: Advanced Features (Optional)

### Widgets
Create home screen widgets showing document stats:

```swift
struct DocumentStatsWidget: Widget {
    let kind: String = "DocumentStatsWidget"
    
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DocumentStatsProvider()) { entry in
            DocumentStatsWidgetView(entry: entry)
        }
        .configurationDisplayName("Document Stats")
        .description("View your document statistics")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
```

### Live Text Integration
Use iOS Live Text to extract text from scanned documents automatically.

### Files App Integration
Make documents appear in the iOS Files app for easy access.

## Common Issues and Solutions

### Camera Not Working
- Check device permissions
- Test on physical device (not simulator)
- Verify `Info.plist` camera usage description

### Backend Connection Issues
- Check network permissions
- Verify HTTPS endpoints
- Test API endpoints manually first

### Sign in with Apple Issues
- Verify Apple Developer Account setup
- Check app identifier configuration
- Test on different devices

## Next Steps

1. **Create the Xcode project**
2. **Add the code I provided**
3. **Configure your backend URL**
4. **Test on device**
5. **Submit to App Store**

The iOS app will provide a much better mobile experience than the web version, with features like:
- Professional document scanning
- Native iOS integration
- Offline access
- Face ID/Touch ID security
- Siri shortcuts
- System-wide search

Your users will be able to seamlessly move between the web app and iOS app with all their documents synchronized.