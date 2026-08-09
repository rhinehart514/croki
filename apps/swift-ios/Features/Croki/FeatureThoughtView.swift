import Foundation

public struct FeatureThoughtView: Sendable, Equatable, Identifiable {
    public enum Representation: String, Sendable, CaseIterable {
        case system, comparison, possibility, causal, temporal, experience, evidence, counterfactual

        var label: String {
            switch self {
            case .possibility: "Possible worlds"
            default: rawValue.capitalized
            }
        }
    }

    public struct Statement: Sendable, Equatable, Identifiable {
        public enum EpistemicState: String, Sendable {
            case observed, attributed, derived, inferred, hypothetical, contradicted, uncovered

            var label: String {
                switch self {
                case .uncovered: "Not in sources"
                default: rawValue.capitalized
                }
            }
        }

        public let id: String
        public let objectID: String
        public let title: String
        public let body: String
        public let epistemicState: EpistemicState
        public let sourceID: String
        public let sourceURI: String?
        public let revision: Int
    }

    public struct Region: Sendable, Equatable, Identifiable {
        public let id: String
        public let title: String
        public let statementIDs: [String]
    }

    public let id: String
    public let sourceRevision: Int
    public let representation: Representation
    public let alternateRepresentation: Representation
    public let question: String
    public let coverage: String
    public let foregrounds: [String]
    public let omissions: [String]
    public let statements: [Statement]
    public let regions: [Region]
}

enum FeatureThoughtViewCompiler {
    static func compile(
        snapshot: CrokiPerceptionSnapshot,
        question: String,
        alternate: Bool
    ) -> FeatureThoughtView? {
        let objects = snapshot.objects.filter(isSemantic).prefix(18)
        guard objects.count >= 2 else { return nil }
        let primary = representation(for: question, snapshot: snapshot)
        let representation = alternate ? alternateRepresentation(primary) : primary
        let statements = objects.map(statement)
        let midpoint = max(1, Int(ceil(Double(statements.count) / 2)))
        let regions: [FeatureThoughtView.Region]
        if representation == .comparison || representation == .possibility {
            regions = [
                .init(id: "world-a", title: "One world", statementIDs: statements.prefix(midpoint).map(\.id)),
                .init(id: "world-b", title: "Another world", statementIDs: statements.dropFirst(midpoint).map(\.id)),
            ].filter { !$0.statementIDs.isEmpty }
        } else if representation == .temporal {
            let ordered = statements.sorted { $0.revision < $1.revision }
            let third = max(1, Int(ceil(Double(ordered.count) / 3)))
            regions = [
                .init(id: "earlier", title: "Earlier", statementIDs: ordered.prefix(third).map(\.id)),
                .init(id: "developing", title: "Developing", statementIDs: ordered.dropFirst(third).prefix(third).map(\.id)),
                .init(id: "now", title: "Now", statementIDs: ordered.dropFirst(third * 2).map(\.id)),
            ].filter { !$0.statementIDs.isEmpty }
        } else {
            let exploratory = statements.filter { [.inferred, .hypothetical, .uncovered].contains($0.epistemicState) }
            let evidence = statements.filter { !exploratory.contains($0) }
            regions = [
                .init(id: "focus", title: focusTitle(representation), statementIDs: exploratory.map(\.id)),
                .init(id: "evidence", title: "What the sources show", statementIDs: evidence.map(\.id)),
            ].filter { !$0.statementIDs.isEmpty }
        }
        let kinds = Set(objects.map(\.source.kind))
        return FeatureThoughtView(
            id: "view-\(snapshot.revision)-\(representation.rawValue)",
            sourceRevision: snapshot.revision,
            representation: representation,
            alternateRepresentation: alternateRepresentation(representation),
            question: normalizedQuestion(question),
            coverage: "\(objects.count) observations across \(kinds.count) source families",
            foregrounds: foregrounds(representation),
            omissions: snapshot.truncated
                ? ["Sources outside bounded perception", "Private model reasoning"]
                : ["Private model reasoning"],
            statements: statements,
            regions: regions
        )
    }

    private static func statement(_ object: CrokiPerceptionObject) -> FeatureThoughtView.Statement {
        .init(
            id: "statement:\(object.id)",
            objectID: object.id,
            title: object.title,
            body: object.summary ?? "",
            epistemicState: epistemicState(object),
            sourceID: "source:\(object.id)",
            sourceURI: object.source.uri,
            revision: object.revision
        )
    }

    private static func representation(
        for question: String,
        snapshot: CrokiPerceptionSnapshot
    ) -> FeatureThoughtView.Representation {
        let value = question.lowercased()
        if contains(value, ["compare", "versus", "alternative", "tradeoff", "option"]) { return .comparison }
        if contains(value, ["before", "after", "changed", "history", "timeline", "release", "when"]) { return .temporal }
        if contains(value, ["customer", "user", "journey", "experience", "friction"]) { return .experience }
        if contains(value, ["evidence", "proof", "contradict", "source", "support"]) { return .evidence }
        if contains(value, ["what if", "counterfactual", "assumption", "scenario"]) { return .counterfactual }
        if contains(value, ["why", "cause", "leverage", "effect", "consequence"]) { return .causal }
        return snapshot.relationships.count >= max(2, snapshot.objects.count - 1) ? .system : .possibility
    }

    private static func alternateRepresentation(
        _ representation: FeatureThoughtView.Representation
    ) -> FeatureThoughtView.Representation {
        switch representation {
        case .comparison: .causal
        case .causal: .temporal
        case .temporal: .evidence
        case .experience: .system
        case .evidence: .comparison
        case .counterfactual: .causal
        case .system: .possibility
        case .possibility: .comparison
        }
    }

    private static func epistemicState(
        _ object: CrokiPerceptionObject
    ) -> FeatureThoughtView.Statement.EpistemicState {
        let value = "\(object.type) \(object.state ?? "")".lowercased()
        if contains(value, ["contradict", "conflict", "invalid"]) { return .contradicted }
        if contains(value, ["hypothesis", "scenario", "provisional", "proposal", "candidate"]) { return .hypothetical }
        if contains(value, ["inferred", "interpretation"]) { return .inferred }
        if contains(value, ["derived", "computed"]) { return .derived }
        if contains(value, ["uncovered", "missing", "unknown", "gap"]) { return .uncovered }
        return contains(object.source.kind.lowercased(), ["provider", "assistant", "thread"])
            ? .attributed : .observed
    }

    private static func foregrounds(_ representation: FeatureThoughtView.Representation) -> [String] {
        switch representation {
        case .comparison: ["Materially different possibilities", "Consequences in current sources"]
        case .temporal: ["Change across revisions", "The current edge of the work"]
        case .causal: ["Candidate causes and consequences", "Contradictory evidence"]
        case .experience: ["User trigger, action, friction, and result"]
        case .evidence: ["Support, contradiction, and coverage"]
        case .counterfactual: ["Hypotheses and downstream effects"]
        case .system: ["Boundaries, dependencies, and flows"]
        case .possibility: ["Different coherent readings of the work"]
        }
    }

    private static func focusTitle(_ representation: FeatureThoughtView.Representation) -> String {
        switch representation {
        case .causal: "What appears to shape the outcome"
        case .system: "The system under attention"
        case .experience: "The lived path"
        case .evidence: "The claim under examination"
        case .counterfactual: "The assumption being changed"
        default: "What matters"
        }
    }

    private static func isSemantic(_ object: CrokiPerceptionObject) -> Bool {
        let value = "\(object.type) \(object.source.kind) \(object.title)".lowercased()
        return !contains(value, ["context window", "ran command", "runtime", "tool"])
    }

    private static func normalizedQuestion(_ question: String) -> String {
        let markers = [
            "\n\nCroki perception focus",
            "\n\nView selection",
            "\n\nCanvas selection",
            "\n\nTerminal context",
            "\n\nPreview annotation",
            "\n\nReview comments",
        ]
        let boundary = markers.compactMap { question.range(of: $0)?.lowerBound }.min()
        let visibleQuestion = boundary.map { String(question[..<$0]) } ?? question
        let normalized = visibleQuestion.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        return normalized.isEmpty ? "What structure matters in the current work?" : normalized
    }

    private static func contains(_ value: String, _ terms: [String]) -> Bool {
        terms.contains { value.contains($0) }
    }
}
