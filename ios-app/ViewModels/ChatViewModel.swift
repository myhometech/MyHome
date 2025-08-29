import Foundation
import SwiftUI

@MainActor
class ChatViewModel: ObservableObject {
    @Published var conversations: [Conversation] = []
    @Published var selectedConversation: Conversation?
    @Published var messages: [ChatMessage] = []
    @Published var currentMessage: String = ""
    @Published var isLoading: Bool = false
    @Published var isSending: Bool = false
    @Published var chatConfig: ChatConfig?
    @Published var showFilters: Bool = false
    @Published var filters: ChatFilters = ChatFilters()
    @Published var errorMessage: String?
    
    private let chatService: ChatService
    
    init(chatService: ChatService = ChatService()) {
        self.chatService = chatService
    }
    
    var isChatEnabled: Bool {
        return chatConfig?.chat.enabled ?? false
    }
    
    var canShowFilters: Bool {
        return chatConfig?.chat.showFilters ?? false
    }
    
    // MARK: - Initialization
    func loadChatConfig() async {
        do {
            let config = try await chatService.getChatConfig()
            self.chatConfig = config
            
            if config.chat.enabled {
                await loadConversations()
            }
        } catch {
            print("Failed to load chat config: \(error)")
            self.errorMessage = "Failed to load chat configuration"
        }
    }
    
    // MARK: - Conversation Management
    func loadConversations() async {
        isLoading = true
        
        do {
            let conversations = try await chatService.getConversations()
            self.conversations = conversations.sorted { $0.updatedAt > $1.updatedAt }
        } catch {
            print("Failed to load conversations: \(error)")
            self.errorMessage = "Failed to load conversations"
        }
        
        isLoading = false
    }
    
    func createNewConversation() async {
        guard !currentMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return
        }
        
        let title = String(currentMessage.prefix(50)) + (currentMessage.count > 50 ? "..." : "")
        
        do {
            let conversation = try await chatService.createConversation(title: title)
            self.conversations.insert(conversation, at: 0)
            self.selectedConversation = conversation
            
            // Send the initial message
            await sendCurrentMessage()
        } catch {
            print("Failed to create conversation: \(error)")
            self.errorMessage = "Failed to create conversation"
        }
    }
    
    func selectConversation(_ conversation: Conversation) async {
        selectedConversation = conversation
        await loadMessages()
    }
    
    // MARK: - Message Management
    func loadMessages() async {
        guard let conversationId = selectedConversation?.id else { return }
        
        isLoading = true
        
        do {
            let messages = try await chatService.getMessages(for: conversationId)
            self.messages = messages.sorted { $0.createdAt < $1.createdAt }
        } catch {
            print("Failed to load messages: \(error)")
            self.errorMessage = "Failed to load messages"
        }
        
        isLoading = false
    }
    
    func sendMessage() async {
        if selectedConversation == nil {
            await createNewConversation()
        } else {
            await sendCurrentMessage()
        }
    }
    
    private func sendCurrentMessage() async {
        guard !currentMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let conversationId = selectedConversation?.id else {
            return
        }
        
        let messageText = currentMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        
        // Add user message immediately for better UX
        let userMessage = ChatMessage(
            id: UUID().uuidString,
            conversationId: conversationId,
            role: .user,
            content: messageText,
            citations: nil,
            confidence: nil,
            createdAt: Date()
        )
        messages.append(userMessage)
        
        // Clear input
        currentMessage = ""
        isSending = true
        
        do {
            let response = try await chatService.sendMessage(
                conversationId: conversationId,
                message: messageText,
                filters: filters.isEmpty ? nil : filters
            )
            
            if response.success {
                // Reload messages to get the assistant's response
                await loadMessages()
                // Refresh conversations list to update timestamps
                await loadConversations()
            } else {
                self.errorMessage = response.error ?? "Failed to send message"
                // Remove the optimistic user message since it failed
                if let lastMessage = messages.last, lastMessage.id == userMessage.id {
                    messages.removeLast()
                }
            }
        } catch {
            print("Failed to send message: \(error)")
            self.errorMessage = "Failed to send message"
            // Remove the optimistic user message since it failed
            if let lastMessage = messages.last, lastMessage.id == userMessage.id {
                messages.removeLast()
            }
        }
        
        isSending = false
    }
    
    // MARK: - Filter Management
    func toggleFilters() {
        showFilters.toggle()
    }
    
    func clearFilters() {
        filters = ChatFilters()
    }
    
    func applyFilters(_ newFilters: ChatFilters) {
        filters = newFilters
        showFilters = false
    }
    
    // MARK: - Error Handling
    func clearError() {
        errorMessage = nil
    }
}