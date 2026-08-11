import SwiftUI

struct VoiceWatchView: View {
    @Environment(QuotaWatchStore.self) private var store
    @Environment(\.isLuminanceReduced) private var isLuminanceReduced

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("语音")
                        .font(.headline.weight(.bold))
                    Spacer()
                    Circle()
                        .fill(statusColor)
                        .frame(width: 7, height: 7)
                }

                switch store.voicePhase {
                case .idle:
                    Text("按住录音，松手转写")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    recordButton
                case .recording:
                    Text("录音中…")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.red)
                    recordButton
                case .uploading:
                    ProgressView("上传转写中")
                case .preview:
                    transcriptPreview
                case .sending:
                    ProgressView("发送中")
                case let .done(msg):
                    Text(msg)
                        .font(.caption)
                        .foregroundStyle(.green)
                    Button("再录一条") { store.resetVoice() }
                case let .failed(msg):
                    Text(msg)
                        .font(.caption2)
                        .foregroundStyle(.red)
                    Button("重试") { store.resetVoice() }
                }

                if !isLuminanceReduced {
                    Text(store.connectionText)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 4)
        }
        .containerBackground(.black, for: .navigation)
        .task {
            await store.prepareVoice()
        }
    }

    private var recordButton: some View {
        Button {
            Task { await store.toggleRecording() }
        } label: {
            Image(systemName: store.voicePhase == .recording ? "stop.circle.fill" : "mic.circle.fill")
                .font(.system(size: 52))
                .foregroundStyle(store.voicePhase == .recording ? .red : .white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
        }
        .buttonStyle(.plain)
    }

    private var transcriptPreview: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(store.draftTranscript.isEmpty ? "（空）" : store.draftTranscript)
                .font(.caption)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 8) {
                Button("确认发送") {
                    Task { await store.confirmSend() }
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)

                Button("重录") {
                    store.resetVoice()
                }
                .buttonStyle(.bordered)
            }
        }
    }

    private var statusColor: Color {
        switch store.voicePhase {
        case .failed: return .red
        case .done: return .green
        case .recording, .uploading, .sending: return .orange
        default: return store.lastReceivedAt == nil ? .orange : .green
        }
    }
}
