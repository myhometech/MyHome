# Complete Step-by-Step Guide: HomeDocs iOS App in Xcode

## What You'll Need

- **Mac computer** with macOS 12.0 or later
- **Xcode 15.0+** (free from Mac App Store)
- **Your Replit backend URL** (we'll find this below)
- **Apple Developer Account** ($99/year, only needed for App Store publishing)

## Step 1: Get Your Backend URL

Your current backend is running at: `https://your-replit-domain.replit.app`

To find your exact URL:
1. Look at your browser address bar when using the web app
2. Or check your Replit project settings
3. It should look like: `https://[your-project-name].[your-username].replit.app`

## Step 2: Download and Install Xcode

1. Open **Mac App Store**
2. Search for "Xcode"
3. Click **Get** (it's free, about 6GB download)
4. Wait for installation to complete
5. Open Xcode and accept license agreements

## Step 3: Create New iOS Project

1. **Open Xcode**
2. Click **"Create a new Xcode project"**
3. Choose **iOS** tab at top
4. Select **App** template
5. Click **Next**

### Project Configuration:
- **Product Name**: `HomeDocs`
- **Team**: Select your Apple ID (sign in if needed)
- **Organization Identifier**: `com.yourname.homedocs` (use your name)
- **Bundle Identifier**: Will auto-fill as `com.yourname.homedocs`
- **Language**: `Swift`
- **Interface**: `SwiftUI`
- **Use Core Data**: ❌ (unchecked)

6. Click **Next**
7. Choose where to save project (Desktop is fine)
8. Click **Create**

## Step 4: Set Up Project Structure

Now you'll copy all the iOS code into your new Xcode project.

### 4.1: Create Folder Groups in Xcode

In the left sidebar (Project Navigator):

1. **Right-click** on "HomeDocs" folder (blue icon)
2. Select **"New Group"**
3. Name it **"Models"**
4. Repeat to create these groups:
   - **Views**
   - **ViewModels** 
   - **Services**

Your project structure should look like:
```
HomeDocs/
├── Models/
├── Views/
├── ViewModels/
├── Services/
├── HomeDocsApp.swift (already exists)
└── ContentView.swift (already exists)
```

### 4.2: Add the iOS Code Files

Now you'll copy each file from the ios-app folder into Xcode:

#### Copy Models (3 files):
1. **Right-click** "Models" group in Xcode
2. Select **"New File"**
3. Choose **iOS** → **Swift File**
4. Name: `User.swift`
5. Replace contents with the User.swift code from ios-app/Models/
6. Repeat for `Document.swift` and `Category.swift`

#### Copy Views (8 files):
1. **Right-click** "Views" group
2. Add these Swift files:
   - `LandingView.swift`
   - `DocumentListView.swift`
   - `DocumentScannerView.swift`
   - `DocumentDetailView.swift`
   - `CategoryPickerView.swift`
   - `CategoryFilterView.swift`
   - `DocumentGridCard.swift`
   - `ProfileView.swift`

#### Copy ViewModels (1 file):
1. **Right-click** "ViewModels" group
2. Add: `DocumentViewModel.swift`

#### Copy Services (3 files):
1. **Right-click** "Services" group
2. Add these Swift files:
   - `AuthService.swift`
   - `APIService.swift`
   - `DocumentStorage.swift`

#### Update Main App File:
1. **Click** on `HomeDocsApp.swift` in Xcode
2. Replace its contents with the code from ios-app/App/HomeDocsApp.swift

## Step 5: Add Required Capabilities

### 5.1: Enable Sign in with Apple
1. Click on **"HomeDocs"** project (blue icon at top)
2. Select **"HomeDocs"** target
3. Click **"Signing & Capabilities"** tab
4. Click **"+ Capability"** button
5. Search for and add **"Sign in with Apple"**

### 5.2: Add Camera Permissions
1. Click on **"Info"** tab (next to Signing & Capabilities)
2. **Right-click** in the info list
3. Select **"Add Row"**
4. Type: `NSCameraUsageDescription`
5. Set value: `HomeDocs needs camera access to scan documents`
6. Add another row: `NSPhotoLibraryUsageDescription`
7. Set value: `HomeDocs needs photo library access to import documents`

## Step 6: Update Backend URL

1. **Open** `APIService.swift` in Xcode
2. **Find line 5** that says:
   ```swift
   private let baseURL = "https://your-homedocs-backend.replit.app"
   ```
3. **Replace** with your actual backend URL:
   ```swift
   private let baseURL = "https://[your-actual-replit-url].replit.app"
   ```

## Step 7: Build and Test

### 7.1: First Build
1. **Select** iPhone simulator from device menu (top center)
2. **Press** Command+R (or click ▶️ play button)
3. Wait for build to complete
4. App should launch in simulator

### 7.2: Test on Real Device (Recommended)
For camera features, you need a real iPhone:

1. **Connect** your iPhone to Mac with USB cable
2. **Trust** the computer on iPhone if prompted
3. **Select** your iPhone from device menu in Xcode
4. **Press** Command+R to build and run
5. **Trust** the developer certificate on iPhone (Settings → General → VPN & Device Management)

## Step 8: Test Core Features

### What Should Work:
- ✅ App opens with Sign in with Apple button
- ✅ Categories load from your backend
- ✅ Document scanning with camera (on real device)
- ✅ Document upload to backend
- ✅ View documents from web app

### If Something Doesn't Work:
1. **Check Console** (bottom panel in Xcode) for error messages
2. **Verify backend URL** is correct
3. **Test backend** is accessible from your phone's browser
4. **Check permissions** are granted

## Step 9: Customize Your App

### 9.1: App Icon
1. **Open** Assets.xcassets in Xcode
2. **Click** AppIcon
3. **Drag** your app icon images into the slots
4. Use 1024x1024 pixels for App Store icon

### 9.2: App Name & Info
1. **Click** project name → **General** tab
2. **Change** Display Name if desired
3. **Set** Version (start with 1.0)
4. **Set** Build number (start with 1)

## Step 10: Test Everything Works

### Final Testing Checklist:
- [ ] Sign in with Apple works
- [ ] Can see documents from web app
- [ ] Camera scanning works on device
- [ ] Scanned documents appear in web app
- [ ] Categories and search work
- [ ] App doesn't crash

## Step 11: Prepare for App Store (Optional)

### If you want to publish:
1. **Join** Apple Developer Program ($99/year)
2. **Create** App Store listing
3. **Add** screenshots and description
4. **Submit** for review

## Troubleshooting Common Issues

### Build Errors:
- **Clean build**: Product → Clean Build Folder
- **Restart** Xcode
- **Check** all files are added properly

### Camera Not Working:
- **Test on real device** (not simulator)
- **Check** camera permissions granted
- **Verify** Info.plist permissions added

### Backend Connection Issues:
- **Test** backend URL in Safari
- **Check** network permissions
- **Verify** HTTPS (not HTTP)

## Your iOS App Features

Once working, your iPhone app will have:

- **Professional document scanning** with iPhone camera
- **Automatic text recognition** from scanned documents
- **Smart categorization** with visual category picker
- **Seamless sync** with your web app
- **Offline access** to previously scanned documents
- **Native iOS look and feel**
- **Face ID/Touch ID** security (can be added)
- **iOS Files app integration** (can be added)

## What's Different from Web App

The iOS app provides:
- **Better mobile experience** than web browser
- **Camera-based scanning** instead of file uploads
- **Offline capabilities** for viewing documents
- **Native iOS integration** with system features
- **App Store distribution** for easy installation

Your users can now seamlessly switch between the web app on their computer and the iOS app on their phone, with all documents automatically syncing between both platforms!