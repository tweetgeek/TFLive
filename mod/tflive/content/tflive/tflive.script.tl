-- TFLive: wypisuje stan Rozgrywki do logu gry jako linie [TFLIVE] (spec §3, §7; ADR 0003).
local record Json
	NULL : table
	encode : function(any) : string
end
local record Wire
	MAX_LINE_BYTES : integer
	formatLine : function(string, string, integer, number, string, integer, integer, string) : string
	chunkRows : function({string}, integer) : {string}
	fingerprint : function(string) : string
end
local record Schedule
	ORDER : {string}
	INTERVALS : {string : integer}
	isNewSession : function(integer, integer) : boolean
	isDue : function(integer, integer, integer) : boolean
	newId : function(number) : string
end
local record Collect
	gameTime : function() : integer
	isPaused : function(number) : boolean
	meta : function(number, integer, {string}) : {string : any}
	finance : function() : {string : any}
	backfill : function(integer) : {string : any}
	lines : function({string : integer}) : {any}
	vehicles : function() : {any}
	stops : function() : {any}
	industries : function() : {any}
	towns : function() : {any}
end

local json = ug_require "tflive::/tflive/lib/json.tl" as Json
local wire = ug_require "tflive::/tflive/lib/wire.tl" as Wire
local schedule = ug_require "tflive::/tflive/lib/schedule.tl" as Schedule
local collect = ug_require "tflive::/tflive/collect.tl" as Collect

local MAX_ERRORS <const> = 5

local record SectionState
	lastWall : integer
	fp : string
end

local record ModState
	saveId : string            -- trwałe (zapisywane z grą)
	sessionId : string         -- reszta: sesyjne, zerowane przy nowej sesji
	lastEmitWall : integer
	seq : integer
	bytes : integer
	sections : {string : SectionState}
	backfillIndex : integer
	departures : {string : integer}
	errors : {string}
end

local function addError(s : ModState, msg : string)
	table.insert(s.errors, msg)
	while #s.errors > MAX_ERRORS do table.remove(s.errors, 1) end
end

local function emit(s : ModState, section : string, gameTime : integer, parts : {string})
	s.seq = s.seq + 1
	for i, p in ipairs(parts) do
		local line = wire.formatLine(s.saveId, s.sessionId, s.seq, gameTime, section, i, #parts, p)
		debugPrint(line)
		s.bytes = s.bytes + #line + 1
	end
end

local function collectSection(s : ModState, name : string, dt : number) : any
	if name == 'meta' then return collect.meta(dt, s.bytes, s.errors) end
	if name == 'finance' then return collect.finance() end
	if name == 'lines' then return collect.lines(s.departures) end
	if name == 'vehicles' then return collect.vehicles() end
	if name == 'stops' then return collect.stops() end
	if name == 'industries' then return collect.industries() end
	if name == 'towns' then return collect.towns() end
	error('nieznana sekcja ' .. name)
end

local function emitSection(s : ModState, name : string, dt : number, gameTime : integer, wall : integer)
	local errMsg : string = nil
	local data : any = nil
	local ok = xpcall(function() data = collectSection(s, name, dt) end, function(e : any) : any
		errMsg = tostring(e)
		return e
	end)
	local sec = s.sections[name] or {}
	sec.lastWall = wall
	s.sections[name] = sec
	if not ok then
		addError(s, name .. ': ' .. tostring(errMsg))
		return
	end
	local parts : {string}
	if name == 'meta' or name == 'finance' then
		parts = { json.encode(data) }
	else
		local rowsJson : {string} = {}
		for i, r in ipairs(data as {any}) do rowsJson[i] = json.encode(r) end
		parts = wire.chunkRows(rowsJson, wire.MAX_LINE_BYTES)
	end
	if name ~= 'meta' and #parts == 1 then
		local fp = wire.fingerprint(parts[1])
		if sec.fp == fp then return end
		sec.fp = fp
	end
	emit(s, name, gameTime, parts)
	if name == 'meta' then s.errors = {} end
end

local function emitBackfill(s : ModState, gameTime : integer)
	local errMsg : string = nil
	local data : {string : any} = nil
	local ok = xpcall(function() data = collect.backfill(s.backfillIndex) end, function(e : any) : any
		errMsg = tostring(e)
		return e
	end)
	if not ok then
		addError(s, 'backfill: ' .. tostring(errMsg))
		s.backfillIndex = s.backfillIndex + 1
		return
	end
	if data == nil then
		s.backfillIndex = 0
		return
	end
	emit(s, 'backfill', gameTime, { json.encode(data) })
	s.backfillIndex = s.backfillIndex + 1
end

local function startSession(s : ModState, wall : integer)
	s.sessionId = schedule.newId(os.clock() * 1000 + wall)
	s.seq = 0
	s.bytes = 0
	s.sections = {}
	s.backfillIndex = 1
	s.departures = {}
	s.errors = {}
end

local ret : GameScript<ModState> = {
	update = function(_userParams : table, state : GameScriptState<ModState>, dt : number) : any
		local s = state:get() or {}
		local wall = os.time()
		if not s.saveId then s.saveId = schedule.newId(os.clock() + wall) end
		if schedule.isNewSession(s.lastEmitWall, wall) or not s.sessionId then startSession(s, wall) end
		local paused = collect.isPaused(dt)
		local gameTime = collect.gameTime()
		local emitted = false
		for _, name in ipairs(schedule.ORDER) do
			if name == 'meta' or not paused then
				local sec = s.sections[name]
				if schedule.isDue(sec and sec.lastWall, wall, schedule.INTERVALS[name]) then
					emitSection(s, name, dt, gameTime, wall)
					emitted = true
				end
			end
		end
		if not paused and s.backfillIndex and s.backfillIndex > 0 then
			emitBackfill(s, gameTime)
		end
		if emitted then s.lastEmitWall = wall end
		state:set(s)
	end,
}

return ret
