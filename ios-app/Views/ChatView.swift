import SwiftUI

struct ChatView: View {
    @StateObject private var viewModel = ChatViewModel()
    @State private var showingConversations = false
    @State private var selectedDocumentId: String?
    
    var body: some View {
        NavigationStack {
            Group {
                if !viewModel.isChatEnabled {
                    ChatDisabledView()
                } else {
                    ChatInterface()
                }
            }
            .navigationTitle("Chat Assistant")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    if viewModel.isChatEnabled {
                        Button("Conversations") {
                            showingConversations = true
                        }
                    }
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    if viewModel.canShowFilters {
                        Button("Filters") {
                            viewModel.toggleFilters()
                        }
                    }
                }
            }
            .task {
                await viewModel.loadChatConfig()
            }
            .sheet(isPresented: $showingConversations) {
                ConversationListView(viewModel: viewModel)
            }
            .sheet(isPresented: $viewModel.showFilters) {
                ChatFiltersView(viewModel: viewModel)
            }
            .alert("Error", isPresented: .constant(viewModel.errorMessage != nil)) {
                Button("OK") {
                    viewModel.clearError()
                }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
    }
    
    @ViewBuilder
    private func ChatInterface() -> some View {
        VStack(spacing: 0) {
            // Messages Area
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        if viewModel.selectedConversation == nil {
                            ChatWelcomeView()
                                .padding()
                        } else {
                            ForEach(viewModel.messages) { message in
                                MessageBubble(
                                    message: message,
                                    onCitationTapped: { citation in
                                        selectedDocumentId = citation.docId
                                    }
                                )
                                .id(message.id)
                            }
                            
                            if viewModel.isSending {
                                MessageBubble(
                                    message: ChatMessage(
                                        id: "sending",
                                        conversationId: viewModel.selectedConversation?.id ?? "",
                                        role: .user,
                                        content: "Sending...",
                                        citations: nil,
                                        confidence: nil,
                                        createdAt: Date()
                                    ),
                                    isPending: true
                                )
                            }
                        }
                    }
                    .padding()
                }
                .onChange(of: viewModel.messages.count) { _, _ in
                    if let lastMessage = viewModel.messages.last {
                        withAnimation(.easeInOut(duration: 0.3)) {
                            proxy.scrollTo(lastMessage.id, anchor: .bottom)
                        }
                    }
                }
            }
            
            // Input Area
            ChatInputView(viewModel: viewModel)
        }
    }
}

struct ChatDisabledView: View {
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "message.circle.fill")
                .font(.system(size: 60))
                .foregroundColor(.secondary)
            
            Text("Chat Assistant")
                .font(.title2)
                .fontWeight(.semibold)
            
            Text("Chat features are not available on your current plan. Please upgrade to access the document assistant.")
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
                .padding(.horizontal)
        }
        .padding()
    }
}

struct ChatWelcomeView: View {
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "message.circle")
                .font(.system(size: 48))
                .foregroundColor(.blue)
            
            Text("Ask me about your documents")
                .font(.title2)
                .fontWeight(.semibold)
            
            Text("I can help you find information, dates, amounts, and more from your uploaded documents.")
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
            
            VStack(alignment: .leading, spacing: 8) {
                Text("Try asking:")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                VStack(alignment: .leading, spacing: 4) {
                    Text("\"How much was my phone bill last month?\"")
                    Text("\"When does my insurance policy expire?\"")
                    Text("\"What documents do I have from O2?\"")
                }
                .font(.caption)
                .foregroundColor(.secondary)
            }
        }
    }
}

struct MessageBubble: View {
    let message: ChatMessage
    var onCitationTapped: ((Citation) -> Void)?
    var isPending: Bool = false
    
    var body: some View {
        HStack(alignment: .top) {
            if message.isFromUser {
                Spacer()
            }
            
            VStack(alignment: message.isFromUser ? .trailing : .leading, spacing: 4) {
                if message.content == "INSUFFICIENT_EVIDENCE" {
                    InsufficientEvidenceView()
                } else {
                    Text(message.content)
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(message.isFromUser ? Color.blue : Color(.systemGray5))
                        )
                        .foregroundColor(message.isFromUser ? .white : .primary)
                        .opacity(isPending ? 0.6 : 1.0)
                }
                
                // Citations
                if let citations = message.citations, !citations.isEmpty {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 120))], spacing: 8) {
                        ForEach(citations) { citation in
                            CitationChip(citation: citation) {
                                onCitationTapped?(citation)
                            }
                        }
                    }
                }
                
                // Confidence warning
                if let confidence = message.confidence, confidence < 0.7 {
                    Text("Uncertain response")
                        .font(.caption2)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color(.systemGray4))
                        .cornerRadius(8)
                }
                
                // Timestamp
                Text(isPending ? "Sending..." : message.formattedTime)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
            
            if !message.isFromUser {
                Spacer()
            }
        }
    }
}

struct InsufficientEvidenceView: View {
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "questionmark.circle")
                .font(.system(size: 32))
                .foregroundColor(.orange)
            
            Text("We couldn't find that information")
                .font(.headline)
            
            Text("I couldn't find specific information about that in your documents. Try rephrasing your question or check if you have the relevant documents uploaded.")
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
}

struct CitationChip: View {
    let citation: Citation
    let onTapped: () -> Void
    
    var body: some View {
        Button(action: onTapped) {
            HStack(spacing: 4) {
                Image(systemName: "doc.text")
                    .font(.caption2)
                
                Text("\(citation.title ?? "Doc \(citation.docId)") – p.\(citation.page)")
                    .font(.caption2)
                    .lineLimit(1)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color(.systemGray4))
            .cornerRadius(8)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

struct ChatInputView: View {
    @ObservedObject var viewModel: ChatViewModel
    @FocusState private var isTextFieldFocused: Bool
    
    var body: some View {
        VStack {
            Divider()
            
            HStack(alignment: .bottom, spacing: 12) {
                TextField("Ask me anything about your documents...", text: $viewModel.currentMessage, axis: .vertical)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .focused($isTextFieldFocused)
                    .lineLimit(1...4)
                    .disabled(viewModel.isSending)
                
                Button(action: {
                    Task {
                        await viewModel.sendMessage()
                    }
                }) {
                    Image(systemName: "paperplane.fill")
                        .foregroundColor(.white)
                        .padding(8)
                        .background(
                            Circle()
                                .fill(canSend ? Color.blue : Color.gray)
                        )
                }
                .disabled(!canSend || viewModel.isSending)
            }
            .padding()
        }
        .background(Color(.systemBackground))
    }
    
    private var canSend: Bool {
        !viewModel.currentMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

// Preview
struct ChatView_Previews: PreviewProvider {
    static var previews: some View {
        ChatView()
    }
}