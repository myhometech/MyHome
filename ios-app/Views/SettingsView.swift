import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var authService: AuthService
    
    var body: some View {
        NavigationStack {
            List {
                Section("Account") {
                    if let user = authService.user {
                        Text("Logged in as: \(user.email ?? "Unknown")")
                    }
                    
                    Button("Sign Out") {
                        authService.signOut()
                    }
                    .foregroundColor(.red)
                }
            }
            .navigationTitle("Settings")
        }
    }
}

#Preview {
    SettingsView()
        .environmentObject(AuthService())
}