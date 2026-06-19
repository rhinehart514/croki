import SwiftUI

/// A single project: the Product⇄GTM workbench.
/// Layout = agent chat (left) · canvas (center) · node detail (right) · console (bottom).
/// The canvas is a placeholder until we settle native-SwiftUI vs embedded Vue Flow.
struct ProjectView: View {
    let project: Project
    var onBack: () -> Void

    @State private var mode: Mode = .gtm

    var body: some View {
        VStack(spacing: 0) {
            topBar
            Divider()
            HStack(spacing: 0) {
                AgentChatPanel()
                    .frame(width: 280)
                Divider()
                VStack(spacing: 0) {
                    CanvasPlaceholder(mode: mode)
                    Divider()
                    ConsolePanel()
                        .frame(height: 150)
                }
                Divider()
                NodeDetailPanel()
                    .frame(width: 300)
            }
        }
        .background(.background)
    }

    private var topBar: some View {
        HStack(spacing: 12) {
            Button(action: onBack) {
                Label("Projects", systemImage: "chevron.left")
            }
            .buttonStyle(.plain)

            Text(project.name).font(.headline)

            Spacer()

            Picker("", selection: $mode) {
                ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .frame(width: 280)

            Spacer()

            Text(project.repoPath)
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }
}

// MARK: - Panels (scaffolds; wired to the Node brain next)

private struct AgentChatPanel: View {
    var body: some View {
        PanelScaffold(title: "Agent", systemImage: "sparkles") {
            Text("Claude drives the canvas from here. Wired to the Node brain next.")
                .font(.callout).foregroundStyle(.secondary)
        }
    }
}

private struct CanvasPlaceholder: View {
    let mode: Mode
    var body: some View {
        ZStack {
            Color(nsColor: .textBackgroundColor)
            VStack(spacing: 8) {
                Image(systemName: "point.3.connected.trianglepath.dotted")
                    .font(.system(size: 34)).foregroundStyle(.tertiary)
                Text(mode == .gtm ? "GTM graph — truth-colored funnel"
                                  : "Product graph — JTBD + capabilities")
                    .font(.headline)
                Text("The engine renders here. Canvas: native SwiftUI vs embedded Vue Flow — TBD.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

private struct ConsolePanel: View {
    var body: some View {
        PanelScaffold(title: "Console", systemImage: "terminal") {
            Text("> claude code output streams here")
                .font(.caption.monospaced()).foregroundStyle(.secondary)
        }
    }
}

private struct NodeDetailPanel: View {
    var body: some View {
        PanelScaffold(title: "Node", systemImage: "doc.text.magnifyingglass") {
            Text("Click a node → grounded diagnosis + Build-with-tracking action.")
                .font(.callout).foregroundStyle(.secondary)
        }
    }
}

private struct PanelScaffold<Content: View>: View {
    let title: String
    let systemImage: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: systemImage)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
            content
            Spacer()
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
