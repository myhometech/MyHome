import Foundation

class DocumentStorage {
    private let documentsKey = "stored_documents"
    private let documentsDirectory: URL
    
    init() {
        let urls = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
        documentsDirectory = urls[0].appendingPathComponent("HomeDocs")
        
        // Create directory if it doesn't exist
        try? FileManager.default.createDirectory(at: documentsDirectory, withIntermediateDirectories: true)
    }
    
    func saveDocuments(_ documents: [Document]) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        
        if let encoded = try? encoder.encode(documents) {
            UserDefaults.standard.set(encoded, forKey: documentsKey)
        }
    }
    
    func loadDocuments() -> [Document] {
        guard let data = UserDefaults.standard.data(forKey: documentsKey) else {
            return []
        }
        
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        
        return (try? decoder.decode([Document].self, from: data)) ?? []
    }
    
    func saveDocumentData(_ data: Data, for document: Document) {
        let fileName = "\(document.id)_\(document.fileName)"
        let fileURL = documentsDirectory.appendingPathComponent(fileName)
        
        do {
            try data.write(to: fileURL)
            
            // Update document with local path
            var updatedDocument = document
            updatedDocument.localPath = fileURL
            updatedDocument.isDownloaded = true
            updatedDocument.lastSyncedAt = Date()
            
            // Update stored documents
            var documents = loadDocuments()
            if let index = documents.firstIndex(where: { $0.id == document.id }) {
                documents[index] = updatedDocument
                saveDocuments(documents)
            }
        } catch {
            print("Failed to save document data: \(error)")
        }
    }
    
    func getLocalDocumentData(for document: Document) -> Data? {
        guard let localPath = document.localPath else { return nil }
        return try? Data(contentsOf: localPath)
    }
    
    func deleteLocalDocument(_ document: Document) {
        guard let localPath = document.localPath else { return }
        
        try? FileManager.default.removeItem(at: localPath)
        
        // Update stored documents
        var documents = loadDocuments()
        if let index = documents.firstIndex(where: { $0.id == document.id }) {
            documents[index].localPath = nil
            documents[index].isDownloaded = false
            saveDocuments(documents)
        }
    }
    
    func clearAllDocuments() {
        UserDefaults.standard.removeObject(forKey: documentsKey)
        
        // Remove all local files
        do {
            let files = try FileManager.default.contentsOfDirectory(at: documentsDirectory, includingPropertiesForKeys: nil)
            for file in files {
                try FileManager.default.removeItem(at: file)
            }
        } catch {
            print("Failed to clear local documents: \(error)")
        }
    }
}