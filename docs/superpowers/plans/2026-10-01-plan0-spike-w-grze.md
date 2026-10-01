# Plan 0: test w grze (spike) — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ustalić w działającej grze TF3 (macOS i Windows) fakty, od których zależą plany 1–3: czy i dokąd mod może zapisywać pliki, które dane z §4 specyfikacji są dostępne, ile kosztuje ich zebranie, jak działa stan skryptu gry oraz księga finansowa.

**Architecture:** Jednorazowy mod `tflive_probe` (do wyrzucenia) ze skryptem gry w Teal. Wykonuje serię sond w hooku `update`, a wyniki wypisuje przez `debugPrint` z prefiksem `[TFLIVE-PROBE]` do logu gry. Wyniki przenosimy do dokumentu ustaleń, który jest jedynym trwałym produktem tego planu.

**Tech Stack:** Transport Fever 3 (mod: `mod.json` + `content/*.gs.lua` + `content/*.script.tl`, język Teal), log gry `stdout.txt`.

**Spec:** `docs/superpowers/specs/2026-10-01-tflive-dashboard-design.md` (§11 krok 0, §3, §4, §4a, §7, §7a, §8), słownik `CONTEXT.md`, ADR `docs/adr/0001`, `docs/adr/0002`.

## Global Constraints

- Kod spike'a leży w `spike/` i jest oznaczony jako do wyrzucenia. Żadnego jego fragmentu nie przenosimy do `mod/tflive/` bez ponownego napisania w planie 2.
- Mod jest tylko do odczytu wobec gry: żadnych `api.cmd.sendCommand`.
- Każda sonda działa w `pcall`. Błąd jednej sondy nie może przerwać pozostałych ani wywołać błędu gry.
- Testy na kopii zapisu gry, nigdy na jedynym zapisie użytkownika.
- Zapis testowy na dysk: łącznie poniżej 50 MB na całe uruchomienie spike'a.
- Platformy: macOS i Windows.

## Ścieżki (ustalone na macOS tego użytkownika)

| Co | macOS | Windows (do potwierdzenia w Task 5) |
|---|---|---|
| Instalacja gry | `~/Library/Application Support/Steam/steamapps/common/Transport Fever 3/` | `C:\Program Files (x86)\Steam\steamapps\common\Transport Fever 3\` |
| Dane użytkownika | `~/Library/Application Support/Steam/userdata/<steamId>/3493540/local/` | `C:\Program Files (x86)\Steam\userdata\<steamId>\3493540\local\` |
| Mody użytkownika | `<dane użytkownika>/mods/` | `<dane użytkownika>\mods\` |
| Log gry | `<dane użytkownika>/crash_dump/stdout.txt` | `<dane użytkownika>\crash_dump\stdout.txt` |
| Zapisy gry | `<dane użytkownika>/save/` | `<dane użytkownika>\save\` |

Steam App ID TF3: `3493540`.

## Review Focus

- **Brak `io` w sandboxie**: sonda musi to wyraźnie zgłosić (`io=nil`), a nie wywołać błędu. Pokrywa Task 2 (sonda P1/P2).
- **Ścieżka względna `io.open` ląduje w katalogu instalacji gry** (na Windows zwykle niezapisywalny): trzeba to wykryć i spróbować ścieżek bezwzględnych z `os.getenv`. Pokrywa Task 2 (sonda P2).
- **Hook `update` wywoływany w pauzie** (`dt == 0`): sonda musi to rozróżnić, bo od tego zależy reguła „brak zapisu w pauzie”. Pokrywa Task 2 (sonda P9).
- **Pusta rozgrywka** (0 linii, 0 pojazdów): sondy P5–P7 muszą zgłosić „brak encji”, a nie błąd indeksowania `nil`. Pokrywa Task 2 (guardy w P5–P7).
- **Długi czas zbierania na dużej mapie** zacinający grę: sonda P4 mierzy czas i jest uruchamiana co 10 s, nie co tick. Pokrywa Task 2 (P4) i Task 4 (pomiar na dużej mapie).

---

### Task 1: Szkielet modu `tflive_probe` i instalacja

**Files:**
- Create: `spike/README.md`
- Create: `spike/tflive_probe/mod.json`
- Create: `spike/tflive_probe/strings.json`
- Create: `spike/tflive_probe/content/tflive_probe/tflive_probe.gs.lua`
- Create: `spike/tflive_probe/content/tflive_probe/tflive_probe.script.tl` (minimalna wersja, w Task 2 pełna)

**Interfaces:**
- Consumes: nic.
- Produces: mod widoczny w grze, który wypisuje do logu linię `[TFLIVE-PROBE] hello`. Task 2 podmienia tylko `tflive_probe.script.tl`.

- [ ] **Step 1: Utwórz `spike/README.md`**

```markdown
# spike/ — kod do wyrzucenia

Zawartość tego katalogu służy wyłącznie do kroku 0 (plan 0). Nie jest częścią produktu.
Wyniki: `docs/superpowers/spikes/2026-10-01-krok0-wyniki.md`.
```

- [ ] **Step 2: Utwórz `spike/tflive_probe/mod.json`** (format skopiowany z wbudowanych modów TF3 i moda `move_it`)

```json
{
    "dependencies": null,
    "incompatibilities": null,
    "modId": "tflive_probe",
    "options": null,
    "params": null,
    "postRunScript": { "fileName": "" },
    "preRunScript": { "fileName": "" },
    "revision": 1,
    "runScript": { "fileName": "" },
    "severityAdd": "None",
    "severityRemove": "None"
}
```

- [ ] **Step 3: Utwórz `spike/tflive_probe/strings.json`**

```json
{
    "en": { "tflive_probe_name": "TFLive probe (spike)" },
    "pl": { "tflive_probe_name": "TFLive sonda (spike)" }
}
```

- [ ] **Step 4: Utwórz `spike/tflive_probe/content/tflive_probe/tflive_probe.gs.lua`** (wzorzec: `base/content/industries/industry_workers.gs.lua`)

```lua
function data()
	return {
		updateScript = {
			fileName = "tflive_probe.script@update",
		},
	}
end
```

- [ ] **Step 5: Utwórz minimalny `tflive_probe.script.tl`**

```lua
local ret : GameScript<table> = {
	update = function(_userParams : table, _state : GameScriptState<table>, _dt : number) : any
		if not g_tfliveProbeHello then
			g_tfliveProbeHello = true
			debugPrint("[TFLIVE-PROBE] hello")
		end
	end,
}

return ret
```

Uwaga: `g_tfliveProbeHello` to zmienna globalna (wzorzec `g_moveItFeedback` z moda `move_it`). Jeśli kompilator Teal w grze odrzuci niezadeklarowaną globalną, dodaj na początku pliku `global g_tfliveProbeHello : boolean`.

- [ ] **Step 6: Skopiuj mod do katalogu modów użytkownika (macOS)**

```bash
D=$(ls -d ~/Library/Application\ Support/Steam/userdata/*/3493540/local | head -1)
rm -rf "$D/mods/tflive_probe" && cp -R spike/tflive_probe "$D/mods/tflive_probe"
ls "$D/mods/tflive_probe"
```

Expected: `content  mod.json  strings.json`

- [ ] **Step 7: Sprawdź w grze (ręcznie, użytkownik)**

1. Uruchom grę i otwórz menu modów. Zanotuj, czy „tflive_probe” jest na liście.
2. Jeśli **nie ma**, przenieś mod do katalogu instalacji gry i powtórz:
   ```bash
D=$(ls -d ~/Library/Application\ Support/Steam/userdata/*/3493540/local | head -1)
   G=~/Library/Application\ Support/Steam/steamapps/common/Transport\ Fever\ 3
   rm -rf "$D/mods/tflive_probe"; cp -R spike/tflive_probe "$G/mods/tflive_probe"
   ```
3. Włącz mod, wczytaj **kopię** dowolnego zapisu gry (np. `autosave_Nowa gra2_…`), poczekaj 10 s i wyjdź do menu.
4. Sprawdź log:
   ```bash
D=$(ls -d ~/Library/Application\ Support/Steam/userdata/*/3493540/local | head -1)
   grep -n "TFLIVE-PROBE" "$D/crash_dump/stdout.txt" | tail -5
   ```
   Expected: `[TFLIVE-PROBE] hello`. Jeśli zamiast tego w logu jest błąd kompilacji Teal, popraw skrypt według komunikatu i powtórz.
5. Jeśli mod działa w zapisie gry, ale `hello` się nie pojawia, sprawdź `grep -n "tflive_probe" "$D/crash_dump/stdout.txt"`. Skrypt mógł nie zostać dodany do istniejącego zapisu. Spróbuj wtedy nowej gry i zanotuj wynik (ważne dla planu 2: czy skrypt dodaje się do istniejących zapisów, pole `addedToExistingSavegame`).

- [ ] **Step 8: Commit**

```bash
git add spike/
git commit -m "spike: szkielet modu tflive_probe (do wyrzucenia)"
```

---

### Task 2: Sondy P1–P10

**Files:**
- Modify: `spike/tflive_probe/content/tflive_probe/tflive_probe.script.tl` (pełna zawartość poniżej)

**Interfaces:**
- Consumes: mod z Task 1.
- Produces: linie w logu w formacie `[TFLIVE-PROBE] <id> <klucz>=<wartość> ...`, które Task 3 przepisuje do dokumentu ustaleń.

Sondy:

| Id | Co sprawdza | Kiedy |
|---|---|---|
| P1 | dostępność `io`, `os`, `require`, `_VERSION`, `os.getenv` | raz |
| P2 | zapis pliku: ścieżka względna i bezwzględne kandydatki | raz |
| P3 | koszt zapisu 300 KB ×10 | raz |
| P4 | liczby encji i czas pełnego zebrania pojazdów | co 10 s |
| P5 | księga: `calculateBalance` dla firmy i linii, `getFirstIncomeTime` | raz |
| P6 | najdłużej czekający towar przy fabryce i przystanku | raz |
| P7 | części pojazdu: `purchaseTime`, `maintenanceState`, żywotność modelu | raz |
| P8 | stan skryptu gry: `saveId` przetrwa zapis i wczytanie | raz + każde wczytanie |
| P9 | `dt` i `GAME_SPEED` w pauzie | co 10 s |
| P10 | zapis przez dowiązanie (symlink/junction) | przy każdym P2 (ten sam plik) |

- [ ] **Step 1: Zastąp `tflive_probe.script.tl` pełną wersją**

```lua
-- KOD DO WYRZUCENIA (spike, plan 0). Nie kopiować do mod/tflive.

local P <const> = "[TFLIVE-PROBE] "

local function log(id : string, msg : string)
	pcall(function() debugPrint(P .. id .. " " .. msg) end)
end

local function probe(id : string, fn : function())
	local ok, err = pcall(fn)
	if not ok then
		log(id, "ERROR=" .. tostring(err))
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
	log("P1", "version=" .. tostring(_VERSION)
		.. " io=" .. type(io)
		.. " io.open=" .. type(io and io.open)
		.. " os=" .. type(os)
		.. " os.getenv=" .. type(os and os.getenv)
		.. " os.rename=" .. type(os and os.rename)
		.. " os.remove=" .. type(os and os.remove)
		.. " require=" .. type(require))
	if os and os.getenv then
		log("P1", "HOME=" .. tostring(os.getenv("HOME"))
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
	log("P2", "label=" .. label .. " path=" .. path .. " ok=" .. tostring(ok and res) .. (ok and "" or (" err=" .. tostring(res))))
	return ok and res
end

local function p2()
	if not io or not io.open then
		log("P2", "SKIP io.open niedostępne")
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
		log("P3", "SKIP")
		return
	end
	local chunk = string.rep("x", 300 * 1024)
	local t0 = nowClock()
	for i = 1, 10 do
		local f = io.open("tflive_probe_bulk.txt", "w")
		if f then
			f:write(chunk)
			f:write("\n")
			f:close()
		end
	end
	log("P3", "writes=10 sizeKB=300 totalSec=" .. string.format("%.4f", nowClock() - t0))
end

-- P4: liczby encji i koszt zebrania pojazdów
local function p4()
	local player = api.engine.util.getPlayer()
	local t0 = nowClock()
	local lines = api.engine.system.lineSystem.getLinesForPlayer(player)
	local vehicles = api.engine.util.getVehicles()
	local industries = api.engine.getEntitiesWithComponent(api.type.ComponentType.INDUSTRY)
	local towns = api.engine.getEntitiesWithComponent(api.type.ComponentType.TOWN)
	local stationGroups = api.engine.getEntitiesWithComponent(api.type.ComponentType.STATION_GROUP)
	local t1 = nowClock()
	local loaded = 0
	for _, v in ipairs(vehicles) do
		local tv = api.engine.getComponent(v, api.type.ComponentType.TRANSPORT_VEHICLE) as Engine.Component.TransportVehicle
		if tv then
			loaded = loaded + 1
			local _s = tv.state
			local _l = tv.line
			local _np = tv.noPath
			local _d = tv.daysAtTerminal
		end
		local _n = api.engine.util.getEntityName(v)
	end
	local t2 = nowClock()
	log("P4", "lines=" .. #lines .. " vehicles=" .. #vehicles .. " industries=" .. #industries
		.. " towns=" .. #towns .. " stationGroups=" .. #stationGroups
		.. " listSec=" .. string.format("%.4f", t1 - t0)
		.. " vehicleDetailSec=" .. string.format("%.4f", t2 - t1)
		.. " vehiclesRead=" .. loaded)
end

-- P5: księga finansowa
local function p5()
	local player = api.engine.util.getPlayer()
	local now = gameTimeNow()
	local gt = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_TIME) as Engine.Component.GameTime
	log("P5", "gameTime=" .. tostring(now) .. " timeOfDaySec=" .. tostring(gt.timeOfDaySec))
	debugPrint(gt.dates)
	log("P5", "balance=" .. tostring(api.engine.util.getPlayersBalance(player))
		.. " firstIncomeTime=" .. tostring(api.engine.util.getFirstIncomeTime(player))
		.. " lastIncomeTime=" .. tostring(api.engine.util.getLastIncomeTime(player)))
	local acc = api.engine.getComponent(player, api.type.ComponentType.ACCOUNT) as Engine.Component.Account
	log("P5", "playerAccount balance=" .. tostring(acc and acc.balance) .. " loan=" .. tostring(acc and acc.loan))
	local first = api.engine.util.getFirstIncomeTime(player)
	log("P5", "playerAll(first..now)=" .. tostring(api.engine.util.calculateBalance({player}, first, now, false))
		.. " playerOps(first..now)=" .. tostring(api.engine.util.calculateBalance({player}, first, now, true)))
	local lines = api.engine.system.lineSystem.getLinesForPlayer(player)
	if #lines == 0 then
		log("P5", "lines=0 SKIP line ledger")
		return
	end
	local line = lines[1]
	local lineAcc = api.engine.getComponent(line, api.type.ComponentType.ACCOUNT)
	log("P5", "line=" .. tostring(line) .. " name=" .. tostring(api.engine.util.getEntityName(line))
		.. " hasAccount=" .. tostring(lineAcc ~= nil)
		.. " lineAll(first..now)=" .. tostring(api.engine.util.calculateBalance({line}, first, now, false))
		.. " lineOps(first..now)=" .. tostring(api.engine.util.calculateBalance({line}, first, now, true)))
	-- 12 punktów: bilans operacyjny linii w 12 równych odcinkach od first do now
	local step = math.floor((now - first) / 12)
	if step > 0 then
		local parts : {string} = {}
		for i = 0, 11 do
			local a = first + i * step
			table.insert(parts, tostring(api.engine.util.calculateBalance({line}, a, a + step, true)))
		end
		log("P5", "lineOpsBuckets=" .. table.concat(parts, ","))
	end
	local t0 = nowClock()
	for _, l in ipairs(lines) do
		api.engine.util.calculateBalance({l}, first, now, true)
	end
	log("P5", "allLinesLedgerSec=" .. string.format("%.4f", nowClock() - t0) .. " lines=" .. #lines)
end

-- P6: najdłużej czekający towar
local function p6()
	local now = gameTimeNow()
	local industries = api.engine.getEntitiesWithComponent(api.type.ComponentType.INDUSTRY)
	if #industries == 0 then
		log("P6", "industries=0 SKIP")
		return
	end
	local ind = industries[1]
	local indComp = api.engine.getComponent(ind, api.type.ComponentType.INDUSTRY) as Engine.Component.Industry
	log("P6", "industry=" .. tostring(ind) .. " name=" .. tostring(api.engine.util.getEntityName(ind))
		.. " level=" .. tostring(indComp.level) .. " maxLevel=" .. tostring(indComp.maxLevel)
		.. " closureTimeStamp=" .. tostring(indComp.closureTimeStamp)
		.. " stockList=" .. tostring(indComp.stockList))
	local sl = api.engine.getComponent(indComp.stockList, api.type.ComponentType.STOCK_LIST)
	debugPrint(sl)
	for stockId = 0, 3 do
		local ok, cnt = pcall(function() : integer
			return api.engine.system.simEntityAtStockSystem.getStockCount(indComp.stockList, stockId)
		end)
		local ok2, longest = pcall(function() : Engine.Entity
			return api.engine.system.simEntityAtStockSystem.getStockSimEntity(indComp.stockList, stockId)
		end)
		local startTime = "nil"
		if ok2 and longest and longest > 0 then
			local sc = api.engine.getComponent(longest, api.type.ComponentType.SIM_CARGO) as Engine.Component.SimCargo
			startTime = sc and tostring(sc.startTime) or "noSimCargo"
		end
		log("P6", "stock=" .. stockId .. " count=" .. tostring(ok and cnt) .. " longest=" .. tostring(ok2 and longest)
			.. " startTime=" .. startTime .. " now=" .. tostring(now))
	end
	local util = api.engine.util as any
	local okInfo, info = pcall(function() : any return util.getIndustryProductivityInfo(ind) end)
	if okInfo then debugPrint(info) end
end

-- P7: części pojazdu
local function p7()
	local vehicles = api.engine.util.getVehicles()
	if #vehicles == 0 then
		log("P7", "vehicles=0 SKIP")
		return
	end
	local v = vehicles[1]
	local tv = api.engine.getComponent(v, api.type.ComponentType.TRANSPORT_VEHICLE) as Engine.Component.TransportVehicle
	log("P7", "vehicle=" .. tostring(v) .. " state=" .. tostring(tv.state) .. " line=" .. tostring(tv.line)
		.. " userStopped=" .. tostring(tv.userStopped) .. " noPath=" .. tostring(tv.noPath)
		.. " daysAtTerminal=" .. tostring(tv.daysAtTerminal) .. " daysInDepot=" .. tostring(tv.daysInDepot)
		.. " parts=" .. #tv.transportVehicleConfig.vehicles
		.. " maintenanceStateUtil=" .. tostring(api.engine.util.getVehicleMaintenanceState(v)))
	local part = tv.transportVehicleConfig.vehicles[1]
	log("P7", "part1 purchaseTime=" .. tostring(part.purchaseTime) .. " maintenanceState=" .. tostring(part.maintenanceState))
	debugPrint(part.part)
	local okModel, model = pcall(function() : any
		local p = part.part as any
		return api.res.modelRep.get(p.modelId)
	end)
	if okModel and model then
		local m = model as any
		log("P7", "lifespan=" .. tostring(m.metadata and m.metadata.maintenance and m.metadata.maintenance.lifespan))
	else
		log("P7", "modelLookup ERROR=" .. tostring(model))
	end
	local okProb, problems = pcall(function() : any return api.engine.util.getVehicleProblems() end)
	if okProb then debugPrint(problems) end
	local okIss, issues = pcall(function() : any return api.engine.util.getLinesIssues(api.engine.util.getPlayer(), true) end)
	if okIss then debugPrint(issues) end
end

-- P8: stan skryptu gry (saveId)
local function p8(state : GameScriptState<table>)
	local s = state:get() as {string : any}
	if s and s.saveId then
		log("P8", "existing saveId=" .. tostring(s.saveId) .. " lastSeenGameTime=" .. tostring(s.lastSeenGameTime))
	else
		math.randomseed(math.floor(nowClock() * 1000000) + gameTimeNow())
		local id = string.format("%08x%08x", math.random(0, 0x7fffffff), math.random(0, 0x7fffffff))
		state:set({ saveId = id, lastSeenGameTime = gameTimeNow() })
		log("P8", "new saveId=" .. id)
	end
end

-- P9: pauza
local function p9(dt : number)
	local speed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED)
	log("P9", "dt=" .. tostring(dt) .. " gameTime=" .. tostring(gameTimeNow()) .. " clock=" .. string.format("%.2f", nowClock()))
	debugPrint(speed)
end

local onceDone = false
local lastPeriodic = -1000.0

local ret : GameScript<table> = {
	update = function(_userParams : table, state : GameScriptState<table>, dt : number) : any
		if not onceDone then
			onceDone = true
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
				local s = state:get() as {string : any}
				if s and s.saveId then
					state:set({ saveId = s.saveId, lastSeenGameTime = gameTimeNow() })
				end
			end)
		end
	end,
}

return ret
```

Uwaga do typów Teal: jeśli kompilator odrzuci którąś konstrukcję (np. `as any`, `as {string : any}` albo porównanie `longest > 0` dla `Engine.Entity`), zastąp ją według komunikatu w logu (np. `local x = y as table`). Każda poprawka ma zachować `pcall` wokół sondy. Zanotuj w dokumencie ustaleń, jakie konstrukcje Teal gra przyjmuje, bo to ważne dla planu 2.

- [ ] **Step 2: Zainstaluj ponownie (do katalogu, który zadziałał w Task 1)**

```bash
D=$(ls -d ~/Library/Application\ Support/Steam/userdata/*/3493540/local | head -1)
rm -rf "$D/mods/tflive_probe" && cp -R spike/tflive_probe "$D/mods/tflive_probe"
mkdir -p ~/tflive_exchange   # zwykły katalog dla sondy P2 (home_exchange)
```

(Jeśli w Task 1 zadziałał katalog instalacji gry, użyj `$G/mods/` zamiast `$D/mods/`.)

- [ ] **Step 3: Uruchomienie w grze (ręcznie, użytkownik)**

1. Wczytaj **kopię** zapisu z kilkoma liniami, pojazdami i obsługiwaną fabryką.
2. Graj 60 s na normalnej prędkości, potem zapauzuj na 30 s, potem 30 s na najwyższej prędkości.
3. Zapisz grę jako `tflive_probe_test`, wyjdź do menu, wczytaj `tflive_probe_test` i graj 20 s.
4. Wyjdź z gry.

- [ ] **Step 4: Zbierz wyniki**

```bash
D=$(ls -d ~/Library/Application\ Support/Steam/userdata/*/3493540/local | head -1)
grep -n "TFLIVE-PROBE" "$D/crash_dump/stdout.txt" > spike/probe-log-macos.txt
wc -l spike/probe-log-macos.txt
grep -nA40 "TFLIVE-PROBE\] P5 gameTime" "$D/crash_dump/stdout.txt" | head -80 > spike/probe-dump-macos.txt
G=~/Library/Application\ Support/Steam/steamapps/common/Transport\ Fever\ 3
find "$G" "$D" ~ -maxdepth 2 -name 'tflive_probe_*.txt' 2>/dev/null
ls -la ~/tflive_exchange 2>/dev/null
```

Expected: linie P1–P9 w `probe-log-macos.txt`. Polecenie `find` pokaże, dokąd trafiła ścieżka względna z P2.

Zrzuty `debugPrint(tabela)` nie mają prefiksu, dlatego Step 4 zapisuje dodatkowo 40 linii po P5 do `probe-dump-macos.txt`. Jeśli zrzuty P6/P7 są dalej w logu, dopisz je ręcznie, otwierając `stdout.txt` w okolicy odpowiednich linii `[TFLIVE-PROBE]`.

- [ ] **Step 5: Usuń pliki testowe z P2/P3**

```bash
D=$(ls -d ~/Library/Application\ Support/Steam/userdata/*/3493540/local | head -1)
find "$G" "$D" ~ -maxdepth 2 -name 'tflive_probe_*.txt' -print -delete 2>/dev/null
```

- [ ] **Step 6: Commit**

```bash
git add spike/
git commit -m "spike: sondy P1-P10 i log z macOS"
```

---

### Task 3: Dowiązanie do RAM-dysku (P10, macOS)

**Files:**
- Create: `spike/ramdisk-macos.sh`

**Interfaces:**
- Consumes: wynik P2 z Task 2. Wymaga, żeby którakolwiek ścieżka `*_exchange` zadziałała (np. `~/tflive_exchange`).
- Produces: odpowiedź, czy zapis gry przez symlink trafia na RAM-dysk.

Jeśli w Task 2 `io.open` było niedostępne (`io=nil`), pomiń ten Task i zanotuj „nie dotyczy” w ustaleniach.

- [ ] **Step 1: Utwórz `spike/ramdisk-macos.sh`**

```bash
D=$(ls -d ~/Library/Application\ Support/Steam/userdata/*/3493540/local | head -1)
#!/usr/bin/env bash
# KOD DO WYRZUCENIA. Tworzy 64 MB RAM-dysk i podmienia ~/tflive_exchange na symlink.
set -euo pipefail
TARGET="${1:-$HOME/tflive_exchange}"
SECTORS=$((64 * 1024 * 1024 / 512))
DEV=$(hdiutil attach -nomount "ram://$SECTORS" | awk '{print $1}')
diskutil erasevolume APFS TFLiveRAM "$DEV" >/dev/null
MNT="/Volumes/TFLiveRAM"
mkdir -p "$MNT/exchange"
if [ -e "$TARGET" ] && [ ! -L "$TARGET" ]; then mv "$TARGET" "$TARGET.bak.$$"; fi
ln -sfn "$MNT/exchange" "$TARGET"
echo "DEV=$DEV MNT=$MNT TARGET=$TARGET -> $(readlink "$TARGET")"
```

- [ ] **Step 2: Uruchom**

```bash
chmod +x spike/ramdisk-macos.sh && ./spike/ramdisk-macos.sh
```

Expected: `DEV=/dev/diskN MNT=/Volumes/TFLiveRAM TARGET=…/tflive_exchange -> /Volumes/TFLiveRAM/exchange`. Polecenie nie powinno pytać o hasło. Jeśli zapyta, zanotuj to, bo spec §7a zakłada „bez sudo”.

- [ ] **Step 3: W grze (użytkownik):** wczytaj `tflive_probe_test` na 15 s, wyjdź.

- [ ] **Step 4: Sprawdź**

```bash
D=$(ls -d ~/Library/Application\ Support/Steam/userdata/*/3493540/local | head -1)
ls -la /Volumes/TFLiveRAM/exchange/
grep "P2 label=home_exchange" "$D/crash_dump/stdout.txt" | tail -1
```

Expected: `probe.txt` na RAM-dysku i `ok=true`.

- [ ] **Step 5: Posprzątaj**

```bash
rm -f ~/tflive_exchange && hdiutil detach /Volumes/TFLiveRAM
```

- [ ] **Step 6: Commit**

```bash
git add spike/ramdisk-macos.sh
git commit -m "spike: test zapisu gry przez symlink na RAM-dysk (macOS)"
```

---

### Task 4: Pomiar na dużej mapie

**Files:**
- Modify: `spike/probe-log-macos.txt` (dopisanie wyników)

**Interfaces:**
- Consumes: mod z Task 2.
- Produces: czasy P4 i P5 dla dużej rozgrywki, które dają realne interwały do planu 2.

- [ ] **Step 1 (użytkownik):** wczytaj największy dostępny zapis gry (najlepiej ≥ 500 pojazdów). Jeśli takiego nie ma, zanotuj największą dostępną liczbę pojazdów. Graj 60 s, wyjdź.

- [ ] **Step 2: Zbierz**

```bash
D=$(ls -d ~/Library/Application\ Support/Steam/userdata/*/3493540/local | head -1)
grep -n "TFLIVE-PROBE\] P4\|TFLIVE-PROBE\] P5 allLines" "$D/crash_dump/stdout.txt" | tail -10 >> spike/probe-log-macos.txt
tail -10 spike/probe-log-macos.txt
```

Expected: `vehicles=<N> … vehicleDetailSec=<t>`. Próg akceptacji: `vehicleDetailSec` < 0,010 s na 1000 pojazdów. Powyżej trzeba zbierać partiami (spec §3).

- [ ] **Step 3: Commit**

```bash
git add spike/probe-log-macos.txt
git commit -m "spike: pomiar wydajności na dużej mapie"
```

---

### Task 5: Windows (użytkownik według checklisty)

**Files:**
- Create: `spike/WINDOWS-CHECKLIST.md`
- Create: `spike/probe-log-windows.txt` (wynik od użytkownika)

**Interfaces:**
- Consumes: mod z Task 2 (bez zmian).
- Produces: wyniki P1–P10 z Windows.

- [ ] **Step 1: Utwórz `spike/WINDOWS-CHECKLIST.md`**

```markdown
# Krok 0 na Windows — checklista

1. Skopiuj folder `spike\tflive_probe` do
   `C:\Program Files (x86)\Steam\userdata\<steamId>\3493540\local\mods\`
   (`<steamId>` to jedyny lub właściwy folder liczbowy w `userdata`). Jeśli Steam jest gdzie indziej, znajdź folder `3493540` w `userdata`.
2. Uruchom grę. Sprawdź, czy mod jest na liście. Jeśli nie, skopiuj go do `...\steamapps\common\Transport Fever 3\mods\`.
3. Włącz mod, wczytaj kopię zapisu, graj 60 s, pauza 30 s, zapisz jako `tflive_probe_test`, wczytaj ponownie, graj 20 s, wyjdź.
4. W PowerShell:
   ```powershell
   $D = Get-ChildItem "C:\Program Files (x86)\Steam\userdata\*\3493540\local" | Select-Object -First 1
   Select-String -Path "$($D.FullName)\crash_dump\stdout.txt" -Pattern "TFLIVE-PROBE" | Out-File probe-log-windows.txt
   Get-ChildItem -Path "C:\Program Files (x86)\Steam\steamapps\common\Transport Fever 3", $D.FullName, $env:USERPROFILE -Filter "tflive_probe_*.txt" -Recurse -Depth 1 -ErrorAction SilentlyContinue | Select-Object FullName
   ```
5. Test junction (tylko jeśli w P2 `userprofile_exchange ok=true`):
   ```powershell
   Remove-Item "$env:USERPROFILE\tflive_exchange" -Recurse -Force
   New-Item -ItemType Directory "$env:TEMP\tflive_ram_sim" | Out-Null
   cmd /c mklink /J "%USERPROFILE%\tflive_exchange" "%TEMP%\tflive_ram_sim"
   ```
   Wczytaj zapis na 15 s, wyjdź, sprawdź `dir %TEMP%\tflive_ram_sim`. Powinien zawierać `probe.txt`.
6. Przekaż plik `probe-log-windows.txt` i wynik kroku 5.
7. Usuń pliki `tflive_probe_*.txt`, junction (`rmdir "%USERPROFILE%\tflive_exchange"`) i mod.
```

Uwaga: krok 5 testuje junction na zwykły katalog (`%TEMP%`), nie na RAM-dysk. Mechanizm dowiązania jest taki sam, a RAM-dysk na Windows to zewnętrzne narzędzie, które użytkownik konfiguruje sam (spec §7a).

- [ ] **Step 2: Commit checklisty**

```bash
git add spike/WINDOWS-CHECKLIST.md
git commit -m "spike: checklista kroku 0 dla Windows"
```

- [ ] **Step 3:** Poczekaj na `probe-log-windows.txt` od użytkownika, zapisz go w `spike/` i zrób commit. Jeśli użytkownik nie ma teraz dostępu do Windows, zanotuj w ustaleniach „Windows: oczekuje” i przejdź dalej. Plan 2 musi wtedy zawierać ten test jako warunek ukończenia.

---

### Task 6: Dokument ustaleń i decyzje

**Files:**
- Create: `docs/superpowers/spikes/2026-10-01-krok0-wyniki.md`
- Modify: `docs/superpowers/specs/2026-10-01-tflive-dashboard-design.md` (tylko miejsca, które wyniki zmieniają)
- Modify: `CONTEXT.md` (tylko jeśli wyniki zmieniają definicję pojęcia, np. Początek linii)

**Interfaces:**
- Consumes: `spike/probe-log-*.txt`, `spike/probe-dump-macos.txt`.
- Produces: wiążące odpowiedzi dla planów 1–3. Plan 1 korzysta z: kanału (plik/log), lokalizacji katalogu wymiany, listy pól dostępnych i niedostępnych. Plan 2 korzysta z: konstrukcji Teal, kosztu zbierania, mechanizmu `saveId`, jednostek `gameTime`.

- [ ] **Step 1: Utwórz dokument ustaleń** (wypełnij każdą komórkę wartością z logu, nie zostawiaj pustych. Jeśli czegoś nie dało się ustalić, wpisz „nie ustalono” i powód)

```markdown
# Krok 0 — wyniki testu w grze

Data: <data> · Wersja gry: <z logu, linia z numerem wersji> · Platformy: macOS <tak/nie>, Windows <tak/nie/oczekuje>

## Odpowiedzi

| # | Pytanie | macOS | Windows | Źródło (linia logu) |
|---|---|---|---|---|
| 1 | Gdzie mod jest wykrywany (`userdata/.../local/mods` czy `<gra>/mods`) | | | Task 1 |
| 2 | Czy skrypt gry dodaje się do istniejącego zapisu | | | Task 1 Step 7.5 |
| 3 | `io` / `io.open` / `os.getenv` / `os.rename` dostępne | | | P1 |
| 4 | Dokąd trafia ścieżka względna `io.open` | | | P2 + find |
| 5 | Które ścieżki bezwzględne są zapisywalne | | | P2 |
| 6 | Koszt zapisu 300 KB | | | P3 |
| 7 | Dowiązanie (symlink/junction) działa dla zapisu z gry | | | Task 3 / Task 5 |
| 8 | `hdiutil` bez sudo | | n/d | Task 3 |
| 9 | Liczby encji i czasy P4 (mała i duża mapa) | | | P4 |
| 10 | Jednostka `gameTime` (ms/s; ile na dzień i miesiąc gry) | | | P5 + `dates` |
| 11 | `calculateBalance` działa dla linii (`hasAccount`) i z `maintenanceIncomeOnly` | | | P5 |
| 12 | Jak daleko wstecz sięga księga (`firstIncomeTime`) | | | P5 |
| 13 | Czas księgi dla wszystkich linii | | | P5 |
| 14 | `getStockSimEntity` + `SimCargo.startTime` działa | | | P6 |
| 15 | `purchaseTime`, `maintenanceState`, `lifespan` dostępne | | | P7 |
| 16 | `getVehicleProblems` / `getLinesIssues`: struktura | | | P7 dump |
| 17 | `saveId` przetrwał zapis i wczytanie | | | P8 |
| 18 | `update` w pauzie: wywoływany? `dt`? | | | P9 |
| 19 | Konstrukcje Teal odrzucone przez grę | | | log błędów |

## Decyzje dla planów 1–3

- Kanał wymiany: <plik | log>, bo <powód z #3–#5>.
- Katalog wymiany: <ścieżka per system>.
- RAM-dysk: <działa/nie działa> (#7, #8).
- Interwały sekcji: <bez zmian względem spec §7 | zmienione na …>, bo <#9>.
- Zbieranie pojazdów partiami: <tak/nie>, bo <#9>.
- Pola niedostępne (w snapshotcie zawsze `null`): <lista>.
- `saveId`: <stan skryptu gry | fallback nazwa mapy>, bo <#17>.
- Detekcja pauzy: <dt == 0 | GAME_SPEED | …>, bo <#18>.
- Uzupełnienie historii: <wykonalne/niewykonalne>, zasięg <#12>, koszt <#13>.
```

- [ ] **Step 2: Zaktualizuj spec i `CONTEXT.md`**

Popraw tylko te miejsca, które wyniki zmieniają, np.:
- kanał „log” zamiast „plik”;
- nowe interwały w §7;
- pola zawsze `null` w §4;
- reguły alertów, których nie da się policzyć, przenoszone do „poza zakresem v1” w §5.

Każdą zmianę w specyfikacji oznacz przypisem „(krok 0: #<nr pytania>)”.

- [ ] **Step 3: Commit**

```bash
git add docs/ CONTEXT.md
git commit -m "docs: wyniki kroku 0 i wynikające z nich zmiany specyfikacji"
```

- [ ] **Step 4: Usuń mod z gry**

```bash
D=$(ls -d ~/Library/Application\ Support/Steam/userdata/*/3493540/local | head -1)
rm -rf "$D/mods/tflive_probe"
G=~/Library/Application\ Support/Steam/steamapps/common/Transport\ Fever\ 3
rm -rf "$G/mods/tflive_probe"
```

Katalog `spike/` zostaje w repozytorium jako zapis eksperymentu. Plan 2 nie importuje z niego kodu.
