-- Sesja modu, terminy sekcji, identyfikatory. Czysty moduł.
local record Schedule
	SESSION_GAP_SEC : integer
	FORCE_REFRESH_SEC : integer
	BACKFILL_MONTHS_PER_TICK : integer
	ORDER : {string}
	INTERVALS : {string : integer}
	isNewSession : function(integer, integer) : boolean
	isDue : function(integer, integer, integer) : boolean
	newId : function(number) : string
end

local schedule : Schedule = {
	SESSION_GAP_SEC = 30,
	FORCE_REFRESH_SEC = 300,
	BACKFILL_MONTHS_PER_TICK = 60,
	ORDER = { 'meta', 'finance', 'lines', 'vehicles', 'stops', 'industries', 'towns' },
	INTERVALS = { meta = 10, finance = 10, lines = 60, vehicles = 60, stops = 60, industries = 120, towns = 120 },
}

local seeded = false

schedule.isNewSession = function(lastEmitWall : integer, wall : integer) : boolean
	return lastEmitWall == nil or wall - lastEmitWall > schedule.SESSION_GAP_SEC
end

schedule.isDue = function(lastWall : integer, wall : integer, interval : integer) : boolean
	return lastWall == nil or wall - lastWall >= interval
end

schedule.newId = function(seed : number) : string
	if not seeded then
		math.randomseed(math.floor(seed * 1000) % 2147483647)
		seeded = true
	end
	return string.format('%08x%08x', math.random(0, 0x7fffffff), math.random(0, 0x7fffffff))
end

return schedule
