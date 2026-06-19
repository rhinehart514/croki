import SwiftUI

// GTM IDE — an AI go-to-market IDE for vibe-coded products.
// Native SwiftUI shell. The "brain" (repo comprehension) runs as a Node sidecar
// the app talks to over JSON (see ../brain). This file is the app entry point.
//
// Requires full Xcode to build (Command Line Tools alone cannot compile SwiftUI).
// Open ~/gtm-ide in Xcode, or `swift run` once a full Xcode toolchain is selected.

@main
struct GTMIDEApp: App {
    @State private var store = ProjectStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .frame(minWidth: 1040, minHeight: 680)
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified)
    }
}

/// Routes between the all-projects home and a single project.
struct RootView: View {
    @Environment(ProjectStore.self) private var store

    var body: some View {
        if let project = store.openProject {
            ProjectView(project: project) { store.openProject = nil }
        } else {
            HomeView()
        }
    }
}
