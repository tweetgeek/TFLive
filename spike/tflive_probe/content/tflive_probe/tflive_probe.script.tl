-- KOD DO WYRZUCENIA (spike, plan 0). Nie kopiować do mod/tflive.

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
	if not ok then
		plog(id, "ERROR=" .. tostring(errMsg))
	end
end

local function nowClock() : number
	local ok, v = pcall(function() : number return os.clock() end)
	return ok and v or -1
end

local function gameTimeNow() : integer
	local gt = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_TIME) as Engine.Component.GameTime
	return gt.gameTime
end

-- P1: środowisko Lua
local function p1()
	plog("P1", "version=" .. tostring(_VERSION)
		.. " io=" .. type(io)
		.. " io.open=" .. type(io and io.open)
		.. " os=" .. type(os)
		.. " os.getenv=" .. type(os and os.getenv)
		.. " os.rename=" .. type(os and os.rename)
		.. " os.remove=" .. type(os and os.remove)
		.. " require=" .. type(require))
	if os and os.getenv then
		plog("P1", "HOME=" .. tostring(os.getenv("HOME"))
			.. " APPDATA=" .. tostring(os.getenv("APPDATA"))
			.. " LOCALAPPDATA=" .. tostring(os.getenv("LOCALAPPDATA"))
			.. " USERPROFILE=" .. tostring(os.getenv("USERPROFILE")))
	end
end

-- P2 + P10: próba zapisu
local function tryWrite(label : string, path : string) : boolean
	local ok, res = pcall(function() : boolean
		local f = io.open(path, "w")
		if not f then return false end
		f:write("tflive probe " .. label .. "\n")
		f:close()
		return true
	end)
	plog("P2", "label=" .. label .. " path=" .. path .. " ok=" .. tostring(ok and res) .. (ok and "" or (" err=" .. tostring(res))))
	return ok and res
end

local function p2()
	if not io or not io.open then
		plog("P2", "SKIP io.open niedostępne")
		return
	end
	tryWrite("relative", "tflive_probe_relative.txt")
	tryWrite("relative_exchange", "tflive_exchange/probe.txt")
	local home = os and os.getenv and os.getenv("HOME")
	if home then
		tryWrite("home", home .. "/tflive_probe_home.txt")
		tryWrite("home_exchange", home .. "/tflive_exchange/probe.txt")
	end
	local profile = os and os.getenv and os.getenv("USERPROFILE")
	if profile then
		tryWrite("userprofile", profile .. "\\tflive_probe_home.txt")
		tryWrite("userprofile_exchange", profile .. "\\tflive_exchange\\probe.txt")
	end
end

-- P3: koszt zapisu 300 KB x10 do ścieżki względnej
local function p3()
	if not io or not io.open then
		plog("P3", "SKIP")
		return
	end
	local chunk = string.rep("x", 300 * 1024)
	local t0 = nowClock()
	for _ = 1, 10 do
		local f = io.open("tflive_probe_bulk.txt", "w")
		if f then
			f:write(chunk)
			f:write("\n")
			f:close()
		end
	end
	plog("P3", "writes=10 sizeKB=300 totalSec=" .. string.format("%.4f", nowClock() - t0))
end

-- P4: liczby encji i koszt zebrania pojazdów
local function p4()
	local player = api.engine.util.getPlayer()
	local t0 = nowClock()
	local lines = api.engine.system.lineSystem.getLinesForPlayer(player)
	local vehicles = api.engine.util.vehicle.getVehicles()
	local industries = api.engine.getEntitiesWithComponent(api.type.ComponentType.INDUSTRY)
	local towns = api.engine.getEntitiesWithComponent(api.type.ComponentType.TOWN)
	local stationGroups = api.engine.getEntitiesWithComponent(api.type.ComponentType.STATION_GROUP)
	local t1 = nowClock()
	local loaded = 0
	local sink = 0
	for _, v in ipairs(vehicles) do
		local tv = api.engine.getComponent(v, api.type.ComponentType.TRANSPORT_VEHICLE) as Engine.Component.TransportVehicle
		if tv then
			loaded = loaded + 1
			if tv.noPath then sink = sink + 1 end
			sink = sink + tv.daysAtTerminal
		end
		local n = api.engine.util.getEntityName(v)
		if n then sink = sink + #n end
	end
	local t2 = nowClock()
	plog("P4", "lines=" .. #lines .. " vehicles=" .. #vehicles .. " industries=" .. #industries
		.. " towns=" .. #towns .. " stationGroups=" .. #stationGroups
		.. " listSec=" .. string.format("%.4f", t1 - t0)
		.. " vehicleDetailSec=" .. string.format("%.4f", t2 - t1)
		.. " vehiclesRead=" .. loaded .. " sink=" .. sink)
end

-- P5: księga finansowa
local function p5()
	local fin = api.engine.util.finance
	local player = api.engine.util.getPlayer()
	local now = gameTimeNow()
	local gt = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_TIME) as Engine.Component.GameTime
	plog("P5", "gameTime=" .. tostring(now) .. " gameTime0=" .. tostring(gt.gameTime0) .. " timeOfDaySec=" .. tostring(gt.timeOfDaySec))
	debugPrint(gt.dates)
	local first = fin.getFirstIncomeTime(player)
	plog("P5", "balance=" .. tostring(fin.getPlayersBalance(player))
		.. " firstIncomeTime=" .. tostring(first)
		.. " lastIncomeTime=" .. tostring(fin.getLastIncomeTime(player)))
	local acc = api.engine.getComponent(player, api.type.ComponentType.ACCOUNT) as Engine.Component.Account
	plog("P5", "playerAccount balance=" .. tostring(acc and acc.balance) .. " loan=" .. tostring(acc and acc.loan))
	plog("P5", "playerAll(first..now)=" .. tostring(fin.calculateBalance({player}, first, now, false))
		.. " playerOps(first..now)=" .. tostring(fin.calculateBalance({player}, first, now, true)))
	local lines = api.engine.system.lineSystem.getLinesForPlayer(player)
	if #lines == 0 then
		plog("P5", "lines=0 SKIP line ledger")
		return
	end
	local line = lines[1]
	local lineAcc = api.engine.getComponent(line, api.type.ComponentType.ACCOUNT) as Engine.Component.Account
	plog("P5", "line=" .. tostring(line) .. " name=" .. tostring(api.engine.util.getEntityName(line))
		.. " hasAccount=" .. tostring(lineAcc ~= nil)
		.. " lineAll(first..now)=" .. tostring(fin.calculateBalance({line}, first, now, false))
		.. " lineOps(first..now)=" .. tostring(fin.calculateBalance({line}, first, now, true)))
	-- 12 odcinków: bilans operacyjny linii w równych przedziałach od first do now
	local step = math.floor((now - first) / 12)
	if step > 0 then
		local parts : {string} = {}
		for i = 0, 11 do
			local a = first + i * step
			table.insert(parts, tostring(fin.calculateBalance({line}, a, a + step, true)))
		end
		plog("P5", "lineOpsBuckets=" .. table.concat(parts, ","))
	end
	local t0 = nowClock()
	for _, l in ipairs(lines) do
		fin.calculateBalance({l}, first, now, true)
	end
	plog("P5", "allLinesLedgerSec=" .. string.format("%.4f", nowClock() - t0) .. " lines=" .. #lines)
end

-- P6: najdłużej czekający towar
local function p6()
	local now = gameTimeNow()
	local industries = api.engine.getEntitiesWithComponent(api.type.ComponentType.INDUSTRY)
	if #industries == 0 then
		plog("P6", "industries=0 SKIP")
		return
	end
	local ind = industries[1]
	local indComp = api.engine.getComponent(ind, api.type.ComponentType.INDUSTRY) as Engine.Component.Industry
	plog("P6", "industry=" .. tostring(ind) .. " name=" .. tostring(api.engine.util.getEntityName(ind))
		.. " level=" .. tostring(indComp.level) .. " maxLevel=" .. tostring(indComp.maxLevel)
		.. " closureTimeStamp=" .. tostring(indComp.closureTimeStamp)
		.. " stockList=" .. tostring(indComp.stockList))
	local sl = api.engine.getComponent(indComp.stockList, api.type.ComponentType.STOCK_LIST) as Engine.Component.StockList
	debugPrint(sl)
	local stockSys = api.engine.system.simEntityAtStockSystem
	for stockId = 0, 3 do
		local ok, cnt = pcall(function() : integer
			return stockSys.getStockCount(indComp.stockList, stockId)
		end)
		local ok2, longest = pcall(function() : Engine.Entity
			return stockSys.getStockSimEntity(indComp.stockList, stockId)
		end)
		local startTime = "nil"
		if ok2 and longest and longest > 0 then
			local sc = api.engine.getComponent(longest, api.type.ComponentType.SIM_CARGO) as Engine.Component.SimCargo
			startTime = sc and tostring(sc.startTime) or "noSimCargo"
		end
		plog("P6", "stock=" .. stockId .. " count=" .. tostring(ok and cnt) .. " longest=" .. tostring(ok2 and longest)
			.. " startTime=" .. startTime .. " now=" .. tostring(now))
	end
	debugPrint(api.engine.util.industry.getIndustryProductivityInfo(ind))
end

-- P7: części pojazdu
local function p7()
	local vehicles = api.engine.util.vehicle.getVehicles()
	if #vehicles == 0 then
		plog("P7", "vehicles=0 SKIP")
		return
	end
	local v = vehicles[1]
	local tv = api.engine.getComponent(v, api.type.ComponentType.TRANSPORT_VEHICLE) as Engine.Component.TransportVehicle
	plog("P7", "vehicle=" .. tostring(v) .. " state=" .. tostring(tv.state) .. " line=" .. tostring(tv.line)
		.. " userStopped=" .. tostring(tv.userStopped) .. " noPath=" .. tostring(tv.noPath)
		.. " daysAtTerminal=" .. tostring(tv.daysAtTerminal) .. " daysInDepot=" .. tostring(tv.daysInDepot)
		.. " parts=" .. #tv.transportVehicleConfig.vehicles
		.. " maintenanceStateUtil=" .. tostring(api.engine.util.vehicle.getVehicleMaintenanceState(v)))
	local part = tv.transportVehicleConfig.vehicles[1]
	plog("P7", "part1 purchaseTime=" .. tostring(part.purchaseTime) .. " maintenanceState=" .. tostring(part.maintenanceState)
		.. " modelId=" .. tostring(part.part.modelId))
	local model = api.res.modelRep.get(part.part.modelId)
	local md = model and model.metadata as {string : {string : any}}
	local maint = md and md.maintenance
	plog("P7", "lifespan=" .. tostring(maint and maint.lifespan))
	debugPrint(maint)
	debugPrint(api.engine.util.vehicle.getVehicleProblems())
	debugPrint(api.engine.util.line.getLinesIssues(api.engine.util.getPlayer(), true))
end

-- P8: stan skryptu gry (saveId)
local record ProbeState
	saveId : string
	lastSeenGameTime : integer
end

local function p8(state : GameScriptState<ProbeState>)
	local s = state:get()
	if s and s.saveId then
		plog("P8", "existing saveId=" .. tostring(s.saveId) .. " lastSeenGameTime=" .. tostring(s.lastSeenGameTime))
	else
		math.randomseed(math.floor(nowClock() * 1000000) + gameTimeNow())
		local id = string.format("%08x%08x", math.random(0, 0x7fffffff), math.random(0, 0x7fffffff))
		state:set({ saveId = id, lastSeenGameTime = gameTimeNow() })
		plog("P8", "new saveId=" .. id)
	end
end

-- P9: pauza
local function p9(dt : number)
	local speed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
	plog("P9", "dt=" .. tostring(dt) .. " gameTime=" .. tostring(gameTimeNow()) .. " clock=" .. string.format("%.2f", nowClock()))
	debugPrint(speed)
end

local onceDone = false
local lastPeriodic = -1000.0

local ret : GameScript<ProbeState> = {
	update = function(_userParams : table, state : GameScriptState<ProbeState>, dt : number) : any
		if not onceDone then
			onceDone = true
			plog("P0", "hello")
			probe("P1", p1)
			probe("P2", p2)
			probe("P3", p3)
			probe("P5", p5)
			probe("P6", p6)
			probe("P7", p7)
			probe("P8", function() p8(state) end)
		end
		local c = nowClock()
		if c - lastPeriodic >= 10.0 then
			lastPeriodic = c
			probe("P4", p4)
			probe("P9", function() p9(dt) end)
			probe("P8", function()
				local s = state:get()
				if s and s.saveId then
					state:set({ saveId = s.saveId, lastSeenGameTime = gameTimeNow() })
				end
			end)
		end
	end,
}

return ret
