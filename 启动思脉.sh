#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PORT="${PORT:-4317}"
URL="http://127.0.0.1:${PORT}/"
PIDFILE="${PIDFILE:-$DIR/.server.pid}"
LOCKFILE="${LOCKFILE:-$DIR/.server.lock}"
LOG="${LOG:-/tmp/mindweave-bridge.log}"

alive() { [ -f "$LOCKFILE" ] && kill -0 "$(cat "$LOCKFILE" 2>/dev/null)" 2>/dev/null; }

# GUI launches (do shell script) have a minimal PATH without node; resolve to absolute path.
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
NODE_BIN="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE_BIN" ]; then
  for c in /usr/local/bin/node /opt/homebrew/bin/node "$HOME/.nvm/versions/node"/*/bin/node "$HOME/.volta/bin/node" "$HOME/.local/bin/node"; do
    if [ -x "$c" ]; then NODE_BIN="$c"; break; fi
  done
fi
if [ -z "$NODE_BIN" ]; then
  echo "未找到 node，请先安装 Node.js（nodejs.org 或 brew install node）。" >&2
  exit 1
fi

if ! alive; then
  ( cd "$DIR" && PORT="$PORT" PIDFILE="$PIDFILE" LOCKFILE="$LOCKFILE" nohup "$NODE_BIN" server.js >"$LOG" 2>&1 & disown ) >/dev/null 2>&1
  ok=""
  for i in $(seq 1 80); do
    if curl -sf -m 2 "$URL"api/health >/dev/null 2>&1; then ok=1; break; fi
    if [ -f "$LOCKFILE" ] && ! kill -0 "$(cat "$LOCKFILE" 2>/dev/null)" 2>/dev/null; then break; fi
    sleep 0.25
  done
  if [ -z "$ok" ]; then
    echo "后台启动失败，日志：$LOG" >&2
    cat "$LOG" 2>/dev/null >&2
    exit 1
  fi
fi
open "$URL"
