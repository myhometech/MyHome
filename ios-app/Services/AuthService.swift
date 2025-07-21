import Foundation
import AuthenticationServices
import Combine

class AuthService: NSObject, ObservableObject {
    @Published var isAuthenticated = false
    @Published var user: User?
    @Published var isLoading = false
    
    private let apiService = APIService()
    private var cancellables = Set<AnyCancellable>()
    
    override init() {
        super.init()
    }
    
    func checkAuthenticationState() {
        isLoading = true
        
        // Check for existing Apple ID credential
        let provider = ASAuthorizationAppleIDProvider()
        
        if let userID = UserDefaults.standard.string(forKey: "appleUserID") {
            provider.getCredentialState(forUserID: userID) { [weak self] credentialState, error in
                DispatchQueue.main.async {
                    switch credentialState {
                    case .authorized:
                        self?.fetchUserProfile()
                    case .revoked, .notFound:
                        self?.signOut()
                    default:
                        self?.isLoading = false
                    }
                }
            }
        } else {
            isLoading = false
        }
    }
    
    func handleSignInWithAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        request.requestedScopes = [.fullName, .email]
        request.nonce = UUID().uuidString
    }
    
    func handleSignInWithAppleCompletion(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            handleSignInSuccess(authorization)
        case .failure(let error):
            print("Sign in failed: \(error.localizedDescription)")
        }
    }
    
    private func handleSignInSuccess(_ authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            return
        }
        
        isLoading = true
        
        // Store user ID for future credential checks
        UserDefaults.standard.set(credential.user, forKey: "appleUserID")
        
        // Extract user information
        let userID = credential.user
        let email = credential.email
        let firstName = credential.fullName?.givenName
        let lastName = credential.fullName?.familyName
        
        // Create user object for backend
        let userData = [
            "id": userID,
            "email": email as Any,
            "firstName": firstName as Any,
            "lastName": lastName as Any,
            "profileImageUrl": NSNull()
        ]
        
        // Send to backend for user creation/update
        apiService.signInWithApple(userData: userData)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { [weak self] completion in
                    if case .failure(let error) = completion {
                        print("Backend sign in failed: \(error)")
                        self?.isLoading = false
                    }
                },
                receiveValue: { [weak self] user in
                    self?.user = user
                    self?.isAuthenticated = true
                    self?.isLoading = false
                }
            )
            .store(in: &cancellables)
    }
    
    private func fetchUserProfile() {
        apiService.fetchUserProfile()
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { [weak self] completion in
                    if case .failure = completion {
                        self?.signOut()
                    }
                },
                receiveValue: { [weak self] user in
                    self?.user = user
                    self?.isAuthenticated = true
                    self?.isLoading = false
                }
            )
            .store(in: &cancellables)
    }
    
    func signOut() {
        isAuthenticated = false
        user = nil
        UserDefaults.standard.removeObject(forKey: "appleUserID")
        UserDefaults.standard.removeObject(forKey: "authToken")
        
        // Call backend logout endpoint
        apiService.signOut()
            .sink(receiveCompletion: { _ in }, receiveValue: { _ in })
            .store(in: &cancellables)
    }
}

// MARK: - ASAuthorizationControllerDelegate
extension AuthService: ASAuthorizationControllerDelegate {
    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        handleSignInSuccess(authorization)
    }
    
    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        print("Authorization failed: \(error.localizedDescription)")
        isLoading = false
    }
}