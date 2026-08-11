import SwiftUI
import WatchQuotaShared

struct WatchRootView: View {
    @Environment(QuotaWatchStore.self) private var store

    var body: some View {
        TabView {
            quotaTab
            VoiceWatchView()
        }
        .tabViewStyle(.verticalPage)
    }

    private var quotaTab: some View {
        Group {
            if let provider = store.selectedProvider {
                providerView(provider)
            } else {
                emptyView
            }
        }
        .containerBackground(.black, for: .navigation)
    }

    private func providerView(_ provider: QuotaProvider) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(provider.displayName)
                    .font(.headline.weight(.bold))
                    .lineLimit(1)
                Spacer()
                Circle()
                    .fill(store.lastReceivedAt == nil ? Color.orange : Color.green)
                    .frame(width: 7, height: 7)
            }

            ForEach(provider.windows.prefix(2)) { window in
                quotaWindow(window)
            }

            Text(store.connectionText)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(store.complicationCacheText)
                .font(.system(size: 9))
                .foregroundStyle(.secondary)
                .lineLimit(2)
            Button("刷新表盘") {
                store.forcePublishComplications()
            }
            .font(.caption2)
        }
        .padding(.horizontal, 4)
        .onTapGesture {
            store.selectNextProvider()
        }
    }

    private func quotaWindow(_ window: QuotaWindow) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(window.label)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(window.roundedLeftPercentage)%")
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .monospacedDigit()
            }
            ProgressView(value: min(max(window.leftPercentage, 0), 100), total: 100)
                .tint(accentColor(for: window.leftPercentage))
                .scaleEffect(y: 1.4)
            if let resetsAt = window.resetsAt {
                Text(resetText(resetsAt))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 7)
        .padding(.horizontal, 8)
        .background {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.08))
        }
    }

    private var emptyView: some View {
        VStack(spacing: 8) {
            Image(systemName: "applewatch")
                .font(.title2)
            Text("等待同步")
                .font(.headline)
            Text("在 iPhone 上完成连接并推送额度")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    private func accentColor(for leftPercentage: Double) -> Color {
        if leftPercentage < 10 { return .red }
        if leftPercentage < 25 { return .orange }
        return .green
    }

    private func resetText(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "M/d HH:mm 重置"
        return formatter.string(from: date)
    }
}

#Preview {
    WatchRootView()
        .environment(QuotaWatchStore())
}
