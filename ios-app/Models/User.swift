import Foundation

struct User: Codable, Identifiable {
    let id: String
    let email: String?
    let firstName: String?
    let lastName: String?
    let profileImageUrl: String?
    let createdAt: Date?
    let updatedAt: Date?
    
    var displayName: String {
        if let firstName = firstName, let lastName = lastName {
            return "\(firstName) \(lastName)"
        } else if let firstName = firstName {
            return firstName
        } else {
            return email ?? "User"
        }
    }
    
    var initials: String {
        if let firstName = firstName, let lastName = lastName {
            return "\(firstName.prefix(1))\(lastName.prefix(1))".uppercased()
        } else if let firstName = firstName {
            return String(firstName.prefix(1)).uppercased()
        } else if let email = email {
            return String(email.prefix(1)).uppercased()
        } else {
            return "U"
        }
    }
}