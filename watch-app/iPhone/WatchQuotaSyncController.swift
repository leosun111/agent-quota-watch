import Foundation
import WatchConnectivity
import WatchQuotaShared

final class WatchQuotaSyncController: NSObject, WCSessionDelegate, @unchecked Sendable {
    var onReachabilityChanged: (@MainActor (String) -> Void)?
    private let lock = NSLock()
    private var _voiceBaseURLText = "http://127.0.0.1:8791"
    private var _voiceToken: String?

    func updateVoiceConfig(baseURLText: String, token: String?) {
        lock.lock()
        _voiceBaseURLText = baseURLText
        _voiceToken = token
        lock.unlock()
    }

    private var voiceBaseURLText: String {
        lock.lock(); defer { lock.unlock() }
        return _voiceBaseURLText
    }

    private var voiceTokenValue: String? {
        lock.lock(); defer { lock.unlock() }
        return _voiceToken
    }

    private var session: WCSession? {
        WCSession.isSupported() ? WCSession.default : nil
    }

    func activate() {
        guard let session else {
            Task { @MainActor in
                onReachabilityChanged?("当前设备不支持 WatchConnectivity")
            }
            return
        }
        session.delegate = self
        session.activate()
    }

    func send(snapshot: QuotaSnapshot) {
        guard let session else { return }
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        let context: [String: Any] = ["quotaSnapshot": data]
        do {
            try session.updateApplicationContext(context)
        } catch {
            session.transferUserInfo(context)
        }
    }

    func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        let reachable = session.isReachable
        let text: String
        if let error {
            text = "Watch 同步失败：\(error.localizedDescription)"
        } else {
            text = reachable ? "Watch 可达" : "Watch 已配对但不可达"
        }
        Task { @MainActor in
            onReachabilityChanged?(text)
        }
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        let text = session.isReachable ? "Watch 可达" : "Watch 已配对但不可达"
        Task { @MainActor in
            onReachabilityChanged?(text)
        }
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        let copy = message
        Task {
            await handleVoiceMessage(copy, reply: nil)
        }
    }

    func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) {
        let copy = message
        nonisolated(unsafe) let reply = replyHandler
        Task {
            await handleVoiceMessage(copy, reply: { payload in
                reply(payload)
            })
        }
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        let copy = userInfo
        Task {
            await handleVoiceMessage(copy, reply: nil)
        }
    }

    func session(_ session: WCSession, didReceive file: WCSessionFile) {
        let src = file.fileURL
        let meta = file.metadata ?? [:]
        let type = meta["type"] as? String
        let filename = (meta["filename"] as? String) ?? src.lastPathComponent
        // Copy file out of system temp immediately
        let dst = FileManager.default.temporaryDirectory.appendingPathComponent("rx-\(UUID().uuidString)-\(filename)")
        try? FileManager.default.copyItem(at: src, to: dst)
        Task {
            guard type == "voiceAudio" else { return }
            do {
                let data = try Data(contentsOf: dst)
                let result = try await self.transcribe(data: data, filename: filename)
                self.pushVoiceResult(text: result.text, error: nil)
            } catch {
                self.pushVoiceResult(text: nil, error: error.localizedDescription)
            }
            try? FileManager.default.removeItem(at: dst)
        }
    }

    private func handleVoiceMessage(
        _ message: [String: Any],
        reply: (@Sendable ([String: Any]) -> Void)?
    ) async {
        let action = message["voiceAction"] as? String
        if action == "transcribe" {
            guard let b64 = message["audioBase64"] as? String,
                  let data = Data(base64Encoded: b64) else {
                reply?(["error": "缺少音频"])
                return
            }
            let filename = (message["filename"] as? String) ?? "watch.m4a"
            do {
                let result = try await transcribe(data: data, filename: filename)
                reply?(["text": result.text, "id": result.id])
                pushVoiceResult(text: result.text, error: nil)
            } catch {
                reply?(["error": error.localizedDescription])
                pushVoiceResult(text: nil, error: error.localizedDescription)
            }
            return
        }

        if action == "send" {
            guard let text = message["text"] as? String, !text.isEmpty else {
                reply?(["error": "空文本"])
                return
            }
            do {
                _ = try await sendText(text)
                reply?(["ok": true])
                pushSendOK()
            } catch {
                reply?(["error": error.localizedDescription])
            }
        }
    }

    private func makeVoiceClient() throws -> VoiceClient {
        let baseText = voiceBaseURLText.trimmingCharacters(in: .whitespacesAndNewlines)
        let voiceURLText: String
        if let url = URL(string: baseText), let host = url.host {
            let scheme = url.scheme ?? "http"
            voiceURLText = "\(scheme)://\(host):8792"
        } else {
            voiceURLText = "http://127.0.0.1:8792"
        }
        guard let base = URL(string: voiceURLText) else {
            throw VoiceClientError.invalidBaseURL
        }
        guard let token = voiceTokenValue, !token.isEmpty else {
            throw VoiceClientError.badHTTPStatus(401, "请先在 iPhone 连接 Mac")
        }
        return VoiceClient(baseURL: base, token: token)
    }

    private func transcribe(data: Data, filename: String) async throws -> VoiceTranscript {
        let client = try makeVoiceClient()
        return try await client.transcribe(audioData: data, filename: filename, locale: "zh-CN")
    }

    private func sendText(_ text: String) async throws -> VoiceSendResponse {
        let client = try makeVoiceClient()
        return try await client.send(text: text, mode: "paste")
    }

    private func pushVoiceResult(text: String?, error: String?) {
        guard let session else { return }
        var ctx: [String: Any] = [:]
        if let text { ctx["voiceText"] = text }
        if let error { ctx["voiceError"] = error }
        if session.isReachable {
            session.sendMessage(ctx, replyHandler: nil, errorHandler: nil)
        }
        session.transferUserInfo(ctx)
        try? session.updateApplicationContext(ctx)
    }

    private func pushSendOK() {
        guard let session else { return }
        let ctx: [String: Any] = ["voiceSendOK": true]
        if session.isReachable {
            session.sendMessage(ctx, replyHandler: nil, errorHandler: nil)
        }
        session.transferUserInfo(ctx)
    }
}
