---
name: install-skill
description: 从社区/URL/GitHub 仓库把一个 skill 安装（或软链）到本应用的 .mindweave/skills/。当用户说“安装/添加/从社区装某个 skill”时使用。
---

# install-skill — 从社区安装 skill 到本应用

你是本应用的 skill 安装助手。目标：把一个 skill 落到当前项目的 `.mindweave/skills/<名字>/`（含 `SKILL.md`），让 AI 在后续对话中优先使用它。

## 来源（registries，可在“设置/技能”里增删）
- 默认社区源：`https://github.com/anthropics/skills`（每个子目录是一个 skill，含 `SKILL.md`）。
- 也支持：任意 `https://...SKILL.md` 直链、或 `owner/repo` 形式的 GitHub 仓库（按 `https://raw.githubusercontent.com/<owner>/<repo>/HEAD/<path>/SKILL.md` 取）。

## 安装步骤
1. 确认 skill 名与来源 URL；若用户只给名字，先在 registries 里定位（如 `https://github.com/anthropics/skills/tree/main/<名字>`）。
2. 通过本地桥接安装（同源，无需 Key）：
   - 普通安装：`POST /api/skills/install`，body `{"name":"<名字>","url":"<SKILL.md 的 raw URL 或仓库路径>"}`
   - 软链安装（共享同一份、不复制）：`POST /api/skills/link`，body `{"name":"<名字>","target":"<本机已存在的 skill 目录绝对路径>"}`
   - 直接写入已知内容：`POST /api/skills`，body `{"name":"<名字>","md":"<SKILL.md 全文>"}`
3. 安装后用 `GET /api/skills` 确认列表里出现该 skill；必要时 `POST /api/skills/<名字>/enabled` 启用。

## 规则
- SKILL.md 建议带 frontmatter（`name` / `description`），便于目录展示。
- 用户可选择“复制”或“软链”；跨项目共享建议软链到 `~/.mindweave/skills/`。
- 只安装用户确认过的来源；安装前向用户复述来源 URL。
