import SwiftUI

struct SearchView: View {
    @State private var searchText = ""
    
    var body: some View {
        NavigationStack {
            VStack {
                Text("Search functionality coming soon")
                    .foregroundColor(.secondary)
            }
            .navigationTitle("Search")
            .searchable(text: $searchText)
        }
    }
}

#Preview {
    SearchView()
}