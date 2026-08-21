import SwiftUI

public struct FeatureThoughtViewView: View {
    let client: any FeatureClient
    let projectID: String
    let question: String
    let onUse: (String) -> Void

    @State private var view: FeatureThoughtView?
    @State private var selectedID: String?
    @State private var alternate = false
    @State private var showsBasis = false
    @State private var isLoading = true
    @State private var errorMessage: String?

    public init(
        client: any FeatureClient,
        projectID: String,
        question: String,
        onUse: @escaping (String) -> Void
    ) {
        self.client = client
        self.projectID = projectID
        self.question = question
        self.onUse = onUse
    }

    public var body: some View {
        Group {
            if isLoading, view == nil {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text("Forming a View…")
                        .font(.caption)
                        .foregroundStyle(T3Colors.textTertiary)
                }
                .padding(.vertical, 12)
            } else if let view {
                content(view)
            } else {
                EmptyView()
            }
        }
        .task(id: alternate) { await load() }
    }

    private func content(_ view: FeatureThoughtView) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("VIEW")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(T3Colors.textPrimary)
                    .tracking(1.1)
                Text("\(view.representation.label) · r\(view.sourceRevision)")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(T3Colors.textTertiary)
                Spacer()
                Button("Basis") {
                    showsBasis.toggle()
                }
                .font(.caption.weight(.semibold))
                .buttonStyle(.plain)
                Button("Reframe") {
                    alternate.toggle()
                }
                .font(.caption.weight(.semibold))
                .buttonStyle(.plain)
            }

            VStack(alignment: .leading, spacing: 0) {
                Text(view.question)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(T3Colors.textPrimary)
                    .padding(.top, 8)

                if showsBasis {
                    basis(view)
                        .padding(.top, 18)
                }

                ForEach(view.regions) { region in
                    let statements = region.statementIDs.compactMap { id in
                        view.statements.first { $0.id == id }
                    }
                    if !statements.isEmpty {
                        VStack(alignment: .leading, spacing: 1) {
                            HStack {
                                Text(region.title)
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(T3Colors.textSecondary)
                                Spacer()
                                Text("\(statements.count)")
                                    .font(.caption2.monospacedDigit())
                                    .foregroundStyle(T3Colors.textTertiary)
                            }
                            .padding(.bottom, 8)

                            ForEach(statements) { statement in
                                statementRow(statement, view: view)
                            }
                        }
                        .padding(.top, 26)
                    }
                }

                Text(view.coverage)
                    .font(.caption2)
                    .foregroundStyle(T3Colors.textTertiary)
                    .padding(.top, 18)
            }
        }
        .padding(16)
        .background(Color.white.opacity(0.035))
        .overlay(Rectangle().stroke(Color.white.opacity(0.12), lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("View for \(view.question)")
    }

    private func basis(_ view: FeatureThoughtView) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Text("VIEW BASIS")
                .font(.caption2.weight(.semibold))
                .tracking(1.1)
                .foregroundStyle(T3Colors.textTertiary)
            Text("Foregrounds \(view.foregrounds.joined(separator: " · "))")
                .font(.caption)
                .foregroundStyle(T3Colors.textSecondary)
            Text("Omits \(view.omissions.joined(separator: " · "))")
                .font(.caption)
                .foregroundStyle(T3Colors.textTertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.white.opacity(0.035))
        .overlay(Rectangle().stroke(Color.white.opacity(0.1), lineWidth: 1))
    }

    private func statementRow(
        _ statement: FeatureThoughtView.Statement,
        view: FeatureThoughtView
    ) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            VStack(alignment: .leading, spacing: 7) {
                Text(statement.epistemicState.label.uppercased())
                    .font(.caption2.weight(.semibold))
                    .tracking(1)
                    .foregroundStyle(epistemicColor(statement.epistemicState))
                Text(statement.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(T3Colors.textPrimary)
                    .multilineTextAlignment(.leading)
                if !statement.body.isEmpty {
                    Text(statement.body)
                        .font(.caption)
                        .foregroundStyle(T3Colors.textSecondary)
                        .multilineTextAlignment(.leading)
                        .lineLimit(4)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .onTapGesture {
                selectedID = selectedID == statement.id ? nil : statement.id
            }
            .accessibilityAction(named: "Select") {
                selectedID = statement.id
            }

            if selectedID == statement.id {
                HStack(spacing: 10) {
                    Button("Use in next message", systemImage: "arrow.turn.down.left") {
                        onUse(selectionText(statement, view: view))
                    }
                    .font(.caption.weight(.semibold))
                    .buttonStyle(.bordered)
                    .tint(.white)

                    if let sourceURI = statement.sourceURI,
                       let sourceURL = URL(string: sourceURI) {
                        Link("Open source", destination: sourceURL)
                            .font(.caption.weight(.semibold))
                    }
                }
                .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(selectedID == statement.id ? Color.white.opacity(0.08) : Color.white.opacity(0.025))
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(epistemicColor(statement.epistemicState))
                .frame(width: 2)
        }
        .accessibilityAddTraits(selectedID == statement.id ? .isSelected : [])
    }

    private func selectionText(
        _ statement: FeatureThoughtView.Statement,
        view: FeatureThoughtView
    ) -> String {
        """
        View selection · \(statement.title)
        Source: \(statement.sourceID)
        View: \(view.id) · revision \(view.sourceRevision)
        """
    }

    private func epistemicColor(
        _ state: FeatureThoughtView.Statement.EpistemicState
    ) -> Color {
        switch state {
        case .observed: .gray
        case .attributed: .cyan
        case .derived: .blue
        case .inferred: .purple
        case .hypothetical: .orange
        case .contradicted: .red
        case .uncovered: T3Colors.textTertiary
        }
    }

    @MainActor
    private func load() async {
        isLoading = true
        errorMessage = nil
        do {
            view = try await client.loadThoughtView(
                projectID: projectID,
                question: question,
                alternate: alternate
            )
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
