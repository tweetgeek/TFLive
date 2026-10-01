#!/usr/bin/env bash
# KOD DO WYRZUCENIA: tl check przez LuaJIT (Lua 5.5 z Homebrew nie uruchamia tl 0.24).
export LUA_PATH="$HOME/.luarocks/share/lua/5.5/?.lua;$HOME/.luarocks/share/lua/5.5/?/init.lua;;"
export LUA_CPATH="$HOME/.luarocks/lib/lua/5.5/?.so;;"
cd "$(dirname "$0")"
exec luajit "$HOME/.luarocks/lib/luarocks/rocks-5.5/tl/0.24.8-1/bin/tl" check "$@"
