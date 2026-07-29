#!/usr/bin/env bash
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PORT="${PORT:-4317}"
URL="http://127.0.0.1:${PORT}/"
PIDFILE="$DIR/.server.pid"; LOCKFILE="$DIR/.server.lock"; LOG="${LOG:-/tmp/mindweave-bridge.log}"
alive(){ [ -f "$LOCKFILE" ] && kill -0 "$(cat "$LOCKFILE" 2>/dev/null)" 2>/dev/null; }

NODE_BIN="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE_BIN" ]; then
  for c in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node "$HOME/.nvm/versions/node"/*/bin/node "$HOME/.volta/bin/node" "$HOME/.local/bin/node"; do
    [ -x "$c" ] && { NODE_BIN="$c"; break; }; done
fi
if [ -z "$NODE_BIN" ]; then
  echo "[mindweave] 未找到 Node.js。请先安装 Node.js >= 18 (https://nodejs.org)。" >&2
  echo "[mindweave] 仅用 Mock 演示可不装 Node：直接用浏览器打开 mindweave.html。" >&2
  read -r -p "按回车键退出…" _ 2>/dev/null || true; exit 1
fi

if ! alive; then
  ( cd "$DIR" && PORT="$PORT" PIDFILE="$PIDFILE" LOCKFILE="$LOCKFILE" nohup "$NODE_BIN" server.js >"$LOG" 2>&1 & disown ) >/dev/null 2>&1
  ok=""
  for i in $(seq 1 80); do
    curl -sf -m 2 "$URL"api/health >/dev/null 2>&1 && { ok=1; break; }
    if [ -f "$LOCKFILE" ] && ! kill -0 "$(cat "$LOCKFILE" 2>/dev/null)" 2>/dev/null; then break; fi
    sleep 0.25
  done
  if [ -z "$ok" ]; then echo "[mindweave] 后台启动失败，日志：$LOG" >&2; cat "$LOG" 2>/dev/null >&2; exit 1; fi
fi

if [ -x "$DIR/思脉MindWeave.app/Contents/MacOS/applet" ] && [ "$(uname)" = "Darwin" ] && [ -z "${MINDWEAVE_FROM_APP:-}" ]; then
  open "$DIR/思脉MindWeave.app"
else
  case "$(uname -s)" in
    Darwin*) open "$URL" ;;
    Linux*)  (command -v xdg-open >/dev/null 2>&1 && xdg-open "$URL") || (command -v sensible-browser >/dev/null 2>&1 && sensible-browser "$URL") || echo "[mindweave] 请打开 $URL" ;;
    *)       echo "[mindweave] 请打开 $URL" ;;
  esac
fi
