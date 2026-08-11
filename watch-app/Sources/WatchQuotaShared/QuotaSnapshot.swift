import Foundation

public struct QuotaSnapshot: Equatable, Codable, Sendable {
    public var capturedAt: Date
    public var activeSessionCount: Int
    public var providers: [QuotaProvider]

    public init(
        capturedAt: Date = .now,
        activeSessionCount: Int = 0,
        providers: [QuotaProvider] = []
    ) {
        self.capturedAt = capturedAt
        self.activeSessionCount = activeSessionCount
        self.providers = providers
    }

    public var isEmpty: Bool {
        providers.allSatisfy { $0.windows.isEmpty }
    }

    public func provider(id: String) -> QuotaProvider? {
        providers.first { $0.id == id }
    }
}

public struct QuotaProvider: Equatable, Codable, Sendable, Identifiable {
    public var id: String
    public var displayName: String
    public var sourceDescription: String?
    public var updatedAt: Date?
    public var windows: [QuotaWindow]

    public init(
        id: String,
        displayName: String,
        sourceDescription: String? = nil,
        updatedAt: Date? = nil,
        windows: [QuotaWindow] = []
    ) {
        self.id = id
        self.displayName = displayName
        self.sourceDescription = sourceDescription
        self.updatedAt = updatedAt
        self.windows = windows
    }
}

public struct QuotaWindow: Equatable, Codable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var usedPercentage: Double
    public var leftPercentage: Double
    public var resetsAt: Date?

    public init(
        id: String,
        label: String,
        usedPercentage: Double,
        leftPercentage: Double,
        resetsAt: Date? = nil
    ) {
        self.id = id
        self.label = label
        self.usedPercentage = usedPercentage
        self.leftPercentage = leftPercentage
        self.resetsAt = resetsAt
    }

    public var roundedUsedPercentage: Int {
        Int(usedPercentage.rounded())
    }

    public var roundedLeftPercentage: Int {
        Int(leftPercentage.rounded())
    }
}

public extension QuotaSnapshot {
    static let preview = QuotaSnapshot(
        capturedAt: .now,
        activeSessionCount: 1,
        providers: [
            QuotaProvider(
                id: "codex",
                displayName: "Codex",
                sourceDescription: "Codex Desktop",
                updatedAt: .now,
                windows: [
                    QuotaWindow(id: "primary", label: "5小时", usedPercentage: 31, leftPercentage: 69),
                    QuotaWindow(id: "secondary", label: "7天", usedPercentage: 42, leftPercentage: 58),
                ]
            ),
            QuotaProvider(
                id: "claude",
                displayName: "Claude",
                sourceDescription: "Claude usage bridge",
                updatedAt: .now,
                windows: [
                    QuotaWindow(id: "five_hour", label: "5小时", usedPercentage: 44, leftPercentage: 56),
                    QuotaWindow(id: "seven_day", label: "7天", usedPercentage: 22, leftPercentage: 78),
                ]
            ),
            QuotaProvider(
                id: "grok",
                displayName: "Grok",
                sourceDescription: "Chrome extension → Agent Panel",
                updatedAt: .now,
                windows: [
                    QuotaWindow(id: "seven_day", label: "周额度", usedPercentage: 42, leftPercentage: 58),
                ]
            ),
        ]
    )
}

