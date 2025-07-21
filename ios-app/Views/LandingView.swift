import SwiftUI
import AuthenticationServices

struct LandingView: View {
    @EnvironmentObject var authService: AuthService
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            VStack(spacing: 16) {
                // Logo and Title
                VStack(spacing: 12) {
                    Image(systemName: "house.circle.fill")
                        .font(.system(size: 80))
                        .foregroundColor(.blue)
                    
                    Text("HomeDocs")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    
                    Text("Organize Your Home Documents Effortlessly")
                        .font(.title3)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }
                .padding(.top, 60)
                
                // Features
                VStack(spacing: 20) {
                    FeatureRow(
                        icon: "camera.viewfinder",
                        title: "Scan Documents",
                        description: "Use your camera to quickly scan and upload documents"
                    )
                    
                    FeatureRow(
                        icon: "folder.fill",
                        title: "Smart Organization",
                        description: "Automatically categorize by utilities, insurance, taxes, and more"
                    )
                    
                    FeatureRow(
                        icon: "magnifyingglass",
                        title: "Quick Search",
                        description: "Find any document instantly with powerful search"
                    )
                    
                    FeatureRow(
                        icon: "shield.fill",
                        title: "Secure Storage",
                        description: "Your documents are encrypted and stored securely"
                    )
                }
                .padding(.horizontal, 32)
                .padding(.top, 40)
            }
            
            Spacer()
            
            // Sign In Button
            VStack(spacing: 16) {
                SignInWithAppleButton(.signIn) { request in
                    authService.handleSignInWithAppleRequest(request)
                } onCompletion: { result in
                    authService.handleSignInWithAppleCompletion(result)
                }
                .frame(height: 50)
                .cornerRadius(8)
                .padding(.horizontal, 32)
                
                Text("Sign in to start organizing your documents")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .padding(.bottom, 50)
        }
        .background(
            LinearGradient(
                colors: [Color.blue.opacity(0.1), Color.white],
                startPoint: .top,
                endPoint: .bottom
            )
        )
    }
}

struct FeatureRow: View {
    let icon: String
    let title: String
    let description: String
    
    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundColor(.blue)
                .frame(width: 30)
            
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)
                    .fontWeight(.semibold)
                
                Text(description)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
        }
    }
}

#Preview {
    LandingView()
        .environmentObject(AuthService())
}