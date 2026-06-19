import SwiftUI

/// A small progress ring used for product / GTM health on the project cards.
struct HealthRing: View {
    let label: String
    let value: Double   // 0...1

    private var tint: Color {
        switch value {
        case ..<0.34: return .red
        case ..<0.67: return .orange
        default:      return .green
        }
    }

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .stroke(.quaternary, lineWidth: 4)
                Circle()
                    .trim(from: 0, to: max(0.001, value))
                    .stroke(tint, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            .frame(width: 34, height: 34)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}
