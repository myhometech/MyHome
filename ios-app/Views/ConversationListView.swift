import SwiftUI

struct ConversationListView: View {
    @ObservedObject var viewModel: ChatViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var showingNewChat = false
    
    var body: some View {
        NavigationStack {
            VStack {
                if viewModel.conversations.isEmpty {
                    EmptyConversationsView()
                } else {
                    List {
                        ForEach(viewModel.conversations) { conversation in
                            ConversationRow(
                                conversation: conversation,
                                isSelected: viewModel.selectedConversation?.id == conversation.id
                            )
                            .onTapGesture {
                                Task {
                                    await viewModel.selectConversation(conversation)
                                    dismiss()
                                }
                            }
                        }
                    }
                    .refreshable {
                        await viewModel.loadConversations()
                    }
                }
            }
            .navigationTitle("Conversations")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Close") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("New Chat") {
                        showingNewChat = true
                    }
                }
            }
            .task {
                if viewModel.conversations.isEmpty {
                    await viewModel.loadConversations()
                }
            }
            .sheet(isPresented: $showingNewChat) {
                NewChatView(viewModel: viewModel) {
                    dismiss()
                }
            }
        }
    }
}

struct ConversationRow: View {
    let conversation: Conversation
    let isSelected: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(conversation.title)
                    .font(.headline)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                
                Spacer()
                
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.blue)
                }
            }
            
            HStack {
                Text(conversation.formattedDate)
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                Spacer()
                
                if let messageCount = conversation.messageCount, messageCount > 0 {
                    Text("\(messageCount) messages")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

struct EmptyConversationsView: View {
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "message.circle")
                .font(.system(size: 48))
                .foregroundColor(.gray)
            
            Text("No conversations yet")
                .font(.title2)
                .fontWeight(.semibold)
            
            Text("Start a new chat to begin asking questions about your documents.")
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
        }
        .padding()
    }
}

struct NewChatView: View {
    @ObservedObject var viewModel: ChatViewModel
    let onClose: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var chatTitle: String = ""
    @State private var isCreating: Bool = false
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Text("Start a new conversation")
                    .font(.title2)
                    .fontWeight(.semibold)
                
                TextField("Enter your first question...", text: $chatTitle, axis: .vertical)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .lineLimit(1...4)
                
                Button("Start Chat") {
                    Task {
                        await createNewChat()
                    }
                }
                .disabled(chatTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isCreating)
                .buttonStyle(.borderedProminent)
                
                Spacer()
            }
            .padding()
            .navigationTitle("New Chat")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
    }
    
    private func createNewChat() async {
        isCreating = true
        viewModel.currentMessage = chatTitle
        await viewModel.createNewConversation()
        isCreating = false
        onClose()
    }
}

// Preview
struct ConversationListView_Previews: PreviewProvider {
    static var previews: some View {
        ConversationListView(viewModel: ChatViewModel())
    }
}