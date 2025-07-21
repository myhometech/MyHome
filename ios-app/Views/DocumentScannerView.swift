import SwiftUI
import VisionKit
import Vision

struct DocumentScannerView: View {
    @EnvironmentObject var documentViewModel: DocumentViewModel
    @State private var showingScanner = false
    @State private var showingCategoryPicker = false
    @State private var scannedImages: [UIImage] = []
    @State private var selectedCategory: Category?
    @State private var documentName = ""
    @State private var tags = ""
    @State private var isProcessing = false
    
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
                    
                    Text("Capture property documents with your camera")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 40)
                
                Spacer()
                
                // Scan Options
                VStack(spacing: 16) {
                    Button(action: {
                        showingScanner = true
                    }) {
                        HStack {
                            Image(systemName: "camera")
                            Text("Scan Document")
                        }
                        .font(.headline)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .cornerRadius(12)
                    }
                    
                    Button(action: {
                        // Photo library picker would go here
                    }) {
                        HStack {
                            Image(systemName: "photo.on.rectangle")
                            Text("Choose from Photos")
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
                
                // Recent scans
                if !scannedImages.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Recent Scans")
                            .font(.headline)
                            .padding(.horizontal)
                        
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 12) {
                                ForEach(Array(scannedImages.enumerated()), id: \.offset) { index, image in
                                    Image(uiImage: image)
                                        .resizable()
                                        .aspectRatio(contentMode: .fill)
                                        .frame(width: 100, height: 140)
                                        .clipped()
                                        .cornerRadius(8)
                                        .onTapGesture {
                                            processScannedDocument(image)
                                        }
                                }
                            }
                            .padding(.horizontal)
                        }
                    }
                }
                
                Spacer()
                
                // Tips
                VStack(alignment: .leading, spacing: 8) {
                    Label("Ensure good lighting for best results", systemImage: "lightbulb")
                    Label("Place document on flat surface", systemImage: "rectangle.on.rectangle")
                    Label("Keep camera steady during scan", systemImage: "hand.raised")
                }
                .font(.caption)
                .foregroundColor(.secondary)
                .padding(.horizontal)
                
                Spacer()
            }
            .navigationTitle("Scan")
            .navigationBarTitleDisplayMode(.inline)
        }
        .sheet(isPresented: $showingScanner) {
            DocumentCameraView { images in
                scannedImages.append(contentsOf: images)
                if let firstImage = images.first {
                    processScannedDocument(firstImage)
                }
            }
        }
        .sheet(isPresented: $showingCategoryPicker) {
            CategoryPickerView(
                selectedCategory: $selectedCategory,
                documentName: $documentName,
                tags: $tags,
                onSave: saveDocument
            )
        }
        .overlay {
            if isProcessing {
                ProgressView("Processing document...")
                    .padding()
                    .background(.regularMaterial)
                    .cornerRadius(12)
            }
        }
    }
    
    private func processScannedDocument(_ image: UIImage) {
        isProcessing = true
        
        // Process image with Vision framework to extract text
        let requestHandler = VNImageRequestHandler(cgImage: image.cgImage!, options: [:])
        let request = VNRecognizeTextRequest { request, error in
            DispatchQueue.main.async {
                isProcessing = false
                
                if let observations = request.results as? [VNRecognizedTextObservation] {
                    let extractedText = observations.compactMap { observation in
                        observation.topCandidates(1).first?.string
                    }.joined(separator: " ")
                    
                    // Auto-suggest document name based on extracted text
                    documentName = suggestDocumentName(from: extractedText)
                }
                
                showingCategoryPicker = true
            }
        }
        
        request.recognitionLanguages = ["en-US"]
        request.recognitionLevel = .accurate
        
        do {
            try requestHandler.perform([request])
        } catch {
            DispatchQueue.main.async {
                isProcessing = false
                showingCategoryPicker = true
            }
        }
    }
    
    private func suggestDocumentName(from text: String) -> String {
        let lowercaseText = text.lowercased()
        
        if lowercaseText.contains("electric") || lowercaseText.contains("power") {
            return "Electric Bill"
        } else if lowercaseText.contains("gas") {
            return "Gas Bill"
        } else if lowercaseText.contains("water") {
            return "Water Bill"
        } else if lowercaseText.contains("insurance") {
            return "Insurance Document"
        } else if lowercaseText.contains("tax") {
            return "Tax Document"
        } else if lowercaseText.contains("receipt") {
            return "Receipt"
        } else {
            return "Scanned Document"
        }
    }
    
    private func saveDocument() {
        guard let image = scannedImages.last else { return }
        
        documentViewModel.uploadDocument(
            image: image,
            name: documentName.isEmpty ? "Scanned Document" : documentName,
            category: selectedCategory,
            tags: tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        )
        
        // Reset state
        scannedImages.removeAll()
        documentName = ""
        tags = ""
        selectedCategory = nil
    }
}

struct DocumentCameraView: UIViewControllerRepresentable {
    let onScan: ([UIImage]) -> Void
    
    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let scanner = VNDocumentCameraViewController()
        scanner.delegate = context.coordinator
        return scanner
    }
    
    func updateUIViewController(_ uiViewController: VNDocumentCameraViewController, context: Context) {}
    
    func makeCoordinator() -> Coordinator {
        Coordinator(onScan: onScan)
    }
    
    class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let onScan: ([UIImage]) -> Void
        
        init(onScan: @escaping ([UIImage]) -> Void) {
            self.onScan = onScan
        }
        
        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
            var images: [UIImage] = []
            
            for pageIndex in 0..<scan.pageCount {
                let image = scan.imageOfPage(at: pageIndex)
                images.append(image)
            }
            
            onScan(images)
            controller.dismiss(animated: true)
        }
        
        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
            controller.dismiss(animated: true)
        }
        
        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
            controller.dismiss(animated: true)
        }
    }
}

#Preview {
    DocumentScannerView()
        .environmentObject(DocumentViewModel())
}