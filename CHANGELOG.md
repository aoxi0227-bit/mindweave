# 更新日志 (Changelog)

本项目采用语义化版本：**大模块/功能更新 → `v1.x`（如 v1.1）**；**小调整/修复 → `v1.x.y`（如 v1.0.1）**。

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
