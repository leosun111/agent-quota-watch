# Claude Design Brief：Codex / Claude Apple Watch 余额 App

请基于下面要求设计 iPhone + Apple Watch App UI。目标不是营销页，而是一个安静、清晰、可长期扫视的状态工具。

## 产品目标

- 在 Apple Watch 上快速查看 Codex / Claude 实时或最近同步余额。
- iPhone 负责配置 Mac Agent、配对、刷新、同步到 Watch。
- Mac 本地 Agent 是数据源，数据不走云。
- Watch 离开 Mac / iPhone 网络后显示最近快照，并明确标记 stale/offline。

## iPhone UI

### 信息架构

第一屏就是配置和状态，不要 landing page。

必须包含：

- Mac Agent 地址输入框
  - 示例：`http://192.168.1.4:58732`
  - 后续可以替换为 Bonjour 自动发现列表。
- 配对码输入
  - 4 位数字。
  - 主按钮：`配对 Mac`
- 连接状态
  - `未配置`
  - `连接中`
  - `已连接`
  - `离线`
- 余额快照预览
  - Codex
  - Claude
  - 每个 provider 显示 `5小时`、`7天` 两个窗口。
  - 显示剩余百分比，不显示已用百分比作为主数字。
- 操作按钮
  - `立即刷新`
  - `同步到 Apple Watch`
- Apple Watch 状态
  - `Watch 可达`
  - `Watch 已配对但不可达`
  - `Watch 未连接`

### iPhone 视觉要求

- 风格：安静的设置型工具，不要大 hero，不要装饰性插画。
- 背景：系统 grouped background 或深色工具背景均可。
- 卡片半径：10-14。
- 主数字使用 monospaced digits。
- 错误状态用红色，但不要挡住主要操作。
- 离线/快照状态要清楚，但不能吓人。

## Apple Watch UI

### 主要屏幕

设计目标：Apple Watch 45mm / 49mm，深色优先，Always On 降亮状态下仍可读。

布局建议：

- 顶部：
  - Provider 名称：`Codex` / `Claude`
  - 连接状态小圆点
- 中部：
  - 两个 quota 卡片：
    - `5小时`
    - `7天`
  - 每张卡片主数字是剩余百分比，例如 `69%`
  - 小字：`可用` 或 `剩余`
  - 可选：重置时间，例如 `22:40 重置`
  - 可用横向进度条或圆环，但不要影响数字阅读。
- 底部：
  - 最近更新时间，例如 `16:39 更新`
  - Codex 活跃会话数，例如 `会话 1`
  - 离线时显示 `离线快照`

### Watch 交互

- 点击 provider 名称或整屏，切换 Codex / Claude。
- 不强依赖 Watch 上手动刷新；刷新主要由 iPhone 发起。
- Watch 上可以有轻量状态，不要塞复杂配置。

### Always On / 降亮状态

重要限制：watchOS 不允许普通第三方 App 永久强制常亮，所以设计必须适配系统降亮状态。

降亮状态只保留：

- Provider 名称
- `5小时` 剩余百分比
- `7天` 剩余百分比
- 最新同步时间或 stale 标记

降亮状态隐藏：

- 背景渐变
- 阴影
- 装饰图标
- 次要说明
- 复杂动画

### Watch 视觉要求

- 背景：纯黑或接近黑，省电。
- 主数字：非常大，monospaced digits，最小不能低于 28pt。
- 字体：圆润但清晰。
- 色彩：
  - Codex：蓝 / 青色
  - Claude：橙 / 琥珀色
  - 剩余 >= 25%：绿色
  - 剩余 10%-25%：橙色
  - 剩余 < 10%：红色
- 不要用低对比灰字承载关键信息。

## Complication / 小组件

需要设计三类：

- Corner complication
  - Provider 小标 + 一个百分比。
- Circular complication
  - 圆环 + `5h` 或 `7d` 数字。
- Rectangular / Smart Stack
  - Provider 名称
  - `5h 69%`
  - `7d 58%`
  - 更新时间

超短文案：

- `C 69%`
- `5h 69`
- `7d 58`
- `Codex 69/58`

## 不要做

- 不要营销页。
- 不要复杂背景图。
- 不要让 Watch 上出现太多设置项。
- 不要承诺“永久常亮”。
- 不要把离线状态设计成错误弹窗，应该是状态标识。

