# Agent Quota Watch

把 **Apple Watch** 变成 Vibe Coding 副屏：

- 表盘复杂功能随时看 **Claude / Codex / Grok** 剩余额度（5 小时 / 周额度 + reset）
- 点复杂功能进入 App 切换模型、查看详情
- 手表录音 → iPhone 中转 → Mac 本地 Whisper 转写 → 手表确认 → 粘贴到 Mac 当前输入框

适合：多 AGI 并行、额度不宽裕、Mac 常合盖外接显示器、想用旧手表麦克风而不是再买 AI 键盘的人。

> **隐私**：仓库不含任何 token、Cookie 或模型权重。密钥与 Whisper 模型在本地生成/下载。

---

## 架构

```text
┌─────────────┐     WCSession      ┌──────────────┐     LAN HTTP      ┌──────────────────┐
│ Apple Watch │ ◄────────────────► │    iPhone    │ ◄───────────────► │   Mac Bridges    │
│ App + 复杂功能│                   │ Agent Quota  │   /quota /voice   │  :8791  :8792    │
└─────────────┘                   └──────────────┘                   └────────┬─────────┘
                                                                              │
                                                    ┌─────────────────────────┼─────────────────────────┐
                                                    ▼                         ▼                         ▼
                                             Agent Panel               whisper.cpp                 剪贴板/粘贴
                                          status.json 额度              本地转写                  当前输入框
```

| 组件 | 作用 | 目录 |
|------|------|------|
| `quota_bridge.py` | 读 Agent Panel（或兼容 JSON），暴露 `GET /quota` | `mac/` |
| `voice_bridge.py` | 收音频、Whisper 转写、`POST /v1/send` 粘贴 | `mac/` |
| iPhone + Watch App | 配对、同步额度、录音中转、表盘复杂功能 | `watch-app/` |

可选上游额度源：

- [Agent Panel](https://github.com/)（本机 `status.json`，含 Claude/Codex + Chrome 采集的 Grok）
- [CodexBar](https://github.com/steipete/CodexBar)（`codexbar serve` 可另接）

---

## 快速开始（Mac）

### 1. 依赖

```bash
brew install python ffmpeg whisper-cpp
# Xcode 16+（装手表 App 需要）
```

### 2. 克隆并安装桥接服务

```bash
git clone https://github.com/leosun111/agent-quota-watch.git
cd agent-quota-watch

# 可选：指定局域网 IP（手表/手机要能访问）
export AGENT_QUOTA_HOST="$(ipconfig getifaddr en0)"
# 若你已有 Agent Panel：
# export AGENT_PANEL_STATUS_URL="http://127.0.0.1:8790/status.json"

./mac/scripts/install-bridges.sh
```

脚本会：

- 生成 token → `~/.agent-quota-watch/secrets/watch-quota-token`
- 安装 LaunchAgent（开机自启）
- 打印手机里应填写的 URL

健康检查：

```bash
curl -s "http://<mac-lan-ip>:8791/health"
curl -s "http://<mac-lan-ip>:8792/health"
```

### 3. 下载 Whisper 模型（语音）

```bash
mkdir -p ~/.agent-quota-watch/models
# 推荐中文：small
curl -L -o ~/.agent-quota-watch/models/ggml-small.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin

# 更高精度（更大更慢）：
# curl -L -o ~/.agent-quota-watch/models/ggml-large-v3-turbo.bin \
#   https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin
```

`voice_bridge` 会自动选已下载的最大完整模型。

### 4. 额度数据源

**方案 A — Agent Panel（与本文作者环境一致）**

确保本机有可访问的：

```text
GET http://127.0.0.1:8790/status.json
```

结构需包含 `agents[]`（claude/codex 的 remain5h/remain7d）以及可选 `grok`。

**方案 B — 自己写一个 status 适配器**

只要最终让 `quota_bridge.py --status-url ...` 读到兼容 JSON 即可。字段约定见 `docs/STATUS_JSON.md`。

### 5. 安装 iPhone / Apple Watch App

```bash
cd watch-app
brew install xcodegen   # 若未安装
# 编辑 project.yml：YOUR_TEAM_ID → 你的 Apple Team ID
# bundle id 前缀默认 com.example，可改成你的
xcodegen generate
open CodexQuotaWatch.xcodeproj
```

在 Xcode：

1. 选中两个 target + Widget，Signing 选你的 Team  
2. 真机运行到 **与手表配对的 iPhone**  
3. 手表上安装 **Agent Quota**（手表 App 或自动随附）

iPhone App 内：

- URL：`http://<mac-lan-ip>:8791`  
- 配对码：任意 ≥4 位数字  
- 连接 → 刷新 → 同步到 Watch  

表盘：长按表盘 → 编辑 → 添加 **Agent Quota** 复杂功能。

> 首次开发安装需在 iPhone「设置 → 通用 → VPN 与设备管理」信任开发者。

---

## 语音流程

1. Watch 上滑到「语音」→ 授权麦克风  
2. 点麦克风录音 → 再点停止  
3. 等待转写预览 → **确认发送**  
4. Mac 当前输入框获得粘贴（需辅助功能权限时，仅粘贴进剪贴板）

系统设置 → 隐私与安全性 → **辅助功能**：允许 `python3` / 终端（若要用自动 Cmd+V）。

---

## 出门 / 办公室远程

默认是 **局域网**。  
人在外、电脑在办公室时：

1. Mac 与 iPhone 加入同一虚拟网络（如 [Tailscale](https://tailscale.com)）  
2. `install-bridges.sh` 的 `AGENT_QUOTA_HOST` 绑 `0.0.0.0`  
3. iPhone 里 URL 改为 Mac 的 Tailscale IP：`http://100.x.y.z:8791`  
4. Token 不要暴露到公网；勿对全网开放无认证端口  

Watch 始终只近场连 iPhone；**远程能力 = iPhone 能否访问 Mac bridge**。

---

## 卸载 Mac 服务

```bash
./mac/scripts/uninstall-bridges.sh
```

---

## 安全说明

- `/quota`、`/v1/*` 使用 Bearer Token（安装时生成）  
- 不要把 `~/.agent-quota-watch/secrets/` 提交到 Git  
- 仅在可信网络或 VPN 内使用明文 HTTP  
- 语音在本地 Whisper 处理（默认不上传云端）

---

## 目录结构

```text
agent-quota-watch/
├── README.md
├── LICENSE
├── mac/
│   ├── quota_bridge.py
│   ├── voice_bridge.py
│   └── scripts/
│       ├── install-bridges.sh
│       └── uninstall-bridges.sh
├── watch-app/                 # XcodeGen iOS + watchOS + Widget
│   ├── project.yml
│   ├── iPhone/
│   ├── Watch/
│   ├── WatchWidget/
│   └── Sources/WatchQuotaShared/
└── docs/
    ├── ARCHITECTURE.md
    └── STATUS_JSON.md
```

---

## 致谢

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) — 本地语音识别  
- [CodexBar](https://github.com/steipete/CodexBar) — 多厂商额度灵感与可选数据源  
- Apple WatchConnectivity / WidgetKit — 手表中转与复杂功能  

---

## License

MIT — 见 [LICENSE](LICENSE)。

欢迎 Issue / PR。若你改进了 Grok 采集、云端 STT 适配或远程组网预设，非常欢迎回馈上游。
