#!/usr/bin/env bash
# 交叉构建 Windows 桌面版（macOS/Linux 上均可运行；产物 dist/desktop/ + zip）
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
VER="$(tr -d '[:space:]' < "$ROOT/VERSION")"

# 应用源文件 → desktop/app/
rm -rf "$DIR/app"; mkdir -p "$DIR/app"
for f in mindweave.html server.js data-store.js skills-memory.js \
         VERSION README.md LICENSE CHANGELOG.md SKILL.md logo.png; do
  [ -e "$ROOT/$f" ] && cp "$ROOT/$f" "$DIR/app/$f"
done
find "$DIR/app" -name .DS_Store -delete 2>/dev/null || true

cd "$DIR"
[ -d node_modules/electron ] || npm install --no-audit --no-fund

echo "=== electron-packager: win32-x64 ==="
# packager 会把 package.json 的 version 默认映射为 appVersion（触发 wine 依赖），
# 故在无 version 字段的临时目录中打包；版本信息与图标改由 embed-icon.js（resedit）写入。
STAGE="$(mktemp -d)/stage"
mkdir -p "$STAGE"
cp "$DIR/main.js" "$STAGE/main.js"
cp -R "$DIR/app" "$STAGE/app"
ln -s "$DIR/node_modules" "$STAGE/node_modules"
node -e 'const p=require("./package.json");delete p.version;require("fs").writeFileSync(process.argv[1]+"/package.json",JSON.stringify(p,null,2))' "$STAGE"
npx electron-packager "$STAGE" MindWeave \
  --platform=win32 --arch=x64 \
  --out="$ROOT/dist/desktop" --overwrite --no-asar
rm -rf "$(dirname "$STAGE")"

EXE="$ROOT/dist/desktop/MindWeave-win32-x64/MindWeave.exe"
[ -f "$EXE" ] || { echo "打包失败：未生成 $EXE"; exit 1; }

echo "=== 嵌入 exe 图标 ==="
node embed-icon.js "$EXE" "$DIR/app-icon.ico"

echo "=== 压缩 ==="
OUT="$ROOT/dist/mindweave-$VER-windows-app.zip"
rm -f "$OUT"
python3 - "$ROOT/dist/desktop/MindWeave-win32-x64" "$OUT" <<'PY'
import os, sys, zipfile
stage, out = sys.argv[1], sys.argv[2]
root = os.path.dirname(stage)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for base, dirs, files in os.walk(stage):
        dirs.sort(); files.sort()
        for f in files:
            fp = os.path.join(base, f)
            z.write(fp, os.path.relpath(fp, root))
print("✓ " + out)
PY
du -h "$OUT"
