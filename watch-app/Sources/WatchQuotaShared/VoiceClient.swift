import Foundation

public struct VoiceTranscript: Equatable, Codable, Sendable {
    public var id: String
    public var text: String
    public var locale: String?
    public var durationMs: Int?

    public init(id: String, text: String, locale: String? = nil, durationMs: Int? = nil) {
        self.id = id
        self.text = text
        self.locale = locale
        self.durationMs = durationMs
    }
}

public struct VoiceSendResponse: Equatable, Codable, Sendable {
    public var ok: Bool
    public var mode: String?
    public var chars: Int?
}

public enum VoiceClientError: LocalizedError, Equatable {
    case invalidBaseURL
    case badHTTPStatus(Int, String?)
    case emptyResponse
    case encodeFailed

    public var errorDescription: String? {
        switch self {
        case .invalidBaseURL: return "语音服务地址无效"
        case let .badHTTPStatus(code, body):
            return "语音服务 HTTP \(code)\(body.map { ": \($0)" } ?? "")"
        case .emptyResponse: return "语音服务无响应"
        case .encodeFailed: return "音频封装失败"
        }
    }
}

public struct VoiceClient: Sendable {
    public var baseURL: URL
    public var token: String
    public var session: URLSession

    public init(baseURL: URL, token: String, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.token = token
        self.session = session
    }

    public func transcribe(audioData: Data, filename: String = "watch.m4a", locale: String = "zh-CN") async throws -> VoiceTranscript {
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()
        body.append("--\(boundary)\r\n")
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n")
        body.append("Content-Type: audio/m4a\r\n\r\n")
        body.append(audioData)
        body.append("\r\n--\(boundary)--\r\n")

        var components = URLComponents(url: baseURL.appendingPathComponent("v1/transcribe"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "locale", value: locale)]
        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        request.timeoutInterval = 180

        return try await send(request)
    }

    public func send(text: String, mode: String = "paste") async throws -> VoiceSendResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("v1/send"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["text": text, "mode": mode])
        request.timeoutInterval = 30
        return try await send(request)
    }

    private func send<Response: Decodable>(_ request: URLRequest) async throws -> Response {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw VoiceClientError.emptyResponse }
        guard (200..<300).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8)
            throw VoiceClientError.badHTTPStatus(http.statusCode, body)
        }
        guard !data.isEmpty else { throw VoiceClientError.emptyResponse }
        return try JSONDecoder().decode(Response.self, from: data)
    }
}

private extension Data {
    mutating func append(_ string: String) {
        if let data = string.data(using: .utf8) {
            append(data)
        }
    }
}
