#!/usr/bin/env swift
import Foundation
import Speech
import AVFoundation

enum TranscribeError: Error {
    case usage
    case unauthorized
    case noResult
    case failed(String)
}

func requestAuth() throws {
    let sem = DispatchSemaphore(value: 0)
    var authError: Error?
    SFSpeechRecognizer.requestAuthorization { status in
        if status != .authorized {
            authError = TranscribeError.unauthorized
        }
        sem.signal()
    }
    sem.wait()
    if let authError { throw authError }
}

func transcribe(url: URL, localeID: String) throws -> String {
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeID)),
          recognizer.isAvailable else {
        throw TranscribeError.failed("recognizer unavailable for \(localeID)")
    }

    let request = SFSpeechURLRecognitionRequest(url: url)
    request.shouldReportPartialResults = false
    request.requiresOnDeviceRecognition = false

    let sem = DispatchSemaphore(value: 0)
    var resultText: String?
    var resultError: Error?

    recognizer.recognitionTask(with: request) { result, error in
        if let error {
            resultError = error
            sem.signal()
            return
        }
        guard let result, result.isFinal else { return }
        resultText = result.bestTranscription.formattedString
        sem.signal()
    }

    let timeout = DispatchTime.now() + .seconds(120)
    if sem.wait(timeout: timeout) == .timedOut {
        throw TranscribeError.failed("timeout")
    }
    if let resultError { throw resultError }
    guard let text = resultText?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else {
        throw TranscribeError.noResult
    }
    return text
}

func main() throws {
    let args = CommandLine.arguments
    guard args.count >= 2 else { throw TranscribeError.usage }
    let path = args[1]
    let locale = args.count >= 3 ? args[2] : "zh-CN"
    let url = URL(fileURLWithPath: path)
    guard FileManager.default.fileExists(atPath: path) else {
        throw TranscribeError.failed("file missing")
    }
    try requestAuth()
    let text = try transcribe(url: url, localeID: locale)
    let payload: [String: Any] = ["text": text, "locale": locale]
    let data = try JSONSerialization.data(withJSONObject: payload, options: [])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
}

do {
    try main()
} catch TranscribeError.usage {
    fputs("usage: transcribe.swift <audio-file> [locale]\n", stderr)
    exit(2)
} catch TranscribeError.unauthorized {
    fputs("speech authorization denied\n", stderr)
    exit(3)
} catch {
    fputs("error: \(error)\n", stderr)
    exit(1)
}
