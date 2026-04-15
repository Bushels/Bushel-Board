import SwiftUI

/// Bottom sheet showing full transparency on why the analyst gave this read.
/// Opened by tapping the trust footer.
struct WhyThisReadSheet: View {
    let data: TrustFooterData

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Confidence header
                    HStack(spacing: 8) {
                        ConfidenceBadge(level: data.confidence)
                        Text(confidenceExplanation)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(data.confidence.color.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                    // Data sources
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Data Sources")
                            .font(.headline)

                        DataSourceRow(
                            icon: "chart.bar.fill",
                            label: "CGC Weekly Data",
                            detail: data.cgcFreshness,
                            color: .prairie
                        )

                        DataSourceRow(
                            icon: "dollarsign.circle.fill",
                            label: "Futures Prices",
                            detail: data.futuresFreshness,
                            color: .canola
                        )

                        DataSourceRow(
                            icon: "person.3.fill",
                            label: "Local Reports",
                            detail: localReportsDetail,
                            color: data.localReportCount >= 3 ? .prairie : .warning
                        )

                        if let elevator = data.elevatorPricing {
                            DataSourceRow(
                                icon: "building.2.fill",
                                label: "Elevator Pricing",
                                detail: elevator,
                                color: .provinceAB
                            )
                        }
                    }

                    // What would change
                    VStack(alignment: .leading, spacing: 8) {
                        Text("What would change this call")
                            .font(.headline)

                        Text("If basis widens past your area average, or if futures drop below support, the read could shift. New local reports also sharpen the picture.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding()
            }
            .navigationTitle("Why This Read")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var confidenceExplanation: String {
        switch data.confidence {
        case .earlyRead:
            return "Limited local data. National picture is clear, but your area needs more reports."
        case .solidRead:
            return "Good data coverage. National + local signals are painting a consistent picture."
        case .strongRead:
            return "Strong data from multiple sources. High conviction in this read."
        }
    }

    private var localReportsDetail: String {
        if data.localReportCount == 0 {
            return "No reports yet in your area"
        }
        return "\(data.localReportCount) reports, \(data.localReportFreshness)"
    }
}

// MARK: - Data Source Row

struct DataSourceRow: View {
    let icon: String
    let label: String
    let detail: String
    let color: Color

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.body)
                .foregroundStyle(color)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.subheadline)
                    .fontWeight(.medium)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .padding(12)
        .background(Color.wheat50)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}
