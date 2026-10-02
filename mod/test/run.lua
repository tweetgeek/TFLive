-- Runner testów czystych modułów modu (LuaJIT). Moduły: mod/build/<nazwa>.lua (z `tl gen`).
local here = debug.getinfo(1, "S").source:sub(2):match("(.*/)") or "./"
local M = {}
M.root = here .. "../"
function M.load(name)
	return dofile(M.root .. "build/" .. name .. ".lua")
end

local function deepEq(a, b)
	if type(a) ~= type(b) then return false end
	if type(a) ~= "table" then return a == b end
	for k, v in pairs(a) do if not deepEq(v, b[k]) then return false end end
	for k, _ in pairs(b) do if a[k] == nil then return false end end
	return true
end
local function show(v)
	if type(v) ~= "table" then return tostring(v) end
	local parts = {}
	for k, x in pairs(v) do parts[#parts + 1] = tostring(k) .. "=" .. show(x) end
	return "{" .. table.concat(parts, ",") .. "}"
end

local passed, failed = 0, 0
function test(name, fn)
	local ok, err = pcall(fn)
	if ok then passed = passed + 1 else failed = failed + 1; print("FAIL " .. name .. ": " .. tostring(err)) end
end
function eq(actual, expected, msg)
	if not deepEq(actual, expected) then error((msg or "eq") .. ": expected " .. show(expected) .. ", got " .. show(actual), 2) end
end
function ok(cond, msg)
	if not cond then error(msg or "ok", 2) end
end

_G.M = M
for _, file in ipairs({ "json_test", "wire_test", "months_test", "schedule_test", "golden" }) do
	local path = here .. file .. ".lua"
	local f = io.open(path, "r")
	if f then f:close(); dofile(path) end
end
print(string.format("lua tests: %d passed, %d failed", passed, failed))
os.exit(failed == 0 and 0 or 1)
