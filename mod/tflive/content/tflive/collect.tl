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
	backfill : function(integer, integer, integer) : {string : any}, integer
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

collect.backfill = function(index : integer, offset : integer, maxMonths : integer) : {string : any}, integer
	local list = backfillEntities()
	if index < 1 or index > #list then return nil, nil end
	local e = list[index]
	local now = collect.gameTime()
	local all = months.lastMonths(now, dayMs(), months.MONTH_CAP, cal)
	local slice : {{integer}} = {}
	for i = offset + 1, math.min(offset + maxMonths, #all) do table.insert(slice, all[i]) end
	local nextOffset : integer = nil
	if offset + maxMonths < #all then nextOffset = offset + maxMonths end
	local b : {string : any} = {
		scope = index == 1 and 'global' or 'line',
		id = index == 1 and NULL or e,
		months = monthlyOps({ e }, slice),
	}
	return b, nextOffset
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
	local ld, cap = 0, 0
	local sys = api.engine.system.simEntityAtVehicleSystem
	for k, c in ipairs(tv.config.capacities as {integer}) do
		if c > 0 then
			cap = cap + c
			ld = ld + sys.getVehicleSimEntitiesCountForCargoType(v, (k - 1) as CargoTypeId)
		end
	end
	return ld, cap
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
		local vids : {integer} = {}
		for _, v in ipairs(api.engine.system.transportVehicleSystem.getLineVehicles(line)) do
			vids[#vids + 1] = v
		end
		local deps : {any} = {}
		for _, v in ipairs(vids) do
			local tv = api.engine.getComponent(v, api.type.ComponentType.TRANSPORT_VEHICLE) as Engine.Component.TransportVehicle
			local last = tv and tv.lastLineStopDeparture or 0
			local key = tostring(v)
			if last > 0 and (departures[key] or 0) < last then
				for i, t in ipairs(tv.lineStopDepartures) do
					if t == last then
						local ld, cap = loadAndCap(v, tv)
						table.insert(deps, { i - 1, ld, cap, t })
						departures[key] = last
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
			vids,
			(okFirst and first ~= nil and first > 0) and (first as any) or NULL,
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
			local ld, cap = loadAndCap(v, tv)
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
				ld,
				cap,
				fin.calculateBalance({ v }, t0, now, true),
				partRows(tv),
			})
		end
	end
	return rows
end

local cargoNames : {integer : string} = {}
local function cargoName(id : integer) : string
	local c = cargoNames[id]
	if c then return c end
	local full = api.res.cargoTypeRep.getName(id as CargoTypeId) or tostring(id)
	c = full:match('([^/]+)%.cargo$') or full
	cargoNames[id] = c
	return c
end

local function allCargoIds() : {integer}
	local ids : {integer} = {}
	for id, _ in pairs(api.res.cargoTypeRep.getAll() as {integer : any}) do table.insert(ids, id) end
	table.sort(ids)
	return ids
end

-- Czas ostatniego wpisu w dzienniku encji (LOG_BOOK) dla nazwy lub prefiksu nazwy.
local function lastLogTime(entity : Engine.Entity, name : string, prefix : boolean) : integer
	local lb = api.engine.getComponent(entity, api.type.ComponentType.LOG_BOOK) as Engine.Component.LogBook
	if not lb or not lb.name2log then return nil end
	local best : integer = nil
	for k, log in pairs(lb.name2log) do
		local match = (prefix and k:sub(1, #name) == name) or (not prefix and k == name)
		if match and log.times and #log.times > 0 then
			local t = log.times[#log.times]
			if best == nil or t > best then best = t end
		end
	end
	return best
end

collect.stops = function() : {any}
	local player = api.engine.util.getPlayer()
	local seen : {integer : boolean} = {}
	local groups : {integer} = {}
	for _, line in ipairs(api.engine.system.lineSystem.getLinesForPlayer(player)) do
		local lc = api.engine.getComponent(line, api.type.ComponentType.LINE) as Engine.Component.Line
		if lc then
			for _, st in ipairs(lc.stops) do
				if not seen[st.stationGroup] then
					seen[st.stationGroup] = true
					table.insert(groups, st.stationGroup)
				end
			end
		end
	end
	local cargoIds = allCargoIds()
	local rows : {any} = {}
	for _, sg in ipairs(groups) do
		local waiting : {any} = {}
		local veryBad = false
		for _, cid in ipairs(cargoIds) do
			local q = api.engine.util.cargo.getCargoQualityDataAtStationGroup(sg, cid as CargoTypeId)
			if q and q.countTotal and q.countTotal > 0 then
				table.insert(waiting, { cargoName(cid), q.countTotal, q.countBad or 0 })
				if q.isVeryBad then veryBad = true end
			end
		end
		table.insert(rows, { sg, api.engine.util.getEntityName(sg) or tostring(sg), waiting, veryBad and 1 or 0 })
	end
	return rows
end

collect.industries = function() : {any}
	local E = api.type["enum"].StockListType
	local rows : {any} = {}
	for _, e in ipairs(api.engine.getEntitiesWithComponent(api.type.ComponentType.INDUSTRY)) do
		local ind = api.engine.getComponent(e, api.type.ComponentType.INDUSTRY) as Engine.Component.Industry
		if ind then
			local sle = ind.stockList
			local sl = api.engine.getComponent(sle, api.type.ComponentType.STOCK_LIST) as Engine.Component.StockList
			local inputs : {any} = {}
			local outputs : {any} = {}
			if sl and sl.stocks then
				for i, s in ipairs(sl.stocks) do
					local sid = (i - 1) as StockId
					local count = api.engine.system.simEntityAtStockSystem.getStockCount(sle, sid)
					local cid = s.cargoType as integer
					if s.type == E.InputStock then
						table.insert(inputs, { cargoName(cid), count, orNull(lastLogTime(sle, 'itemsConsumed' .. tostring(cid), false)) })
					elseif s.type == E.OutputStock then
						table.insert(outputs, { cargoName(cid), count, s.capacity or 0 })
					end
				end
			end
			local typeName = 'industry'
			local con = api.engine.getComponent(ind.construction, api.type.ComponentType.CONSTRUCTION) as Engine.Component.Construction
			if con and con.fileName then typeName = con.fileName:match('([^/]+)%.con$') or con.fileName end
			local closure : any = NULL
			if ind.closureTimeStamp and ind.closureTimeStamp > 0 then closure = ind.closureTimeStamp end
			table.insert(rows, {
				e,
				api.engine.util.getEntityName(e) or tostring(e),
				typeName,
				ind.level or 0,
				ind.maxLevel or 0,
				closure,
				ind.upgradeProgress or 0,
				inputs,
				outputs,
				orNull(lastLogTime(sle, 'itemsLoaded', false)),
			})
		end
	end
	return rows
end

local DISTRICTS : {string} = { 'RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL' }

collect.towns = function() : {any}
	local LU = api.type["enum"].LandUseType as {string : any}
	local resIdx = (LU['RESIDENTIAL'] as integer) + 1
	local rows : {any} = {}
	for _, t in ipairs(api.engine.getEntitiesWithComponent(api.type.ComponentType.TOWN)) do
		local town = api.engine.getComponent(t, api.type.ComponentType.TOWN) as Engine.Component.Town
		if town then
			local usage = api.engine.util.town.getTownCapacityUsage(t)
			local res = usage and usage[resIdx]
			local em = api.engine.util.town.getTownEmissionDB(t)
			local needs : {any} = {}
			for _, dname in ipairs(DISTRICTS) do
				local lu = LU[dname] as LandUseType
				for cid, sl in pairs(api.engine.system.townBuildingSystem.getCargoSupplyAndLimit(t, lu) as {integer : {number}}) do
					local demand = math.floor(sl[2] or 0)
					if demand > 0 then
						table.insert(needs, { dname, cargoName(cid), demand, math.min(math.ceil(sl[1] or 0), demand) })
					end
				end
			end
			table.insert(rows, {
				t,
				api.engine.util.getEntityName(t) or tostring(t),
				res and res.capacity or 0,
				town.developmentActive and 1 or 0,
				em and em.noise or 0,
				em and em.pollution or 0,
				needs,
				orNull(lastLogTime(t, 'itemsAtDestination', true)),
			})
		end
	end
	return rows
end

return collect
