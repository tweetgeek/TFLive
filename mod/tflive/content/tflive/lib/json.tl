-- Koder JSON dla linii [TFLIVE]. Czysty moduł (bez API gry).
local record Json
	NULL : table
	encode : function(any) : string
end

local json : Json = { NULL = {} }

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
	return string.format('%.6g', n)
end

local function isArray(t : table) : boolean
	for k, _ in pairs(t) do
		if type(k) ~= 'number' then return false end
	end
	return true
end

local encode : function(any) : string
encode = function(v : any) : string
	if v == nil or v == json.NULL then return 'null' end
	local tv = type(v)
	if tv == 'boolean' then return (v as boolean) and 'true' or 'false' end
	if tv == 'number' then return number(v as number) end
	if tv == 'string' then return '"' .. escape(v as string) .. '"' end
	if tv == 'table' then
		local t = v as table
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
