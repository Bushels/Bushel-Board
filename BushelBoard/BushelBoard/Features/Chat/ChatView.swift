import SwiftUI

/// Primary chat interface — the root screen of the app.
/// Messages-like layout with typed cards (not markdown).
struct ChatView: View {
    @State private var viewModel = ChatViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Message list
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(viewModel.messages) { message in
                                MessageBubble(message: message)
                                    .id(message.id)
                            }
                        }
                        .padding()
                    }
                    .onChange(of: viewModel.messages.count) {
                        if let last = viewModel.messages.last {
                            withAnimation {
                                proxy.scrollTo(last.id, anchor: .bottom)
                            }
                        }
                    }
                }

                // Composer
                ChatComposer(
                    text: $viewModel.inputText,
                    quickChips: viewModel.quickChips,
                    onSend: { viewModel.sendMessage() },
                    onChipTap: { chip in viewModel.inputText = chip }
                )
            }
            .navigationTitle("Bushel Board")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

// Placeholder views — implemented in Phase 1
struct MessageBubble: View {
    let message: ChatMessage
    var body: some View {
        Text(message.content)
    }
}

struct ChatComposer: View {
    @Binding var text: String
    let quickChips: [String]
    let onSend: () -> Void
    let onChipTap: (String) -> Void
    var body: some View {
        Text("Composer placeholder")
    }
}

struct MeView: View {
    var body: some View {
        Text("Me tab placeholder")
    }
}

struct SignInView: View {
    var body: some View {
        Text("Sign in placeholder")
    }
}
