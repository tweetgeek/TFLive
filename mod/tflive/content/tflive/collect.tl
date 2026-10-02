-- Kolektory sekcji [TFLIVE] — odczyt API gry. Każdy kolektor zwraca dane w kształcie kontraktu
-- (krotki = tablice, brak wartości = json.NULL). Wywoływane w pcall przez tflive.script.tl.
local record Json
	NULL : table
end
local type Calendar = function(number) : (integer, integer, integer)
local record Months
	MONTH_CAP : integer
	lastMonths : function(integer, integer, integer, Calendar) : {{integer}}
end

local json = ug_require "tflive::/tflive/lib/json.tl" as Json
local months = ug_require "tflive::/tflive/lib/months.tl" as Months
local NULL = json.NULL

local record Collect
	gameTime : function() : integer
	isPaused : function(number) : boolean
	meta : function(number, integer, {string}) : {string : any}
	finance : function() : {string : any}
	backfillCount : function() : integer
	backfill : function(integer) : {string : any}
	lines : function({string : integer}) : {any}
	vehicles : function() : {any}
	stops : function() : {any}
	industries : function() : {any}
	towns : function() : {any}
end

local collect : Collect = {}

local function world() : Engine.Entity
	return api.engine.util.getWorld()
end

local function gameSpeed() : Engine.Component.GameSpeed
	return api.engine.getComponent(world(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
end

collect.gameTime = function() : integer
	return (api.engine.getComponent(world(), api.type.ComponentType.GAME_TIME) as Engine.Component.GameTime).gameTime
end

local function dayMs() : integer
	local gs = gameSpeed()
	if gs and gs.millisPerDay and gs.millisPerDay > 0 then return math.floor(gs.millisPerDay) end
	return api.util.getDefaultDayDuration()
end

local function cal(t : number) : integer, integer, integer
	local d = api.engine.util.getCalendarDate(t)
	return d.year, d.month, d.day
end

local function orNull(v : any) : any
	if v == nil then return NULL end
	return v
end

local function yearAgo(now : integer) : integer
	return math.max(now - api.util.getDefaultYearDuration(), 0)
end

local function monthlyOps(ents : {Engine.Entity}, list : {{integer}}) : {{integer}}
	local fin = api.engine.util.finance
	local out : {{integer}} = {}
	for _, mm in ipairs(list) do
		table.insert(out, { mm[1], fin.calculateBalance(ents, mm[2], mm[3], true) })
	end
	return out
end

collect.isPaused = function(dt : number) : boolean
	local gs = gameSpeed()
	return dt == 0 or (gs ~= nil and gs.speedup == 0)
end

collect.meta = function(dt : number, bytes : integer, errors : {string}) : {string : any}
	local now = collect.gameTime()
	local gs = gameSpeed()
	local d = api.engine.util.getCalendarDate(now)
	local m : {string : any} = {
		date = { d.year, d.month, d.day },
		dayMs = dayMs(),
		paused = collect.isPaused(dt) and 1 or 0,
		speed = gs and gs.speedup or NULL,
		map = orNull(api.engine.util.getEntityName(api.engine.util.getPlayer())),
		bytes = bytes,
		errors = errors,
	}
	return m
end

collect.finance = function() : {string : any}
	local fin = api.engine.util.finance
	local player = api.engine.util.getPlayer()
	local acc = api.engine.getComponent(player, api.type.ComponentType.ACCOUNT) as Engine.Component.Account
	local now = collect.gameTime()
	local t0 = yearAgo(now)
	local ops = fin.calculateBalance({ player }, t0, now, true)
	local income = math.floor(fin.calcIncomeSince(t0, player))
	local f : {string : any} = {
		bal = acc.balance,
		loan = acc.loan,
		ops12 = ops,
		run12 = math.max(income - ops, 0),
		inv12 = NULL,
		opsM = monthlyOps({ player }, months.lastMonths(now, dayMs(), 3, cal)),
	}
	return f
end

local function backfillEntities() : {Engine.Entity}
	local player = api.engine.util.getPlayer()
	local list : {Engine.Entity} = { player }
	for _, line in ipairs(api.engine.system.lineSystem.getLinesForPlayer(player)) do table.insert(list, line) end
	return list
end

collect.backfillCount = function() : integer
	return #backfillEntities()
end

collect.backfill = function(index : integer) : {string : any}
	local list = backfillEntities()
	if index < 1 or index > #list then return nil end
	local e = list[index]
	local now = collect.gameTime()
	local b : {string : any} = {
		scope = index == 1 and 'global' or 'line',
		id = index == 1 and NULL or e,
		months = monthlyOps({ e }, months.lastMonths(now, dayMs(), months.MONTH_CAP, cal)),
	}
	return b
end

return collect
