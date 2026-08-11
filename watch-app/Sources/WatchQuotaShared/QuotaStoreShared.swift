import Foundation
import Security

public enum QuotaAppGroup {
    public static let selectedProviderKey = "quota.selectedProvider"
    public static let keychainService = "com.example.CodexQuotaWatch.complication"
    public static let keychainAccount = "compact-cache-v2"

    /// Shared across Watch app + Widget when keychain-access-groups entitlements allow.
    /// Set Info.plist `AQKeychainAccessGroup` to e.g. `ABCDE12345.com.example.CodexQuotaWatch`
    /// or rely on automatic fallback (no access group → same-process only).
    public static var keychainAccessGroup: String? {
        if let custom = Bundle.main.object(forInfoDictionaryKey: "AQKeychainAccessGroup") as? String,
           !custom.isEmpty, !custom.contains("YOUR_TEAM_ID") {
            return custom
        }
        if let prefix = Bundle.main.object(forInfoDictionaryKey: "AppIdentifierPrefix") as? String,
           !prefix.isEmpty {
            return "\(prefix)com.example.CodexQuotaWatch"
        }
        return nil
    }

    public static func save(snapshot: QuotaSnapshot) {
        saveCompactCache(from: snapshot)
    }

    public static func loadSnapshot() -> QuotaSnapshot? {
        // Compact path is primary for complications; full snapshot optional.
        nil
    }

    public static func saveSelectedProviderID(_ id: String) {
        UserDefaults.standard.set(id, forKey: selectedProviderKey)
        // Re-encode last snapshot payload if present in keychain by updating preferred
        if var obj = loadCompactDictionary() {
            // Rebuild from stored full snapshot blob if we have it
            if let full = loadFullSnapshotData(),
               let snap = try? JSONDecoder().decode(QuotaSnapshot.self, from: full) {
                saveCompactCache(from: snap, preferredID: id)
                return
            }
            obj["selectedHint"] = id
            if let data = try? JSONSerialization.data(withJSONObject: obj) {
                keychainSet(data: data, account: keychainAccount)
            }
        }
    }

    public static func loadSelectedProviderID() -> String? {
        UserDefaults.standard.string(forKey: selectedProviderKey)
    }

    public static func saveCompactCache(from snapshot: QuotaSnapshot, preferredID: String? = nil) {
        let preferred = preferredID ?? loadSelectedProviderID()
        let model = ComplicationQuotaViewModel.from(snapshot: snapshot, preferredID: preferred)

        // Persist full snapshot bytes for provider switching without network
        if let full = try? JSONEncoder().encode(snapshot) {
            keychainSet(data: full, account: "full-snapshot-v2")
        }

        let dict: [String: Any] = [
            "providerID": model.providerID,
            "shortName": model.shortName,
            "leftPrimary": model.leftPrimary as Any,
            "leftSecondary": model.leftSecondary as Any,
            "primaryLabel": model.primaryLabel,
            "secondaryLabel": model.secondaryLabel,
            "updatedAt": Date().timeIntervalSince1970,
            "compactLine": model.compactLine,
            "writeOK": true,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: dict, options: [.sortedKeys]) else {
            lastWriteStatus = "encode failed"
            return
        }

        let status = keychainSet(data: data, account: keychainAccount)
        lastWriteStatus = status == errSecSuccess
            ? "OK \(model.compactLine) group=\(keychainAccessGroup ?? "none")"
            : "keychain err \(status) group=\(keychainAccessGroup ?? "none")"

        // Also standard defaults inside same process (debug)
        UserDefaults.standard.set(data, forKey: "complication-cache-v2")
        UserDefaults.standard.set(lastWriteStatus, forKey: "complication-write-status")
    }

    public static func loadCompactModel() -> ComplicationQuotaViewModel? {
        guard let obj = loadCompactDictionary() else { return nil }
        return ComplicationQuotaViewModel(
            providerID: obj["providerID"] as? String ?? "none",
            shortName: obj["shortName"] as? String ?? "AQ",
            leftPrimary: intValue(obj["leftPrimary"]),
            leftSecondary: intValue(obj["leftSecondary"]),
            primaryLabel: obj["primaryLabel"] as? String ?? "—",
            secondaryLabel: obj["secondaryLabel"] as? String ?? "",
            updatedAt: (obj["updatedAt"] as? Double).map { Date(timeIntervalSince1970: $0) }
        )
    }

    public static var lastWriteStatus: String {
        get { UserDefaults.standard.string(forKey: "complication-write-status") ?? "never" }
        set { UserDefaults.standard.set(newValue, forKey: "complication-write-status") }
    }

    public static var isAppGroupAvailable: Bool { false }

    // MARK: - Internals

    private static func loadCompactDictionary() -> [String: Any]? {
        let data =
            keychainGet(account: keychainAccount)
            ?? UserDefaults.standard.data(forKey: "complication-cache-v2")
        guard let data,
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return obj
    }

    private static func loadFullSnapshotData() -> Data? {
        keychainGet(account: "full-snapshot-v2")
    }

    private static func intValue(_ any: Any?) -> Int? {
        if let i = any as? Int { return i }
        if let n = any as? NSNumber { return n.intValue }
        if let d = any as? Double { return Int(d.rounded()) }
        if any is NSNull { return nil }
        return nil
    }

    @discardableResult
    private static func keychainSet(data: Data, account: String) -> OSStatus {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
        ]
        if let group = keychainAccessGroup {
            query[kSecAttrAccessGroup as String] = group
        }
        SecItemDelete(query as CFDictionary)

        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        var status = SecItemAdd(add as CFDictionary, nil)

        // Fallback without access group if shared group rejected
        if status != errSecSuccess, query[kSecAttrAccessGroup as String] != nil {
            query.removeValue(forKey: kSecAttrAccessGroup as String)
            SecItemDelete(query as CFDictionary)
            var add2 = query
            add2[kSecValueData as String] = data
            add2[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            status = SecItemAdd(add2 as CFDictionary, nil)
            lastWriteStatus = "fallback no-group status=\(status)"
        }
        return status
    }

    private static func keychainGet(account: String) -> Data? {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        if let group = keychainAccessGroup {
            query[kSecAttrAccessGroup as String] = group
        }
        var item: CFTypeRef?
        var status = SecItemCopyMatching(query as CFDictionary, &item)
        if status != errSecSuccess, query[kSecAttrAccessGroup as String] != nil {
            query.removeValue(forKey: kSecAttrAccessGroup as String)
            status = SecItemCopyMatching(query as CFDictionary, &item)
        }
        guard status == errSecSuccess else { return nil }
        return item as? Data
    }
}

public struct ComplicationQuotaViewModel: Equatable, Sendable {
    public var providerID: String
    public var shortName: String
    public var leftPrimary: Int?
    public var leftSecondary: Int?
    public var primaryLabel: String
    public var secondaryLabel: String
    public var updatedAt: Date?

    public init(
        providerID: String,
        shortName: String,
        leftPrimary: Int?,
        leftSecondary: Int?,
        primaryLabel: String,
        secondaryLabel: String,
        updatedAt: Date?
    ) {
        self.providerID = providerID
        self.shortName = shortName
        self.leftPrimary = leftPrimary
        self.leftSecondary = leftSecondary
        self.primaryLabel = primaryLabel
        self.secondaryLabel = secondaryLabel
        self.updatedAt = updatedAt
    }

    public static func from(snapshot: QuotaSnapshot?, preferredID: String?) -> ComplicationQuotaViewModel {
        let providers = snapshot?.providers ?? []
        let provider =
            providers.first(where: { $0.id == preferredID })
            ?? providers.first(where: { $0.id == "claude" })
            ?? providers.first

        guard let provider else {
            return ComplicationQuotaViewModel(
                providerID: "none",
                shortName: "AQ",
                leftPrimary: nil,
                leftSecondary: nil,
                primaryLabel: "—",
                secondaryLabel: "—",
                updatedAt: nil
            )
        }

        let short: String = {
            switch provider.id {
            case "claude": return "CL"
            case "codex": return "CX"
            case "grok": return "GK"
            default: return String(provider.displayName.prefix(2)).uppercased()
            }
        }()

        let w0 = provider.windows.first
        let w1 = provider.windows.dropFirst().first
        return ComplicationQuotaViewModel(
            providerID: provider.id,
            shortName: short,
            leftPrimary: w0.map(\.roundedLeftPercentage),
            leftSecondary: w1.map(\.roundedLeftPercentage),
            primaryLabel: w0?.label ?? "额度",
            secondaryLabel: w1?.label ?? "",
            updatedAt: snapshot?.capturedAt ?? provider.updatedAt
        )
    }

    public var compactLine: String {
        let a = leftPrimary.map(String.init) ?? "—"
        if let b = leftSecondary {
            return "\(shortName) \(a)/\(b)"
        }
        return "\(shortName) \(a)%"
    }

    public var gaugeValue: Double {
        Double(leftPrimary ?? 0) / 100.0
    }
}
