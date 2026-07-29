# 思脉 MindWeave

> 人与 AI **双向写作**的思维导图 + Markdown 单页应用。
> 改字出图、改图出字、对话改图——三向实时同步；AI 流式输出时导图**逐节点生长**。
> 配套本地桥接，**直接接入本机 Claude CLI**，无需填 Key、不靠 mock。

视觉采用 Anthropic 设计语言（暖象牙底 + 陶土强调 + 衬线正文）。

![light](demo/01_overview_light.png)

## 一句话运行

**用真实模型（推荐）：**
```bash
node server.js          # 识别本地 claude CLI + 代理，启动同源桥接
# 打开终端打印的地址，如 http://127.0.0.1:4317
```
页面首屏自动识别并切到「本地 Claude CLI」模式，对话即真实模型，**不使用 mock**。

**零配置演示：** 直接双击 `mindweave.html`（内置 Mock 脚本，离线可玩）。

## 能力速览

| 模块 | 说明 |
|------|------|
| 双向同步 | Markdown ↔ 思维导图 ↔ AI 对话，单一数据源，带 source 防循环 |
| 自绘导图 | SVG 布局/缩放（下限锁适应窗口）/拖拽/节点增删改/折叠/键盘操作/生长动画 |
| `[[DOC]]` 协议 | 闲聊不动图，需改文档时流式追加，逐节点生长 + 更新 chip |
| 三模式 AI | ① 本地 Claude CLI 桥接 ② 自定义 OpenAI 兼容端点（含 Ollama/LM Studio 探测）③ Mock |
| 主题 | 深/浅全局 + 4 套导图配色，**可新建/删除**自建主题 |
| 文档管理 | 多文档/分组（增删改名）/搜索/4 模板/自动保存/导入导出 .md·SVG·PNG |
| 布局 | 三栏可折叠，右栏上下可拖拽，状态持久化 |

## 接入本地 Claude CLI 的原理

`server.js`（Node 标准库，无依赖）做两件事：
1. **识别**：探测 `claude` 二进制+版本，读取 `~/.claude/settings.json` 的 `ANTHROPIC_BASE_URL`，请求 `/v1/models` 取模型 → `GET /api/health`。
2. **接入**：把对话转成 Anthropic Messages 流式请求发给该代理，SSE 实时回传 → `POST /api/chat`。

页面同源调用，无 CORS、无 Key、无 mock。详见 [技术文档.md](技术文档.md) §5。

## 文档

- [技术文档.md](技术文档.md) — 架构、引擎算法、协议、数据流、桥接实现
- [工程文档.md](工程文档.md) — 运行、配置、扩展、验证、部署、安全
- [思维导图AI对话网页-工程规划文档.md](思维导图AI对话网页-工程规划文档.md) — 原始需求与决策记录

## 环境

- 浏览器：Chrome/Edge/Safari 近两版
- 真实模型需 Node ≥ 18 + 已登录的 `claude` CLI（仅 Mock 则都不需要）

## 许可

自用 / 内测。纯前端云端模式的 Key 仅存本机浏览器，对外发布前请加后端中转。

## 一键启动（macOS 双击）

双击 **`思脉MindWeave.app`**（或 `启动思脉.sh`）：
- 无终端窗口静默启动后台 `server.js`，并自动用浏览器打开页面；
- 页面与后台用**心跳 + 客户端计数**联动：**关闭最后一个标签页 → 后台自动退出**（崩溃/强退由心跳超时兜底）；
- 重复双击不会起多个后台（单实例锁）。

> 首次双击若被 Gatekeeper 拦截：右键 → 打开 → 确认；或终端执行 `xattr -dr com.apple.quarantine 思脉MindWeave.app`。
> 页面已开时，模型芯片显示「本地 Claude · <model>」即代表走真实模型（非 mock）。

