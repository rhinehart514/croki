import Testing
@testable import T3Code

@Suite("Source-grounded thought Views")
struct ThoughtViewTests {
    @Test
    func comparisonQuestionBuildsTwoVisibleWorldsWithoutHandoffMetadata() {
        let snapshot = CrokiPerceptionSnapshot(
            revision: 7,
            truncated: false,
            objects: [
                object(id: "current", title: "Current workflow", revision: 3),
                object(id: "native", title: "Native ADE flow", revision: 7),
            ],
            relationships: []
        )

        let view = FeatureThoughtViewCompiler.compile(
            snapshot: snapshot,
            question: "Compare the current workflow with a native ADE flow\n\nCanvas selection: native",
            alternate: false
        )

        #expect(view?.representation == .comparison)
        #expect(view?.question == "Compare the current workflow with a native ADE flow")
        #expect(view?.regions.map(\.title) == ["One world", "Another world"])
        #expect(view?.statements.allSatisfy { !$0.sourceID.isEmpty } == true)
    }

    @Test
    func reframeChangesRepresentationWithoutChangingSourceStatements() {
        let snapshot = CrokiPerceptionSnapshot(
            revision: 4,
            truncated: true,
            objects: [
                object(id: "claim", title: "Claim", state: "candidate", revision: 3),
                object(id: "evidence", title: "Evidence", revision: 4),
            ],
            relationships: []
        )

        let primary = FeatureThoughtViewCompiler.compile(
            snapshot: snapshot,
            question: "Compare the evidence",
            alternate: false
        )
        let alternate = FeatureThoughtViewCompiler.compile(
            snapshot: snapshot,
            question: "Compare the evidence",
            alternate: true
        )

        #expect(primary?.representation == .comparison)
        #expect(alternate?.representation == .causal)
        #expect(primary?.statements.map(\.objectID) == alternate?.statements.map(\.objectID))
        #expect(primary?.statements.first?.epistemicState == .hypothetical)
        #expect(primary?.omissions.contains("Sources outside bounded perception") == true)
    }

    private func object(
        id: String,
        title: String,
        state: String? = nil,
        revision: Int
    ) -> CrokiPerceptionObject {
        CrokiPerceptionObject(
            id: id,
            type: "decision",
            title: title,
            summary: "Source-grounded detail",
            state: state,
            revision: revision,
            source: .init(
                kind: "file",
                id: id,
                uri: "file:///repo/\(id).md",
                sourceThreadId: nil,
                observedAt: "2026-08-08T12:00:00.000Z"
            )
        )
    }
}
