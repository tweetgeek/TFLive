#!/usr/bin/env bash
# tl check / tl gen dla modu — przez LuaJIT (Lua 5.5 z Homebrew nie uruchamia tl 0.24).
set -euo pipefail
cd "$(dirname "$0")/.."
ROCKS="${LUAROCKS_TREE:-$HOME/.luarocks}"
TL_BIN="${TL_BIN:-$(ls -d "$ROCKS"/lib/luarocks/rocks-*/tl/*/bin/tl | head -1)}"
LUAVER="$(basename "$(dirname "$(dirname "$(dirname "$(dirname "$TL_BIN")")")")" | sed 's/rocks-//')"
export LUA_PATH="$ROCKS/share/lua/$LUAVER/?.lua;$ROCKS/share/lua/$LUAVER/?/init.lua;;"
export LUA_CPATH="$ROCKS/lib/lua/$LUAVER/?.so;;"
case "${1:-}" in
  check)
    status=0
    while IFS= read -r f; do luajit "$TL_BIN" check "$f" >/tmp/tflive-tl.$$ 2>&1 || { cat /tmp/tflive-tl.$$; status=1; }; done < <(find tflive/content -name '*.tl' | sort)
    rm -f /tmp/tflive-tl.$$
    [ $status -eq 0 ] && echo "tl check: OK"
    exit $status ;;
  gen)
    mkdir -p build
    for f in tflive/content/tflive/lib/*.tl; do
      [ -f "$f" ] && luajit "$TL_BIN" gen "$f" -o "build/$(basename "${f%.tl}").lua" >/dev/null
    done
    echo "tl gen: OK" ;;
  *) echo "użycie: tl.sh check|gen" >&2; exit 2 ;;
esac
