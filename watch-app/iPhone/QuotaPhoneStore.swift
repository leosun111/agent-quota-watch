import Foundation
import Observation
import WatchConnectivity
import WatchQuotaShared

@Observable
@MainActor
final class QuotaPhoneStore: NSObject {
    var macBaseURLText: String {
        didSet {
            UserDefaults.standard.set(macBaseURLText, forKey: Self.macBaseURLKey)
            syncVoiceConfig()
        }
    }
    var pairingCode = ""
    var token: String? {
        didSet {
            UserDefaults.standard.set(token, forKey: Self.tokenKey)
            syncVoiceConfig()
        }
    }
    var snapshot: QuotaSnapshot? {
        didSet { persistSnapshot() }
    }
    var selectedProviderID = "codex"
    var connectionState: ConnectionState = .unconfigured
    var lastError: String?
    var lastSyncAt: Date?
    var watchReachabilityText = "Watch 未连接"
    var autoRefreshEnabled = true

    private static let macBaseURLKey = "watchQuota.macBaseURL"
    private static let tokenKey = "watchQuota.pairToken"
    private static let snapshotKey = "watchQuota.latestSnapshot"
    private let watchSync = WatchQuotaSyncController()
    private var refreshTask: Task<Void, Never>?

    override init() {
        self.macBaseURLText = UserDefaults.standard.string(forKey: Self.macBaseURLKey)
            ?? "http://127.0.0.1:8791"
        self.token = UserDefaults.standard.string(forKey: Self.tokenKey)
        super.init()
        self.snapshot = Self.restoreSnapshot()
        if selectedProviderID.isEmpty {
            selectedProviderID = "claude"
        }
        if pairingCode.isEmpty {
            pairingCode = "2026"
        }
        watchSync.onReachabilityChanged = { [weak self] text in
            self?.watchReachabilityText = text
        }
        syncVoiceConfig()
        watchSync.activate()
        startAutoRefresh()
    }

    private func syncVoiceConfig() {
        watchSync.updateVoiceConfig(baseURLText: macBaseURLText, token: token)
    }

    func startAutoRefresh() {
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                if self.autoRefreshEnabled, self.canRefresh {
                    await self.refresh()
                }
                try? await Task.sleep(for: .seconds(15))
            }
        }
    }

    func stopAutoRefresh() {
        refreshTask?.cancel()
        refreshTask = nil
    }

    var selectedProvider: QuotaProvider? {
        snapshot?.provider(id: selectedProviderID) ?? snapshot?.providers.first
    }

    var canPair: Bool {
        URL(string: macBaseURLText) != nil && pairingCode.count >= 4
    }

    var canRefresh: Bool {
        URL(string: macBaseURLText) != nil && token?.isEmpty == false
    }

    func pair() {
        guard let client = makeClient() else {
            connectionState = .offline
            lastError = "Mac Agent 地址无效"
            return
        }

        connectionState = .connecting
        lastError = nil
        Task {
            do {
                token = try await client.pair(code: pairingCode)
                connectionState = .connected
                await refresh()
            } catch {
                connectionState = .offline
                lastError = error.localizedDescription
            }
        }
    }

    func refresh() async {
        guard let token, let client = makeClient() else {
            connectionState = .unconfigured
            lastError = "请先配置 Mac Agent 并完成配对"
            return
        }

        connectionState = .connecting
        lastError = nil
        do {
            let latest = try await client.fetchQuota(token: token)
            snapshot = latest
            lastSyncAt = .now
            connectionState = .connected
            watchSync.send(snapshot: latest)
        } catch {
            connectionState = .offline
            lastError = error.localizedDescription
        }
    }

    func refreshNow() {
        Task { await refresh() }
    }

    func sendToWatch() {
        guard let snapshot else { return }
        watchSync.send(snapshot: snapshot)
    }

    private func makeClient() -> MacAgentClient? {
        guard let url = URL(string: macBaseURLText) else { return nil }
        return MacAgentClient(baseURL: url)
    }

    private func persistSnapshot() {
        guard let snapshot, let data = try? JSONEncoder().encode(snapshot) else { return }
        UserDefaults.standard.set(data, forKey: Self.snapshotKey)
    }

    private static func restoreSnapshot() -> QuotaSnapshot? {
        guard let data = UserDefaults.standard.data(forKey: snapshotKey) else { return nil }
        return try? JSONDecoder().decode(QuotaSnapshot.self, from: data)
    }
}

enum ConnectionState: String {
    case unconfigured = "未配置"
    case connecting = "连接中"
    case connected = "已连接"
    case offline = "离线"
}

