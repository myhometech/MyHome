import Foundation

class ChatService: ObservableObject {
    private let apiService: APIService
    
    init(apiService: APIService = .shared) {
        self.apiService = apiService
    }
    
    // MARK: - Chat Configuration
    func getChatConfig() async throws -> ChatConfig {
        return try await apiService.request(
            endpoint: "/api/config",
            method: "GET",
            responseType: ChatConfig.self
        )
    }
    
    // MARK: - Conversation Management
    func getConversations() async throws -> [Conversation] {
        return try await apiService.request(
            endpoint: "/api/conversations",
            method: "GET",
            responseType: [Conversation].self
        )
    }
    
    func createConversation(title: String) async throws -> Conversation {
        let request = CreateConversationRequest(title: title)
        return try await apiService.request(
            endpoint: "/api/conversations",
            method: "POST",
            body: request,
            responseType: Conversation.self
        )
    }
    
    func getMessages(for conversationId: String) async throws -> [ChatMessage] {
        return try await apiService.request(
            endpoint: "/api/conversations/\(conversationId)/messages",
            method: "GET",
            responseType: [ChatMessage].self
        )
    }
    
    // MARK: - Chat Messaging
    func sendMessage(
        conversationId: String,
        message: String,
        filters: ChatFilters? = nil
    ) async throws -> ChatResponse {
        let request = ChatRequest(
            conversationId: conversationId,
            message: message,
            filters: filters
        )
        
        return try await apiService.request(
            endpoint: "/api/chat",
            method: "POST",
            body: request,
            responseType: ChatResponse.self
        )
    }
}