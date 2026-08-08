"use strict";
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const DATA = path.join(__dirname, ".mindweave");
const DEFAULT_DATA = DATA;
// 自定义数据目录的指针始终存在默认目录的 config.json 里（dataDir 字段），避免“配置跟着数据走”的死锁
function resolveDataDir() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(DEFAULT_DATA, "config.json"), "utf8"));
    const p = cfg && typeof cfg.dataDir === "string" ? cfg.dataDir.trim() : "";
    if (p && path.isAbsolute(p) && fs.existsSync(p)) return p;
  } catch (e) {}
  return DEFAULT_DATA;
}
let CUR_DATA = resolveDataDir();
let NOTES = path.join(CUR_DATA, "notes");
let MEMORY = path.join(CUR_DATA, "memory");
let MEM_NOTES = path.join(MEMORY, "notes");
let MEM_GROUPS = path.join(MEMORY, "groups");
let CACHE = path.join(CUR_DATA, "cache");
let TRASH = path.join(CUR_DATA, "trash");
let GROUPS_IDX = path.join(CUR_DATA, "groups.md");
let CONFIG = path.join(CUR_DATA, "config.json");
const UNGROUPED = "未分组";

function applyPaths(dir) {
  CUR_DATA = dir;
  NOTES = path.join(dir, "notes");
  MEMORY = path.join(dir, "memory");
  MEM_NOTES = path.join(MEMORY, "notes");
  MEM_GROUPS = path.join(MEMORY, "groups");
  CACHE = path.join(dir, "cache");
  TRASH = path.join(dir, "trash");
  GROUPS_IDX = path.join(dir, "groups.md");
  CONFIG = path.join(dir, "config.json");
}

function ensure() {
  for (const d of [CUR_DATA, NOTES, MEMORY, MEM_NOTES, MEM_GROUPS, CACHE, TRASH]) fs.mkdirSync(d, { recursive: true });
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
  const note = { id: meta.id || path.basename(fp, ".md"), title: meta.title || path.basename(fp, ".md"), group: meta.group || UNGROUPED, order: parseInt(meta.order || "0", 10) || 0, createdAt: parseInt(meta.createdAt || "0", 10) || 0, updatedAt: parseInt(meta.updatedAt || "0", 10) || 0, template: meta.template || "blank", markdown: body.replace(/\n$/, "") };
  try { const sidecar = fp.replace(/\.md$/, ".chat.json"); if (fs.existsSync(sidecar)) { const chat = JSON.parse(fs.readFileSync(sidecar, "utf8")); if (Array.isArray(chat)) note.chat = chat; } } catch (e) {}
  return note;
}
function serializeNote(d) {
  const fm = ["---", "id: " + d.id, "title: " + (d.title || "").replace(/\n/g, " "), "group: " + (d.group || UNGROUPED), "order: " + (d.order || 0), "createdAt: " + (d.createdAt || 0), "updatedAt: " + (d.updatedAt || 0), "template: " + (d.template || "blank"), "---", ""].join("\n");
  return fm + (d.markdown || "");
}
function titleBase(d) { const t = String(d.title || "").trim(); return t ? sanitize(t) : sanitize(d.id); }
function noteFileId(fp) {
  try {
    const txt = fs.readFileSync(fp, "utf8").slice(0, 800);
    const m = txt.match(/^---\n([\s\S]*?)\n---/);
    if (m) { const mm = m[1].match(/^id:\s*(.+)$/m); if (mm) return mm[1].trim(); }
  } catch (e) {}
  return null;
}
// 在分组目录里定位这篇笔记实际对应的文件（标题命名 / 重名加 id 后缀 / 旧 id 命名）
function locateNoteFile(dir, d) {
  const base = titleBase(d), sid = sanitize(d.id);
  for (const name of [base + ".md", base + "-" + sid + ".md", sid + ".md"]) {
    const fp = path.join(dir, name);
    if (!fs.existsSync(fp)) continue;
    const fid = noteFileId(fp);
    if (fid === d.id || (!fid && path.basename(fp, ".md") === sid)) return fp;
  }
  return null;
}
function notePath(d) {
  const dir = ensureGroupDir(d.group);
  const plain = path.join(dir, titleBase(d) + ".md");
  if (!fs.existsSync(plain)) return plain;
  if (noteFileId(plain) === d.id) return plain; // 就是本篇自己
  return path.join(dir, titleBase(d) + "-" + sanitize(d.id) + ".md"); // 与别人重名，加 id 后缀
}

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
  return { groups: readGroups(), docs: readAllNotes(), activeId: cfg.activeId || null, settings: { memoryScope: cfg.memoryScope || "note", backend: cfg.backend || "", registries: cfg.registries || [] }, dataDir: CUR_DATA, defaultDir: DEFAULT_DATA };
}
function syncData(payload) {
  ensure();
  const groups = Array.isArray(payload.groups) && payload.groups.length ? payload.groups : readGroups();
  const docs = Array.isArray(payload.docs) ? payload.docs : [];
  for (const g of groups) ensureGroupDir(g.name);
  writeGroups(groups);
  const keep = new Set();
  for (const d of docs) {
    if (!d.id) continue;
    const gdir = d.group === UNGROUPED ? UNGROUPED : sanitize(d.group || UNGROUPED);
    const np = writeNoteFile(d);
    keep.add(gdir + "/" + path.basename(np));
  }
  // prune note files no longer present (连同对应 chat sidecar 一起删)
  let ents = []; try { ents = fs.readdirSync(NOTES, { withFileTypes: true }); } catch (e) {}
  const pruneMd = (fp) => { try { fs.unlinkSync(fp); } catch (er) {} try { fs.unlinkSync(fp.replace(/\.md$/, ".chat.json")); } catch (er) {} };
  for (const e of ents) {
    if (e.isFile() && e.name.endsWith(".md")) { if (!keep.has(UNGROUPED + "/" + e.name)) pruneMd(path.join(NOTES, e.name)); }
    else if (e.isDirectory()) { let sub = []; try { sub = fs.readdirSync(path.join(NOTES, e.name)); } catch (er) {} for (const f of sub) if (f.endsWith(".md") && !keep.has(e.name + "/" + f)) pruneMd(path.join(NOTES, e.name, f)); }
  }
  // merge settings (preserve server-only keys)
  const cfg = readCfg();
  if (payload.settings) { if (payload.settings.memoryScope) cfg.memoryScope = payload.settings.memoryScope; if (payload.settings.backend !== undefined) cfg.backend = payload.settings.backend; if (payload.settings.registries) cfg.registries = payload.settings.registries; }
  if (payload.activeId !== undefined) cfg.activeId = payload.activeId;
  writeCfg(cfg);
  return { ok: true, count: docs.length };
}
function revealDir(p) {
  const target = p || CUR_DATA;
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  try { spawn(cmd, [target], { detached: true, stdio: "ignore" }).unref(); } catch (e) {}
  return target;
}

// ---- 自定义数据目录 ----
function getDataDir() { return CUR_DATA; }
function getDefaultDir() { return DEFAULT_DATA; }
function readDefaultCfg() { try { return JSON.parse(fs.readFileSync(path.join(DEFAULT_DATA, "config.json"), "utf8")); } catch (e) { return {}; } }
function writePointer(p) {
  fs.mkdirSync(DEFAULT_DATA, { recursive: true });
  const cfg = readDefaultCfg();
  if (p) cfg.dataDir = p; else delete cfg.dataDir;
  fs.writeFileSync(path.join(DEFAULT_DATA, "config.json"), JSON.stringify(cfg, null, 2));
}
function setDataDir(p) {
  const want = String(p || "").trim();
  if (!want) { // 恢复默认：仅切回默认目录，custom 目录里的数据原样保留
    writePointer(null);
    applyPaths(DEFAULT_DATA);
    ensure();
    return { ok: true, dataDir: CUR_DATA, defaultDir: DEFAULT_DATA, reset: true };
  }
  const target = path.resolve(want);
  if (target === CUR_DATA) return { ok: true, dataDir: CUR_DATA, defaultDir: DEFAULT_DATA, unchanged: true };
  fs.mkdirSync(target, { recursive: true });
  const probe = path.join(target, ".mw-write-test");
  try { fs.writeFileSync(probe, "1"); fs.unlinkSync(probe); } catch (e) { throw new Error("目录不可写：" + target); }
  // 目标目录还没有笔记结构时，把当前数据整体迁过去；已有结构则直接采用
  let migrated = false;
  if (!fs.existsSync(path.join(target, "notes")) && !fs.existsSync(path.join(target, "groups.md"))) {
    ensure();
    for (const name of ["notes", "memory", "trash", "groups.md"]) {
      const src = path.join(CUR_DATA, name);
      if (!fs.existsSync(src)) continue;
      fs.cpSync(src, path.join(target, name), { recursive: true });
    }
    if (fs.existsSync(CONFIG)) {
      const cfg = readCfg(); delete cfg.dataDir;
      fs.writeFileSync(path.join(target, "config.json"), JSON.stringify(cfg, null, 2));
    }
    migrated = true;
  }
  writePointer(target);
  applyPaths(target);
  ensure();
  return { ok: true, dataDir: CUR_DATA, defaultDir: DEFAULT_DATA, migrated };
}

// 调起系统原生文件夹选择框，返回所选绝对路径（用户取消则 canceled）
function pickDir() {
  return new Promise((resolve) => {
    let cmd, args;
    if (process.platform === "darwin") {
      cmd = "osascript";
      args = ["-e", 'POSIX path of (choose folder with prompt "选择思脉数据保存文件夹")'];
    } else if (process.platform === "win32") {
      cmd = "powershell";
      args = ["-NoProfile", "-Command", "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = '选择思脉数据保存文件夹'; if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $d.SelectedPath }"];
    } else {
      cmd = "zenity";
      args = ["--file-selection", "--directory", "--title=选择思脉数据保存文件夹"];
    }
    let child;
    try { child = spawn(cmd, args, { stdio: ["ignore", "pipe", "ignore"] }); } catch (e) { resolve({ canceled: true }); return; }
    let out = "", done = false;
    const fin = (r) => { if (!done) { done = true; clearTimeout(tm); resolve(r); } };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (c) => (out += c));
    child.on("error", () => fin({ canceled: true }));
    child.on("close", (code) => {
      let p = out.trim().replace(/[\\/]+$/, "");
      if (code !== 0 || !p) return fin({ canceled: true });
      fin({ path: p });
    });
    const tm = setTimeout(() => { try { child.kill(); } catch (e) {} fin({ canceled: true }); }, 180000);
  });
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
  let extra = "";
  const sk = require("./skills-memory");
  try { extra += sk.skillsPrompt ? sk.skillsPrompt() : ""; } catch (e) {}
  if (ctx && ctx.noteId) { const m = memoryForQuery(ctx.noteId, ctx.group || UNGROUPED); let mem = ""; if (m.groupIdx) mem += "\n\n" + m.groupIdx; if (m.noteMem && m.noteMem.trim()) mem += "\n\n## 当前笔记《" + (ctx.title || "") + "》的记忆\n" + m.noteMem.trim(); if (mem) extra += "\n\n# 本应用 Memory（回答前先参考；已按组归档，定位到当前笔记）" + mem; }
  if (extra) { const di = s.indexOf("\n\n当前文档：\n"); if (di >= 0) s = s.slice(0, di) + "\n" + extra + s.slice(di); else s += extra; }
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
    if (!spec || !spec.bin) { resolve(""); return; }
    const args = [];
    let promptText = prompt;
    const win = process.platform === "win32";
    const useStdin = win && !!spec.stdinPrompt;
    if (system) {
      if (useStdin || win || !(spec.sys && spec.sys.length)) promptText = "[系统指令]\n" + system + "\n\n[任务]\n" + prompt;
      else args.push(spec.sys[0], system);
    }
    if (useStdin) {
      args.push(spec.prompt[0]);
    } else {
      if (win && promptText.length > 7500) promptText = promptText.slice(0, 7500) + "\n\n[内容过长，已截断]";
      args.push(spec.prompt[0], promptText);
    }
    if (spec.flags) for (const f of spec.flags) args.push(f);
    if (spec.out && spec.out.length) args.push(...spec.out);
    // Windows 上 npm 全局 CLI 是 .cmd/.bat shim，必须经 cmd shell 启动；windowsHide 防止闪黑框
    const spawnOpts = { stdio: [useStdin ? "pipe" : "ignore", "pipe", "pipe"] };
    if (win) {
      if (/\.(cmd|bat)$/i.test(String(spec.bin))) spawnOpts.shell = true;
      spawnOpts.windowsHide = true;
    }
    const child = spawn(spec.bin, args, spawnOpts);
    if (useStdin) { try { child.stdin.write(promptText); child.stdin.end(); } catch (e) {} }
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
    const body = JSON.stringify({ model: model || "MiniMax-M3", max_tokens: 1200, stream: false, messages });
    const u = new URL(baseUrl + "/v1/messages");
    const mod = u.protocol === "https:" ? require("https") : require("http");
    const r = mod.request({ hostname: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80), path: u.pathname, method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key || "x", "anthropic-version": "2023-06-01", "Content-Length": Buffer.byteLength(body) } }, (res) => {
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

function notesMtime() {
  ensure(); let max = 0;
  const walk = (dir) => { let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) { const fp = path.join(dir, e.name);
      if (e.isDirectory()) walk(fp);
      else if (e.name.endsWith(".md")) { try { const st = fs.statSync(fp); if (st.mtimeMs > max) max = st.mtimeMs; } catch (er) {} } } };
  walk(NOTES);
  try { const st = fs.statSync(GROUPS_IDX); if (st.mtimeMs > max) max = st.mtimeMs; } catch (e) {}
  return { mtime: max };
}


function trashNote(d) {
  ensure();
  let fp = path.join(TRASH, titleBase(d) + ".md");
  if (fs.existsSync(fp) && noteFileId(fp) !== d.id) fp = path.join(TRASH, titleBase(d) + "-" + sanitize(d.id) + ".md");
  fs.writeFileSync(fp, serializeNote(d));
  if (Array.isArray(d.chat)) { try { fs.writeFileSync(fp.replace(/\.md$/, ".chat.json"), JSON.stringify(d.chat)); } catch (e) {} }
}
function trashInfo() {
  ensure(); let count = 0, size = 0;
  let ents; try { ents = fs.readdirSync(TRASH); } catch (e) { return { count: 0, size: 0, items: [] }; }
  const items = [];
  for (const f of ents) {
    const fp = path.join(TRASH, f);
    try { const st = fs.statSync(fp); size += st.size; } catch (e) {}
    if (f.endsWith(".md")) { count++; const n = parseNoteFile(fp); if (n) items.push({ id: n.id, title: n.title, group: n.group, updatedAt: n.updatedAt }); }
  }
  return { count, size, items };
}
function emptyTrash() {
  ensure(); let ents; try { ents = fs.readdirSync(TRASH); } catch (e) { return { ok: true }; }
  for (const f of ents) { try { fs.unlinkSync(path.join(TRASH, f)); } catch (e) {} }
  return { ok: true };
}
function restoreNote(id) {
  ensure();
  let ents = []; try { ents = fs.readdirSync(TRASH); } catch (e) { return null; }
  let fp = null;
  for (const f of ents) {
    if (!f.endsWith(".md")) continue;
    const c = path.join(TRASH, f);
    if (noteFileId(c) === id || path.basename(c, ".md") === sanitize(id)) { fp = c; break; }
  }
  if (!fp) return null;
  const n = parseNoteFile(fp);
  try { fs.unlinkSync(fp); } catch (e) {}
  try { fs.unlinkSync(fp.replace(/\.md$/, ".chat.json")); } catch (e) {}
  return n;
}

function writeNoteFile(d) {
  ensure();
  const dir = ensureGroupDir(d.group);
  const np = notePath(d);
  const old = locateNoteFile(dir, d);
  fs.writeFileSync(np, serializeNote(d));
  if (Array.isArray(d.chat)) { try { fs.writeFileSync(np.replace(/\.md$/, ".chat.json"), JSON.stringify(d.chat)); } catch (e) {} }
  // 标题变了导致文件名变化：旧文件（含旧 id 命名）改名迁移，chat sidecar 一起带走
  if (old && old !== np) {
    const oldSide = old.replace(/\.md$/, ".chat.json"), newSide = np.replace(/\.md$/, ".chat.json");
    if (!Array.isArray(d.chat) && fs.existsSync(oldSide) && !fs.existsSync(newSide)) { try { fs.renameSync(oldSide, newSide); } catch (e) {} }
    try { fs.unlinkSync(old); } catch (e) {}
    try { fs.unlinkSync(oldSide); } catch (e) {}
  }
  return np;
}
function removeNoteFile(d) {
  const dir = d.group === UNGROUPED ? NOTES : path.join(NOTES, sanitize(d.group || UNGROUPED));
  const fp = locateNoteFile(dir, d) || path.join(dir, sanitize(d.id) + ".md");
  try { fs.unlinkSync(fp); } catch (e) {}
  try { fs.unlinkSync(fp.replace(/\.md$/, ".chat.json")); } catch (e) {}
}
function apiListNotes() {
  const data = loadData();
  return { groups: data.groups, notes: data.docs.map((d) => ({ id: d.id, title: d.title, group: d.group, order: d.order || 0, createdAt: d.createdAt, updatedAt: d.updatedAt, template: d.template })) };
}
function apiGetNote(id) { return readAllNotes().find((n) => n.id === id) || null; }
function ensureGroupRegistered(name) {
  if (name === UNGROUPED) return;
  const groups = readGroups();
  if (!groups.find((g) => g.name === name)) { groups.push({ name }); writeGroups(groups); }
}
function apiCreateNote(input) {
  ensure();
  const src = input || {};
  const now = Date.now();
  const title = (src.title && String(src.title).trim()) || "未命名导图";
  const group = (src.group && String(src.group).trim()) || UNGROUPED;
  const d = { id: crypto.randomBytes(5).toString("hex"), title, group, order: 0, createdAt: now, updatedAt: now, template: "blank", markdown: typeof src.markdown === "string" && src.markdown.trim() ? src.markdown : "# " + title + "\n", chat: [] };
  ensureGroupRegistered(group);
  writeNoteFile(d);
  return d;
}
function apiUpdateNote(id, patch) {
  const cur = readAllNotes().find((n) => n.id === id);
  if (!cur) return null;
  const p = patch || {};
  const old = Object.assign({}, cur);
  if (p.title !== undefined) cur.title = String(p.title).trim() || cur.title;
  if (p.markdown !== undefined) cur.markdown = String(p.markdown);
  if (p.group !== undefined) cur.group = String(p.group).trim() || UNGROUPED;
  cur.updatedAt = Date.now();
  ensureGroupRegistered(cur.group);
  if (cur.group !== old.group) removeNoteFile(old);
  writeNoteFile(cur);
  return cur;
}
function apiDeleteNote(id) {
  const cur = readAllNotes().find((n) => n.id === id);
  if (!cur) return false;
  trashNote(cur);
  removeNoteFile(cur);
  return true;
}
function apiListGroups() {
  const notes = readAllNotes();
  return readGroups().map((g) => ({ name: g.name, count: notes.filter((n) => n.group === g.name).length }));
}
function apiCreateGroup(name) {
  const n = String(name || "").trim();
  if (!n) return { ok: false, error: "分组名不能为空" };
  const groups = readGroups();
  if (groups.find((g) => g.name === n)) return { ok: true, exists: true };
  groups.push({ name: n });
  writeGroups(groups);
  ensureGroupDir(n);
  return { ok: true };
}
function apiDeleteGroup(name) {
  const n = String(name || "").trim();
  if (!n || n === UNGROUPED) return { ok: false, error: "未分组不可删除" };
  const groups = readGroups();
  if (!groups.find((g) => g.name === n)) return { ok: false, error: "分组不存在" };
  for (const note of readAllNotes().filter((x) => x.group === n)) {
    const old = Object.assign({}, note);
    note.group = UNGROUPED;
    note.updatedAt = Date.now();
    removeNoteFile(old);
    writeNoteFile(note);
  }
  writeGroups(groups.filter((g) => g.name !== n));
  return { ok: true };
}
function genApiKey() {
  const cfg = readCfg();
  cfg.apiKey = "mw-" + crypto.randomBytes(16).toString("hex");
  writeCfg(cfg);
  return cfg.apiKey;
}
function revokeApiKey() { const cfg = readCfg(); delete cfg.apiKey; writeCfg(cfg); }
function getApiKey() { return readCfg().apiKey || null; }
function checkApiKey(k) { const key = getApiKey(); return !!(key && k && k === key); }

module.exports = { ensure, readCfg, writeCfg, loadData, syncData, notesMtime, revealDir, setDataDir, getDataDir, getDefaultDir, pickDir, trashNote, trashInfo, emptyTrash, restoreNote, readNoteMem, writeNoteMem, setGroupIndexLine, memoryForQuery, buildSystem, collectCli, collectHttp, cacheGet, cacheSet, DATA, apiListNotes, apiGetNote, apiCreateNote, apiUpdateNote, apiDeleteNote, apiListGroups, apiCreateGroup, apiDeleteGroup, genApiKey, revokeApiKey, getApiKey, checkApiKey };
