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
  ( cd "$BUILD" && zip -qr "$OUT/mindweave-$VER-$platform.zip" mindweave )
  echo "✓ dist/mindweave-$VER-$platform.zip"
}

pack macos   start.sh 启动思脉.sh 启动思脉.applescript build-macos-app.sh 思脉MindWeave.app
pack windows start.bat start.ps1
pack linux   start.sh

rm -rf "$BUILD"
echo "完成：v$VER 三端包已输出到 dist/"
