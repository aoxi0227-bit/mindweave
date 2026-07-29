# 更新日志 (Changelog)

本项目采用语义化版本：**大模块/功能更新 → `v1.x`（如 v1.1）**；**小调整/修复 → `v1.x.y`（如 v1.0.1）**。

## [v1.1.1] — 桥接健壮性修复 + 三端打包规范

### 修复（链接 API / 本地 CLI / 本地 LLM / 启动服务）
- **https 上游全断**：`server.js` / `data-store.js` 全链路只走 `http` 模块且默认端口写死 80——`ANTHROPIC_BASE_URL` 为 https 时探测与对话永远失败；现按协议自动选择 http/https 模块与默认端口（`/v1/models`、`/v1/messages`、skills 安装均受益）。
- **CLI 参数拼接**：`--output-format stream-json` 此前无脑拼给所有 CLI（qwen / opencode 不支持必挂）；现按 spec 分别配置（claude / kimi 用 stream-json，qwen / opencode 走纯文本解析）。
- **CLI memory 总结必失败**：`/api/backends` 返回的 spec 缺 `bin`，自动 memory 总结 spawn(undefined) 静默 500；已补上。
- **非 claude CLI 被前端误拒**：CLI 模式闸门此前看 `srvHealth.ready`（仅代表 claude+代理），只有 kimi/qwen/opencode 的用户发不出消息；改为查 `/api/backends` 是否有可用后端，设置面板状态同理展示多 CLI。
- **system prompt 双重注入**：CLI 路径（promptText 内嵌 + `--system-prompt`）与 HTTP 代理路径（messages 里的 system 被拼两次）各注入两遍，浪费 token；现各只注入一次。
- **LM Studio 接入不填模型名**：探测到的模型列表未保存，「接入 LM Studio」后测试连接必失败；现与 Ollama 一致自动填入首个模型。
- **OpenAI 兼容直连健壮性**：测试连接前校验模型名非空。

### 修复（启动服务 / 数据）
- **单实例锁是死代码**：`.server.lock` 从未被写入，每次启动都重复 spawn；现正常写入/校验，端口占用时友好退出而非堆栈崩溃。
- **`.app` 存在后浏览器打不开**：`start.sh` ↔ `.app` ↔ `启动思脉.sh` 互相 open 死循环；`启动思脉.sh` 改为标记 wrapper，从 `.app` 内启动时直接开浏览器。
- **Mock/API 模式下后台 2 分钟自杀**：心跳此前只在 claude 就绪时启动；现桥接在跑即心跳，关页自停逻辑不变。
- **memory 一存就清空**：前端发 `txt` 后端读 `text`；已对齐，并补上全局记忆的读写路径（此前全局记忆 UI 永远空白）。
- **Skills 从未注入对话**：`skillsPrompt()` 未导出，`buildSystem` 永远拿不到；已导出。
- **聊天记录刷新即丢**：`/api/data/sync` 丢弃 chat；现按笔记 sidecar（`<id>.chat.json`）落盘，activeId 一并持久化，重开恢复到上次文档。
- **分组名含特殊字符写完即被剪**：syncData 剪枝键未做 sanitize；已修复。
- **Windows 启动器误判**：netstat 探测不验身份，4317 被任意程序占用就跳过启动；改为探测 `/api/health` 特征字段。
- **模板弹层无入口**：「新建文档」此前直接建空白图，4 套场景模板触达不到；现新建时弹出模板选择。
- **Mock 模式误触发 memory 总结**（白白起一次 LLM 调用）；已加模式判断。

### 工程
- 新增 `VERSION` 文件与 `build-release.sh`：一条命令产出 `dist/mindweave-<版本>-{macos,windows,linux}.zip` 三端包（端口 + 浏览器形式；exe/dmg/deb 后期再议）。版本与发布规范见 `工程文档.md` §11。

## [v1.1.1] — 快捷键自定义 + 折叠改 Shift+Tab（小更新）

### 调整
- **折叠快捷键由 `Space` 改为 `Shift+Tab`**（避免与输入空格冲突）。
- **设置新增「快捷键」自定义**：8 个动作（新建子/同级、折叠、删除、四向导航）均可点「录制」重绑，支持 Shift/Ctrl/Alt/Meta 组合；**持久化**到本地与文件夹配置；可「恢复默认」。
### 修复
- 修复 document 键位守卫 `e.target.matches` 在合成/无 target 事件下抛错，导致折叠等绑定动作不生效。

## [v1.1] — 本地数据落盘 + 按组记忆 + 多后端识别 + 启动体验

### 新增 / 大模块
- **本地文件夹实时落盘**：所有分组与笔记按框架归档到 `.mindweave/notes/<分组>/<笔记>.md`（YAML frontmatter + 正文），分组顺序存 `groups.md`；新增**缓存文件夹** `.mindweave/cache/`。打开软件即与本地文件夹双向同步。
- **按组归档的 Memory**：每篇笔记调用 Agent 后，自动把当前 MD 总结成该笔记的记忆（`.mindweave/memory/notes/<id>.md`），并维护**组级索引**（`.mindweave/memory/groups/<组>.index.md`）。再问某篇笔记时，先读组索引定位、再读该笔记记忆，避免通读全组。未分组笔记为各自零散记忆。
- **多后端自动识别**：server.js 启动时探测 `claude / kimi / qwen / opencode` 与本地代理（如 cc-switch），设置里下拉一键切换；含 stream-json 适配与 thinking 块过滤、kimi 无 `--system-prompt` 兼容。
- **应用自带 Skills + Memory**：`.mindweave/skills/`（默认 `install-skill` 从社区装、`create-skill` 新建）；AI 在动用自身能力前先查 app skills/memory；支持**软链**与**社区安装**。
- **启动体验 / 自动启动后台**：用启动器打开软件时**自动启动 server.js** 并开网页；网页检测不到桥接时显示**引导浮层**（按系统提示双击 start.bat / start.sh / .app，或「重新检测」「先用 Mock 打开」）；顶栏桥接状态条可点开引导；设置内「前往本地文件夹」一键打开数据目录。
- **侧栏拖拽 + 分组管理**：文档可拖拽在分组间/组内移动；每组名 ＋ 在该组建空白图、✎ 重命名、🗑 删除（二次确认气泡）；「未分组」受保护；「新建文档」直达空白图。

### 调整 / 修复
- **双击编辑光标**：占位「新主题」双击清空+光标居首，空着离开恢复「新主题」；有内容双击光标置末可续编/逐字删，清空离开恢复**原标题**。
- 设置**后端模型记住上次选择**；编辑框/光标精确贴合节点；删除图标改为**气泡确认**；新建子主题自动居中；Backspace 删除后视图居中到选中节点。
- 修复 `/api/system` 引用未定义变量导致 server 崩溃（Windows 表现为「桥接未启动」）。

## [v1.0.0] — 首版
- 单文件前端：思维导图 + Markdown + AI 对话三向同步，`[[DOC]]` 协议流式逐节点生长，自绘 SVG 导图引擎（布局/缩放钳制/动画/键盘/居中）。
- 本地桥接 server.js：识别本机 Claude CLI 与其代理，无 Key、无 mock。
- 跨平台启动器（macOS/Linux `start.sh`、Windows `start.bat`/`start.ps1`、macOS `.app` 打包脚本）；关页即停。
- Anthropic 设计语言，深/浅主题，导图主题增删，多文档/分组/模板/导入导出。
