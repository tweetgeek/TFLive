-- Koder JSON dla linii [TFLIVE]. Czysty moduł (bez API gry).
local record Json
	NULL : table
	encode : function(any) : string
end

-- NULL jest strukturalny (znacznik w metatabeli), żeby działał między instancjami modułu.
local NULL_MT : metatable<table> = { __tflive_null = true } as metatable<table>
local json : Json = { NULL = setmetatable({} as table, NULL_MT) }

local function isNull(v : table) : boolean
	local mt = getmetatable(v) as {string : any}
	return mt ~= nil and mt['__tflive_null'] == true
end

local function escape(s : string) : string
	local out = s:gsub('[%c"\\]', function(c : string) : string
		if c == '"' then return '\\"' end
		if c == '\\' then return '\\\\' end
		if c == '\n' then return '\\n' end
		if c == '\r' then return '\\r' end
		if c == '\t' then return '\\t' end
		return string.format('\\u%04x', c:byte())
	end)
	return out
end

local function number(n : number) : string
	if n ~= n or n == math.huge or n == -math.huge then return 'null' end
	if n == math.floor(n) and math.abs(n) < 1e15 then return string.format('%.0f', n) end
	local s = string.format('%.14g', n)
	s = s:gsub(',', '.')
	return s
end

local function isArray(t : table) : boolean
	for k, _ in pairs(t) do
		if type(k) ~= 'number' then return false end
	end
	return true
end

local encode : function(any) : string
encode = function(v : any) : string
	if v == nil then return 'null' end
	local tv = type(v)
	if tv == 'boolean' then return (v as boolean) and 'true' or 'false' end
	if tv == 'number' then return number(v as number) end
	if tv == 'string' then return '"' .. escape(v as string) .. '"' end
	if tv == 'table' then
		local t = v as table
		if isNull(t) then return 'null' end
		if isArray(t) then
			local arr = t as {any}
			local parts : {string} = {}
			for i = 1, #arr do parts[i] = encode(arr[i]) end
			return '[' .. table.concat(parts, ',') .. ']'
		end
		local obj = t as {string : any}
		local keys : {string} = {}
		for k, _ in pairs(obj) do table.insert(keys, k) end
		table.sort(keys)
		local parts : {string} = {}
		for _, k in ipairs(keys) do table.insert(parts, '"' .. escape(k) .. '":' .. encode(obj[k])) end
		return '{' .. table.concat(parts, ',') .. '}'
	end
	error('json: nieobsługiwany typ ' .. tv)
end
json.encode = encode

return json
