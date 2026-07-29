"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const os = require("os");

const ROOT = __dirname;
const PORT = parseInt(process.env.PORT || "4317", 10);
const SETTINGS = path.join(os.homedir(), ".claude", "settings.json");

function readCliConfig() {
  try {
    const j = JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
    return (j && j.env) || {};
  } catch (e) {
    return {};
  }
}
function detectClaudeBin() {
  const cands = [
    path.join(os.homedir(), ".local", "bin", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ];
  for (const c of cands) {
    try {
      if (fs.existsSync(c)) return c;
    } catch (e) {}
  }
  return null;
}
function httpJson(url, opts, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname + u.search,
        method: opts.method || "GET",
        headers: opts.headers || {},
      },
      (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("timeout")));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

let cache = { t: 0, val: null };
async function health(force) {
  if (!force && cache.val && Date.now() - cache.t < 8000) return cache.val;
  const env = readCliConfig();
  const baseUrl = (env.ANTHROPIC_BASE_URL || "").replace(/\/+$/, "");
  const bin = detectClaudeBin();
  let cliVersion = null;
  if (bin) {
    try {
      const v = await new Promise((res) => {
        const p = spawn(bin, ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
        let o = "";
        p.stdout.on("data", (d) => (o += d));
        p.on("close", () => res(o.trim()));
        p.on("error", () => res(""));
        setTimeout(() => {
          try { p.kill(); } catch (e) {}
          res(o.trim());
        }, 4000);
      });
      cliVersion = v || null;
    } catch (e) {}
  }
  let proxy = { ok: false, models: [], model: "" };
  if (baseUrl) {
    try {
      const r = await httpJson(
        baseUrl + "/v1/models",
        { headers: { "x-api-key": env.ANTHROPIC_API_KEY || "x", "anthropic-version": "2023-06-01" } },
        3500
      );
      if (r.status === 200) {
        const j = JSON.parse(r.body);
        const list = (j.data || j.models || []).map((m) => m.id || m.slug || m.model).filter(Boolean);
        proxy = { ok: true, models: list, model: list[0] || "" };
      }
    } catch (e) {}
  }
  const val = {
    cli: !!bin,
    cliPath: bin,
    cliVersion,
    proxyOk: proxy.ok,
    baseUrl,
    models: proxy.models,
    model: proxy.model,
    ready: !!bin && proxy.ok,
  };
  cache = { t: Date.now(), val };
  return val;
}

function sendJson(res, code, obj) {
  const b = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  res.end(b);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function serveStatic(req, res) {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/" || p === "") p = "/mindweave.html";
  const fp = path.normalize(path.join(ROOT, p));
  if (!fp.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  fs.readFile(fp, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = "";
    req.on("data", (d) => (b += d));
    req.on("end", () => resolve(b));
    req.on("error", reject);
  });
}

async function handleChat(req, res) {
  const env = readCliConfig();
  const baseUrl = (env.ANTHROPIC_BASE_URL || "").replace(/\/+$/, "");
  if (!baseUrl) {
    sendJson(res, 500, { error: "未读取到本地 Claude CLI 的 ANTHROPIC_BASE_URL（~/.claude/settings.json）" });
    return;
  }
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (e) {
    sendJson(res, 400, { error: "bad json" });
    return;
  }
  const h = await health(false);
  const model = (payload.model && String(payload.model).trim()) || h.model || "MiniMax-M3";
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  let system = "";
  const convo = [];
  for (const m of messages) {
    if (m.role === "system") system += (system ? "\n\n" : "") + m.content;
    else convo.push({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") });
  }
  if (!convo.length) convo.push({ role: "user", content: "你好" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "X-Accel-Buffering": "no",
  });
  const write = (obj) => {
    try {
      res.write("data: " + JSON.stringify(obj) + "\n\n");
    } catch (e) {}
  };

  const body = JSON.stringify({
    model,
    max_tokens: payload.max_tokens || 4000,
    stream: true,
    system: system || undefined,
    messages: convo,
  });

  let upstream;
  try {
    upstream = await new Promise((resolve, reject) => {
      const u = new URL(baseUrl + "/v1/messages");
      const r = http.request(
        {
          hostname: u.hostname,
          port: u.port || 80,
          path: u.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": env.ANTHROPIC_API_KEY || "x",
            "anthropic-version": "2023-06-01",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        resolve
      );
      r.on("error", reject);
      r.setTimeout(60000, () => r.destroy(new Error("upstream timeout")));
      r.write(body);
      r.end();
    });
  } catch (e) {
    write({ error: "无法连接本地代理 " + baseUrl + "：" + e.message });
    res.end();
    return;
  }

  if (upstream.statusCode !== 200) {
    let errBody = "";
    upstream.on("data", (d) => (errBody += d));
    upstream.on("end", () => {
      let msg = "上游 HTTP " + upstream.statusCode;
      try {
        const j = JSON.parse(errBody);
        msg = (j.error && (j.error.message || j.error.type)) || msg;
      } catch (e) {}
      write({ error: msg });
      res.end();
    });
    return;
  }

  let buf = "";
  let evt = "";
  upstream.setEncoding("utf8");
  upstream.on("data", (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, "");
      buf = buf.slice(i + 1);
      if (line.startsWith("event:")) evt = line.slice(6).trim();
      else if (line.startsWith("data:")) {
        const t = evt;
        evt = "";
        const data = line.slice(5).trim();
        if (!data) continue;
        try {
          const o = JSON.parse(data);
          if (t === "content_block_delta" && o.delta && o.delta.type === "text_delta" && o.delta.text) {
            write({ text: o.delta.text });
          } else if (t === "message_stop") {
            write({ done: true });
          } else if (t === "error") {
            write({ error: (o.error && o.error.message) || "upstream error" });
          }
        } catch (e) {}
      }
    }
  });
  upstream.on("end", () => {
    try {
      res.end();
    } catch (e) {}
  });
  upstream.on("error", (e) => {
    write({ error: e.message });
    try {
      res.end();
    } catch (e2) {}
  });
  req.on("close", () => {
    try {
      upstream.destroy();
    } catch (e) {}
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }
  const url = req.url.split("?")[0];
  if (req.method === "GET" && (url === "/api/health" || url === "/api/health/")) {
    sendJson(res, 200, await health(req.url.includes("force=1")));
    return;
  }
  if (req.method === "POST" && (url === "/api/chat" || url === "/api/chat/")) {
    await handleChat(req, res);
    return;
  }
  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, () => {
  health(true)
    .then((h) => {
      console.log("[mindweave-bridge] listening on http://127.0.0.1:" + PORT);
      console.log("[mindweave-bridge] claude CLI: " + (h.cli ? (h.cliVersion || "detected") + " @ " + h.cliPath : "NOT FOUND"));
      console.log("[mindweave-bridge] proxy: " + (h.proxyOk ? h.baseUrl + " · model=" + h.model : "UNREACHABLE"));
      console.log("[mindweave-bridge] ready=" + h.ready + " (open the URL above; mock is NOT used when ready)");
    })
    .catch((e) => console.log("[mindweave-bridge] health error: " + e.message));
});
