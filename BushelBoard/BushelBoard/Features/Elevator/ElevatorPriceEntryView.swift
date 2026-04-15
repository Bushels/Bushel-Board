import SwiftUI

/// Structured price entry form for elevator/processor operators.
/// Alternative to chat-paste: grain picker, grade, price, basis, FSA targeting.
/// Calls save_elevator_prices tool via the chat-completion Edge Function.
struct ElevatorPriceEntryView: View {
    @Environment(AuthManager.self) private var auth
    @Environment(\.dismiss) private var dismiss

    @State private var entries: [PriceEntry] = [PriceEntry()]
    @State private var targetFSACodes: [String] = []
    @State private var isSubmitting = false
    @State private var resultMessage: String?
    @State private var showResult = false

    private let supabase = SupabaseManager.shared.client

    var body: some View {
        NavigationStack {
            Form {
                // Price entries
                ForEach($entries) { $entry in
                    priceEntrySection(entry: $entry)
                }

                // Add another price
                Section {
                    Button {
                        withAnimation { entries.append(PriceEntry()) }
                    } label: {
                        Label("Add another grain", systemImage: "plus.circle")
                    }
                }

                // FSA targeting
                Section("Target areas") {
                    ForEach(targetFSACodes.indices, id: \.self) { i in
                        HStack {
                            TextField("FSA code (e.g., T0L)", text: $targetFSACodes[i])
                                .textContentType(.postalCode)
                                .autocapitalization(.allCharacters)
                                .frame(maxWidth: 120)

                            Spacer()

                            if targetFSACodes.count > 1 {
                                Button(role: .destructive) {
                                    withAnimation { targetFSACodes.remove(at: i) }
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundStyle(.secondary)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    if targetFSACodes.count < 3 {
                        Button {
                            withAnimation { targetFSACodes.append("") }
                        } label: {
                            Label("Add area (max 3)", systemImage: "mappin.circle")
                                .font(.caption)
                        }
                    }

                    Text("Farmers in these postal areas will see your prices.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                // Submit
                Section {
                    Button {
                        submitPrices()
                    } label: {
                        if isSubmitting {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Post \(validEntryCount) Price\(validEntryCount == 1 ? "" : "s")")
                                .frame(maxWidth: .infinity)
                                .fontWeight(.semibold)
                        }
                    }
                    .disabled(!canSubmit || isSubmitting)
                }

                // Posted price history
                Section("Recently posted") {
                    Text("Price history coming soon")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Post Prices")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .alert("Prices posted", isPresented: $showResult) {
                Button("OK") { dismiss() }
            } message: {
                Text(resultMessage ?? "Done")
            }
            .onAppear {
                // Default FSA from operator's facility postal code
                if let fsa = auth.userProfile?.fsaCode {
                    targetFSACodes = [fsa]
                } else {
                    targetFSACodes = [""]
                }
            }
        }
    }

    // MARK: - Price Entry Section

    @ViewBuilder
    private func priceEntrySection(entry: Binding<PriceEntry>) -> some View {
        Section {
            // Grain picker
            Picker("Grain", selection: entry.grain) {
                ForEach(PriceEntry.grainOptions, id: \.self) { grain in
                    Text(grain).tag(grain)
                }
            }

            // Grade
            TextField("Grade (e.g., CWRS 1)", text: entry.grade)

            // Price
            HStack {
                TextField("Price ($/tonne)", value: entry.pricePerTonne, format: .number)
                    .keyboardType(.decimalPad)

                Divider()

                TextField("or $/bu", value: entry.pricePerBushel, format: .number)
                    .keyboardType(.decimalPad)
            }

            // Basis
            HStack {
                TextField("Basis", value: entry.basis, format: .number)
                    .keyboardType(.numbersAndPunctuation)

                TextField("vs (e.g., ICE Canola)", text: entry.basisReference)
            }

            // Delivery period
            Picker("Delivery", selection: entry.deliveryPeriod) {
                Text("Spot").tag("spot")
                Text("Deferred").tag("deferred")
                Text("New crop").tag("new crop")
            }
            .pickerStyle(.segmented)
        } header: {
            Text(entry.wrappedValue.grain.isEmpty ? "Price entry" : entry.wrappedValue.grain)
        }
    }

    // MARK: - Validation

    private var validEntryCount: Int {
        entries.filter(\.isValid).count
    }

    private var canSubmit: Bool {
        validEntryCount > 0 &&
        targetFSACodes.contains(where: { $0.count >= 3 })
    }

    // MARK: - Submit

    private func submitPrices() {
        isSubmitting = true

        Task {
            guard let session = try? await supabase.auth.session,
                  let facilityName = auth.userProfile?.facilityName,
                  let facilityType = auth.userProfile?.facilityType else {
                resultMessage = "Missing facility info. Check your profile."
                showResult = true
                isSubmitting = false
                return
            }

            let validEntries = entries.filter(\.isValid)
            let fsaCodes = targetFSACodes.filter { $0.count >= 3 }.map { $0.prefix(3).uppercased() }

            // Insert directly via Supabase — no need to go through chat-completion
            var savedCount = 0
            let now = Date()

            for entry in validEntries {
                let decayHours: Double = entry.deliveryPeriod == "spot" ? 72 : 168
                let expiresAt = now.addingTimeInterval(decayHours * 3600)

                let row: [String: Any?] = [
                    "operator_id": session.user.id.uuidString,
                    "facility_name": facilityName,
                    "facility_type": facilityType,
                    "grain": entry.grain,
                    "grade": entry.grade.isEmpty ? nil : entry.grade,
                    "price_per_tonne": entry.pricePerTonne,
                    "price_per_bushel": entry.pricePerBushel,
                    "basis": entry.basis,
                    "basis_reference": entry.basisReference.isEmpty ? nil : entry.basisReference,
                    "delivery_period": entry.deliveryPeriod,
                    "posted_at": ISO8601DateFormatter().string(from: now),
                    "expires_at": ISO8601DateFormatter().string(from: expiresAt),
                    "source_method": "form",
                    "target_fsa_codes": Array(fsaCodes.map { String($0) }),
                ]

                // Filter out nils for Supabase insert
                let cleanRow = row.compactMapValues { $0 }

                do {
                    try await supabase
                        .from("elevator_prices")
                        .insert(cleanRow)
                        .execute()
                    savedCount += 1
                } catch {
                    print("Price insert error for \(entry.grain): \(error)")
                }
            }

            let areas = fsaCodes.joined(separator: ", ")
            resultMessage = "Posted \(savedCount) price\(savedCount == 1 ? "" : "s") to \(areas). Farmers can see them now."
            showResult = true
            isSubmitting = false
        }
    }
}

// MARK: - Price Entry Model

struct PriceEntry: Identifiable {
    let id = UUID()
    var grain = "Wheat"
    var grade = ""
    var pricePerTonne: Double?
    var pricePerBushel: Double?
    var basis: Double?
    var basisReference = ""
    var deliveryPeriod = "spot"

    var isValid: Bool {
        !grain.isEmpty && (pricePerTonne != nil || pricePerBushel != nil || basis != nil)
    }

    static let grainOptions = [
        "Wheat", "Canola", "Barley", "Oats", "Amber Durum",
        "Flaxseed", "Peas", "Lentils", "Soybeans", "Corn",
        "Rye", "Mustard Seed",
    ]
}
