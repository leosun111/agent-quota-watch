import AVFoundation
import Foundation

@MainActor
final class VoiceCaptureController: NSObject {
    enum State: Equatable {
        case idle
        case recording
        case unavailable(String)
    }

    private(set) var state: State = .idle
    private var recorder: AVAudioRecorder?
    private var fileURL: URL?

    var isRecording: Bool {
        if case .recording = state { return true }
        return false
    }

    func prepare() async {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .default, options: [.duckOthers])
            try session.setActive(true)
            let granted = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
                AVAudioSession.sharedInstance().requestRecordPermission { cont.resume(returning: $0) }
            }
            if !granted {
                state = .unavailable("未授权麦克风")
            }
        } catch {
            state = .unavailable(error.localizedDescription)
        }
    }

    func start() throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("watch-voice-\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 16000,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
        ]
        let recorder = try AVAudioRecorder(url: url, settings: settings)
        recorder.isMeteringEnabled = true
        guard recorder.record() else {
            throw NSError(domain: "VoiceCapture", code: 1, userInfo: [NSLocalizedDescriptionKey: "无法开始录音"])
        }
        self.recorder = recorder
        self.fileURL = url
        self.state = .recording
    }

    func stop() -> URL? {
        recorder?.stop()
        recorder = nil
        state = .idle
        return fileURL
    }

    func cancel() {
        recorder?.stop()
        recorder = nil
        if let fileURL {
            try? FileManager.default.removeItem(at: fileURL)
        }
        fileURL = nil
        state = .idle
    }
}
