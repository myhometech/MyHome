import Foundation
import Combine

class APIService: ObservableObject {
    private let baseURL = "https://your-homedocs-backend.replit.app" // Update with your backend URL
    private let session = URLSession.shared
    
    // MARK: - Authentication
    
    func signInWithApple(userData: [String: Any]) -> AnyPublisher<User, Error> {
        let url = URL(string: "\(baseURL)/api/auth/apple")!
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: userData)
        } catch {
            return Fail(error: error).eraseToAnyPublisher()
        }
        
        return session.dataTaskPublisher(for: request)
            .map(\.data)
            .decode(type: User.self, decoder: JSONDecoder())
            .eraseToAnyPublisher()
    }
    
    func fetchUserProfile() -> AnyPublisher<User, Error> {
        let url = URL(string: "\(baseURL)/api/auth/user")!
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        return session.dataTaskPublisher(for: request)
            .map(\.data)
            .decode(type: User.self, decoder: JSONDecoder())
            .eraseToAnyPublisher()
    }
    
    func signOut() -> AnyPublisher<Void, Error> {
        let url = URL(string: "\(baseURL)/api/logout")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        
        return session.dataTaskPublisher(for: request)
            .map { _ in () }
            .eraseToAnyPublisher()
    }
    
    // MARK: - Documents
    
    func fetchDocuments(categoryId: Int? = nil, search: String? = nil) -> AnyPublisher<[Document], Error> {
        var components = URLComponents(string: "\(baseURL)/api/documents")!
        var queryItems: [URLQueryItem] = []
        
        if let categoryId = categoryId {
            queryItems.append(URLQueryItem(name: "categoryId", value: String(categoryId)))
        }
        
        if let search = search, !search.isEmpty {
            queryItems.append(URLQueryItem(name: "search", value: search))
        }
        
        components.queryItems = queryItems.isEmpty ? nil : queryItems
        
        var request = URLRequest(url: components.url!)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        return session.dataTaskPublisher(for: request)
            .map(\.data)
            .decode(type: [Document].self, decoder: jsonDecoder)
            .eraseToAnyPublisher()
    }
    
    func uploadDocument(
        imageData: Data,
        name: String,
        categoryId: Int?,
        tags: [String]
    ) -> AnyPublisher<Document, Error> {
        let url = URL(string: "\(baseURL)/api/documents")!
        let boundary = UUID().uuidString
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 60.0 // Increase timeout for large files
        
        var formData = Data()
        
        // Determine file type and content type
        let (filename, contentType) = determineFileTypeAndName(data: imageData, name: name)
        
        // Add file
        formData.append("--\(boundary)\r\n".data(using: .utf8)!)
        formData.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        formData.append("Content-Type: \(contentType)\r\n\r\n".data(using: .utf8)!)
        formData.append(imageData)
        formData.append("\r\n".data(using: .utf8)!)
        
        // Add document name
        formData.append("--\(boundary)\r\n".data(using: .utf8)!)
        formData.append("Content-Disposition: form-data; name=\"name\"\r\n\r\n".data(using: .utf8)!)
        formData.append(name.data(using: .utf8)!)
        formData.append("\r\n".data(using: .utf8)!)
        
        // Add category ID if provided
        if let categoryId = categoryId {
            formData.append("--\(boundary)\r\n".data(using: .utf8)!)
            formData.append("Content-Disposition: form-data; name=\"categoryId\"\r\n\r\n".data(using: .utf8)!)
            formData.append(String(categoryId).data(using: .utf8)!)
            formData.append("\r\n".data(using: .utf8)!)
        }
        
        // Add tags if provided
        if !tags.isEmpty {
            let tagsJSON = try! JSONSerialization.data(withJSONObject: tags)
            formData.append("--\(boundary)\r\n".data(using: .utf8)!)
            formData.append("Content-Disposition: form-data; name=\"tags\"\r\n\r\n".data(using: .utf8)!)
            formData.append(tagsJSON)
            formData.append("\r\n".data(using: .utf8)!)
        }
        
        formData.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = formData
        
        return session.dataTaskPublisher(for: request)
            .map(\.data)
            .decode(type: Document.self, decoder: jsonDecoder)
            .catch { error -> AnyPublisher<Document, Error> in
                print("⚠️ Upload error: \(error)")
                return Fail(error: error).eraseToAnyPublisher()
            }
            .eraseToAnyPublisher()
    }
    
    // MARK: - Helper Methods
    
    private func determineFileTypeAndName(data: Data, name: String) -> (filename: String, contentType: String) {
        // Check PDF signature
        if data.count >= 4 {
            let pdfSignature = Data([0x25, 0x50, 0x44, 0x46]) // %PDF
            if data.prefix(4) == pdfSignature {
                return ("\(name).pdf", "application/pdf")
            }
        }
        
        // Check JPEG signature
        if data.count >= 2 {
            let jpegSignature = Data([0xFF, 0xD8])
            if data.prefix(2) == jpegSignature {
                return ("\(name).jpg", "image/jpeg")
            }
        }
        
        // Check PNG signature
        if data.count >= 8 {
            let pngSignature = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
            if data.prefix(8) == pngSignature {
                return ("\(name).png", "image/png")
            }
        }
        
        // Default to JPEG
        return ("\(name).jpg", "image/jpeg")
    }
    
    func deleteDocument(id: Int) -> AnyPublisher<Void, Error> {
        let url = URL(string: "\(baseURL)/api/documents/\(id)")!
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        
        return session.dataTaskPublisher(for: request)
            .map { _ in () }
            .eraseToAnyPublisher()
    }
    
    func downloadDocument(id: Int) -> AnyPublisher<Data, Error> {
        let url = URL(string: "\(baseURL)/api/documents/\(id)/download")!
        
        return session.dataTaskPublisher(for: url)
            .map(\.data)
            .eraseToAnyPublisher()
    }
    
    // MARK: - Categories
    
    func fetchCategories() -> AnyPublisher<[Category], Error> {
        let url = URL(string: "\(baseURL)/api/categories")!
        
        return session.dataTaskPublisher(for: url)
            .map(\.data)
            .decode(type: [Category].self, decoder: JSONDecoder())
            .eraseToAnyPublisher()
    }
    
    func initializeCategories() -> AnyPublisher<Void, Error> {
        let url = URL(string: "\(baseURL)/api/init-categories")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        
        return session.dataTaskPublisher(for: request)
            .map { _ in () }
            .eraseToAnyPublisher()
    }
    
    // MARK: - Document Stats
    
    func fetchDocumentStats() -> AnyPublisher<DocumentStats, Error> {
        let url = URL(string: "\(baseURL)/api/documents/stats")!
        
        return session.dataTaskPublisher(for: url)
            .map(\.data)
            .decode(type: DocumentStats.self, decoder: JSONDecoder())
            .eraseToAnyPublisher()
    }
    
    // MARK: - Helper
    
    private var jsonDecoder: JSONDecoder {
        let decoder = JSONDecoder()
        let formatter = ISO8601DateFormatter()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)
            
            if let date = formatter.date(from: dateString) {
                return date
            }
            
            // Fallback for different date formats
            let fallbackFormatter = DateFormatter()
            fallbackFormatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
            
            if let date = fallbackFormatter.date(from: dateString) {
                return date
            }
            
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Cannot decode date string \(dateString)")
        }
        return decoder
    }
}

struct DocumentStats: Codable {
    let totalDocuments: Int
    let totalSize: Int
    let categoryCounts: [CategoryCount]
}

struct CategoryCount: Codable {
    let categoryId: Int
    let count: Int
}