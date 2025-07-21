import SwiftUI
import AuthenticationServices

@main
struct HomeDocsApp: App {
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