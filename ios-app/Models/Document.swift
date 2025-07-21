import Foundation
import UIKit

struct Document: Codable, Identifiable {
    let id: Int
    let name: String
    let fileName: String
    let mimeType: String
    let fileSize: Int
    let categoryId: Int?
    let tags: [String]?
    let uploadedAt: Date
    let userId: String
    
    // Local storage properties
    var localPath: URL?
    var isDownloaded: Bool = false
    var lastSyncedAt: Date?
    
    var fileIcon: String {
        switch mimeType {
        case "application/pdf":
            return "doc.text.fill"
        case "image/jpeg", "image/jpg", "image/png", "image/webp":
            return "photo.fill"
        default:
            return "doc.fill"
        }
    }
    
    var formattedFileSize: String {
        ByteCountFormatter.string(fromByteCount: Int64(fileSize), countStyle: .file)
    }
    
    var fileExtension: String {
        (fileName as NSString).pathExtension.uppercased()
    }
    
    var category: Category? {
        guard let categoryId = categoryId else { return nil }
        return Category.defaultCategories.first { $0.id == categoryId }
    }
    
    var formattedUploadDate: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: uploadedAt)
    }
    
    var isImage: Bool {
        mimeType.hasPrefix("image/")
    }
    
    var isPDF: Bool {
        mimeType == "application/pdf"
    }
}

// MARK: - Document Preview
extension Document {
    func generateThumbnail(completion: @escaping (UIImage?) -> Void) {
        guard let localPath = localPath else {
            completion(nil)
            return
        }
        
        if isImage {
            DispatchQueue.global(qos: .userInitiated).async {
                let image = UIImage(contentsOfFile: localPath.path)
                DispatchQueue.main.async {
                    completion(image)
                }
            }
        } else if isPDF {
            DispatchQueue.global(qos: .userInitiated).async {
                guard let data = try? Data(contentsOf: localPath),
                      let provider = CGDataProvider(data: data as CFData),
                      let pdfDocument = CGPDFDocument(provider),
                      let page = pdfDocument.page(at: 1) else {
                    DispatchQueue.main.async {
                        completion(nil)
                    }
                    return
                }
                
                let pageRect = page.getBoxRect(.mediaBox)
                let renderer = UIGraphicsImageRenderer(size: pageRect.size)
                let image = renderer.image { context in
                    UIColor.white.set()
                    context.fill(pageRect)
                    
                    context.cgContext.translateBy(x: 0, y: pageRect.size.height)
                    context.cgContext.scaleBy(x: 1, y: -1)
                    context.cgContext.drawPDFPage(page)
                }
                
                DispatchQueue.main.async {
                    completion(image)
                }
            }
        } else {
            completion(nil)
        }
    }
}