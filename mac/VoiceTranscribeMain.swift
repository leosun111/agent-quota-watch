import Foundation
import Speech

enum TranscribeError: Error {
    case usage, unauthorized, noResult, failed(String)
}

func requestAuth() throws {
    let sem = DispatchSemaphore(value: 0)
    var ok = false
    SFSpeechRecognizer.requestAuthorization { status in
        ok = (status == .authorized)
        sem.signal()
    }
    _ = sem.wait(timeout: .now() + 60)
    if !ok { throw TranscribeError.unauthorized }
}

func transcribe(url: URL, localeID: String) throws -> String {
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeID)),
          recognizer.isAvailable else {
        throw TranscribeError.failed("recognizer unavailable")
    }
    let request = SFSpeechURLRecognitionRequest(url: url)
    request.shouldReportPartialResults = false
    let sem = DispatchSemaphore(value: 0)
    var text: String?
    var err: Error?
    recognizer.recognitionTask(with: request) { result, error in
        if let error { err = error; sem.signal(); return }
        guard let result, result.isFinal else { return }
        text = result.bestTranscription.formattedString
        sem.signal()
    }
    if sem.wait(timeout: .now() + 120) == .timedOut {
        throw TranscribeError.failed("timeout")
    }
    if let err { throw err }
    let t = (text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    if t.isEmpty { throw TranscribeError.noResult }
    return t
}

let args = CommandLine.arguments
if args.count >= 2, args[1] == "--authorize-only" {
    do {
        try requestAuth()
        print("{\"ok\":true}")
        exit(0)
    } catch {
        fputs("authorize failed\n", stderr)
        exit(3)
    }
}
guard args.count >= 2 else {
    fputs("usage: VoiceTranscribe <file> [locale]|--authorize-only\n", stderr)
    exit(2)
}
let path = args[1]
let locale = args.count >= 3 ? args[2] : "zh-CN"
do {
    try requestAuth()
    let text = try transcribe(url: URL(fileURLWithPath: path), localeID: locale)
    let data = try JSONSerialization.data(withJSONObject: ["text": text, "locale": locale])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0A]))
} catch {
    fputs("error: \(error)\n", stderr)
    exit(1)
}
