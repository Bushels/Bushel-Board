import SwiftUI
import AuthenticationServices

/// Sign-in screen: Sign in with Apple (primary) + email fallback.
/// Farmer-first design — warm, simple, one-thumb friendly.
struct SignInView: View {
    @Environment(AuthManager.self) private var auth
    @State private var showEmailSignIn = false
    @State private var showSignUp = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Hero
            VStack(spacing: 16) {
                Image(systemName: "leaf.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(Color.canola)

                Text("Bushels")
                    .font(.custom("Fraunces", size: 32, relativeTo: .largeTitle))
                    .fontWeight(.bold)
                    .foregroundStyle(Color.wheat900)

                Text("Your farming buddy in your pocket.")
                    .font(.body)
                    .foregroundStyle(.secondary)
            }
            .padding(.bottom, 48)

            // Sign in with Apple
            SignInWithAppleButton(.signIn, onRequest: configureAppleRequest, onCompletion: handleAppleResult)
                .signInWithAppleButtonStyle(.black)
                .frame(height: 50)
                .cornerRadius(12)
                .padding(.horizontal, 32)

            // Email sign-in
            Button {
                showEmailSignIn = true
            } label: {
                Text("Sign in with email")
                    .font(.body)
                    .fontWeight(.medium)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(Color.wheat100)
                    .foregroundStyle(Color.wheat900)
                    .cornerRadius(12)
            }
            .padding(.horizontal, 32)
            .padding(.top, 12)

            // Error
            if let error = errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .padding(.top, 8)
            }

            Spacer()

            // Sign up link
            Button {
                showSignUp = true
            } label: {
                Text("New here? **Create an account**")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding(.bottom, 32)
        }
        .background(Color.wheat50.ignoresSafeArea())
        .sheet(isPresented: $showEmailSignIn) {
            EmailSignInSheet()
        }
        .sheet(isPresented: $showSignUp) {
            SignUpView()
        }
    }

    // MARK: - Apple Sign-In

    private func configureAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        let hashedNonce = auth.generateNonce()
        request.requestedScopes = [.email, .fullName]
        request.nonce = hashedNonce
    }

    private func handleAppleResult(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            Task {
                do {
                    try await auth.signInWithApple(authorization: authorization)
                } catch {
                    errorMessage = error.localizedDescription
                }
            }
        case .failure(let error):
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Email Sign-In Sheet

struct EmailSignInSheet: View {
    @Environment(AuthManager.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)

                    SecureField("Password", text: $password)
                        .textContentType(.password)
                }

                if let error = errorMessage {
                    Section {
                        Text(error)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }

                Section {
                    Button {
                        signIn()
                    } label: {
                        if isLoading {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Sign In")
                                .frame(maxWidth: .infinity)
                                .fontWeight(.semibold)
                        }
                    }
                    .disabled(email.isEmpty || password.isEmpty || isLoading)
                }
            }
            .navigationTitle("Sign In")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func signIn() {
        isLoading = true
        errorMessage = nil
        Task {
            do {
                try await auth.signIn(email: email, password: password)
                dismiss()
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}
