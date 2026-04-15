import SwiftUI

/// Me tab — profile, alerts, settings, delivery history.
/// Secondary tab; most action happens in Chat.
struct MeView: View {
    @Environment(AuthManager.self) private var auth
    @State private var showMyFarm = false

    var body: some View {
        NavigationStack {
            List {
                // Profile section
                Section {
                    if let profile = auth.userProfile {
                        HStack(spacing: 12) {
                            Image(systemName: "person.crop.circle.fill")
                                .font(.system(size: 44))
                                .foregroundStyle(Color.canola)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(profile.farmerName ?? profile.email)
                                    .font(.headline)

                                if let farm = profile.farmName {
                                    Text(farm)
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }

                                if let fsa = profile.fsaCode {
                                    Label("Area: \(fsa)", systemImage: "mappin.circle")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                // Farm section
                Section("My Farm") {
                    Button {
                        showMyFarm = true
                    } label: {
                        Label("Crop Plans & Deliveries", systemImage: "leaf.fill")
                    }

                    Label("Contract Progress", systemImage: "chart.bar.fill")
                        .foregroundStyle(.secondary)
                }

                // Alerts section
                Section("Alerts") {
                    Label("Basis Threshold Alerts", systemImage: "bell.badge.fill")
                        .foregroundStyle(.secondary)

                    Label("Weekly Intelligence", systemImage: "newspaper.fill")
                        .foregroundStyle(.secondary)

                    Text("Coming soon")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }

                // Settings section
                Section("Settings") {
                    Label("Notification Preferences", systemImage: "gearshape.fill")
                        .foregroundStyle(.secondary)

                    Label("Data & Privacy", systemImage: "hand.raised.fill")
                        .foregroundStyle(.secondary)
                }

                // Sign out
                Section {
                    Button(role: .destructive) {
                        Task { try? await auth.signOut() }
                    } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
            .navigationTitle("Me")
            .sheet(isPresented: $showMyFarm) {
                MyFarmSheet()
            }
        }
    }
}

// MARK: - My Farm Sheet (placeholder for Phase 2)

struct MyFarmSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Image(systemName: "leaf.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(Color.canola)

                Text("My Farm")
                    .font(.title2)
                    .fontWeight(.bold)

                Text("Crop plans, delivery history, and percentile comparisons coming in Phase 2.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
            .navigationTitle("My Farm")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
