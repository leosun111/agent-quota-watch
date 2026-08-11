import Foundation
import Observation
import WatchConnectivity
import WidgetKit
import WatchQuotaShared

enum VoicePhase: Equatable {
    case idle
    case recording
    case uploading
    case preview
    case sending
    case done(String)
    case failed(String)
}

@Observable
@MainActor
final class QuotaWatchStore: NSObject {
    var snapshot: QuotaSnapshot? {
        didSet { persistSnapshot() }
    }
    var selectedProviderID = "claude"
    var connectionText = "等待 iPhone 同步"
    var complicationCacheText = "表盘缓存: —"
    var lastReceivedAt: Date?

    var voicePhase: VoicePhase = .idle
    var draftTranscript = ""

    private static let snapshotKey = "watchQuota.latestSnapshot"
    private let capture = VoiceCaptureController()
    private var pendingVoiceReply = false

    override init() {
        if let shared = QuotaAppGroup.loadSnapshot() {
            self.snapshot = shared
        } else {
            self.snapshot = Self.restoreSnapshot()
        }
        if let preferred = QuotaAppGroup.loadSelectedProviderID() {
            self.selectedProviderID = preferred
        }
        super.init()
        activateSession()
        publishToComplications()
    }

    var selectedProvider: QuotaProvider? {
        snapshot?.provider(id: selectedProviderID) ?? snapshot?.providers.first
    }

    func selectNextProvider() {
        guard let providers = snapshot?.providers, providers.isEmpty == false else { return }
        guard let currentIndex = providers.firstIndex(where: { $0.id == selectedProvider?.id }) else {
            selectedProviderID = providers[0].id
            publishToComplications()
            return
        }
        selectedProviderID = providers[(currentIndex + 1) % providers.count].id
        publishToComplications()
    }

    func forcePublishComplications() {
        publishToComplications()
    }

    private func publishToComplications() {
        if let snapshot {
            QuotaAppGroup.save(snapshot: snapshot)
            QuotaAppGroup.saveSelectedProviderID(selectedProviderID)
        }
        // Force widget refresh; kind must match widget definition.
        WidgetCenter.shared.reloadTimelines(ofKind: "AgentQuotaComplication")
        WidgetCenter.shared.reloadAllTimelines()

        if let model = QuotaAppGroup.loadCompactModel(), model.leftPrimary != nil {
            complicationCacheText = "表盘缓存: \(model.compactLine)"
        } else {
            complicationCacheText = "表盘缓存失败: \(QuotaAppGroup.lastWriteStatus)"
        }
    }

    func prepareVoice() async {
        await capture.prepare()
    }

    func toggleRecording() async {
        switch voicePhase {
        case .recording:
            await finishRecording()
        case .idle, .failed, .done:
            do {
                try capture.start()
                voicePhase = .recording
                draftTranscript = ""
            } catch {
                voicePhase = .failed(error.localizedDescription)
            }
        default:
            break
        }
    }

    func resetVoice() {
        capture.cancel()
        draftTranscript = ""
        pendingVoiceReply = false
        voicePhase = .idle
    }

    func confirmSend() async {
        let text = draftTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            voicePhase = .failed("没有可发送文本")
            return
        }
        guard WCSession.default.isReachable else {
            // Still queue via transferUserInfo
            voicePhase = .sending
            WCSession.default.transferUserInfo([
                "voiceAction": "send",
                "text": text,
            ])
            voicePhase = .done("已提交发送")
            return
        }
        voicePhase = .sending
        pendingVoiceReply = true
        WCSession.default.sendMessage(
            ["voiceAction": "send", "text": text],
            replyHandler: { [weak self] reply in
                Task { @MainActor in
                    self?.handleVoiceReply(reply)
                }
            },
            errorHandler: { [weak self] error in
                Task { @MainActor in
                    self?.voicePhase = .failed(error.localizedDescription)
                }
            }
        )
    }

    private func finishRecording() async {
        guard let url = capture.stop() else {
            voicePhase = .failed("录音失败")
            return
        }
        voicePhase = .uploading
        guard FileManager.default.fileExists(atPath: url.path) else {
            voicePhase = .failed("录音文件丢失")
            return
        }

        let session = WCSession.default
        if session.activationState != .activated {
            voicePhase = .failed("未连接 iPhone")
            return
        }

        // Prefer file transfer for audio size
        pendingVoiceReply = true
        let meta: [String: Any] = ["type": "voiceAudio", "filename": url.lastPathComponent]
        session.transferFile(url, metadata: meta)

        // Also try immediate message if small enough and reachable
        if session.isReachable, let data = try? Data(contentsOf: url), data.count < 50_000 {
            session.sendMessage(
                ["voiceAction": "transcribe", "audioBase64": data.base64EncodedString(), "filename": url.lastPathComponent],
                replyHandler: { [weak self] reply in
                    Task { @MainActor in
                        self?.handleVoiceReply(reply)
                    }
                },
                errorHandler: { _ in
                    // File transfer still in flight
                }
            )
        } else {
            connectionText = "音频已发送，等待转写…"
        }
    }

    private func handleVoiceReply(_ reply: [String: Any]) {
        pendingVoiceReply = false
        if let error = reply["error"] as? String {
            voicePhase = .failed(error)
            return
        }
        if let text = reply["text"] as? String {
            draftTranscript = text
            voicePhase = .preview
            connectionText = "转写完成"
            return
        }
        if let ok = reply["ok"] as? Bool, ok {
            voicePhase = .done("已发送到 Mac")
            return
        }
        voicePhase = .failed("未知回复")
    }

    private func activateSession() {
        guard WCSession.isSupported() else {
            connectionText = "WatchConnectivity 不可用"
            return
        }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    private func apply(snapshotData data: Data) {
        guard let snapshot = try? JSONDecoder().decode(QuotaSnapshot.self, from: data) else {
            return
        }
        self.snapshot = snapshot
        self.lastReceivedAt = .now
        self.connectionText = "已同步"
        publishToComplications()
    }

    private func persistSnapshot() {
        guard let snapshot, let data = try? JSONEncoder().encode(snapshot) else { return }
        UserDefaults.standard.set(data, forKey: Self.snapshotKey)
        // Keep complication cache in sync whenever local snapshot changes.
        QuotaAppGroup.save(snapshot: snapshot)
        QuotaAppGroup.saveSelectedProviderID(selectedProviderID)
    }

    private static func restoreSnapshot() -> QuotaSnapshot? {
        guard let data = UserDefaults.standard.data(forKey: snapshotKey) else { return nil }
        return try? JSONDecoder().decode(QuotaSnapshot.self, from: data)
    }
}

extension QuotaWatchStore: WCSessionDelegate {
    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        Task { @MainActor in
            if let error {
                connectionText = "同步失败：\(error.localizedDescription)"
            } else {
                connectionText = activationState == .activated ? "等待 iPhone 同步" : "未激活"
            }
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        if let data = applicationContext["quotaSnapshot"] as? Data {
            let snapshotData = Data(data)
            Task { @MainActor in
                apply(snapshotData: snapshotData)
            }
        }
        if let text = applicationContext["voiceText"] as? String {
            Task { @MainActor in
                draftTranscript = text
                voicePhase = .preview
                connectionText = "转写完成"
            }
        }
        if let error = applicationContext["voiceError"] as? String {
            Task { @MainActor in
                voicePhase = .failed(error)
            }
        }
        if let ok = applicationContext["voiceSendOK"] as? Bool, ok {
            Task { @MainActor in
                voicePhase = .done("已发送到 Mac")
            }
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        if let data = userInfo["quotaSnapshot"] as? Data {
            let snapshotData = Data(data)
            Task { @MainActor in
                apply(snapshotData: snapshotData)
            }
        }
        if let text = userInfo["voiceText"] as? String {
            Task { @MainActor in
                draftTranscript = text
                voicePhase = .preview
            }
        }
        if let error = userInfo["voiceError"] as? String {
            Task { @MainActor in
                voicePhase = .failed(error)
            }
        }
        if let ok = userInfo["voiceSendOK"] as? Bool, ok {
            Task { @MainActor in
                voicePhase = .done("已发送到 Mac")
            }
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        applyVoiceMessage(message)
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) {
        applyVoiceMessage(message)
        replyHandler(["ok": true])
    }

    nonisolated private func applyVoiceMessage(_ message: [String: Any]) {
        if let text = message["voiceText"] as? String ?? message["text"] as? String,
           message["voiceAction"] == nil {
            Task { @MainActor in
                draftTranscript = text
                voicePhase = .preview
            }
        }
        if let error = message["error"] as? String {
            Task { @MainActor in
                voicePhase = .failed(error)
            }
        }
        if let ok = message["ok"] as? Bool, ok {
            Task { @MainActor in
                voicePhase = .done("已发送到 Mac")
            }
        }
    }
}
