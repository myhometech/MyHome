import SwiftUI

struct DocumentListView: View {
    @EnvironmentObject var documentViewModel: DocumentViewModel
    @EnvironmentObject var authService: AuthService
    @State private var searchText = ""
    @State private var selectedCategory: Category?
    @State private var viewMode: ViewMode = .grid
    @State private var showingProfile = false
    
    enum ViewMode: CaseIterable {
        case grid, list
        
        var icon: String {
            switch self {
            case .grid: return "square.grid.2x2"
            case .list: return "list.bullet"
            }
        }
    }
    
    var filteredDocuments: [Document] {
        var documents = documentViewModel.documents
        
        // Filter by category
        if let selectedCategory = selectedCategory {
            documents = documents.filter { $0.categoryId == selectedCategory.id }
        }
        
        // Filter by search text
        if !searchText.isEmpty {
            documents = documents.filter { document in
                document.name.localizedCaseInsensitiveContains(searchText) ||
                document.fileName.localizedCaseInsensitiveContains(searchText) ||
                (document.tags?.contains { $0.localizedCaseInsensitiveContains(searchText) } ?? false)
            }
        }
        
        return documents
    }
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Stats Header
                StatsHeaderView()
                
                // Category Filter
                CategoryFilterView(
                    categories: documentViewModel.categories,
                    selectedCategory: $selectedCategory
                )
                
                // Documents Section
                VStack(spacing: 0) {
                    // Section Header
                    HStack {
                        Text("Recent Documents")
                            .font(.headline)
                        
                        Spacer()
                        
                        HStack(spacing: 8) {
                            ForEach(ViewMode.allCases, id: \.self) { mode in
                                Button(action: { viewMode = mode }) {
                                    Image(systemName: mode.icon)
                                        .foregroundColor(viewMode == mode ? .white : .blue)
                                        .padding(8)
                                        .background(viewMode == mode ? Color.blue : Color.clear)
                                        .cornerRadius(6)
                                }
                            }
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 12)
                    .background(Color(.systemBackground))
                    
                    Divider()
                    
                    // Documents Grid/List
                    if documentViewModel.isLoading {
                        ProgressView("Loading documents...")
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if filteredDocuments.isEmpty {
                        EmptyStateView(
                            searchText: searchText,
                            selectedCategory: selectedCategory
                        )
                    } else {
                        ScrollView {
                            LazyVStack(spacing: 16) {
                                if viewMode == .grid {
                                    DocumentGridView(documents: filteredDocuments)
                                } else {
                                    DocumentListItemsView(documents: filteredDocuments)
                                }
                            }
                            .padding()
                        }
                    }
                }
                .background(Color(.systemGroupedBackground))
            }
            .navigationTitle("HomeDocs")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: { showingProfile = true }) {
                        AsyncImage(url: URL(string: authService.user?.profileImageUrl ?? "")) { image in
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                        } placeholder: {
                            Circle()
                                .fill(Color.blue)
                                .overlay(
                                    Text(authService.user?.initials ?? "U")
                                        .foregroundColor(.white)
                                        .font(.caption)
                                )
                        }
                        .frame(width: 32, height: 32)
                        .clipShape(Circle())
                    }
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: {
                        documentViewModel.refreshDocuments()
                    }) {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
            .searchable(text: $searchText, prompt: "Search documents...")
            .refreshable {
                await documentViewModel.refreshDocuments()
            }
        }
        .sheet(isPresented: $showingProfile) {
            ProfileView()
        }
        .onAppear {
            documentViewModel.loadDocuments()
        }
    }
}

struct StatsHeaderView: View {
    @EnvironmentObject var documentViewModel: DocumentViewModel
    
    var body: some View {
        HStack(spacing: 16) {
            StatCard(
                title: "Documents",
                value: "\(documentViewModel.totalDocuments)",
                icon: "doc.text",
                color: .blue
            )
            
            StatCard(
                title: "Storage",
                value: documentViewModel.formattedTotalSize,
                icon: "internaldrive",
                color: .green
            )
            
            StatCard(
                title: "Categories",
                value: "\(documentViewModel.categoriesInUse)",
                icon: "folder",
                color: .orange
            )
        }
        .padding()
        .background(Color(.systemBackground))
    }
}

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color
    
    var body: some View {
        VStack(spacing: 4) {
            HStack {
                Image(systemName: icon)
                    .foregroundColor(color)
                Spacer()
            }
            
            Text(value)
                .font(.title2)
                .fontWeight(.bold)
            
            Text(title)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(8)
    }
}

struct DocumentGridView: View {
    let documents: [Document]
    
    let columns = [
        GridItem(.flexible()),
        GridItem(.flexible())
    ]
    
    var body: some View {
        LazyVGrid(columns: columns, spacing: 16) {
            ForEach(documents) { document in
                NavigationLink(destination: DocumentDetailView(document: document)) {
                    DocumentGridCard(document: document)
                }
                .buttonStyle(PlainButtonStyle())
            }
        }
    }
}

struct DocumentListItemsView: View {
    let documents: [Document]
    
    var body: some View {
        LazyVStack(spacing: 12) {
            ForEach(documents) { document in
                NavigationLink(destination: DocumentDetailView(document: document)) {
                    DocumentListCard(document: document)
                }
                .buttonStyle(PlainButtonStyle())
            }
        }
    }
}

struct EmptyStateView: View {
    let searchText: String
    let selectedCategory: Category?
    
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 60))
                .foregroundColor(.gray)
            
            Text("No documents found")
                .font(.title2)
                .fontWeight(.semibold)
            
            if !searchText.isEmpty || selectedCategory != nil {
                Text("Try adjusting your search or filters")
                    .foregroundColor(.secondary)
            } else {
                Text("Scan your first document to get started")
                    .foregroundColor(.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#Preview {
    DocumentListView()
        .environmentObject(DocumentViewModel())
        .environmentObject(AuthService())
}