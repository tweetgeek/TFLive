-- Format linii [TFLIVE], podział sekcji na części, odcisk treści. Czysty moduł.
local record Wire
	SCHEMA_VERSION : integer
	MAX_LINE_BYTES : integer
	formatLine : function(string, string, integer, number, string, integer, integer, string) : string
	chunkRows : function({string}, integer) : {string}
	fingerprint : function(string) : string
end

local wire : Wire = { SCHEMA_VERSION = 1, MAX_LINE_BYTES = 90000 }

wire.formatLine = function(saveId : string, sessionId : string, seq : integer, gameTime : number, section : string, part : integer, parts : integer, json : string) : string
	return string.format('[TFLIVE] %d %s %s %d %.0f %s %d/%d %s', wire.SCHEMA_VERSION, saveId, sessionId, seq, gameTime, section, part, parts, json)
end

wire.chunkRows = function(rowsJson : {string}, maxBytes : integer) : {string}
	local out : {string} = {}
	local cur : {string} = {}
	local size = 2
	for _, r in ipairs(rowsJson) do
		if #cur > 0 and size + #r + 1 > maxBytes then
			table.insert(out, '[' .. table.concat(cur, ',') .. ']')
			cur = {}
			size = 2
		end
		table.insert(cur, r)
		size = size + #r + 1
	end
	table.insert(out, '[' .. table.concat(cur, ',') .. ']')
	return out
end

wire.fingerprint = function(s : string) : string
	local h = 5381
	local n = #s
	local i = 1
	while i <= n do
		local j = math.min(i + 255, n)
		local bytes = { s:byte(i, j) }
		for k = 1, #bytes do h = (h * 33 + bytes[k]) % 4294967296 end
		i = j + 1
	end
	return string.format('%.0f:%d', h, n)
end

return wire
