import XCTest
@testable import T3Code

@MainActor
final class NativeServerMetadataTests: XCTestCase {
    func testCurrentServerConfigMetadataReplacesStalePairingDescriptor() throws {
        let pairedDescriptor = try descriptor(
            environmentID: "studio",
            version: "0.4.7",
            updateMode: "desktop-managed"
        )
        let environment = Environment(
            id: "studio",
            label: "Studio",
            httpBaseURL: URL(string: "https://studio.example")!,
            webSocketBaseURL: URL(string: "wss://studio.example")!,
            descriptor: pairedDescriptor
        )
        let config = try JSONDecoder.t3.decode(
            ServerConfigSnapshot.self,
            from: Data(
                """
                {
                  "environment": {
                    "environmentId": "studio",
                    "label": "Studio",
                    "platform": {"os": "darwin", "arch": "arm64"},
                    "serverVersion": "0.4.8",
                    "capabilities": {
                      "repositoryIdentity": true,
                      "serverSelfUpdate": "homebrew",
                      "threadPinning": true,
                      "threadTitleRegeneration": true
                    }
                  },
                  "providers": []
                }
                """.utf8
            )
        )

        let resolved = NativeFeatureClient.currentDescriptor(
            for: environment,
            serverConfig: config
        )

        XCTAssertEqual(resolved?.serverVersion, "0.4.8")
        XCTAssertEqual(resolved?.capabilities.serverSelfUpdate, "homebrew")
        XCTAssertEqual(resolved?.capabilities.threadPinning, true)
        XCTAssertEqual(resolved?.capabilities.threadTitleRegeneration, true)
        XCTAssertEqual(environment.descriptor?.serverVersion, "0.4.7")
        XCTAssertEqual(environment.descriptor?.capabilities.threadPinning, false)
        XCTAssertEqual(environment.descriptor?.capabilities.threadTitleRegeneration, false)
    }

    private func descriptor(
        environmentID: String,
        version: String,
        updateMode: String
    ) throws -> EnvironmentDescriptor {
        try JSONDecoder.t3.decode(
            EnvironmentDescriptor.self,
            from: Data(
                """
                {
                  "environmentId": "\(environmentID)",
                  "label": "Studio",
                  "platform": {"os": "darwin", "arch": "arm64"},
                  "serverVersion": "\(version)",
                  "capabilities": {
                    "repositoryIdentity": true,
                    "serverSelfUpdate": "\(updateMode)",
                    "threadPinning": false,
                    "threadTitleRegeneration": false
                  }
                }
                """.utf8
            )
        )
    }
}
