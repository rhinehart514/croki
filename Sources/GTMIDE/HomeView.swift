import SwiftUI

/// The all-projects home: a grid of project cards, each a mini-dashboard.
struct HomeView: View {
    @Environment(ProjectStore.self) private var store

    private let columns = [GridItem(.adaptive(minimum: 260, maximum: 360), spacing: 16)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Your projects")
                        .font(.largeTitle.bold())
                    Text("Product + GTM health across everything you're building")
                        .foregroundStyle(.secondary)
                }

                LazyVGrid(columns: columns, alignment: .leading, spacing: 16) {
                    ForEach(store.projects) { project in
                        ProjectCard(project: project)
                            .onTapGesture { store.openProject = project }
                    }
                }
            }
            .padding(28)
        }
        .background(.background)
    }
}

/// One project, as a mini-dashboard card: name, two health rings, the one open question.
struct ProjectCard: View {
    let project: Project

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text(project.name).font(.headline)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }

            HStack(spacing: 20) {
                HealthRing(label: "product", value: project.productHealth)
                HealthRing(label: "gtm", value: project.gtmHealth)
                Spacer()
            }

            Text(project.openQuestion)
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Text(project.repoPath)
                .font(.caption2.monospaced())
                .foregroundStyle(.tertiary)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(.quaternary, lineWidth: 1))
        .contentShape(Rectangle())
    }
}
