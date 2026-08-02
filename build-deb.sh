#!/usr/bin/env bash
# 构建 Linux deb 包（arch all，基于 Ubuntu 26.04；依赖 nodejs>=18）
# 用法：./build-deb.sh
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
VER="$(tr -d '[:space:]' < "$DIR/VERSION")"
PKG="mindweave_${VER}_all"
W="$(mktemp -d)/$PKG"
mkdir -p "$W"

# ---- data：应用文件 ----
STAGE="$W/data/opt/mindweave"
mkdir -p "$STAGE"
for f in mindweave.html server.js data-store.js skills-memory.js start.sh \
         VERSION README.md LICENSE CHANGELOG.md SKILL.md logo.png logo-appicon.png; do
  [ -e "$DIR/$f" ] && cp "$DIR/$f" "$STAGE/$f"
done
chmod +x "$STAGE/start.sh"
find "$STAGE" -name .DS_Store -delete 2>/dev/null || true

# ---- data：命令包装 ----
mkdir -p "$W/data/usr/bin"
cat > "$W/data/usr/bin/mindweave" <<'EOF'
#!/bin/sh
exec /opt/mindweave/start.sh
EOF
chmod 755 "$W/data/usr/bin/mindweave"

# ---- data：桌面入口 ----
mkdir -p "$W/data/usr/share/applications"
cat > "$W/data/usr/share/applications/mindweave.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Version=1.0
Name=思脉 MindWeave
Name[zh_CN]=思脉 MindWeave
Comment=人与 AI 双向写作思维导图
Comment[zh_CN]=人与 AI 双向写作思维导图
Exec=mindweave
Icon=mindweave
Terminal=false
Categories=Office;Utility;
Keywords=mindmap;思维导图;ai;
StartupNotify=true
EOF

# ---- data：图标（hicolor）----
if command -v sips >/dev/null 2>&1 && [ -f "$DIR/logo-appicon.png" ]; then
  for s in 48 64 128 256 512; do
    mkdir -p "$W/data/usr/share/icons/hicolor/${s}x${s}/apps"
    sips -z $s $s "$DIR/logo-appicon.png" --out "$W/data/usr/share/icons/hicolor/${s}x${s}/apps/mindweave.png" >/dev/null 2>&1
  done
fi

# ---- data：文档 ----
mkdir -p "$W/data/usr/share/doc/mindweave"
cp "$DIR/README.md" "$W/data/usr/share/doc/mindweave/README.md" 2>/dev/null || true
cp "$DIR/CHANGELOG.md" "$W/data/usr/share/doc/mindweave/changelog.md" 2>/dev/null || true

# ---- control ----
SIZE=$(du -sk "$W/data" | cut -f1)
mkdir -p "$W/control"
cat > "$W/control/control" <<EOF
Package: mindweave
Version: $VER
Section: utils
Priority: optional
Architecture: all
Depends: nodejs (>= 18), xdg-utils
Maintainer: MindWeave <mindweave@local>
Installed-Size: $SIZE
Description: 思脉 MindWeave —— 人与 AI 双向写作思维导图
 本地优先的思维导图 + AI 对话写作应用：SVG 导图编辑、Markdown
 双向同步、多 CLI 后端（Claude Code / Kimi / Qwen 等）、外部
 Agent HTTP API、剪切/复制/粘贴与拖拽重排。
 基于 Ubuntu 26.04 构建，适用于任何提供 nodejs 的 Debian 系发行版。
EOF
cat > "$W/control/postinst" <<'EOF'
#!/bin/sh
set -e
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -f -t /usr/share/icons/hicolor 2>/dev/null || true
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q /usr/share/applications 2>/dev/null || true
exit 0
EOF
cat > "$W/control/postrm" <<'EOF'
#!/bin/sh
set -e
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -f -t /usr/share/icons/hicolor 2>/dev/null || true
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q /usr/share/applications 2>/dev/null || true
exit 0
EOF
chmod 755 "$W/control/postinst" "$W/control/postrm"

# ---- 打包：tar（root 属主）+ python ar（macOS 自带 BSD ar 产出 dpkg 不认的归档，故纯 python 组装）----
TAROPTS=(--uid 0 --gid 0 --uname root --gname root)
( cd "$W/data" && tar "${TAROPTS[@]}" -czf "$W/data.tar.gz" . )
( cd "$W/control" && tar "${TAROPTS[@]}" -czf "$W/control.tar.gz" . )
printf '2.0\n' > "$W/debian-binary"
mkdir -p "$DIR/dist"
OUT="$DIR/dist/mindweave_${VER}_all.deb"
rm -f "$OUT"
python3 - "$W" "$OUT" <<'PY'
import sys
w, out = sys.argv[1], sys.argv[2]
members = ["debian-binary", "control.tar.gz", "data.tar.gz"]
with open(out, "wb") as f:
    f.write(b"!<arch>\n")
    for name in members:
        data = open(w + "/" + name, "rb").read()
        header = "%-16s%-12s%-6s%-6s%-8s%-10s%s" % (name, 0, 0, 0, 100644, len(data), "`\n")
        f.write(header.encode("ascii"))
        f.write(data)
        if len(data) % 2:
            f.write(b"\n")
PY
rm -rf "$(dirname "$W")"
echo "✓ $OUT ($(du -h "$OUT" | cut -f1))"
