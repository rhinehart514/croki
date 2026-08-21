import Foundation

public struct CrokiPerceptionSnapshot: Decodable, Sendable, Equatable {
    public let revision: Int
    public let truncated: Bool
    public let objects: [CrokiPerceptionObject]
    public let relationships: [CrokiPerceptionRelationship]
}

public struct CrokiPerceptionObject: Decodable, Sendable, Equatable, Identifiable {
    public struct Source: Decodable, Sendable, Equatable {
        public let kind: String
        public let id: String?
        public let uri: String?
        public let sourceThreadId: String?
        public let observedAt: String
    }

    public let id: String
    public let type: String
    public let title: String
    public let summary: String?
    public let state: String?
    public let revision: Int
    public let source: Source
}

public struct CrokiPerceptionRelationship: Decodable, Sendable, Equatable, Identifiable {
    public let id: String
    public let from: String
    public let to: String
    public let kind: String
    public let label: String?
}
