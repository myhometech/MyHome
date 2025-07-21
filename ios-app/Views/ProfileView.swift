import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var documentViewModel: DocumentViewModel
    @State private var showingSignOutAlert = false
    
    var body: some View {
        NavigationView {
            List {
                // Profile Header
                Section {
                    HStack(spacing: 16) {
                        AsyncImage(url: URL(string: authService.user?.profileImageUrl ?? "")) { image in
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                        } placeholder: {
                            Circle()
                                .fill(Color.blue)
                                .overlay(
                                    Text(authService.user?.initials ?? "U")
                                        .foregroundColor(.white)
                                        .font(.title2)
                                        .fontWeight(.medium)
                                )
                        }
                        .frame(width: 60, height: 60)
                        .clipShape(Circle())
                        
                        VStack(alignment: .leading, spacing: 4) {
                            Text(authService.user?.displayName ?? "User")
                                .font(.title2)
                                .fontWeight(.semibold)
                            
                            if let email = authService.user?.email {
                                Text(email)
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }
                        }
                        
                        Spacer()
                    }
                    .padding(.vertical, 8)
                }
                
                // Statistics
                Section(header: Text("Statistics")) {
                    StatRow(label: "Total Documents", value: "\(documentViewModel.totalDocuments)")
                    StatRow(label: "Storage Used", value: documentViewModel.formattedTotalSize)
                    StatRow(label: "Categories", value: "\(documentViewModel.categoriesInUse)")
                }
                
                // Settings
                Section(header: Text("Settings")) {
                    NavigationLink(destination: SettingsView()) {
                        Label("App Settings", systemImage: "gear")
                    }
                    
                    NavigationLink(destination: AboutView()) {
                        Label("About", systemImage: "info.circle")
                    }
                    
                    Button(action: { showingSignOutAlert = true }) {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                            .foregroundColor(.red)
                    }
                }
            }
            .navigationTitle("Profile")
        }
        .alert("Sign Out", isPresented: $showingSignOutAlert) {
            Button("Cancel", role: .cancel) { }
            Button("Sign Out", role: .destructive) {
                authService.signOut()
            }
        } message: {
            Text("Are you sure you want to sign out?")
        }
    }
}

struct StatRow: View {
    let label: String
    let value: String
    
    var body: some View {
        HStack {
            Text(label)
            Spacer()
            Text(value)
                .fontWeight(.medium)
                .foregroundColor(.secondary)
        }
    }
}

struct SettingsView: View {
    @State private var notificationsEnabled = true
    @State private var autoSync = true
    
    var body: some View {
        List {
            Section(header: Text("Notifications")) {
                Toggle("Enable Notifications", isOn: $notificationsEnabled)
            }
            
            Section(header: Text("Sync")) {
                Toggle("Auto Sync", isOn: $autoSync)
            }
            
            Section(header: Text("Storage")) {
                Button("Clear Cache") {
                    // Implement cache clearing
                }
                .foregroundColor(.blue)
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct AboutView: View {
    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text("HomeDocs")
                        .font(.title2)
                        .fontWeight(.bold)
                    
                    Text("Version 1.0.0")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    
                    Text("Document management made simple")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 8)
            }
            
            Section(header: Text("Features")) {
                Text("• Professional document scanning")
                Text("• Smart categorization")
                Text("• Secure cloud storage")
                Text("• Cross-device sync")
                Text("• Advanced search")
            }
            
            Section(header: Text("Support")) {
                Link("Privacy Policy", destination: URL(string: "https://example.com/privacy")!)
                Link("Terms of Service", destination: URL(string: "https://example.com/terms")!)
                Link("Contact Support", destination: URL(string: "mailto:support@example.com")!)
            }
        }
        .navigationTitle("About")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    ProfileView()
        .environmentObject(AuthService())
        .environmentObject(DocumentViewModel())
}