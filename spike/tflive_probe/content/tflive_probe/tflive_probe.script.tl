-- KOD DO WYRZUCENIA (spike, plan 0, runda 2). Nie kopiować do mod/tflive.
-- Wnioski z rundy 1: skrypt działa w puli wątków symulacji (osobne stany Lua),
-- więc znaczniki "raz" trzymamy w stanie skryptu gry, a nie w zmiennych modułu.

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

-- Środowisko Lua: wspólne dla P11 (symulacja) i P12 (GUI)
local function envReport(id : string)
	local g = _G as {string : any}
	local pkg = g["package"] as {string : any}
	plog(id, "io=" .. type(g["io"])
		.. " package=" .. type(pkg)
		.. " loadlib=" .. type(pkg and pkg["loadlib"])
		.. " load=" .. type(g["load"]) .. " loadstring=" .. type(g["loadstring"])
		.. " dofile=" .. type(g["dofile"]) .. " debug=" .. type(g["debug"])
		.. " collectgarbage=" .. type(g["collectgarbage"]))
	if pkg then
		plog(id, "cpath=" .. tostring(pkg["cpath"]))
		plog(id, "path=" .. tostring(pkg["path"]))
	end
	local req = g["require"] as function(string) : any
	local okSock, sockErr = pcall(function() : any return req("socket") end)
	plog(id, "require(socket) ok=" .. tostring(okSock) .. " res=" .. tostring(sockErr))
end

-- P12: zapis pliku z GUI
local function guiWrite()
	local g = _G as {string : any}
	local ioLib = g["io"] as {string : any}
	if not ioLib then
		plog("P12", "io=nil w GUI")
		return
	end
	local openFn = ioLib["open"] as function(string, string) : any
	local home = os.getenv("HOME") or os.getenv("USERPROFILE")
	for _, path in ipairs({ "tflive_probe_gui_relative.txt", (home or ".") .. "/tflive_exchange/probe_gui.txt" }) do
		local ok, res = pcall(function() : any
			local f = openFn(path, "w") as {string : function(any, string)}
			if not f then return false end
			f["write"](f, "tflive gui probe\n")
			(f["close"] as function(any))(f)
			return true
		end)
		plog("P12", "write path=" .. path .. " ok=" .. tostring(ok) .. " res=" .. tostring(res))
	end
end

-- P13: przychody linii przez pojazdy
local function p13()
	local fin = api.engine.util.finance
	local player = api.engine.util.getPlayer()
	local now = gameTimeNow()
	local lines = api.engine.system.lineSystem.getLinesForPlayer(player)
	local shown = 0
	for _, line in ipairs(lines) do
		if shown >= 3 then break end
		local vehicles = api.engine.system.transportVehicleSystem.getLineVehicles(line)
		if #vehicles > 0 then
			shown = shown + 1
			plog("P13", "line=" .. tostring(line) .. " vehicles=" .. #vehicles
				.. " lineOps=" .. tostring(fin.calculateBalance({line}, 0, now, true))
				.. " vehiclesAll=" .. tostring(fin.calculateBalance(vehicles, 0, now, false))
				.. " vehiclesOps=" .. tostring(fin.calculateBalance(vehicles, 0, now, true))
				.. " lineAndVehiclesOps=" .. tostring(fin.calculateBalance({line, table.unpack(vehicles)}, 0, now, true))
				.. " v1Ops=" .. tostring(fin.calculateBalance({vehicles[1]}, 0, now, true)))
		end
	end
end

-- P14: gameTime -> data, jednostka lifespan
local function p14()
	local gt = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_TIME) as Engine.Component.GameTime
	local dates = gt.dates
	plog("P14", "datesCount=" .. #dates .. " gameTime=" .. tostring(gt.gameTime))
	local function show(label : string, e : {integer, Date})
		if e then
			local d = e[2]
			plog("P14", label .. " t=" .. tostring(e[1]) .. " date=" .. tostring(d.year) .. "-" .. tostring(d.month) .. "-" .. tostring(d.day))
		end
	end
	show("first", dates[1])
	show("second", dates[2])
	show("last", dates[#dates])
	local today = Date.now()
	plog("P14", "Date.now=" .. tostring(today.year) .. "-" .. tostring(today.month) .. "-" .. tostring(today.day))
	local vehicles = api.engine.util.vehicle.getVehicles()
	if #vehicles > 0 then
		local tv = api.engine.getComponent(vehicles[1], api.type.ComponentType.TRANSPORT_VEHICLE) as Engine.Component.TransportVehicle
		local part = tv.transportVehicleConfig.vehicles[1]
		local model = api.res.modelRep.get(part.part.modelId)
		local md = model.metadata as {string : {string : any}}
		local av = md["availability"]
		plog("P14", "purchaseTime=" .. tostring(part.purchaseTime) .. " lifespan=" .. tostring(md["maintenance"] and md["maintenance"]["lifespan"])
			.. " yearFrom=" .. tostring(av and av["yearFrom"]) .. " yearTo=" .. tostring(av and av["yearTo"])
			.. " formatAge=" .. tostring(api.engine.util.formatAge(part.purchaseTime, gt.gameTime)))
	end
end

-- P15: koszt i integralność kanału przez log
local function p15()
	for _, kb in ipairs({ 10, 100 }) do
		local body = string.rep("0123456789", kb * 102)
		local t0 = nowClock()
		plog("P15", "BEGIN kb=" .. kb .. " len=" .. #body .. " " .. body .. " END")
		plog("P15", "kb=" .. kb .. " sec=" .. string.format("%.5f", nowClock() - t0))
	end
end

local record ProbeState
	saveId : string
	lastSeenGameTime : integer
	round2Done : boolean
	lastPeriodicWall : integer
end

local guiDone = false

local ret : GameScriptWithGui<ProbeState, table> = {
	update = function(_userParams : table, state : GameScriptState<ProbeState>, dt : number) : any
		local s = state:get() or {}
		if not s.round2Done then
			s.round2Done = true
			state:set(s)
			plog("P0", "round2 hello")
			probe("P11", function() envReport("P11") end)
			probe("P13", p13)
			probe("P14", p14)
			probe("P15", p15)
		end
		local wall = os.time()
		if not s.lastPeriodicWall or wall - s.lastPeriodicWall >= 10 then
			s.lastPeriodicWall = wall
			s.lastSeenGameTime = gameTimeNow()
			state:set(s)
			plog("P9", "dt=" .. tostring(dt) .. " gameTime=" .. tostring(s.lastSeenGameTime) .. " wall=" .. tostring(wall))
		end
	end,
	guiUpdate = function(_userParams : table, _state : GameScriptStateReadOnly<ProbeState>, _guiState : GameScriptState<table>)
		if not guiDone then
			guiDone = true
			plog("P12", "gui hello")
			probe("P12", function() envReport("P12") end)
			probe("P12", guiWrite)
		end
	end,
}

return ret
