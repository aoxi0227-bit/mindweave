#!/usr/bin/env bash
# 由 .app 内部调起的小 wrapper：标记来源后转交 start.sh，避免 start.sh 再次 open .app 造成循环。
DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
export MINDWEAVE_FROM_APP=1
exec bash "$DIR/start.sh"
