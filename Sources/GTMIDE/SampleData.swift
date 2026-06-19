import Foundation

/// Placeholder portfolio until the Node brain reads the real repos.
/// These are the founder's actual ventures, so the first dogfood targets are real.
enum SampleData {
    static let projects: [Project] = [
        Project(name: "Buffalo Projects",
                repoPath: "~/Buffalo-Projects",
                productHealth: 0.6, gtmHealth: 0.25,
                openQuestion: "Can't tell what creates active projects yet."),
        Project(name: "RodentRadar",
                repoPath: "~/rodentradar",
                productHealth: 0.45, gtmHealth: 0.15,
                openQuestion: "Buyer still unclear — pilot not signed."),
        Project(name: "Nursing Sim",
                repoPath: "~/nursing",
                productHealth: 0.3, gtmHealth: 0.1,
                openQuestion: "Scenario eval not defined."),
        Project(name: "Venture",
                repoPath: "~/venture",
                productHealth: 0.5, gtmHealth: 0.2,
                openQuestion: "Not yet run live on a real venture."),
    ]
}
