#!/usr/bin/env bash
# 构建 思脉MindWeave.app（AppleScript 启动器 + 新 Logo 图标注入）
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
[ "$(uname)" = "Darwin" ] || { echo "build-macos-app.sh only runs on macOS"; exit 1; }
command -v osacompile >/dev/null 2>&1 || { echo "osacompile not found"; exit 1; }

cat > "$DIR/启动思脉.sh" <<'EOF'
#!/usr/bin/env bash
# 由 .app 内部调起的小 wrapper：标记来源后转交 start.sh，避免 start.sh 再次 open .app 造成循环。
DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
export MINDWEAVE_FROM_APP=1
exec bash "$DIR/start.sh"
EOF
chmod +x "$DIR/启动思脉.sh" 2>/dev/null || true

rm -rf "$DIR/思脉MindWeave.app"
osacompile -o "$DIR/思脉MindWeave.app" "$DIR/启动思脉.applescript" 2>/dev/null || osacompile -o "$DIR/思脉MindWeave.app" "$DIR/start.sh"

PLIST="$DIR/思脉MindWeave.app/Contents/Info.plist"
PB=/usr/libexec/PlistBuddy
"$PB" -c "Add :LSUIElement bool true" "$PLIST" 2>/dev/null || "$PB" -c "Set :LSUIElement true" "$PLIST" 2>/dev/null
"$PB" -c "Set :CFBundleName 思脉MindWeave" "$PLIST" 2>/dev/null
"$PB" -c "Set :CFBundleDisplayName 思脉MindWeave" "$PLIST" 2>/dev/null

# ---- 图标注入：logo-appicon.png（白底母版，缺失则 logo.png）→ Assets.car + applet.icns ----
inject_icon() {
  local APP="$1" SRC=""
  [ -f "$DIR/logo-appicon.png" ] && SRC="$DIR/logo-appicon.png"
  [ -z "$SRC" ] && [ -f "$DIR/logo.png" ] && SRC="$DIR/logo.png"
  [ -z "$SRC" ] && { echo "warn: 未找到 logo.png，沿用系统默认图标"; return 0; }
  command -v sips >/dev/null 2>&1 || { echo "warn: sips 不可用，跳过图标注入"; return 0; }
  local W; W="$(mktemp -d)"
  local s
  for s in 16 32 64 128 256 512 1024; do
    sips -z $s $s "$SRC" --out "$W/i_$s.png" >/dev/null 2>&1 || return 0
  done
  # icns（CFBundleIconFile 回退路径）
  mkdir -p "$W/icon.iconset"
  cp "$W/i_16.png"   "$W/icon.iconset/icon_16x16.png"
  cp "$W/i_32.png"   "$W/icon.iconset/icon_16x16@2x.png"
  cp "$W/i_32.png"   "$W/icon.iconset/icon_32x32.png"
  cp "$W/i_64.png"   "$W/icon.iconset/icon_32x32@2x.png"
  cp "$W/i_128.png"  "$W/icon.iconset/icon_128x128.png"
  cp "$W/i_256.png"  "$W/icon.iconset/icon_128x128@2x.png"
  cp "$W/i_256.png"  "$W/icon.iconset/icon_256x256.png"
  cp "$W/i_512.png"  "$W/icon.iconset/icon_256x256@2x.png"
  cp "$W/i_512.png"  "$W/icon.iconset/icon_512x512.png"
  cp "$W/i_1024.png" "$W/icon.iconset/icon_512x512@2x.png"
  iconutil -c icns "$W/icon.iconset" -o "$APP/Contents/Resources/applet.icns" 2>/dev/null || true
  # Assets.car（CFBundleIconName=applet 指向的资产目录，Spotlight/Finder 优先读它）
  if command -v xcrun >/dev/null 2>&1 && xcrun --find actool >/dev/null 2>&1; then
    mkdir -p "$W/Assets.xcassets/applet.appiconset" "$W/compiled"
    cp "$W/i_16.png"   "$W/Assets.xcassets/applet.appiconset/icon_16x16.png"
    cp "$W/i_32.png"   "$W/Assets.xcassets/applet.appiconset/icon_16x16@2x.png"
    cp "$W/i_32.png"   "$W/Assets.xcassets/applet.appiconset/icon_32x32.png"
    cp "$W/i_64.png"   "$W/Assets.xcassets/applet.appiconset/icon_32x32@2x.png"
    cp "$W/i_128.png"  "$W/Assets.xcassets/applet.appiconset/icon_128x128.png"
    cp "$W/i_256.png"  "$W/Assets.xcassets/applet.appiconset/icon_128x128@2x.png"
    cp "$W/i_256.png"  "$W/Assets.xcassets/applet.appiconset/icon_256x256.png"
    cp "$W/i_512.png"  "$W/Assets.xcassets/applet.appiconset/icon_256x256@2x.png"
    cp "$W/i_512.png"  "$W/Assets.xcassets/applet.appiconset/icon_512x512.png"
    cp "$W/i_1024.png" "$W/Assets.xcassets/applet.appiconset/icon_512x512@2x.png"
    printf '{ "info": { "version": 1, "author": "xcode" } }' > "$W/Assets.xcassets/Contents.json"
    cat > "$W/Assets.xcassets/applet.appiconset/Contents.json" <<'JSON'
{
  "images": [
    { "idiom": "mac", "size": "16x16", "scale": "1x", "filename": "icon_16x16.png" },
    { "idiom": "mac", "size": "16x16", "scale": "2x", "filename": "icon_16x16@2x.png" },
    { "idiom": "mac", "size": "32x32", "scale": "1x", "filename": "icon_32x32.png" },
    { "idiom": "mac", "size": "32x32", "scale": "2x", "filename": "icon_32x32@2x.png" },
    { "idiom": "mac", "size": "128x128", "scale": "1x", "filename": "icon_128x128.png" },
    { "idiom": "mac", "size": "128x128", "scale": "2x", "filename": "icon_128x128@2x.png" },
    { "idiom": "mac", "size": "256x256", "scale": "1x", "filename": "icon_256x256.png" },
    { "idiom": "mac", "size": "256x256", "scale": "2x", "filename": "icon_256x256@2x.png" },
    { "idiom": "mac", "size": "512x512", "scale": "1x", "filename": "icon_512x512.png" },
    { "idiom": "mac", "size": "512x512", "scale": "2x", "filename": "icon_512x512@2x.png" }
  ],
  "info": { "version": 1, "author": "xcode" }
}
JSON
    xcrun actool "$W/Assets.xcassets" --compile "$W/compiled" --platform macosx \
      --minimum-deployment-target 10.13 --app-icon applet >/dev/null 2>&1 \
      && [ -f "$W/compiled/Assets.car" ] \
      && cp "$W/compiled/Assets.car" "$APP/Contents/Resources/Assets.car"
  fi
  "$PB" -c "Set :CFBundleIconFile applet" "$PLIST" 2>/dev/null || "$PB" -c "Add :CFBundleIconFile string applet" "$PLIST" 2>/dev/null
  "$PB" -c "Set :CFBundleIconName applet" "$PLIST" 2>/dev/null || "$PB" -c "Add :CFBundleIconName string applet" "$PLIST" 2>/dev/null
  rm -rf "$W"
  echo "icon injected"
}
inject_icon "$DIR/思脉MindWeave.app"

# 重签（改动 Resources 后签名失效；ad-hoc 即可）+ 刷新图标缓存
codesign --force --deep -s - "$DIR/思脉MindWeave.app" 2>/dev/null || true
xattr -cr "$DIR/思脉MindWeave.app" 2>/dev/null || true
touch "$DIR/思脉MindWeave.app"
LSREG=/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister
[ -x "$LSREG" ] && "$LSREG" -f "$DIR/思脉MindWeave.app" 2>/dev/null
killall Dock 2>/dev/null || true
echo "built $DIR/思脉MindWeave.app"
