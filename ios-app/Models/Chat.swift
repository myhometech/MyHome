import Foundation

// MARK: - Chat Models
struct Conversation: Identifiable, Codable {
    let id: String
    let title: String
    let updatedAt: Date
    let messageCount: Int?
    
    var formattedDate: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        return formatter.string(from: updatedAt)
    }
}

struct ChatMessage: Identifiable, Codable {
    let id: String
    let conversationId: String
    let role: MessageRole
    let content: String
    let citations: [Citation]?
    let confidence: Double?
    let createdAt: Date
    
    enum MessageRole: String, Codable {
        case user = "user"
        case assistant = "assistant"
    }
    
    var isFromUser: Bool {
        return role == .user
    }
    
    var formattedTime: String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: createdAt)
    }
}

struct Citation: Identifiable, Codable {
    let id = UUID()
    let docId: String
    let page: Int
    let title: String?
    
    private enum CodingKeys: String, CodingKey {
        case docId, page, title
    }
}

struct ChatFilters: Codable {
    var provider: String?
    var docType: [String]?
    var dateFrom: Date?
    var dateTo: Date?
    
    var isEmpty: Bool {
        return provider?.isEmpty != false && 
               docType?.isEmpty != false && 
               dateFrom == nil && 
               dateTo == nil
    }
}

// MARK: - API Request/Response Models
struct ChatRequest: Codable {
    let conversationId: String
    let message: String
    let filters: ChatFilters?
}

struct ChatResponse: Codable {
    let success: Bool
    let message: String?
    let error: String?
}

struct CreateConversationRequest: Codable {
    let title: String
}

// MARK: - Chat Configuration
struct ChatConfig: Codable {
    let chat: ChatSettings
    
    struct ChatSettings: Codable {
        let enabled: Bool
        let showFilters: Bool
    }
}