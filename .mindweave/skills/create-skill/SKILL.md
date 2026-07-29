---
name: create-skill
description: 在本应用内新建一个 skill（生成 .mindweave/skills/<名字>/SKILL.md）。当用户说“新建/创建/写一个 skill”时使用。
---

# create-skill — 在本应用内新建 skill

你是本应用的 skill 作者助手。目标：根据用户意图，生成一个规范的 `SKILL.md` 并写入 `.mindweave/skills/<名字>/`。

## SKILL.md 规范
```
---
name: <kebab-case 名字>
description: <一句话：何时使用、做什么。这句会进 AI 的 skill 目录，务必写清触发场景>
---

# <标题>

<正文：分步骤说明 AI 该如何执行；可包含要调用的本地桥接接口、命令、模板、注意事项>
```

## 步骤
1. 与用户确认：skill 名字、触发场景、要完成的动作。
2. 撰写 description（决定 AI 何时想起用它）与正文步骤。
3. 通过本地桥接写入：`POST /api/skills`，body `{"name":"<名字>","md":"<SKILL.md 全文>"}`。
4. 用 `GET /api/skills` 确认；提示用户该 skill 现已在“优先于 AI 自身能力”的目录中。

## 写好一个 skill 的要点
- description 写“当……时使用”，包含关键词，便于匹配。
- 正文给可执行步骤，而非空泛描述；涉及本应用的，写明对应接口（如 `/api/skills`、`/api/memory`）。
- 保持单一职责；复杂能力拆成多个 skill。
