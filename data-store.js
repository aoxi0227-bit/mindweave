"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const DATA = path.join(__dirname, ".mindweave");
const NOTES = path.join(DATA, "notes");
const MEMORY = path.join(DATA, "memory");
const MEM_NOTES = path.join(MEMORY, "notes");
const MEM_GROUPS = path.join(MEMORY, "groups");
const CACHE = path.join(DATA, "cache");
const GROUPS_IDX = path.join(DATA, "groups.md");
const CONFIG = path.join(DATA, "config.json");
const UNGROUPED = "未分组";

function ensure() {
  for (const d of [DATA, NOTES, MEMORY, MEM_NOTES, MEM_GROUPS, CACHE]) fs.mkdirSync(d, { recursive: true });
  if (!fs.existsSync(CONFIG)) fs.writeFileSync(CONFIG, JSON.stringify({ memoryScope: "note", registries: ["https://github.com/anthropics/skills"], disabledSkills: [] }, null, 2));
}
function ensureGroupDir(g) { const dir = g === UNGROUPED ? NOTES : path.join(NOTES, sanitize(g)); fs.mkdirSync(dir, { recursive: true }); return dir; }
function sanitize(s) { return String(s).replace(/[\\/:*?"<>|]/g, "_").slice(0, 60) || "group"; }
function safeJoin(base, name) { const fp = path.normalize(path.join(base, name)); if (!fp.startsWith(base)) throw new Error("非法路径"); return fp; }
function readCfg() { ensure(); try { return JSON.parse(fs.readFileSync(CONFIG, "utf8")); } catch (e) { return { memoryScope: "note", registries: [], disabledSkills: [] }; } }
function writeCfg(c) { ensure(); fs.writeFileSync(CONFIG, JSON.stringify(c, null, 2)); }

function parseNoteFile(fp) {
  let txt; try { txt = fs.readFileSync(fp, "utf8"); } catch (e) { return null; }
  let meta = {}, body = txt;
  const m = txt.match(/^---\n([\s\S]*?)\n---\n?/);
  if (m) { body = txt.slice(m[0].length); for (const line of m[1].split("\n")) { const mm = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/); if (mm) meta[mm[1]] = mm[2].trim(); } }
  return { id: meta.id || path.basename(fp, ".md"), title: meta.title || path.basename(fp, ".md"), group: meta.group || UNGROUPED, order: parseInt(meta.order || "0", 10) || 0, createdAt: parseInt(meta.createdAt || "0", 10) || 0, updatedAt: parseInt(meta.updatedAt || "0", 10) || 0, template: meta.template || "blank", markdown: body.replace(/\n$/, "") };
}
function serializeNote(d) {
  const fm = ["---", "id: " + d.id, "title: " + (d.title || "").replace(/\n/g, " "), "group: " + (d.group || UNGROUPED), "order: " + (d.order || 0), "createdAt: " + (d.createdAt || 0), "updatedAt: " + (d.updatedAt || 0), "template: " + (d.template || "blank"), "---", ""].join("\n");
  return fm + (d.markdown || "");
}
function notePath(d) { return path.join(ensureGroupDir(d.group), sanitize(d.id) + ".md"); }

function readGroups() {
  ensure(); const out = []; let i = 0;
  try { if (fs.existsSync(GROUPS_IDX)) for (const line of fs.readFileSync(GROUPS_IDX, "utf8").split("\n")) { const m = line.match(/^-\s+(.+)$/); if (m) out.push({ name: m[1].trim(), order: i++ }); } } catch (e) {}
  if (!out.length) out.push({ name: UNGROUPED, order: 0 });
  if (!out.find(g => g.name === UNGROUPED)) out.push({ name: UNGROUPED, order: out.length });
  return out;
}
function writeGroups(groups) { ensure(); fs.writeFileSync(GROUPS_IDX, "# 分组（顺序即侧栏顺序）\n" + groups.map(g => "- " + g.name).join("\n") + "\n"); }

function readAllNotes() {
  ensure(); const notes = [];
  let ents = []; try { ents = fs.readdirSync(NOTES, { withFileTypes: true }); } catch (e) { return notes; }
  for (const e of ents) {
    const fp = path.join(NOTES, e.name);
    if (e.isFile() && e.name.endsWith(".md")) { const n = parseNoteFile(fp); if (n) notes.push(n); }
    else if (e.isDirectory()) { let sub = []; try { sub = fs.readdirSync(fp); } catch (er) {} for (const f of sub) if (f.endsWith(".md")) { const n = parseNoteFile(path.join(fp, f)); if (n) notes.push(n); } }
  }
  return notes;
}
function loadData() {
  ensure();
  const cfg = readCfg();
  return { groups: readGroups(), docs: readAllNotes(), activeId: null, settings: { memoryScope: cfg.memoryScope || "note", backend: cfg.backend || "", registries: cfg.registries || [] }, dataDir: DATA };
}
function syncData(payload) {
  ensure();
  const groups = Array.isArray(payload.groups) && payload.groups.length ? payload.groups : readGroups();
  const docs = Array.isArray(payload.docs) ? payload.docs : [];
  for (const g of groups) ensureGroupDir(g.name);
  writeGroups(groups);
  const keep = new Set();
  for (const d of docs) { if (!d.id) continue; keep.add(d.group + "/" + sanitize(d.id) + ".md"); fs.writeFileSync(notePath(d), serializeNote(d)); }
  // prune note files no longer present
  let ents = []; try { ents = fs.readdirSync(NOTES, { withFileTypes: true }); } catch (e) {}
  for (const e of ents) {
    if (e.isFile() && e.name.endsWith(".md")) { if (!keep.has(UNGROUPED + "/" + e.name)) try { fs.unlinkSync(path.join(NOTES, e.name)); } catch (er) {} }
    else if (e.isDirectory()) { let sub = []; try { sub = fs.readdirSync(path.join(NOTES, e.name)); } catch (er) {} for (const f of sub) if (f.endsWith(".md") && !keep.has(e.name + "/" + f)) try { fs.unlinkSync(path.join(NOTES, e.name, f)); } catch (er) {} }
  }
  // merge settings (preserve server-only keys)
  const cfg = readCfg();
  if (payload.settings) { if (payload.settings.memoryScope) cfg.memoryScope = payload.settings.memoryScope; if (payload.settings.backend !== undefined) cfg.backend = payload.settings.backend; if (payload.settings.registries) cfg.registries = payload.settings.registries; }
  writeCfg(cfg);
  return { ok: true, count: docs.length };
}
function revealDir(p) {
  const target = p || DATA;
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  try { spawn(cmd, [target], { detached: true, stdio: "ignore" }).unref(); } catch (e) {}
  return target;
}

// ---- memory ----
function memNotePath(noteId) { return path.join(MEM_NOTES, sanitize(noteId) + ".md"); }
function memGroupPath(group) { return path.join(MEM_GROUPS, sanitize(group) + ".md"); }
function groupIndexPath(group) { return path.join(MEM_GROUPS, sanitize(group) + ".index.md"); }
function readText(fp) { try { return fs.readFileSync(fp, "utf8"); } catch (e) { return ""; } }
function readNoteMem(noteId) { return readText(memNotePath(noteId)); }
function writeNoteMem(noteId, txt) { ensure(); fs.writeFileSync(memNotePath(noteId), txt); }
function readGroupIndex(group) {
  const txt = readText(groupIndexPath(group)); const m = {};
  for (const line of txt.split("\n")) { const mm = line.match(/^-\s+\[([^\]]+)\]\s*(.*)$/); if (mm) m[mm[1]] = mm[2].trim(); }
  return m;
}
function setGroupIndexLine(group, noteId, title, oneline) {
  ensure(); const fp = groupIndexPath(group); const idx = readGroupIndex(group); idx[noteId] = (title || "") + " — " + (oneline || "");
  const lines = Object.keys(idx).map(id => "- [" + id + "] " + idx[id]);
  fs.writeFileSync(fp, "# 组记忆索引（" + group + "）\n> 提问某篇笔记时，先读本索引定位，再读该笔记的 memory，无需通读全组。\n" + lines.join("\n") + "\n");
}
function memoryForQuery(noteId, group) {
  ensure(); const noteMem = readNoteMem(noteId); let groupIdx = "";
  if (group && group !== UNGROUPED) { const idx = readGroupIndex(group); const lines = Object.keys(idx).filter(id => id !== noteId).map(id => "- [" + id + "] " + idx[id]); if (lines.length) groupIdx = "## 本组其它笔记索引（先定位再读对应 memory）\n" + lines.join("\n") + "\n"; }
  return { noteMem, groupIdx };
}
function buildSystem(base, ctx) {
  let s = base || "";
  const sk = require("./skills-memory");
  try { s += sk.skillsPrompt ? sk.skillsPrompt() : ""; } catch (e) {}
  // memory injection (per-note + group index)
  if (ctx && ctx.noteId) { const m = memoryForQuery(ctx.noteId, ctx.group || UNGROUPED); let mem = ""; if (m.groupIdx) mem += "\n\n" + m.groupIdx; if (m.noteMem && m.noteMem.trim()) mem += "\n\n## 当前笔记《" + (ctx.title || "") + "》的记忆\n" + m.noteMem.trim(); if (mem) s += "\n\n# 本应用 Memory（回答前先参考；已按组归档，定位到当前笔记）" + mem; }
  return s;
}

// ---- LLM collect (for auto memory summary) ----
function parseCliLine(line, onText) {
  if (!line || !line.trim()) return;
  let o; try { o = JSON.parse(line); } catch (e) { return; }
  const collect = (v) => { if (typeof v === "string") onText(v); else if (Array.isArray(v)) v.forEach(x => { if (typeof x === "string") onText(x); else if (x && typeof x.text === "string") onText(x.text); }); };
  if (o.role === "assistant" && "content" in o) { collect(o.content); return; }
  const t = o.type;
  if (t === "stream_event" && o.event) { const ev = o.event; if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta" && ev.delta.text) onText(ev.delta.text); return; }
  if (t === "content_block_delta" && o.delta && o.delta.text) { onText(o.delta.text); return; }
  if (t === "assistant" && o.message && o.message.content) { const txt = (o.message.content || []).filter(c => c && c.type === "text").map(c => c.text || "").join(""); if (txt) onText(txt); return; }
  if (t === "result" && typeof o.result === "string") { onText(o.result); return; }
}
function collectCli(spec, prompt, system) {
  return new Promise((resolve) => {
    const args = [];
    if (system && spec.sys && spec.sys.length) args.push(spec.sys[0], system);
    if (system) args.push(...(spec.flags || []));
    args.push(spec.prompt[0], (system ? "[系统指令]\n" + system + "\n\n[任务]\n" : "") + prompt);
    if (spec.flags && system) {} // flags already added above conditionally
    if (!system && spec.flags) for (const f of spec.flags) args.push(f);
    args.push("--output-format", "stream-json");
    const child = spawn(spec.bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let buf = "", out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (c) => { buf += c; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); parseCliLine(l, t => (out += t)); } });
    child.on("close", () => { if (buf.trim()) parseCliLine(buf, t => (out += t)); resolve(out.trim()); });
    child.on("error", () => resolve(""));
    setTimeout(() => { try { child.kill(); } catch (e) {} resolve(out.trim()); }, 40000);
  });
}
function collectHttp(baseUrl, key, model, messages) {
  return new Promise((resolve) => {
    const http = require("http");
    const body = JSON.stringify({ model: model || "MiniMax-M3", max_tokens: 1200, stream: false, messages });
    const u = new URL(baseUrl + "/v1/messages");
    const r = http.request({ hostname: u.hostname, port: u.port || 80, path: u.pathname, method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key || "x", "anthropic-version": "2023-06-01", "Content-Length": Buffer.byteLength(body) } }, (res) => {
      let t = ""; res.setEncoding("utf8"); res.on("data", d => (t += d)); res.on("end", () => {
        if (res.statusCode !== 200) return resolve("");
        try { const j = JSON.parse(t); const c = (j.content || []).filter(x => x.type === "text").map(x => x.text).join(""); resolve(c.trim()); } catch (e) { resolve(""); }
      });
    });
    r.on("error", () => resolve("")); r.setTimeout(40000, () => { r.destroy(); resolve(""); }); r.write(body); r.end();
  });
}

// ---- cache ----
function cacheGet(k) { try { return JSON.parse(fs.readFileSync(path.join(CACHE, sanitize(k) + ".json"), "utf8")); } catch (e) { return null; } }
function cacheSet(k, v) { ensure(); try { fs.writeFileSync(path.join(CACHE, sanitize(k) + ".json"), JSON.stringify(v)); } catch (e) {} }

module.exports = { ensure, readCfg, writeCfg, loadData, syncData, revealDir, readNoteMem, writeNoteMem, setGroupIndexLine, memoryForQuery, buildSystem, collectCli, collectHttp, cacheGet, cacheSet, DATA };
