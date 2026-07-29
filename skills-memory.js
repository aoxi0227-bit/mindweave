"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const DATA = path.join(__dirname, ".mindweave");
const SKILLS_DIR = path.join(DATA, "skills");
const MEM_DIR = path.join(DATA, "memory");
const CFG_PATH = path.join(DATA, "config.json");
const GLOBAL_MEM = path.join(MEM_DIR, "global", "MEMORY.md");
const NOTES_MEM = path.join(MEM_DIR, "notes");

function ensure() {
  for (const d of [SKILLS_DIR, path.join(MEM_DIR, "global"), NOTES_MEM]) fs.mkdirSync(d, { recursive: true });
  if (!fs.existsSync(CFG_PATH)) fs.writeFileSync(CFG_PATH, JSON.stringify({ memoryScope: "global", registries: ["https://github.com/anthropics/skills"] }, null, 2));
  if (!fs.existsSync(GLOBAL_MEM)) fs.writeFileSync(GLOBAL_MEM, "# 全局记忆（跨笔记）\n\n- 在此记录跨所有导图通用的偏好、约定、长期事实。\n- 行内可用 `- ` 列表；AI 会在每次对话前读取。\n");
}
function readCfg() { ensure(); try { return JSON.parse(fs.readFileSync(CFG_PATH, "utf8")); } catch (e) { return { memoryScope: "global", registries: [] }; } }
function writeCfg(c) { ensure(); fs.writeFileSync(CFG_PATH, JSON.stringify(c, null, 2)); }
function safeJoin(base, name) { const fp = path.normalize(path.join(base, name)); if (!fp.startsWith(base)) throw new Error("非法名称"); return fp; }
function readText(fp) { try { return fs.readFileSync(fp, "utf8"); } catch (e) { return ""; } }

function parseSkill(dir, name) {
  const fp = path.join(dir, "SKILL.md");
  if (!fs.existsSync(fp)) return null;
  const txt = readText(fp);
  let displayName = name, description = "", body = txt;
  const fm = txt.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (fm) {
    body = txt.slice(fm[0].length);
    const m1 = fm[1].match(/^name:\s*(.+)$/m); if (m1) displayName = m1[1].trim().replace(/^["']|["']$/g, "");
    const m2 = fm[1].match(/^description:\s*(.+)$/m); if (m2) description = m2[1].trim().replace(/^["']|["']$/g, "");
  }
  if (!description) { const ln = body.split("\n").map(s => s.trim()).filter(s => s && !s.startsWith("#"))[0]; description = (ln || "").slice(0, 140); }
  return { name, displayName, description, body, path: fp };
}
function scanDir(dir) {
  const out = [];
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of ents) {
    if (!e.isDirectory() && !e.isSymbolicLink()) continue;
    let st; try { st = fs.statSync(path.join(dir, e.name)); } catch (err) { continue; }
    if (!st.isDirectory()) continue;
    const sk = parseSkill(path.join(dir, e.name), e.name);
    if (sk) { sk.symlink = e.isSymbolicLink(); sk.enabled = sk.enabled !== false; out.push(sk); }
  }
  return out;
}
function listSkills() {
  ensure();
  const proj = scanDir(SKILLS_DIR);
  const globalDir = path.join(os.homedir(), ".mindweave", "skills");
  let global = [];
  const seen = new Set(proj.map(s => s.name));
  if (fs.existsSync(globalDir)) for (const s of scanDir(globalDir)) if (!seen.has(s.name)) { s.global = true; global.push(s); }
  return proj.concat(global);
}
function getSkill(name) { ensure(); return parseSkill(SKILLS_DIR, name) || parseSkill(path.join(os.homedir(), ".mindweave", "skills"), name); }
function skillEnabled(name) { const c = readCfg(); const d = (c.disabledSkills || []); return d.indexOf(name) < 0; }
function setSkillEnabled(name, on) { const c = readCfg(); c.disabledSkills = (c.disabledSkills || []).filter(x => x !== name); if (!on) c.disabledSkills.push(name); writeCfg(c); }
function deleteSkill(name) { const fp = safeJoin(SKILLS_DIR, name); fs.rmSync(fp, { recursive: true, force: true }); }
function createSkill(name, md) { const dir = safeJoin(SKILLS_DIR, name); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, "SKILL.md"), md); }
function linkSkill(name, target) { const fp = safeJoin(SKILLS_DIR, name); try { fs.symlinkSync(target, fp, "dir"); } catch (e) { throw new Error("软链失败：" + e.message); } }

function skillsPrompt() {
  const all = listSkills().filter(s => skillEnabled(s.name));
  if (!all.length) return "";
  let s = "\n\n# 本应用自带的 Skills（优先于你自身能力）\n在动用你自己的内置能力或通用方法之前，先查看下列 app skills；若某 skill 适用，优先按其说明执行。需要某 skill 的完整步骤时，在回复中单独一行输出 [[USE_SKILL:名字]]，系统会把其全文提供给你。\n";
  for (const sk of all) s += "- " + sk.name + (sk.displayName && sk.displayName !== sk.name ? "（" + sk.displayName + "）" : "") + "：" + (sk.description || "（无描述）") + "\n";
  return s;
}

function memPathFor(scope, noteId) { return scope === "note" && noteId ? path.join(NOTES_MEM, noteId + ".md") : GLOBAL_MEM; }
function readMem(scope, noteId) { ensure(); return readText(memPathFor(scope, noteId)); }
function writeMem(scope, noteId, txt) { ensure(); fs.writeFileSync(memPathFor(scope, noteId), txt); }
function combinedMem(noteId) {
  const c = readCfg(); const scope = c.memoryScope || "global";
  const g = readText(GLOBAL_MEM);
  if (scope === "note" && noteId) { const n = readText(path.join(NOTES_MEM, noteId + ".md")); return { global: g, note: n }; }
  return { global: g, note: "" };
}
function memoryPrompt(noteId) {
  const m = combinedMem(noteId); let s = "";
  const clean = (t) => t.replace(/^#[^\n]*\n/, "").trim();
  const g = clean(m.global), n = clean(m.note || "");
  if (g || n) {
    s += "\n\n# 本应用的 Memory（用户长期记忆，回答前先参考）\n";
    if (g) s += "## 全局记忆（跨笔记）\n" + g + "\n";
    if (n) s += "## 当前笔记记忆\n" + n + "\n";
  }
  return s;
}
function buildSystem(base, noteId) { return base + skillsPrompt() + memoryPrompt(noteId); }
function catalogs() { ensure(); const c = readCfg(); return { registries: c.registries || [], memoryScope: c.memoryScope || "global", skills: listSkills().map(s => ({ name: s.name, displayName: s.displayName, description: s.description, enabled: skillEnabled(s.name), symlink: !!s.symlink, global: !!s.global })) }; }

module.exports = { ensure, readCfg, writeCfg, listSkills, getSkill, skillEnabled, setSkillEnabled, deleteSkill, createSkill, linkSkill, readMem, writeMem, combinedMem, buildSystem, catalogs };
