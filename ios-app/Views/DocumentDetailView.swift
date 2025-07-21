import SwiftUI
import QuickLook

struct DocumentDetailView: View {
    let document: Document
    @EnvironmentObject var documentViewModel: DocumentViewModel
    @State private var showingDeleteAlert = false
    @State private var showingShareSheet = false
    @State private var documentData: Data?
    @State private var isLoading = false
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Document Header
                DocumentHeaderView(document: document)
                
                // Document Info
                DocumentInfoView(document: document)
                
                // Actions
                DocumentActionsView(
                    document: document,
                    onDownload: downloadDocument,
                    onShare: shareDocument,
                    onDelete: { showingDeleteAlert = true }
                )
                
                // Tags
                if let tags = document.tags, !tags.isEmpty {
                    TagsView(tags: tags)
                }
            }
            .padding()
        }
        .navigationTitle(document.name)
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Menu {
                    Button(action: shareDocument) {
                        Label("Share", systemImage: "square.and.arrow.up")
                    }
                    
                    Button(action: downloadDocument) {
                        Label("Download", systemImage: "arrow.down.circle")
                    }
                    
                    Divider()
                    
                    Button(role: .destructive, action: { showingDeleteAlert = true }) {
                        Label("Delete", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .alert("Delete Document", isPresented: $showingDeleteAlert) {
            Button("Cancel", role: .cancel) { }
            Button("Delete", role: .destructive) {
                documentViewModel.deleteDocument(document)
            }
        } message: {
            Text("Are you sure you want to delete \"\(document.name)\"? This action cannot be undone.")
        }
        .sheet(isPresented: $showingShareSheet) {
            if let documentData = documentData {
                ShareSheet(items: [documentData])
            }
        }
        .overlay {
            if isLoading {
                ProgressView("Loading document...")
                    .padding()
                    .background(.regularMaterial)
                    .cornerRadius(12)
            }
        }
    }
    
    private func downloadDocument() {
        isLoading = true
        
        documentViewModel.downloadDocument(document) { data in
            isLoading = false
            documentData = data
        }
    }
    
    private func shareDocument() {
        guard documentData != nil else {
            downloadDocument()
            return
        }
        showingShareSheet = true
    }
}

struct DocumentHeaderView: View {
    let document: Document
    @State private var thumbnailImage: UIImage?
    
    var body: some View {
        HStack(spacing: 16) {
            // Thumbnail
            Group {
                if let thumbnailImage = thumbnailImage {
                    Image(uiImage: thumbnailImage)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } else {
                    Image(systemName: document.fileIcon)
                        .font(.title)
                        .foregroundColor(document.category?.colorValue ?? .gray)
                }
            }
            .frame(width: 60, height: 80)
            .background(Color(.secondarySystemBackground))
            .cornerRadius(8)
            .clipped()
            
            VStack(alignment: .leading, spacing: 8) {
                Text(document.name)
                    .font(.title2)
                    .fontWeight(.semibold)
                
                HStack {
                    if let category = document.category {
                        Label(category.name, systemImage: category.iconName)
                            .font(.caption)
                            .foregroundColor(category.colorValue)
                    }
                    
                    Spacer()
                    
                    Text(document.fileExtension)
                        .font(.caption)
                        .fontWeight(.medium)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color(.tertiarySystemBackground))
                        .cornerRadius(4)
                }
                
                Text("Uploaded \(document.formattedUploadDate)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
        }
        .onAppear {
            document.generateThumbnail { image in
                thumbnailImage = image
            }
        }
    }
}

struct DocumentInfoView: View {
    let document: Document
    
    var body: some View {
        VStack(spacing: 12) {
            InfoRow(label: "File Name", value: document.fileName)
            InfoRow(label: "File Size", value: document.formattedFileSize)
            InfoRow(label: "Type", value: document.mimeType)
            
            if document.isDownloaded {
                InfoRow(label: "Status", value: "Downloaded")
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }
}

struct InfoRow: View {
    let label: String
    let value: String
    
    var body: some View {
        HStack {
            Text(label)
                .foregroundColor(.secondary)
            Spacer()
            Text(value)
                .fontWeight(.medium)
        }
        .font(.subheadline)
    }
}

struct DocumentActionsView: View {
    let document: Document
    let onDownload: () -> Void
    let onShare: () -> Void
    let onDelete: () -> Void
    
    var body: some View {
        VStack(spacing: 12) {
            ActionButton(
                title: "Download",
                icon: "arrow.down.circle.fill",
                color: .blue,
                action: onDownload
            )
            
            ActionButton(
                title: "Share",
                icon: "square.and.arrow.up.fill",
                color: .green,
                action: onShare
            )
            
            ActionButton(
                title: "Delete",
                icon: "trash.fill",
                color: .red,
                action: onDelete
            )
        }
    }
}

struct ActionButton: View {
    let title: String
    let icon: String
    let color: Color
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack {
                Image(systemName: icon)
                Text(title)
                Spacer()
            }
            .foregroundColor(color)
            .padding()
            .background(color.opacity(0.1))
            .cornerRadius(12)
        }
    }
}

struct TagsView: View {
    let tags: [String]
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Tags")
                .font(.headline)
            
            FlowLayout(tags: tags) { tag in
                Text(tag)
                    .font(.caption)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color(.tertiarySystemBackground))
                    .cornerRadius(16)
            }
        }
    }
}

struct FlowLayout<Data: RandomAccessCollection, Content: View>: View where Data.Element: Hashable {
    let tags: Data
    let content: (Data.Element) -> Content
    
    var body: some View {
        LazyVStack(alignment: .leading, spacing: 8) {
            ForEach(computeRows(), id: \.self) { row in
                HStack(spacing: 8) {
                    ForEach(row, id: \.self) { tag in
                        content(tag)
                    }
                    Spacer()
                }
            }
        }
    }
    
    private func computeRows() -> [[Data.Element]] {
        // Simple implementation - in real app, you'd calculate based on available width
        let array = Array(tags)
        var rows: [[Data.Element]] = []
        var currentRow: [Data.Element] = []
        
        for tag in array {
            currentRow.append(tag)
            if currentRow.count >= 3 {
                rows.append(currentRow)
                currentRow = []
            }
        }
        
        if !currentRow.isEmpty {
            rows.append(currentRow)
        }
        
        return rows
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

#Preview {
    NavigationView {
        DocumentDetailView(document: Document(
            id: 1,
            name: "Electric Bill - January 2024",
            fileName: "electric_bill_jan_2024.pdf",
            mimeType: "application/pdf",
            fileSize: 234567,
            categoryId: 1,
            tags: ["utility", "electric", "monthly"],
            uploadedAt: Date(),
            userId: "user123"
        ))
    }
    .environmentObject(DocumentViewModel())
}