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
	FORCE_REFRESH_SEC : integer
	BACKFILL_MONTHS_PER_TICK : integer
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
	backfill : function(integer, integer, integer) : {string : any}, integer
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
	lastSent : integer
end

local record ModState
	saveId : string            -- trwałe (zapisywane z grą)
	sessionId : string         -- reszta: sesyjne, zerowane przy nowej sesji
	lastEmitWall : integer
	seq : integer
	bytes : integer
	sections : {string : SectionState}
	backfillIndex : integer
	backfillOffset : integer
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
	local parts : {string} = nil
	local skip = false
	local deps : {string : integer} = nil
	local sec = s.sections[name] or {}
	s.sections[name] = sec
	sec.lastWall = wall
	local ok = xpcall(function()
		local data : any
		if name == 'lines' then
			deps = {}
			for k, v in pairs(s.departures) do deps[k] = v end
			data = collect.lines(deps)
		else
			data = collectSection(s, name, dt)
		end
		if name == 'meta' or name == 'finance' then
			parts = { json.encode(data) }
		else
			local rowsJson : {string} = {}
			for i, r in ipairs(data as {any}) do rowsJson[i] = json.encode(r) end
			parts = wire.chunkRows(rowsJson, wire.MAX_LINE_BYTES)
		end
		if name ~= 'meta' and #parts == 1 then
			local fp = wire.fingerprint(parts[1])
			if sec.fp == fp and sec.lastSent ~= nil and wall - sec.lastSent < schedule.FORCE_REFRESH_SEC then
				skip = true
			end
			sec.fp = fp
		end
	end, function(e : any) : any
		errMsg = tostring(e)
		return e
	end)
	if not ok then
		addError(s, name .. ': ' .. tostring(errMsg))
		return
	end
	if deps then s.departures = deps end
	if skip then return end
	sec.lastSent = wall
	emit(s, name, gameTime, parts)
	if name == 'meta' then s.errors = {} end
end

local function emitBackfill(s : ModState, gameTime : integer)
	local errMsg : string = nil
	local data : {string : any} = nil
	local nextOffset : integer = nil
	local part : string = nil
	local ok = xpcall(function()
		data, nextOffset = collect.backfill(s.backfillIndex, s.backfillOffset, schedule.BACKFILL_MONTHS_PER_TICK)
		if data ~= nil then
			local m = data['months'] as {any}
			if m and #m > 0 then part = json.encode(data) end
		end
	end, function(e : any) : any
		errMsg = tostring(e)
		return e
	end)
	if not ok then
		addError(s, 'backfill: ' .. tostring(errMsg))
		s.backfillIndex = s.backfillIndex + 1
		s.backfillOffset = 0
		return
	end
	if data == nil then
		s.backfillIndex = 0
		s.backfillOffset = 0
		return
	end
	if part then emit(s, 'backfill', gameTime, { part }) end
	if nextOffset then
		s.backfillOffset = nextOffset
	else
		s.backfillIndex = s.backfillIndex + 1
		s.backfillOffset = 0
	end
end

local function startSession(s : ModState, wall : integer)
	s.sessionId = schedule.newId(os.clock() * 1000 + wall)
	s.seq = 0
	s.bytes = 0
	s.sections = {}
	s.backfillIndex = 1
	s.backfillOffset = 0
	s.departures = {}
	s.errors = {}
end

local function run(s : ModState, dt : number)
	local wall = os.time()
	if not s.saveId then s.saveId = schedule.newId(os.clock() + wall) end
	if schedule.isNewSession(s.lastEmitWall, wall) or not s.sessionId then startSession(s, wall) end
	local paused = collect.isPaused(dt)
	local gameTime = collect.gameTime()
	local emitted = false
	local processedOther = false
	for _, name in ipairs(schedule.ORDER) do
		if name == 'meta' or not paused then
			local sec = s.sections[name]
			if schedule.isDue(sec and sec.lastWall, wall, schedule.INTERVALS[name]) then
				emitSection(s, name, dt, gameTime, wall)
				emitted = true
				if name ~= 'meta' then
					processedOther = true
					break
				end
			end
		end
	end
	if not paused and not processedOther and s.backfillIndex and s.backfillIndex > 0 then
		emitBackfill(s, gameTime)
	end
	if emitted then s.lastEmitWall = wall end
end

local ret : GameScript<ModState> = {
	update = function(_userParams : table, state : GameScriptState<ModState>, dt : number) : any
		local s = state:get() or {}
		local err : string = nil
		local ok = xpcall(function() run(s, dt) end, function(e : any) : any
			err = tostring(e)
			return e
		end)
		if not ok then
			if not s.errors then s.errors = {} end
			addError(s, 'update: ' .. tostring(err))
		end
		state:set(s)
	end,
}

return ret
