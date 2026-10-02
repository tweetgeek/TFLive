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

local VEHICLE_STATES : {string} = { 'IN_DEPOT', 'EN_ROUTE', 'AT_TERMINAL', 'GOING_TO_DEPOT' }
local CARRIERS : {string} = { 'ROAD', 'RAIL', 'TRAM', 'AIR', 'WATER' }

local function enumName(enumTable : any, names : {string}, value : any, fallback : string) : string
	local t = enumTable as {string : any}
	for _, n in ipairs(names) do
		if t[n] == value then return n end
	end
	return fallback
end

local function stateName(v : any) : string
	return enumName(api.type["enum"].TransportVehicleState, VEHICLE_STATES, v, 'EN_ROUTE')
end

local function carrierName(v : any) : string
	return enumName(api.type["enum"].Carrier, CARRIERS, v, 'OTHER')
end

local function lineMode(line : Engine.Entity) : string
	local T = api.type["enum"].TransportMode as {string : any}
	local tm = api.engine.util.line.getLineTransportModesUnion(line) as {any : boolean}
	local function has(names : {string}) : boolean
		for _, n in ipairs(names) do
			if T[n] ~= nil and tm[T[n]] then return true end
		end
		return false
	end
	if has({ 'BUS', 'CAR', 'TRUCK' }) then return 'ROAD' end
	if has({ 'TRAIN', 'ELECTRIC_TRAIN' }) then return 'RAIL' end
	if has({ 'TRAM', 'ELECTRIC_TRAM' }) then return 'TRAM' end
	if has({ 'AIRCRAFT', 'SMALL_AIRCRAFT', 'HELICOPTER' }) then return 'AIR' end
	if has({ 'SHIP', 'SMALL_SHIP' }) then return 'WATER' end
	return 'OTHER'
end

local function colorOf(line : Engine.Entity) : any
	local c = api.engine.getComponent(line, api.type.ComponentType.COLOR) as Engine.Component.Color
	if not c or not c.color then return NULL end
	local function byte(x : number) : integer
		return math.floor(math.max(0, math.min(1, x)) * 255 + 0.5)
	end
	return string.format('#%02x%02x%02x', byte(c.color.x), byte(c.color.y), byte(c.color.z))
end

-- Ładunek i pojemność: per ładunek, bo getVehicleSimEntitiesCount zwraca tabelę (krok 0 #27).
local function loadAndCap(v : Engine.Entity, tv : Engine.Component.TransportVehicle) : integer, integer
	local load, cap = 0, 0
	local sys = api.engine.system.simEntityAtVehicleSystem
	for k, c in ipairs(tv.config.capacities as {integer}) do
		if c > 0 then
			cap = cap + c
			load = load + sys.getVehicleSimEntitiesCountForCargoType(v, (k - 1) as CargoTypeId)
		end
	end
	return load, cap
end

collect.lines = function(departures : {string : integer}) : {any}
	local fin = api.engine.util.finance
	local player = api.engine.util.getPlayer()
	local now = collect.gameTime()
	local t0 = yearAgo(now)
	local mlist = months.lastMonths(now, dayMs(), 3, cal)
	local rows : {any} = {}
	for _, line in ipairs(api.engine.system.lineSystem.getLinesForPlayer(player)) do
		local lc = api.engine.getComponent(line, api.type.ComponentType.LINE) as Engine.Component.Line
		local stopIds : {integer} = {}
		if lc then
			for i, st in ipairs(lc.stops) do stopIds[i] = st.stationGroup end
		end
		local vehicles = api.engine.system.transportVehicleSystem.getLineVehicles(line)
		local deps : {any} = {}
		for _, v in ipairs(vehicles) do
			local tv = api.engine.getComponent(v, api.type.ComponentType.TRANSPORT_VEHICLE) as Engine.Component.TransportVehicle
			local last = tv and tv.lastLineStopDeparture or 0
			local key = tostring(v)
			if last > 0 and (departures[key] or 0) < last then
				departures[key] = last
				for i, t in ipairs(tv.lineStopDepartures) do
					if t == last then
						local load, cap = loadAndCap(v, tv)
						table.insert(deps, { i - 1, load, cap, t })
						break
					end
				end
			end
		end
		local okFirst, first = pcall(function() : integer return fin.getFirstIncomeTime(line) end)
		table.insert(rows, {
			line,
			api.engine.util.getEntityName(line) or tostring(line),
			lineMode(line),
			colorOf(line),
			stopIds,
			vehicles,
			(okFirst and first ~= nil) and (first as any) or NULL,
			fin.calculateBalance({ line }, t0, now, true),
			NULL,
			deps,
			monthlyOps({ line }, mlist),
		})
	end
	return rows
end

local function partRows(tv : Engine.Component.TransportVehicle) : {any}
	local parts : {any} = {}
	for _, p in ipairs(tv.transportVehicleConfig.vehicles) do
		local modelId = p.part.modelId
		local resName = api.res.modelRep.getName(modelId) or tostring(modelId)
		local model = api.res.modelRep.get(modelId)
		local md = model and (model.metadata as {string : {string : any}})
		local maint = md and md['maintenance']
		local lifespan = (maint and (maint['lifespan'] as number)) or 0
		table.insert(parts, { resName:match('([^/]+)%.mdl$') or resName, p.purchaseTime, lifespan, p.maintenanceState })
	end
	return parts
end

collect.vehicles = function() : {any}
	local fin = api.engine.util.finance
	local player = api.engine.util.getPlayer()
	local now = collect.gameTime()
	local t0 = yearAgo(now)
	local rows : {any} = {}
	local list = api.engine.getEntitiesWithComponent(api.type.ComponentType.TRANSPORT_VEHICLE, { requireOwnedByPlayer = player } as Engine.EntityFilters)
	for _, v in ipairs(list) do
		local tv = api.engine.getComponent(v, api.type.ComponentType.TRANSPORT_VEHICLE) as Engine.Component.TransportVehicle
		if tv then
			local load, cap = loadAndCap(v, tv)
			local lineId : any = NULL
			if tv.line and tv.line > 0 and api.engine.entityExists(tv.line) then lineId = tv.line end
			table.insert(rows, {
				v,
				api.engine.util.getEntityName(v) or tostring(v),
				lineId,
				carrierName(tv.carrier),
				stateName(tv.state),
				tv.userStopped and 1 or 0,
				tv.noPath and 1 or 0,
				tv.daysAtTerminal or 0,
				tv.daysInDepot or 0,
				load,
				cap,
				fin.calculateBalance({ v }, t0, now, true),
				partRows(tv),
			})
		end
	end
	return rows
end

return collect
