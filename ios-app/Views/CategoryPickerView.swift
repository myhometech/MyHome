import SwiftUI

struct CategoryPickerView: View {
    @Binding var selectedCategory: Category?
    @Binding var documentName: String
    @Binding var tags: String
    let onSave: () -> Void
    
    @Environment(\.dismiss) private var dismiss
    @State private var showingAlert = false
    
    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Document Details")) {
                    TextField("Document Name", text: $documentName)
                    
                    TextField("Tags (comma separated)", text: $tags)
                        .textInputAutocapitalization(.never)
                }
                
                Section(header: Text("Category")) {
                    LazyVGrid(columns: [
                        GridItem(.flexible()),
                        GridItem(.flexible())
                    ], spacing: 12) {
                        ForEach(Category.defaultCategories) { category in
                            CategoryCard(
                                category: category,
                                isSelected: selectedCategory?.id == category.id
                            ) {
                                selectedCategory = category
                            }
                        }
                    }
                }
            }
            .navigationTitle("Save Document")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        if documentName.trimmingCharacters(in: .whitespaces).isEmpty {
                            showingAlert = true
                        } else {
                            onSave()
                            dismiss()
                        }
                    }
                    .fontWeight(.semibold)
                }
            }
        }
        .alert("Document Name Required", isPresented: $showingAlert) {
            Button("OK") { }
        } message: {
            Text("Please enter a name for your document.")
        }
    }
}

struct CategoryCard: View {
    let category: Category
    let isSelected: Bool
    let onTap: () -> Void
    
    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 8) {
                Image(systemName: category.iconName)
                    .font(.title2)
                    .foregroundColor(isSelected ? .white : category.colorValue)
                
                Text(category.name)
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundColor(isSelected ? .white : .primary)
            }
            .frame(height: 80)
            .frame(maxWidth: .infinity)
            .background(isSelected ? category.colorValue : Color(.secondarySystemBackground))
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(category.colorValue, lineWidth: isSelected ? 0 : 1)
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

#Preview {
    CategoryPickerView(
        selectedCategory: .constant(nil),
        documentName: .constant(""),
        tags: .constant(""),
        onSave: {}
    )
}