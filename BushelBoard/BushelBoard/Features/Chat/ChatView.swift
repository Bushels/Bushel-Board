import SwiftUI

/// Primary chat interface — the root screen of the app.
/// Messages-like layout with typed cards (not markdown).
struct ChatView: View {
    @State private var viewModel = ChatViewModel()
    @Environment(AuthManager.self) private var auth
    @State private var showGrainDetail: String?
    @Binding var deepLinkPrompt: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Message list
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            // Welcome message for empty state
                            if viewModel.messages.isEmpty && !viewModel.isLoading {
                                WelcomeView(onChipTap: { chip in
                                    viewModel.inputText = chip
                                    viewModel.sendMessage()
                                })
                                .padding(.top, 40)
                            }

                            ForEach(viewModel.messages) { message in
                                MessageBubble(
                                    message: message,
                                    onVerificationConfirm: {
                                        viewModel.handleVerification(messageId: message.id, confirmed: true)
                                    },
                                    onVerificationDeny: {
                                        viewModel.handleVerification(messageId: message.id, confirmed: false)
                                    },
                                    onVerificationCorrect: { correction in
                                        viewModel.handleVerificationCorrection(messageId: message.id, correction: correction)
                                    }
                                )
                                .id(message.id)
                                .transition(.asymmetric(
                                    insertion: .opacity.combined(with: .move(edge: .bottom)),
                                    removal: .opacity
                                ))
                            }
                        }
                        .padding()
                        .animation(.easeOut(duration: 0.25), value: viewModel.messages.count)
                    }
                    .onChange(of: viewModel.messages.count) {
                        if let last = viewModel.messages.last {
                            withAnimation(.easeOut(duration: 0.3)) {
                                proxy.scrollTo(last.id, anchor: .bottom)
                            }
                        }
                    }
                    .scrollDismissesKeyboard(.interactively)
                }

                // Composer
                ChatComposerView(
                    text: $viewModel.inputText,
                    quickChips: viewModel.quickChips,
                    isLoading: viewModel.isLoading,
                    onSend: { viewModel.sendMessage() },
                    onChipTap: { chip in viewModel.inputText = chip }
                )
            }
            .navigationTitle("Bushels")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(item: $showGrainDetail) { grain in
                GrainDetailSheet(grain: grain)
            }
        }
        .task {
            viewModel.loadQuickChips(for: auth.userProfile)
        }
        .onChange(of: deepLinkPrompt) {
            // Handle deep link from widget/push/Siri
            if let prompt = deepLinkPrompt {
                viewModel.inputText = prompt
                viewModel.sendMessage()
                deepLinkPrompt = nil
            }
        }
    }
}

// MARK: - Grain name as sheet Identifiable

extension String: @retroactive Identifiable {
    public var id: String { self }
}

// MARK: - Welcome View (Empty State)

struct WelcomeView: View {
    let onChipTap: (String) -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "leaf.fill")
                .font(.system(size: 40))
                .foregroundStyle(Color.canola)

            Text("Hey, I'm Bushy.")
                .font(.custom("Fraunces", size: 24, relativeTo: .title2))
                .fontWeight(.bold)

            Text("I'm your farming buddy. Ask me anything about your crops, local markets, or what the neighbors are up to.")
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Text("I share useful info in chats to help everyone make better decisions, but I never share anything personal. No names, no farm names, no exact spots. Just area-level stuff.")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            // Starter chips
            VStack(spacing: 8) {
                starterChip("Should I be hauling my wheat?")
                starterChip("What's canola doing this week?")
                starterChip("How does my area compare?")
            }
            .padding(.top, 8)

        }
    }

    private func starterChip(_ text: String) -> some View {
        Button {
            onChipTap(text)
        } label: {
            Text(text)
                .font(.subheadline)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity)
                .background(Color.wheat100)
                .foregroundStyle(Color.wheat900)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .padding(.horizontal, 32)
    }
}

// MARK: - Grain Detail Sheet (placeholder for Phase 1)

struct GrainDetailSheet: View {
    let grain: String

    var body: some View {
        NavigationStack {
            VStack {
                Text("Grain Detail: \(grain)")
                    .font(.title2)
                Text("Full grain dashboard coming in Phase 2")
                    .foregroundStyle(.secondary)
            }
            .navigationTitle(grain)
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
