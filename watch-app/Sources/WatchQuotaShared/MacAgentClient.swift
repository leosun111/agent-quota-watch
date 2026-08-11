import Foundation

public struct MacAgentPairResponse: Equatable, Codable, Sendable {
    public var token: String

    public init(token: String) {
        self.token = token
    }
}

public struct MacAgentPairRequest: Equatable, Codable, Sendable {
    public var code: String

    public init(code: String) {
        self.code = code
    }
}

public enum MacAgentClientError: LocalizedError, Equatable {
    case invalidBaseURL
    case badHTTPStatus(Int)
    case emptyResponse

    public var errorDescription: String? {
        switch self {
        case .invalidBaseURL:
            return "Invalid Mac agent URL."
        case let .badHTTPStatus(status):
            return "Mac agent returned HTTP \(status)."
        case .emptyResponse:
            return "Mac agent returned an empty response."
        }
    }
}

public struct MacAgentClient: Sendable {
    public var baseURL: URL
    public var session: URLSession

    public init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    public func pair(code: String) async throws -> String {
        var request = URLRequest(url: endpointURL(path: "pair"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(MacAgentPairRequest(code: code))

        let response: MacAgentPairResponse = try await send(request)
        return response.token
    }

    public func fetchQuota(token: String) async throws -> QuotaSnapshot {
        var request = URLRequest(url: endpointURL(path: "quota"))
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        return try await send(request)
    }

    private func endpointURL(path: String) -> URL {
        baseURL.appendingPathComponent(path)
    }

    private func send<Response: Decodable>(_ request: URLRequest) async throws -> Response {
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw MacAgentClientError.emptyResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            throw MacAgentClientError.badHTTPStatus(httpResponse.statusCode)
        }

        guard data.isEmpty == false else {
            throw MacAgentClientError.emptyResponse
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .deferredToDate
        return try decoder.decode(Response.self, from: data)
    }
}

