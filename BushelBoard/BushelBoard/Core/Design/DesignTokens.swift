import SwiftUI

// MARK: - Color Tokens (Wheat Palette)

extension Color {
    // Background
    static let wheat50 = Color(hex: "f5f3ee")
    static let wheat100 = Color(hex: "e8e4d9")
    static let wheat200 = Color(hex: "d4cdb8")
    static let wheat900 = Color(hex: "2a261e")

    // Primary
    static let canola = Color(hex: "c17f24")

    // Success
    static let prairie = Color(hex: "437a22")

    // Warning
    static let warning = Color(hex: "d97706")

    // Province Colors
    static let provinceAB = Color(hex: "2e6b9e")
    static let provinceBC = Color(hex: "2f8f83")
    static let provinceSK = Color(hex: "6d9e3a")
    static let provinceMB = Color(hex: "b37d24")

    // Convenience initializer from hex
    init(hex: String) {
        let scanner = Scanner(string: hex)
        var rgb: UInt64 = 0
        scanner.scanHexInt64(&rgb)
        self.init(
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255
        )
    }
}

// MARK: - Shadow Tokens

extension View {
    func glassShadowSm() -> some View {
        shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    func glassShadowMd() -> some View {
        shadow(color: .black.opacity(0.06), radius: 8, y: 4)
            .shadow(color: .black.opacity(0.04), radius: 2, y: 1)
    }
}

// MARK: - Confidence Levels

enum ConfidenceLevel: String, Codable {
    case earlyRead = "Early read"
    case solidRead = "Solid read"
    case strongRead = "Strong read"
}
