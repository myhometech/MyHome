import Foundation
import Combine
import UIKit

class DocumentViewModel: ObservableObject {
    @Published var documents: [Document] = []
    @Published var categories: [Category] = []
    @Published var isLoading = false
    @Published var error: String?
    @Published var stats: DocumentStats?
    
    private let apiService = APIService()
    private let documentStorage = DocumentStorage()
    private var cancellables = Set<AnyCancellable>()
    
    init() {
        loadCategories()
        loadDocumentStats()
    }
    
    // MARK: - Computed Properties
    
    var totalDocuments: Int {
        stats?.totalDocuments ?? documents.count
    }
    
    var formattedTotalSize: String {
        let totalSize = stats?.totalSize ?? documents.reduce(0) { $0 + $1.fileSize }
        return ByteCountFormatter.string(fromByteCount: Int64(totalSize), countStyle: .file)
    }
    
    var categoriesInUse: Int {
        Set(documents.compactMap { $0.categoryId }).count
    }
    
    // MARK: - Public Methods
    
    func loadDocuments() {
        isLoading = true
        error = nil
        
        // Load from local storage first
        documents = documentStorage.loadDocuments()
        
        // Then fetch from API
        apiService.fetchDocuments()
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { [weak self] completion in
                    self?.isLoading = false
                    if case .failure(let error) = completion {
                        self?.error = error.localizedDescription
                    }
                },
                receiveValue: { [weak self] fetchedDocuments in
                    self?.documents = fetchedDocuments
                    self?.documentStorage.saveDocuments(fetchedDocuments)
                }
            )
            .store(in: &cancellables)
    }
    
    func refreshDocuments() async {
        await MainActor.run {
            isLoading = true
            error = nil
        }
        
        do {
            let fetchedDocuments = try await apiService.fetchDocuments().async()
            await MainActor.run {
                self.documents = fetchedDocuments
                self.documentStorage.saveDocuments(fetchedDocuments)
                self.isLoading = false
            }
        } catch {
            await MainActor.run {
                self.error = error.localizedDescription
                self.isLoading = false
            }
        }
    }
    
    func loadCategories() {
        apiService.initializeCategories()
            .flatMap { [weak self] _ in
                self?.apiService.fetchCategories() ?? Empty().eraseToAnyPublisher()
            }
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { [weak self] completion in
                    if case .failure = completion {
                        // Use default categories if API fails
                        self?.categories = Category.defaultCategories
                    }
                },
                receiveValue: { [weak self] categories in
                    self?.categories = categories
                }
            )
            .store(in: &cancellables)
    }
    
    func loadDocumentStats() {
        apiService.fetchDocumentStats()
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { [weak self] stats in
                    self?.stats = stats
                }
            )
            .store(in: &cancellables)
    }
    
    func uploadDocument(
        image: UIImage,
        name: String,
        category: Category?,
        tags: [String]
    ) {
        guard let imageData = image.jpegData(compressionQuality: 0.8) else {
            error = "Failed to convert image to JPEG format. Please try scanning the document again."
            return
        }
        
        isLoading = true
        error = nil
        
        apiService.uploadDocument(
            imageData: imageData,
            name: name,
            categoryId: category?.id,
            tags: tags
        )
        .receive(on: DispatchQueue.main)
        .sink(
            receiveCompletion: { [weak self] completion in
                self?.isLoading = false
                if case .failure(let error) = completion {
                    // Provide more specific error messages
                    if error.localizedDescription.contains("PDF") {
                        self?.error = "PDF creation failed. Please check your document quality and try again."
                    } else if error.localizedDescription.contains("network") {
                        self?.error = "Network error. Please check your internet connection and try again."
                    } else {
                        self?.error = "Upload failed: \(error.localizedDescription)"
                    }
                }
            },
            receiveValue: { [weak self] newDocument in
                self?.documents.insert(newDocument, at: 0)
                self?.documentStorage.saveDocuments(self?.documents ?? [])
                self?.loadDocumentStats() // Refresh stats
            }
        )
        .store(in: &cancellables)
    }
    
    func uploadPDFDocument(
        pdfData: Data,
        name: String,
        category: Category?,
        tags: [String]
    ) {
        isLoading = true
        error = nil
        
        print("📄 Uploading PDF document: \(name) (\(pdfData.count) bytes)")
        
        apiService.uploadDocument(
            imageData: pdfData, // API service now handles PDFs too
            name: name,
            categoryId: category?.id,
            tags: tags
        )
        .receive(on: DispatchQueue.main)
        .sink(
            receiveCompletion: { [weak self] completion in
                self?.isLoading = false
                if case .failure(let error) = completion {
                    // Provide more specific error messages for PDF uploads
                    if error.localizedDescription.contains("PDF") {
                        self?.error = "PDF upload failed. The PDF file may be corrupted or invalid."
                    } else if error.localizedDescription.contains("size") {
                        self?.error = "PDF file is too large. Please try a smaller file."
                    } else {
                        self?.error = "PDF upload failed: \(error.localizedDescription)"
                    }
                }
            },
            receiveValue: { [weak self] newDocument in
                print("✅ PDF document uploaded successfully: \(newDocument.name)")
                self?.documents.insert(newDocument, at: 0)
                self?.documentStorage.saveDocuments(self?.documents ?? [])
                self?.loadDocumentStats() // Refresh stats
            }
        )
        .store(in: &cancellables)
    }
    
    func deleteDocument(_ document: Document) {
        isLoading = true
        error = nil
        
        apiService.deleteDocument(id: document.id)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { [weak self] completion in
                    self?.isLoading = false
                    if case .failure(let error) = completion {
                        self?.error = error.localizedDescription
                    }
                },
                receiveValue: { [weak self] _ in
                    self?.documents.removeAll { $0.id == document.id }
                    self?.documentStorage.saveDocuments(self?.documents ?? [])
                    self?.loadDocumentStats() // Refresh stats
                }
            )
            .store(in: &cancellables)
    }
    
    func downloadDocument(_ document: Document, completion: @escaping (Data?) -> Void) {
        // Check if document is already downloaded locally
        if let localPath = document.localPath,
           let data = try? Data(contentsOf: localPath) {
            completion(data)
            return
        }
        
        // Download from server
        apiService.downloadDocument(id: document.id)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { completion in
                    if case .failure = completion {
                        completion(nil)
                    }
                },
                receiveValue: { [weak self] data in
                    // Save locally for future access
                    self?.documentStorage.saveDocumentData(data, for: document)
                    completion(data)
                }
            )
            .store(in: &cancellables)
    }
    
    func searchDocuments(query: String, categoryId: Int? = nil) {
        guard !query.isEmpty else {
            loadDocuments()
            return
        }
        
        isLoading = true
        error = nil
        
        apiService.fetchDocuments(categoryId: categoryId, search: query)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { [weak self] completion in
                    self?.isLoading = false
                    if case .failure(let error) = completion {
                        self?.error = error.localizedDescription
                    }
                },
                receiveValue: { [weak self] searchResults in
                    self?.documents = searchResults
                }
            )
            .store(in: &cancellables)
    }
    
    func filterDocuments(by categoryId: Int?) {
        isLoading = true
        error = nil
        
        apiService.fetchDocuments(categoryId: categoryId)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { [weak self] completion in
                    self?.isLoading = false
                    if case .failure(let error) = completion {
                        self?.error = error.localizedDescription
                    }
                },
                receiveValue: { [weak self] filteredDocuments in
                    self?.documents = filteredDocuments
                }
            )
            .store(in: &cancellables)
    }
}

// MARK: - Publisher Extensions
extension Publisher {
    func async() async throws -> Output {
        try await withCheckedThrowingContinuation { continuation in
            var cancellable: AnyCancellable?
            
            cancellable = self
                .sink(
                    receiveCompletion: { completion in
                        switch completion {
                        case .finished:
                            break
                        case .failure(let error):
                            continuation.resume(throwing: error)
                        }
                        cancellable?.cancel()
                    },
                    receiveValue: { value in
                        continuation.resume(returning: value)
                        cancellable?.cancel()
                    }
                )
        }
    }
}