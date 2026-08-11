// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "WatchQuotaApp",
    platforms: [
        .iOS(.v17),
        .watchOS(.v10),
        .macOS(.v14),
    ],
    products: [
        .library(
            name: "WatchQuotaShared",
            targets: ["WatchQuotaShared"]
        ),
    ],
    targets: [
        .target(name: "WatchQuotaShared"),
    ]
)

