import Foundation

enum T3SharedContainer {
    static let appGroupID = "group.com.croki.croki.native"
    static let urlScheme = "croki-native"

    static var rootURL: URL? {
        FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupID
        )
    }
}
