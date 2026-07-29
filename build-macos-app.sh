#!/usr/bin/env bash
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
/usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Set :LSUIElement true" "$PLIST" 2>/dev/null
/usr/libexec/PlistBuddy -c "Set :CFBundleName 思脉MindWeave" "$PLIST" 2>/dev/null
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName 思脉MindWeave" "$PLIST" 2>/dev/null
xattr -cr "$DIR/思脉MindWeave.app" 2>/dev/null || true
echo "built $DIR/思脉MindWeave.app"
