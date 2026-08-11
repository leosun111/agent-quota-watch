import SwiftUI
import WatchQuotaShared

struct PhoneRootView: View {
    @Environment(QuotaPhoneStore.self) private var store

    var body: some View {
        @Bindable var store = store

        NavigationStack {
            Form {
                Section("Mac 额度桥") {
                    TextField("例如 http://127.0.0.1:8791", text: $store.macBaseURLText)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()

                    HStack {
                        Text("状态")
                        Spacer()
                        Text(store.connectionState.rawValue)
                            .foregroundStyle(statusColor)
                    }

                    if let lastError = store.lastError {
                        Text(lastError)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                }

                Section("配对") {
                    TextField("任意 4 位数字即可（家庭局域网）", text: $store.pairingCode)
                        .keyboardType(.numberPad)

                    Button("连接 Mac") {
                        store.pair()
                    }
                    .disabled(!store.canPair)
                }

                Section("Claude / Codex / Grok") {
                    if let snapshot = store.snapshot {
                        QuotaSnapshotPreview(snapshot: snapshot)
                    } else {
                        ContentUnavailableView(
                            "暂无额度快照",
                            systemImage: "applewatch",
                            description: Text("连接 Mac 后刷新。Grok 依赖 Chrome 插件页 grok.com/?_s=usage")
                        )
                    }

                    Button("立即刷新") {
                        store.refreshNow()
                    }
                    .disabled(!store.canRefresh)

                    Button("同步到 Apple Watch") {
                        store.sendToWatch()
                    }
                    .disabled(store.snapshot == nil)
                }

                Section("Apple Watch") {
                    Text(store.watchReachabilityText)
                    Text("点卡片可在 Claude / Codex / Grok 间切换。手表显示最近成功同步的快照。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Agent Quota")
            .onAppear {
                store.startAutoRefresh()
                if store.canRefresh {
                    store.refreshNow()
                } else if store.canPair {
                    store.pair()
                }
            }
            .onDisappear {
                // Keep polling while app is backgrounded only if system allows;
                // stop tight loop when view goes away to save battery.
            }
        }
    }

    private var statusColor: Color {
        switch store.connectionState {
        case .connected:
            return .green
        case .connecting:
            return .orange
        case .offline:
            return .red
        case .unconfigured:
            return .secondary
        }
    }
}

private struct QuotaSnapshotPreview: View {
    var snapshot: QuotaSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("活跃会话")
                Spacer()
                Text("\(snapshot.activeSessionCount)")
                    .font(.title2.monospacedDigit().bold())
            }

            ForEach(snapshot.providers) { provider in
                VStack(alignment: .leading, spacing: 8) {
                    Text(provider.displayName)
                        .font(.headline)

                    ForEach(provider.windows) { window in
                        HStack {
                            Text(window.label)
                            Spacer()
                            Text("\(window.roundedLeftPercentage)% 可用")
                                .monospacedDigit()
                                .fontWeight(.semibold)
                        }
                    }
                }
                .padding(.vertical, 6)
            }
        }
    }
}

#Preview {
    PhoneRootView()
        .environment(QuotaPhoneStore())
}

