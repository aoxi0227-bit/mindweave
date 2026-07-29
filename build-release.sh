#!/usr/bin/env bash
# 三端同步打包：dist/mindweave-<版本>-{macos,windows,linux}.zip
# 用法：./build-release.sh          （版本号取 VERSION 文件）
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
VER="$(tr -d '[:space:]' < "$DIR/VERSION")"
[ -n "$VER" ] || { echo "VERSION 文件为空"; exit 1; }
BUILD="$DIR/dist/build"
OUT="$DIR/dist"
rm -rf "$BUILD"; mkdir -p "$BUILD" "$OUT"

COMMON=(mindweave.html server.js data-store.js skills-memory.js README.md LICENSE CHANGELOG.md VERSION 工程文档.md 技术文档.md 跨平台说明.md)

pack() {
  local platform="$1"; shift
  local stage="$BUILD/mindweave"
  rm -rf "$stage"; mkdir -p "$stage"
  local f
  for f in "${COMMON[@]}" "$@"; do
    [ -e "$DIR/$f" ] || { echo "缺少文件：$f"; exit 1; }
    cp -R "$DIR/$f" "$stage/$f"
  done
  chmod +x "$stage"/*.sh 2>/dev/null || true
  find "$stage" -name .DS_Store -delete 2>/dev/null || true
  # 用 python3 打包：中文文件名自动带 UTF-8 标志位（Info-ZIP 不打，Windows 解压会乱码）
  STAGE="$stage" OUT="$OUT/mindweave-$VER-$platform.zip" python3 - <<'PY'
import os, zipfile
stage = os.environ["STAGE"]; out = os.environ["OUT"]
root = os.path.dirname(stage)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for base, dirs, files in os.walk(stage):
        dirs.sort(); files.sort()
        if not dirs and not files:
            z.write(base, os.path.relpath(base, root))
        for f in files:
            fp = os.path.join(base, f)
            z.write(fp, os.path.relpath(fp, root))
print("✓ " + out)
PY
}

pack macos   start.sh 启动思脉.sh 启动思脉.applescript build-macos-app.sh 思脉MindWeave.app
pack windows start.bat start.ps1
pack linux   start.sh

rm -rf "$BUILD"
echo "完成：v$VER 三端包已输出到 dist/"
