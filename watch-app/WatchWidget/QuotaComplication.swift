import SwiftUI
import WidgetKit
import WatchQuotaShared

struct QuotaEntry: TimelineEntry {
    let date: Date
    let model: ComplicationQuotaViewModel
    let hasData: Bool
}

struct QuotaTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> QuotaEntry {
        QuotaEntry(date: .now, model: .from(snapshot: .preview, preferredID: "claude"), hasData: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (QuotaEntry) -> Void) {
        completion(makeEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<QuotaEntry>) -> Void) {
        let entry = makeEntry()
        // Ask system to refresh soon; actual cadence is coalesced by watchOS.
        let next = Date().addingTimeInterval(entry.hasData ? 120 : 60)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func makeEntry() -> QuotaEntry {
        // 1) Compact cache (most reliable)
        if let compact = QuotaAppGroup.loadCompactModel(), compact.leftPrimary != nil || compact.providerID != "none" {
            return QuotaEntry(date: .now, model: compact, hasData: compact.leftPrimary != nil)
        }
        // 2) Full snapshot
        let snap = QuotaAppGroup.loadSnapshot()
        let preferred = QuotaAppGroup.loadSelectedProviderID()
        let model = ComplicationQuotaViewModel.from(snapshot: snap, preferredID: preferred)
        let has = snap != nil && model.leftPrimary != nil
        return QuotaEntry(date: .now, model: model, hasData: has)
    }
}

struct QuotaComplicationViews: View {
    @Environment(\.widgetFamily) private var family
    var entry: QuotaEntry

    var body: some View {
        Group {
            switch family {
            case .accessoryCircular:
                circular
            case .accessoryCorner:
                corner
            case .accessoryInline:
                inline
            case .accessoryRectangular:
                rectangular
            default:
                rectangular
            }
        }
        .widgetURL(URL(string: "agentquota://open"))
    }

    private var circular: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Text(entry.model.shortName)
                    .font(.system(size: 10, weight: .bold))
                Text(entry.model.leftPrimary.map { "\($0)" } ?? "—")
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .minimumScaleFactor(0.6)
                Text("%")
                    .font(.system(size: 9, weight: .semibold))
                    .opacity(0.8)
            }
        }
    }

    private var corner: some View {
        Text(entry.model.leftPrimary.map { "\($0)%" } ?? "—")
            .font(.caption2.weight(.bold))
            .widgetLabel {
                Text(entry.model.compactLine)
            }
    }

    private var inline: some View {
        Text(entry.hasData ? entry.model.compactLine : "AQ —")
            .fontWeight(.semibold)
    }

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(entry.model.shortName)
                    .font(.caption.weight(.bold))
                Spacer(minLength: 2)
                Text(entry.model.leftPrimary.map { "\($0)%" } ?? "—")
                    .font(.system(.title3, design: .rounded).bold())
                    .monospacedDigit()
            }
            if entry.hasData {
                if let s = entry.model.leftSecondary, !entry.model.secondaryLabel.isEmpty {
                    Text("\(entry.model.primaryLabel) \(entry.model.leftPrimary.map(String.init) ?? "—") · \(entry.model.secondaryLabel) \(s)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                } else {
                    Text(entry.model.primaryLabel)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                ProgressView(value: entry.model.gaugeValue)
                    .tint(entry.model.leftPrimary.map { $0 < 15 ? Color.red : ($0 < 30 ? Color.orange : Color.green) } ?? .gray)
            } else {
                Text("打开App同步")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

@main
struct QuotaComplicationBundle: WidgetBundle {
    var body: some Widget {
        QuotaComplicationWidget()
    }
}

struct QuotaComplicationWidget: Widget {
    let kind = "AgentQuotaComplication"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: QuotaTimelineProvider()) { entry in
            QuotaComplicationViews(entry: entry)
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Agent Quota")
        .description("Claude / Codex / Grok 剩余额度")
        .supportedFamilies([
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline,
            .accessoryCorner,
        ])
    }
}
