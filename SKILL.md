---
name: mindweave
description: 读写用户本地「思脉 MindWeave」思维导图应用的笔记：列出分组与笔记、读取/新建/更新/删除笔记、管理分组。当用户说「写到我的思维导图」「记到我的笔记里」「更新我的导图」「看看我的笔记列表」或提及思脉/MindWeave 时使用本 skill。
---

# 思脉 MindWeave · Agent 接入

本 skill 教你经 HTTP API 直接读写用户本地的思脉思维导图笔记。用户在应用里看到的导图会在 **3 秒内**自动同步你的改动（应用轮询文件变化）。

## 接入前必须做的两件事

1. **Base URL**：默认 `http://127.0.0.1:4317`（应用后台 server.js 的端口）。
2. **API Key**：让用户在应用「设置 → Agent API」里点「生成 API Key」并把 Key 给你。所有请求必须带请求头：

```
Authorization: Bearer <KEY>
```

（也接受 `X-API-Key: <KEY>`。）没有 Key 时 API 返回 401——直接向用户索要，不要猜测。

## 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/notes` | 列出所有分组与笔记（元数据，不含正文，轻量） |
| GET | `/api/notes/:id` | 读取一篇笔记（含 markdown 全文与聊天记录） |
| POST | `/api/notes` | 新建笔记，body：`{"title": "...", "markdown": "...", "group": "分组名?"}` |
| PUT | `/api/notes/:id` | 更新笔记，body 任意组合：`{"title?": ..., "markdown?": ..., "group?": ...}` |
| DELETE | `/api/notes/:id` | 删除笔记（进应用回收站，用户可还原） |
| GET | `/api/groups` | 分组列表（含每组笔记数） |
| POST | `/api/groups` | 新建分组，body：`{"name": "..."}` |
| DELETE | `/api/groups/:name` | 删除分组（组内笔记移回「未分组」） |

## 思维导图的 Markdown 格式

导图 = 一个 `#` 一级标题（中心主题）+ `-` 列表（两级空格缩进表示层级，最多 5 层）：

```markdown
# 咖啡

- 历史
  - 埃塞俄比亚起源
  - 阿拉伯传播
- 种类
  - 阿拉比卡
  - 罗布斯塔
```

## 典型流程

**更新已有笔记（增量）**：先 `GET /api/notes/:id` 取当前 markdown → 在其基础上修改 → `PUT` 回写整份 markdown。

**追加一个主题**：读出 markdown，在对应分支下加两格缩进的 `- 新主题`，PUT 回写。

```bash
# 列表
curl -s http://127.0.0.1:4317/api/notes -H "Authorization: Bearer $MW_KEY"

# 读取
curl -s http://127.0.0.1:4317/api/notes/<id> -H "Authorization: Bearer $MW_KEY"

# 更新
curl -s -X PUT http://127.0.0.1:4317/api/notes/<id> \
  -H "Authorization: Bearer $MW_KEY" -H "Content-Type: application/json" \
  -d '{"markdown": "# 咖啡\n\n- 历史\n  - 埃塞俄比亚起源\n  - 唐代茶经（新）"}'

# 新建（group 不存在会自动创建）
curl -s -X POST http://127.0.0.1:4317/api/notes \
  -H "Authorization: Bearer $MW_KEY" -H "Content-Type: application/json" \
  -d '{"title": "会议纪要 0512", "group": "工作", "markdown": "# 会议纪要 0512\n\n- 决议\n  - 事项一"}'
```

## 兜底：直接读写文件（server 没运行时）

笔记就是 `.mindweave/notes/` 下的 Markdown 文件，可直接读写（应用打开时同样 3 秒内自动同步）：

- 目录：`<项目目录>/.mindweave/notes/`，未分组笔记在根目录，其余在 `notes/<分组名>/` 子目录
- 每篇 = `<id>.md`（YAML frontmatter + 正文）+ 可选 `<id>.chat.json`

```markdown
---
id: <id>
title: <标题>
group: <分组名|未分组>
order: 0
createdAt: <毫秒时间戳>
updatedAt: <毫秒时间戳>
template: blank
---
# 中心主题

- 主题
  - 子主题
```

改动后请更新 frontmatter 的 `updatedAt`（毫秒时间戳）。

## 行为准则

- 修改前先读取当前内容，**只改用户要求的部分**，其余原样保留。
- 删除操作进回收站（可还原），放心执行，但大规模删除前先跟用户确认。
- 层级最多 5 层；标题与节点文字保持精炼。
