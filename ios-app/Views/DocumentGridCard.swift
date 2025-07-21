import SwiftUI

struct DocumentGridCard: View {
    let document: Document
    @State private var thumbnailImage: UIImage?
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Document thumbnail or icon
            Group {
                if let thumbnailImage = thumbnailImage {
                    Image(uiImage: thumbnailImage)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } else {
                    Image(systemName: document.fileIcon)
                        .font(.title)
                        .foregroundColor(document.category?.colorValue ?? .gray)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .frame(height: 100)
            .background(Color(.secondarySystemBackground))
            .cornerRadius(8)
            .clipped()
            
            VStack(alignment: .leading, spacing: 4) {
                Text(document.name)
                    .font(.headline)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                
                HStack {
                    if let category = document.category {
                        HStack(spacing: 4) {
                            Image(systemName: category.iconName)
                                .font(.caption)
                            Text(category.name)
                                .font(.caption)
                        }
                        .foregroundColor(category.colorValue)
                    }
                    
                    Spacer()
                    
                    Text(document.formattedFileSize)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
                
                Text(document.uploadedAt, style: .date)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding(12)
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.1), radius: 2, x: 0, y: 1)
        .onAppear {
            document.generateThumbnail { image in
                thumbnailImage = image
            }
        }
    }
}

struct DocumentListCard: View {
    let document: Document
    @State private var thumbnailImage: UIImage?
    
    var body: some View {
        HStack(spacing: 12) {
            // Thumbnail
            Group {
                if let thumbnailImage = thumbnailImage {
                    Image(uiImage: thumbnailImage)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } else {
                    Image(systemName: document.fileIcon)
                        .font(.title2)
                        .foregroundColor(document.category?.colorValue ?? .gray)
                }
            }
            .frame(width: 50, height: 65)
            .background(Color(.secondarySystemBackground))
            .cornerRadius(6)
            .clipped()
            
            VStack(alignment: .leading, spacing: 4) {
                Text(document.name)
                    .font(.headline)
                    .lineLimit(2)
                
                HStack {
                    if let category = document.category {
                        HStack(spacing: 4) {
                            Image(systemName: category.iconName)
                                .font(.caption)
                            Text(category.name)
                                .font(.caption)
                        }
                        .foregroundColor(category.colorValue)
                    }
                    
                    Spacer()
                    
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(document.formattedFileSize)
                            .font(.caption2)
                            .foregroundColor(.secondary)
                        
                        Text(document.uploadedAt, style: .date)
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }
            }
            
            Spacer()
        }
        .padding(12)
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.1), radius: 2, x: 0, y: 1)
        .onAppear {
            document.generateThumbnail { image in
                thumbnailImage = image
            }
        }
    }
}

#Preview {
    VStack(spacing: 16) {
        DocumentGridCard(document: Document(
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
        
        DocumentListCard(document: Document(
            id: 2,
            name: "Insurance Policy",
            fileName: "home_insurance_2024.pdf",
            mimeType: "application/pdf",
            fileSize: 456789,
            categoryId: 2,
            tags: ["insurance", "home"],
            uploadedAt: Date(),
            userId: "user123"
        ))
    }
    .padding()
}