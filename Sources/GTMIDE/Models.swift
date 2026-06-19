import Foundation
import Observation

/// The two lenses over a project. Both render as node graphs; this just picks which.
enum Mode: String, CaseIterable, Identifiable {
    case product = "Product Strategy"
    case gtm = "GTM"
    var id: String { rawValue }
}

/// A repo-backed product the IDE reasons about. `productHealth` / `gtmHealth` are
/// 0...1 confidence-of-progress, rendered as rings. `openQuestion` is the one thing
/// the brain says matters most right now.
struct Project: Identifiable, Hashable {
    let id = UUID()
    var name: String
    var repoPath: String
    var productHealth: Double   // 0...1
    var gtmHealth: Double       // 0...1
    var openQuestion: String
}

/// App-wide state. Swift-native; the Node brain will populate this over JSON later.
@Observable
final class ProjectStore {
    var projects: [Project] = SampleData.projects
    var openProject: Project? = nil
}
