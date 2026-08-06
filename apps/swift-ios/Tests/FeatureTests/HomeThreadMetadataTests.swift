import Foundation
import Testing
@testable import T3Code

@Suite("Web V2 home thread metadata")
struct HomeThreadMetadataTests {
    private let now = Date(timeIntervalSince1970: 10_000)

    @Test
    func statusLabelsFollowTheWebV2RowVocabulary() {
        let expected: [(FeatureThreadState, HomeThreadStatus, String?)] = [
            (.idle, .ready, nil),
            (.queued, .working, "Working"),
            (.working, .working, "Working"),
            (.waitingForApproval, .approval, "Approval"),
            (.waitingForInput, .input, "Input"),
            (.failed, .failed, "Failed"),
            (.completed, .done, "Done"),
        ]

        for (state, status, label) in expected {
            let thread = FeatureThread(
                id: state.rawValue,
                projectID: "project",
                title: "Task",
                state: state
            )
            #expect(thread.homeStatus == status)
            #expect(thread.homeStatusLabel == label)
        }
    }

    @Test
    func backgroundLivenessRemainsVisibleAfterTheTurnSettles() {
        let working = FeatureThread(
            id: "working-background",
            projectID: "project",
            title: "Background work",
            state: .idle,
            backgroundLiveness: .working
        )
        let monitoring = FeatureThread(
            id: "monitoring-background",
            projectID: "project",
            title: "Watch CI",
            state: .completed,
            backgroundLiveness: .monitoring
        )

        #expect(working.homeStatus == .working)
        #expect(working.homeStatusLabel == "Working")
        #expect(monitoring.homeStatus == .monitoring)
        #expect(monitoring.homeStatusLabel == "Monitoring")
    }

    @Test
    func searchNoticesPreservePartialAndFailedEvidenceForRetry() {
        let partial = FeatureThreadSearchNotice.partial(
            unavailableEnvironmentNames: ["Office"]
        )
        let failed = FeatureThreadSearchNotice.failed(
            message: "Conversation search failed on Studio. Check that server and retry."
        )

        #expect(partial.homeMessage.contains("Office"))
        #expect(partial.homeMessage.contains("incomplete"))
        #expect(failed.homeMessage.contains("retry"))
        #expect(!failed.homeMessage.contains("No matching tasks"))
    }

    @Test
    func nativeWorkerPresentationKeepsCompleteSeparateChatsAndSearchRevealsTheFamily() {
        var parent = FeatureThread(
            id: "parent",
            projectID: "project",
            workerView: .threads,
            title: "Ship Croki"
        )
        let worker = FeatureThread(
            id: "worker",
            projectID: "project",
            parentThreadID: parent.id,
            title: "Audit updater"
        )
        let project = FeatureProject(
            id: "project",
            environmentID: "environment",
            name: "Croki",
            path: "/work/croki"
        )
        var snapshot = FeatureSnapshot(projects: [project], threads: [parent, worker])
        let separate = HomePresentation(
            snapshot: snapshot,
            query: "",
            contentMatches: [],
            projectID: nil,
            now: now
        )
        #expect(separate.active.map(\.id) == ["parent", "worker"])

        parent.workerView = .activity
        snapshot.threads = [parent, worker]
        let serverRequestedInline = HomePresentation(
            snapshot: snapshot,
            query: "",
            contentMatches: [],
            projectID: nil,
            now: now
        )
        #expect(serverRequestedInline.active.map(\.id) == ["parent", "worker"])
        #expect(parent.supportsWorkerView != true)

        let match = FeatureThreadSearchMatch(
            threadID: worker.id,
            projectID: project.id,
            parentThreadID: parent.id,
            source: .assistant,
            snippet: "Updater rollback is safe",
            messageCreatedAt: now
        )
        let search = HomePresentation(
            snapshot: snapshot,
            query: "rollback",
            contentMatches: [match],
            projectID: nil,
            now: now
        )
        #expect(search.searchResults.map(\.id) == ["parent", "worker"])
        #expect(search.searchMatchesByThreadID[worker.id]?.speakerLabel == "Worker")
        #expect(worker.canTogglePin == false)
        #expect(worker.canRegenerateTitle == false)

        let contexts = HomeThreadRowContext.index(snapshot: snapshot)
        #expect(contexts[worker.id]?.parentThreadTitle == "Ship Croki")
        #expect(contexts[worker.id]?.workerProvenance == "Worker of Ship Croki")
    }

    @Test
    func orphanWorkerRemainsVisibleAndExposesHonestRecovery() {
        let orphan = FeatureThread(
            id: "orphan-worker",
            projectID: "project",
            parentThreadID: "missing-parent",
            title: "Audit release"
        )
        let snapshot = FeatureSnapshot(threads: [orphan])

        let presentation = HomePresentation(
            snapshot: snapshot,
            query: "",
            contentMatches: [],
            projectID: nil,
            now: now
        )
        let context = HomeThreadRowContext.index(snapshot: snapshot)[orphan.id]
        let recovery = WorkerChatRecovery(worker: orphan, threads: snapshot.threads)

        #expect(presentation.active.map(\.id) == [orphan.id])
        #expect(context?.workerProvenance == "Worker, parent unavailable")
        #expect(recovery?.provenance == "Worker, parent unavailable")
        #expect(recovery?.action == .reloadAndReturnToTasks)
        #expect(recovery?.parentThreadID == "missing-parent")
    }

    @Test
    func workerRecoveryReturnsToTheNamedParentWhenItReappears() {
        let parent = FeatureThread(
            id: "parent",
            projectID: "project",
            title: "Ship release"
        )
        let worker = FeatureThread(
            id: "worker",
            projectID: "project",
            parentThreadID: parent.id,
            title: "Audit release"
        )

        let recovery = WorkerChatRecovery(worker: worker, threads: [parent, worker])

        #expect(recovery?.provenance == "Worker of Ship release")
        #expect(recovery?.action == .continueInParent)
        #expect(recovery?.parentTitle == "Ship release")
    }

    @Test
    func workingDurationMatchesTheCompactWebFormatAndClampsFutureDates() {
        let thread = FeatureThread(
            id: "working",
            projectID: "project",
            title: "Build",
            state: .working,
            workingStartedAt: now.addingTimeInterval(-5_465)
        )
        let future = FeatureThread(
            id: "queued",
            projectID: "project",
            title: "Queue",
            state: .queued,
            workingStartedAt: now.addingTimeInterval(5)
        )
        let idle = FeatureThread(
            id: "idle",
            projectID: "project",
            title: "Rest",
            state: .idle,
            workingStartedAt: now.addingTimeInterval(-10)
        )

        #expect(thread.homeWorkingDuration(at: now) == "1h 31m")
        #expect(future.homeWorkingDuration(at: now) == "0s")
        #expect(idle.homeWorkingDuration(at: now) == nil)
    }

    @Test
    func rowAttributionPrefersCurrentEnvironmentNameAndWireProviderName() {
        let thread = FeatureThread(
            id: "thread",
            projectID: "project",
            environmentID: "device",
            environmentName: "Old device name",
            title: "Build",
            branch: "feat/web-v2-home",
            worktreePath: "/worktrees/web-v2-home",
            providerID: "codex-work",
            providerName: "Codex Work"
        )
        let snapshot = FeatureSnapshot(
            environments: [
                FeatureEnvironment(
                    id: "device",
                    name: "leftbook",
                    endpoint: "https://leftbook.example"
                ),
            ],
            projects: [
                FeatureProject(
                    id: "project",
                    environmentID: "device",
                    name: "t3code",
                    path: "/work/t3code"
                ),
            ],
            providers: [FeatureProvider(id: "codex-work", name: "Config name")]
        )

        #expect(thread.homeEnvironmentLabel(in: snapshot) == "leftbook")
        #expect(thread.homeProviderLabel(in: snapshot) == "Codex Work")
        #expect(thread.branch == "feat/web-v2-home")
        #expect(thread.worktreePath == "/worktrees/web-v2-home")
    }

    @Test
    func rowAttributionFallsBackThroughProjectAndProviderCatalog() {
        let thread = FeatureThread(
            id: "thread",
            projectID: "project",
            title: "Build",
            providerID: "claude"
        )
        let snapshot = FeatureSnapshot(
            environments: [
                FeatureEnvironment(
                    id: "device",
                    name: "steambox",
                    endpoint: "https://steambox.example"
                ),
            ],
            projects: [
                FeatureProject(
                    id: "project",
                    environmentID: "device",
                    name: "t3code",
                    path: "/work/t3code"
                ),
            ],
            providers: [FeatureProvider(id: "claude", name: "Claude")]
        )

        #expect(thread.homeEnvironmentLabel(in: snapshot) == "steambox")
        #expect(thread.homeProviderLabel(in: snapshot) == "Claude")
    }

    @Test
    func rowContextCarriesHarnessIdentityAndCustomProviderFallback() throws {
        let knownThread = FeatureThread(
            id: "known",
            projectID: "project",
            title: "Use Claude",
            providerID: "work-claude"
        )
        let customThread = FeatureThread(
            id: "custom",
            projectID: "project",
            title: "Use a custom harness",
            providerID: "acme-agent",
            providerName: "Acme Agent"
        )
        let snapshot = FeatureSnapshot(
            projects: [
                FeatureProject(
                    id: "project",
                    environmentID: "device",
                    name: "t3code",
                    path: "/work/t3code"
                ),
            ],
            threads: [knownThread, customThread],
            providers: [
                FeatureProvider(id: "work-claude", name: "Claude Code", driver: "custom"),
                FeatureProvider(id: "acme-agent", name: "Acme Agent", driver: "custom"),
            ]
        )

        let contexts = HomeThreadRowContext.index(snapshot: snapshot)
        let known = try #require(contexts[knownThread.id])
        let custom = try #require(contexts[customThread.id])

        #expect(known.providerID == "work-claude")
        #expect(known.providerDriver == "custom")
        #expect(known.providerName == "Claude Code")
        #expect(
            ProviderBrand.resolve(
                driver: known.providerDriver,
                providerID: known.providerID,
                providerName: known.providerName
            ) == .claude
        )
        #expect(custom.providerID == "acme-agent")
        #expect(custom.providerDriver == "custom")
        #expect(custom.providerName == "Acme Agent")
        #expect(
            ProviderBrand.resolve(
                driver: custom.providerDriver,
                providerID: custom.providerID,
                providerName: custom.providerName
            ) == nil
        )
    }
}
