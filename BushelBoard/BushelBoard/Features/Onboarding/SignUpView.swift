import SwiftUI

/// Sign-up flow: role selection, postal code, farm details.
/// Farmers need postal code (for FSA-based local intel).
/// Elevator operators need elevator name and location.
struct SignUpView: View {
    @Environment(AuthManager.self) private var auth
    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var role: UserRole = .farmer
    @State private var farmerName = ""
    @State private var farmName = ""
    @State private var postalCode = ""
    // Operator-specific fields
    @State private var companyName = ""
    @State private var facilityName = ""
    @State private var facilityType: FacilityType = .elevator
    @State private var facilityPostalCode = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    enum UserRole: String, CaseIterable {
        case farmer
        case elevator
        case observer

        var displayName: String {
            switch self {
            case .farmer: return "Farmer"
            case .elevator: return "Elevator / Processor"
            case .observer: return "Observer"
            }
        }

        var icon: String {
            switch self {
            case .farmer: return "leaf.fill"
            case .elevator: return "building.2.fill"
            case .observer: return "eye.fill"
            }
        }
    }

    enum FacilityType: String, CaseIterable {
        case elevator
        case crusher
        case mill
        case terminal

        var displayName: String {
            switch self {
            case .elevator: return "Grain Elevator"
            case .crusher: return "Crushing Plant"
            case .mill: return "Flour Mill"
            case .terminal: return "Terminal"
            }
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                // Role selection
                Section("I am a...") {
                    Picker("Role", selection: $role) {
                        ForEach(UserRole.allCases, id: \.self) { r in
                            Label(r.displayName, systemImage: r.icon).tag(r)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                // Account
                Section("Account") {
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)

                    SecureField("Password", text: $password)
                        .textContentType(.newPassword)

                    SecureField("Confirm password", text: $confirmPassword)
                        .textContentType(.newPassword)
                }

                // Farmer-specific fields
                if role == .farmer {
                    Section("About your farm") {
                        TextField("Your name", text: $farmerName)
                            .textContentType(.name)

                        TextField("Farm name (optional)", text: $farmName)

                        TextField("Postal code", text: $postalCode)
                            .textContentType(.postalCode)
                            .autocapitalization(.allCharacters)

                        if !postalCode.isEmpty && postalCode.count >= 3 {
                            Label("Area: \(String(postalCode.prefix(3)).uppercased())",
                                  systemImage: "mappin.circle.fill")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                // Operator-specific fields
                if role == .elevator {
                    Section("About your facility") {
                        TextField("Company name", text: $companyName)
                            .textContentType(.organizationName)

                        TextField("Facility / elevator name", text: $facilityName)

                        Picker("Facility type", selection: $facilityType) {
                            ForEach(FacilityType.allCases, id: \.self) { type in
                                Text(type.displayName).tag(type)
                            }
                        }

                        TextField("Facility postal code", text: $facilityPostalCode)
                            .textContentType(.postalCode)
                            .autocapitalization(.allCharacters)

                        if !facilityPostalCode.isEmpty && facilityPostalCode.count >= 3 {
                            Label("Service area: \(String(facilityPostalCode.prefix(3)).uppercased())",
                                  systemImage: "mappin.circle.fill")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Section {
                        Label("Farmers in your area will see your posted prices with your facility name — never your personal info.", systemImage: "lock.shield.fill")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                // Privacy transparency (farmer and observer roles)
                if role == .farmer || role == .observer {
                    Section {
                        VStack(alignment: .leading, spacing: 8) {
                            Label("How Bushy handles your data", systemImage: "lock.shield.fill")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .foregroundStyle(Color.prairie)

                            Text("Bushy shares area-level insights to help everyone — like \"a few of your neighbors\" or \"prices in your area\" — but never your name, farm name, exact location, or individual data.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                // Error
                if let error = errorMessage {
                    Section {
                        Text(error)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }

                // Submit
                Section {
                    Button {
                        signUp()
                    } label: {
                        if isLoading {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Create Account")
                                .frame(maxWidth: .infinity)
                                .fontWeight(.semibold)
                        }
                    }
                    .disabled(!isFormValid || isLoading)
                }
            }
            .navigationTitle("Create Account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private var isFormValid: Bool {
        guard !email.isEmpty, password.count >= 6, password == confirmPassword else { return false }
        switch role {
        case .farmer: return !postalCode.isEmpty
        case .elevator: return !facilityName.isEmpty && !facilityPostalCode.isEmpty
        case .observer: return true
        }
    }

    private func signUp() {
        isLoading = true
        errorMessage = nil
        Task {
            do {
                try await auth.signUp(
                    email: email,
                    password: password,
                    role: role.rawValue,
                    postalCode: postalCode.isEmpty ? nil : postalCode,
                    farmerName: farmerName.isEmpty ? nil : farmerName,
                    farmName: farmName.isEmpty ? nil : farmName,
                    companyName: companyName.isEmpty ? nil : companyName,
                    facilityName: facilityName.isEmpty ? nil : facilityName,
                    facilityType: role == .elevator ? facilityType.rawValue : nil,
                    facilityPostalCode: facilityPostalCode.isEmpty ? nil : facilityPostalCode
                )
                dismiss()
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}
