-- KOD DO WYRZUCENIA (spike, runda 3 — niewiadome planu 2). Nie kopiować do mod/tflive.
local P <const> = "[TFLIVE-PROBE] "

local function plog(id : string, msg : string)
	pcall(function() debugPrint(P .. id .. " " .. msg) end)
end

local function probe(id : string, fn : function())
	local errMsg : string = nil
	local ok = xpcall(fn, function(e : any) : any
		errMsg = tostring(e)
		return e
	end)
	if not ok then plog(id, "ERROR=" .. tostring(errMsg)) end
end

local function clock() : number
	local ok, v = pcall(function() : number return os.clock() end)
	return ok and v or -1
end

local world = function() : Engine.Entity return api.engine.util.getWorld() end
local function gameTime() : Engine.Component.GameTime
	return api.engine.getComponent(world(), api.type.ComponentType.GAME_TIME) as Engine.Component.GameTime
end

-- R0: wczytywanie modułów modu
local function r0()
	for _, path in ipairs({ "/tflive_probe/probe_lib.tl", "tflive_probe::/tflive_probe/probe_lib.tl", "::/tflive_probe/probe_lib.tl" }) do
		local ok, res = pcall(function() : any return ug_require(path) end)
		local msg = ok and (type(res) == "table" and ((res as {string:function():string})["hello"])() or type(res)) or tostring(res)
		plog("R0", "path=" .. path .. " ok=" .. tostring(ok) .. " res=" .. tostring(msg))
	end
end

-- R1: prędkość gry i czas
local function r1()
	local gs = api.engine.getComponent(world(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
	local gt = gameTime()
	local d = api.engine.util.getCalendarDate(gt.gameTime)
	local t0 = clock()
	local n = #gt.dates
	local tDates = clock() - t0
	plog("R1", "millisPerDay=" .. tostring(gs.millisPerDay) .. " speedup=" .. tostring(gs.speedup)
		.. " defDay=" .. tostring(api.util.getDefaultDayDuration()) .. " defMonth=" .. tostring(api.util.getDefaultMonthDuration())
		.. " defYear=" .. tostring(api.util.getDefaultYearDuration())
		.. " calendar=" .. tostring(d.year) .. "-" .. tostring(d.month) .. "-" .. tostring(d.day)
		.. " dates=" .. n .. " datesSec=" .. string.format("%.4f", tDates))
end

-- Początki miesięcy z GameTime.dates (ostatnie n)
local function monthStarts(n : integer) : {{integer, integer, integer}}
	local dates = gameTime().dates
	local starts : {{integer, integer, integer}} = {}
	for i = #dates, 1, -1 do
		local e = dates[i]
		local dd = e[2]
		if dd.day == 1 then
			table.insert(starts, 1, { e[1], dd.year, dd.month })
			if #starts > n then break end
		end
	end
	return starts
end

-- R2: Koszty bieżące — wariant A (kategorie utrzymania) vs B (przychód - wynik)
local function r2()
	local fin = api.engine.util.finance
	local player = api.engine.util.getPlayer()
	local now = gameTime().gameTime
	local t0 = math.max(now - api.util.getDefaultYearDuration(), 0)
	local ops = fin.calculateBalance({ player }, t0, now, true)
	local all = fin.calculateBalance({ player }, t0, now, false)
	local M = api.type.JournalEntry.Maintenance
	local parts : {string} = {}
	local sumA = 0
	for _, k in ipairs({ "VEHICLE", "INFRASTRUCTURE", "OTHER", "VEHICLE_MAINTENANCE" }) do
		local cat = (M as {string:JournalEntry.Maintenance})[k]
		local ok, v = pcall(function() : integer return fin.calculateBalance({ player }, t0, now, true, cat) end)
		table.insert(parts, k .. "=" .. tostring(ok and v or "ERR"))
		if ok and v then sumA = sumA + v end
	end
	local income = fin.calcIncomeSince(t0, player)
	plog("R2", "ops12=" .. ops .. " all12=" .. all .. " income12=" .. tostring(income) .. " B_run12=" .. tostring(income - ops)
		.. " A_sum=" .. sumA .. " " .. table.concat(parts, " "))
	local starts = monthStarts(3)
	local ms : {string} = {}
	for k = 1, #starts do
		local a = starts[k][1]
		local b = starts[k + 1] and starts[k + 1][1] or now
		table.insert(ms, starts[k][2] .. "-" .. starts[k][3] .. ":" .. fin.calculateBalance({ player }, a, b, true))
	end
	plog("R2", "opsByMonth " .. table.concat(ms, " "))
end

-- R3: computeFinanceTable (Inwestycje)
local function r3()
	local cfg = api.type.ChartConfig.new()
	cfg.count = 1
	local fd = api.engine.util.finance.computeFinanceTable(api.engine.util.getPlayer(), cfg)
	plog("R3", "header=" .. table.concat(fd.header, "|") .. " total=" .. table.concat(fd.total as {any} as {string}, "|"))
	fd:foreach_investment(function(key : integer, values : {integer})
		local vs : {string} = {}
		for _, v in ipairs(values) do table.insert(vs, tostring(v)) end
		plog("R3", "investment key=" .. tostring(key) .. " values=" .. table.concat(vs, "|"))
	end)
end

-- R4: Początek linii i historia miesięczna linii
local function r4()
	local fin = api.engine.util.finance
	local player = api.engine.util.getPlayer()
	local now = gameTime().gameTime
	local lines = api.engine.system.lineSystem.getLinesForPlayer(player)
	local starts = monthStarts(24)
	local shown = 0
	for _, line in ipairs(lines) do
		local ops = fin.calculateBalance({ line }, 0, now, true)
		if ops ~= 0 and shown < 2 then
			shown = shown + 1
			local okF, first = pcall(function() : integer return fin.getFirstIncomeTime(line) end)
			local lb = api.engine.getComponent(line, api.type.ComponentType.LOG_BOOK) as Engine.Component.LogBook
			local keys : {string} = {}
			local firstT = "nil"
			if lb then
				for k, lg in pairs(lb.name2log) do
					table.insert(keys, k)
					if k == "itemsTransported" and lg.times and #lg.times > 0 then firstT = tostring(lg.times[1]) end
				end
			end
			local months : {string} = {}
			for k = 1, #starts do
				local a = starts[k][1]
				local b = starts[k + 1] and starts[k + 1][1] or now
				table.insert(months, tostring(fin.calculateBalance({ line }, a, b, true)))
			end
			plog("R4", "line=" .. tostring(line) .. " ops=" .. ops .. " firstIncome=" .. tostring(okF and first or "ERR")
				.. " logKeys=" .. table.concat(keys, ",") .. " itemsTransportedFirst=" .. firstT .. " months24=" .. table.concat(months, ","))
		end
	end
	local t0 = clock()
	for _, line in ipairs(lines) do
		for k = 1, #starts do
			local a = starts[k][1]
			local b = starts[k + 1] and starts[k + 1][1] or now
			fin.calculateBalance({ line }, a, b, true)
		end
	end
	plog("R4", "backfillCost lines=" .. #lines .. " months=" .. #starts .. " sec=" .. string.format("%.4f", clock() - t0))
end

-- R5: pojazdy — obciążenie, brak linii, odjazdy
local function r5()
	local player = api.engine.util.getPlayer()
	local owned = api.engine.getEntitiesWithComponent(api.type.ComponentType.TRANSPORT_VEHICLE, { requireOwnedByPlayer = player } as Engine.EntityFilters)
	plog("R5", "ownedVehicles=" .. #owned .. " allVehicles=" .. #api.engine.util.vehicle.getVehicles())
	local doneLine, doneNoLine = false, false
	for _, v in ipairs(owned) do
		local tv = api.engine.getComponent(v, api.type.ComponentType.TRANSPORT_VEHICLE) as Engine.Component.TransportVehicle
		local cnt = api.engine.system.simEntityAtVehicleSystem.getVehicleSimEntitiesCount(v) as any
		local caps : {string} = {}
		for k, c in ipairs(tv.config.capacities as {integer}) do if c > 0 then table.insert(caps, tostring(k) .. ":" .. tostring(c)) end end
		local hasLine = api.engine.entityExists(tv.line)
		if hasLine and not doneLine then
			doneLine = true
			local deps : {string} = {}
			for _, t in ipairs(tv.lineStopDepartures) do table.insert(deps, tostring(t)) end
			plog("R5", "vehicle=" .. tostring(v) .. " line=" .. tostring(tv.line) .. " countType=" .. type(cnt) .. " count=" .. tostring(type(cnt) == "number" and cnt or "table")
				.. " caps=" .. table.concat(caps, ",") .. " carrier=" .. tostring(tv.carrier) .. " state=" .. tostring(tv.state)
				.. " lastDep=" .. tostring(tv.lastLineStopDeparture) .. " deps=" .. table.concat(deps, ",") .. " stop2avail=" .. #tv.lineStop2cargo2available)
		elseif not hasLine and not doneNoLine then
			doneNoLine = true
			plog("R5", "vehicleNoLine=" .. tostring(v) .. " lineValue=" .. tostring(tv.line))
		end
	end
	local E = api.type["enum"]
	plog("R5", "enum EN_ROUTE=" .. tostring(E.TransportVehicleState.EN_ROUTE) .. " ROAD=" .. tostring(E.Carrier.ROAD) .. " RAIL=" .. tostring(E.Carrier.RAIL)
		.. " RES=" .. tostring(E.LandUseType.RESIDENTIAL) .. " Input=" .. tostring(E.StockListType.InputStock))
end

-- R6/R8: dzienniki przemysłu i miast, emisje, potrzeby
local function r6()
	local inds = api.engine.getEntitiesWithComponent(api.type.ComponentType.INDUSTRY)
	for i = 1, math.min(2, #inds) do
		local lb = api.engine.getComponent(inds[i], api.type.ComponentType.LOG_BOOK) as Engine.Component.LogBook
		local keys : {string} = {}
		if lb then for k, lg in pairs(lb.name2log) do table.insert(keys, k .. "#" .. tostring(lg.times and #lg.times or 0)) end end
		plog("R6", "industry=" .. tostring(inds[i]) .. " logKeys=" .. table.concat(keys, ","))
	end
	local towns = api.engine.getEntitiesWithComponent(api.type.ComponentType.TOWN)
	if #towns > 0 then
		local t = towns[1]
		local lb = api.engine.getComponent(t, api.type.ComponentType.LOG_BOOK) as Engine.Component.LogBook
		local keys : {string} = {}
		if lb then for k, lg in pairs(lb.name2log) do table.insert(keys, k .. "#" .. tostring(lg.times and #lg.times or 0)) end end
		local em = api.engine.util.town.getTownEmissionDB(t)
		local cap = api.engine.util.town.getTownCapacityUsage(t)
		local res = cap[(api.type["enum"].LandUseType.RESIDENTIAL as integer) + 1]
		local needs : {string} = {}
		for _, lu in ipairs({ api.type["enum"].LandUseType.RESIDENTIAL, api.type["enum"].LandUseType.COMMERCIAL, api.type["enum"].LandUseType.INDUSTRIAL }) do
			for cargo, sl in pairs(api.engine.system.townBuildingSystem.getCargoSupplyAndLimit(t, lu)) do
				table.insert(needs, tostring(lu) .. "/" .. tostring(cargo) .. "=" .. tostring((sl as {number})[1]) .. "/" .. tostring((sl as {number})[2]))
			end
		end
		plog("R8", "town=" .. tostring(t) .. " pop=" .. tostring(res and res.capacity) .. " used=" .. tostring(res and res.used)
			.. " noise=" .. tostring(em.noise) .. " pollution=" .. tostring(em.pollution) .. " needs=" .. table.concat(needs, ",") .. " logKeys=" .. table.concat(keys, ","))
	end
end

-- R9/R10: przystanki, kolor i tryb linii
local function r9()
	local player = api.engine.util.getPlayer()
	local lines = api.engine.system.lineSystem.getLinesForPlayer(player)
	if #lines == 0 then plog("R9", "lines=0 SKIP") return end
	local line = lines[1]
	local lc = api.engine.getComponent(line, api.type.ComponentType.LINE) as Engine.Component.Line
	local col = api.engine.getComponent(line, api.type.ComponentType.COLOR) as Engine.Component.Color
	local modes : {string} = {}
	for m, on in pairs(api.engine.util.line.getLineTransportModesUnion(line)) do if on then table.insert(modes, tostring(m)) end end
	plog("R10", "line=" .. tostring(line) .. " color=" .. tostring(col and col.color.x) .. "," .. tostring(col and col.color.y) .. "," .. tostring(col and col.color.z)
		.. " modes=" .. table.concat(modes, ",") .. " stops=" .. #lc.stops)
	local pax = api.res.cargoTypeRep.getPassengerCargoTypeId()
	local now = gameTime().gameTime
	for si = 1, math.min(2, #lc.stops) do
		local sg = lc.stops[si].stationGroup
		local cnt = api.engine.system.simEntityAtTerminalSystem.getLineStopSimEntitiesCount(line, si - 1, pax)
		local ents = api.engine.system.simEntityAtTerminalSystem.getLineStopSimEntities(line, si - 1, pax)
		local minArr : number = nil
		for _, e in ipairs(ents) do
			local at = api.engine.getComponent(e, api.type.ComponentType.SIM_ENTITY_AT_TERMINAL) as Engine.Component.SimEntityAtTerminal
			if at and (minArr == nil or at.arrivalTime < minArr) then minArr = at.arrivalTime end
		end
		local q = api.engine.util.cargo.getCargoQualityDataAtStationGroup(sg, pax)
		plog("R9", "stop=" .. tostring(sg) .. " name=" .. tostring(api.engine.util.getEntityName(sg)) .. " paxCount=" .. tostring(cnt)
			.. " ents=" .. #ents .. " minArrival=" .. tostring(minArr) .. " now=" .. now .. " groupCountTotal=" .. tostring(q and q.countTotal)
			.. " cargoName=" .. tostring(api.res.cargoTypeRep.getName(pax)))
	end
end

local record ProbeState
	round3Done : boolean
	events : integer
	lastWall : integer
end

local ret : GameScript<ProbeState> = {
	update = function(_userParams : table, state : GameScriptState<ProbeState>, dt : number) : any
		if not state:hasEventSubscriptions() then
			state:subscribeToEvent("OnToArriveAtDestination")
		end
		local s = state:get() or {}
		if not s.round3Done and dt > 0 then
			s.round3Done = true
			s.events = 0
			state:set(s)
			plog("P0", "round3 hello")
			probe("R0", r0)
			probe("R1", r1)
			probe("R2", r2)
			probe("R3", r3)
			probe("R4", r4)
			probe("R5", r5)
			probe("R6", r6)
			probe("R9", r9)
		end
		local wall = os.time()
		if not s.lastWall or wall - s.lastWall >= 10 then
			s.lastWall = wall
			state:set(s)
			probe("R1", r1)
		end
	end,
	handleEvent = function(_userParams : table, state : GameScriptState<ProbeState>, src : string, id : string, name : string, param : any) : any
		local s = state:get() or {}
		if (s.events or 0) >= 3 then return end
		s.events = (s.events or 0) + 1
		state:set(s)
		probe("R7", function()
			local p = param as { string : {{any}} }
			local ents = p and p["entities"]
			local first = ents and ents[1]
			local stock = first and (first[2] as {integer})
			local stockEntity = stock and stock[1]
			local isInd = stockEntity and api.engine.getComponent(stockEntity as Engine.Entity, api.type.ComponentType.INDUSTRY) ~= nil
			local cargoE = first and first[1] as Engine.Entity
			local sc = cargoE and api.engine.getComponent(cargoE, api.type.ComponentType.SIM_CARGO) as Engine.Component.SimCargo
			plog("R7", "src=" .. tostring(src) .. " id=" .. tostring(id) .. " name=" .. tostring(name) .. " n=" .. tostring(ents and #ents)
				.. " stockEntity=" .. tostring(stockEntity) .. " stockId=" .. tostring(stock and stock[2]) .. " isIndustry=" .. tostring(isInd)
				.. " cargoType=" .. tostring(sc and sc.cargoType) .. " t=" .. tostring(gameTime().gameTime))
		end)
	end,
}

return ret
