// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "GTMIDE",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "GTMIDE", path: "Sources/GTMIDE")
    ]
)
