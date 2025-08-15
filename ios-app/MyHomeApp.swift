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
                .onOpenURL { url in
                    handleIncomingURL(url)
                }
        }
    }
    
    // MARK: - URL Handling
    
    private func handleIncomingURL(_ url: URL) {
        print("📱 Received URL: \(url)")
        
        if url.scheme == "myhome" {
            // Handle custom URL scheme from Genius Scan or other apps
            if url.host == "import" {
                handleDocumentImport(from: url)
            }
        } else if url.isFileURL {
            // Handle direct file sharing
            handleFileImport(from: url)
        }
    }
    
    private func handleDocumentImport(from url: URL) {
        // Parse Genius Scan callback or other document scanning app callbacks
        print("📄 Handling document import from: \(url)")
        // Implementation would depend on Genius Scan's callback format
    }
    
    private func handleFileImport(from url: URL) {
        print("📁 Handling file import: \(url)")
        
        guard url.startAccessingSecurityScopedResource() else {
            print("❌ Failed to access security scoped resource")
            return
        }
        
        defer {
            url.stopAccessingSecurityScopedResource()
        }
        
        do {
            let data = try Data(contentsOf: url)
            let filename = url.deletingPathExtension().lastPathComponent
            
            // Determine if it's a PDF or image
            if url.pathExtension.lowercased() == "pdf" {
                importPDFDocument(data: data, name: filename)
            } else {
                importImageDocument(data: data, name: filename)
            }
        } catch {
            print("❌ Failed to read file: \(error)")
        }
    }
    
    private func importPDFDocument(data: Data, name: String) {
        // For PDF files, we upload them directly
        documentViewModel.uploadPDFDocument(pdfData: data, name: name, category: nil, tags: [])
    }
    
    private func importImageDocument(data: Data, name: String) {
        guard let image = UIImage(data: data) else {
            print("❌ Failed to create image from data")
            return
        }
        
        documentViewModel.uploadDocument(image: image, name: name, category: nil, tags: [])
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

#Preview {
    ContentView()
        .environmentObject(AuthService())
        .environmentObject(DocumentViewModel())
}