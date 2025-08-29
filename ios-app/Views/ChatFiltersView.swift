import SwiftUI

struct ChatFiltersView: View {
    @ObservedObject var viewModel: ChatViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var tempFilters: ChatFilters
    
    init(viewModel: ChatViewModel) {
        self.viewModel = viewModel
        self._tempFilters = State(initialValue: viewModel.filters)
    }
    
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("e.g., O2, British Gas", text: Binding(
                        get: { tempFilters.provider ?? "" },
                        set: { tempFilters.provider = $0.isEmpty ? nil : $0 }
                    ))
                } header: {
                    Text("Provider")
                } footer: {
                    Text("Filter documents by provider or company name")
                }
                
                Section {
                    Picker("Document Type", selection: Binding(
                        get: { tempFilters.docType?.first ?? "" },
                        set: { tempFilters.docType = $0.isEmpty ? nil : [$0] }
                    )) {
                        Text("All Types").tag("")
                        Text("Bills").tag("bill")
                        Text("Invoices").tag("invoice")
                        Text("Statements").tag("statement")
                        Text("Policies").tag("policy")
                        Text("Receipts").tag("receipt")
                    }
                    .pickerStyle(.menu)
                } header: {
                    Text("Document Type")
                }
                
                Section {
                    DatePicker(
                        "From Date",
                        selection: Binding(
                            get: { tempFilters.dateFrom ?? Date.distantPast },
                            set: { tempFilters.dateFrom = $0 == Date.distantPast ? nil : $0 }
                        ),
                        displayedComponents: .date
                    )
                    .datePickerStyle(.compact)
                    
                    DatePicker(
                        "To Date",
                        selection: Binding(
                            get: { tempFilters.dateTo ?? Date.distantFuture },
                            set: { tempFilters.dateTo = $0 == Date.distantFuture ? nil : $0 }
                        ),
                        displayedComponents: .date
                    )
                    .datePickerStyle(.compact)
                } header: {
                    Text("Date Range")
                } footer: {
                    Text("Filter documents by date range")
                }
                
                Section {
                    Button("Clear All Filters") {
                        tempFilters = ChatFilters()
                    }
                    .foregroundColor(.red)
                    .disabled(tempFilters.isEmpty)
                }
            }
            .navigationTitle("Search Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Apply") {
                        viewModel.applyFilters(tempFilters)
                    }
                }
            }
        }
    }
}

// Preview
struct ChatFiltersView_Previews: PreviewProvider {
    static var previews: some View {
        ChatFiltersView(viewModel: ChatViewModel())
    }
}