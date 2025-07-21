import Foundation
import SwiftUI

struct Category: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let icon: String
    let color: String
    
    var iconName: String {
        // Convert FontAwesome icons to SF Symbols
        switch icon {
        case "fas fa-bolt":
            return "bolt.fill"
        case "fas fa-shield-alt":
            return "shield.fill"
        case "fas fa-calculator":
            return "calculator"
        case "fas fa-tools":
            return "wrench.and.screwdriver.fill"
        case "fas fa-file-contract":
            return "doc.text.fill"
        case "fas fa-certificate":
            return "award.fill"
        case "fas fa-receipt":
            return "receipt.fill"
        case "fas fa-folder":
            return "folder.fill"
        default:
            return "folder.fill"
        }
    }
    
    var colorValue: Color {
        switch color {
        case "blue":
            return .blue
        case "green":
            return .green
        case "purple":
            return .purple
        case "orange":
            return .orange
        case "teal":
            return .teal
        case "indigo":
            return .indigo
        case "yellow":
            return .yellow
        case "gray":
            return .gray
        default:
            return .gray
        }
    }
}

extension Category {
    static let defaultCategories: [Category] = [
        Category(id: 1, name: "Utilities", icon: "fas fa-bolt", color: "blue"),
        Category(id: 2, name: "Insurance", icon: "fas fa-shield-alt", color: "green"),
        Category(id: 3, name: "Taxes", icon: "fas fa-calculator", color: "purple"),
        Category(id: 4, name: "Maintenance", icon: "fas fa-tools", color: "orange"),
        Category(id: 5, name: "Legal", icon: "fas fa-file-contract", color: "teal"),
        Category(id: 6, name: "Warranty", icon: "fas fa-certificate", color: "indigo"),
        Category(id: 7, name: "Receipts", icon: "fas fa-receipt", color: "yellow"),
        Category(id: 8, name: "Other", icon: "fas fa-folder", color: "gray")
    ]
}