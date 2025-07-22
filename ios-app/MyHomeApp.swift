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

#Preview {
    ContentView()
        .environmentObject(AuthService())
        .environmentObject(DocumentViewModel())
}