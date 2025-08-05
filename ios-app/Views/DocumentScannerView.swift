import SwiftUI
import UIKit

struct DocumentScannerView: View {
    @EnvironmentObject var documentViewModel: DocumentViewModel
    @State private var showingInstallDialog = false
    @State private var isLaunchingGeniusScan = false
    @State private var alertMessage = ""
    @State private var showAlert = false
    
    var body: some View {
        NavigationView {
            VStack(spacing: 24) {
                // Header
                VStack(spacing: 8) {
                    Image(systemName: "camera.viewfinder")
                        .font(.system(size: 60))
                        .foregroundColor(.blue)
                    
                    Text("Scan Documents")
                        .font(.title2)
                        .fontWeight(.semibold)
                    
                    Text("Use Genius Scan app for professional document scanning")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 40)
                
                Spacer()
                
                // Scan Options
                VStack(spacing: 16) {
                    Button(action: {
                        launchGeniusScan()
                    }) {
                        HStack {
                            Image(systemName: "camera")
                            Text(isLaunchingGeniusScan ? "Launching..." : "Open Genius Scan")
                        }
                        .font(.headline)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(isLaunchingGeniusScan ? Color.gray : Color.blue)
                        .cornerRadius(12)
                    }
                    .disabled(isLaunchingGeniusScan)
                    
                    Button(action: {
                        openAppStore()
                    }) {
                        HStack {
                            Image(systemName: "arrow.down.app")
                            Text("Get Genius Scan")
                        }
                        .font(.headline)
                        .foregroundColor(.blue)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue.opacity(0.1))
                        .cornerRadius(12)
                    }
                }
                .padding(.horizontal, 32)
                
                // Information Card
                VStack(alignment: .leading, spacing: 12) {
                    Text("About Genius Scan")
                        .font(.headline)
                        .padding(.horizontal)
                    
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                            Text("Professional document scanning")
                        }
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                            Text("Automatic edge detection")
                        }
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                            Text("Multi-page PDF creation")
                        }
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                            Text("Advanced image enhancement")
                        }
                    }
                    .font(.subheadline)
                    .padding(.horizontal)
                }
                
                Spacer()
                
                // Usage Instructions
                VStack(alignment: .leading, spacing: 8) {
                    Text("How to use:")
                        .font(.headline)
                        .padding(.bottom, 4)
                    
                    VStack(alignment: .leading, spacing: 4) {
                        Label("1. Tap 'Open Genius Scan'", systemImage: "1.circle")
                        Label("2. Scan your documents in Genius Scan", systemImage: "2.circle")
                        Label("3. Share back to MyHome when done", systemImage: "3.circle")
                    }
                }
                .font(.caption)
                .foregroundColor(.secondary)
                .padding(.horizontal)
                
                Spacer()
            }
            .navigationTitle("Scan")
            .navigationBarTitleDisplayMode(.inline)
        }
        .alert("Genius Scan", isPresented: $showAlert) {
            Button("OK") { }
        } message: {
            Text(alertMessage)
        }
    }
    
    // MARK: - Genius Scan Integration Functions
    
    private func launchGeniusScan() {
        isLaunchingGeniusScan = true
        
        guard let url = URL(string: "geniusscan://") else {
            showError("Invalid URL scheme")
            return
        }
        
        if UIApplication.shared.canOpenURL(url) {
            UIApplication.shared.open(url) { success in
                DispatchQueue.main.async {
                    self.isLaunchingGeniusScan = false
                    if success {
                        self.showSuccess("Genius Scan launched successfully!")
                    } else {
                        self.showError("Failed to launch Genius Scan")
                    }
                }
            }
        } else {
            // App not installed, show install dialog
            isLaunchingGeniusScan = false
            showInstallDialog()
        }
    }
    
    private func openAppStore() {
        guard let url = URL(string: "https://apps.apple.com/app/genius-scan-pdf-scanner/id377672876") else {
            showError("Invalid App Store URL")
            return
        }
        
        UIApplication.shared.open(url) { success in
            DispatchQueue.main.async {
                if !success {
                    self.showError("Failed to open App Store")
                }
            }
        }
    }
    
    private func showInstallDialog() {
        alertMessage = "Genius Scan is not installed. Would you like to download it from the App Store?"
        showAlert = true
    }
    
    private func showSuccess(_ message: String) {
        alertMessage = message
        showAlert = true
    }
    
    private func showError(_ message: String) {
        alertMessage = message
        showAlert = true
    }
}

#Preview {
    DocumentScannerView()
        .environmentObject(DocumentViewModel())
}