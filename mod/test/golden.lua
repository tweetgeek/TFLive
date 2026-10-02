-- Generuje mod/test/golden.log: linie dokładnie tak, jak emituje je mod (json + wire).
local json = M.load("json")
local wire = M.load("wire")
local N = json.NULL
local PREFIX = "[2026-10-02 10:00:00Z - MESSAGE  - Sim Pool 1       - Main           ]  "
local out = {}
local seq = 0
local SAVE, SESSION, GT = "0123456789abcdef", "fedcba9876543210", 10107800

local function emit(section, payload)
	seq = seq + 1
	out[#out + 1] = PREFIX .. wire.formatLine(SAVE, SESSION, seq, GT, section, 1, 1, json.encode(payload))
end
local function emitRows(section, rows, maxBytes)
	seq = seq + 1
	local enc = {}
	for i, r in ipairs(rows) do enc[i] = json.encode(r) end
	local parts = wire.chunkRows(enc, maxBytes or wire.MAX_LINE_BYTES)
	for i, p in ipairs(parts) do out[#out + 1] = PREFIX .. wire.formatLine(SAVE, SESSION, seq, GT, section, i, #parts, p) end
end

emit("meta", { date = { 1906, 12, 2 }, dayMs = 4000, paused = 0, speed = 1, map = "Firma Testowa", bytes = 2048, errors = {} })
emit("finance", { bal = 1155058, loan = 13554171, ops12 = 3947992, run12 = 3058214, inv12 = N,
	opsM = { { 22883, -227439 }, { 22884, 621063 }, { 22885, 5000 } } })
emitRows("lines", {
	{ 60555, "TC - Drewno", "ROAD", "#ffb266", { 49496, 60416 }, { 51559 }, 4748250, -81812, N,
		{ { 0, 20, 32, 9778000 } }, { { 22884, -1600 }, { 22885, 2168 } } },
	{ 55014, "Linia bez koloru", "RAIL", N, {}, {}, N, 1000, N, {}, {} },
})
local vehicles = {}
for i = 1, 80 do
	vehicles[i] = { 51000 + i, "Pojazd " .. i, (i % 3 == 0) and N or 60555, "ROAD", "EN_ROUTE", 0, (i == 7) and 1 or 0,
		5 + i, 10 + i, 20 + i, 40 + i, (i % 2 == 0) and N or 1500, { { "bus_a", 2241600, 29220, 0.57302629947662 } } }
end
emitRows("vehicles", vehicles, 4000)
emitRows("stops", { { 49496, "Dworzec Uxbridge", { { "passengers", 27, 3 } }, 0 }, { 60416, "Dworzec Preesall", { { "cargo", 15, 2 } }, 1 } })
emitRows("industries", {
	{ 61423, "Platforma wiertnicza", "oil_well", 5, 7, N, 0, {}, { { "crude", 154, 400 } }, N },
	{ 55069, "Rafineria", "oil_refinery", 1, 5, 10200000, 0, { { "crude", 0, N } }, { { "fuel", 3, 200 } }, 9000000 },
})
emitRows("towns", { { 30171, "Uxbridge", 214, 1, 64.923797607422, 1905.9814453125,
	{ { "COMMERCIAL", "food", 99, 0 }, { "INDUSTRIAL", "tools", 80, N } }, N } })
emit("backfill", { scope = "global", id = N, months = { { 22800, 100 }, { 22801, -50 } } })
emit("backfill", { scope = "line", id = 60555, months = { { 22884, -1600 } } })

-- Porównanie ze starą wersją (świeżość pliku)
local oldContent = nil
local oldFile = io.open(M.root .. "test/golden.log", "r")
if oldFile then
	oldContent = oldFile:read("*a")
	oldFile:close()
end
local newContent = table.concat(out, "\n") .. "\n"

local f = assert(io.open(M.root .. "test/golden.log", "w"))
f:write(newContent)
f:close()

test("golden: wygenerowano wszystkie sekcje", function()
	ok(#out >= 10, "linii: " .. #out)
end)

test("golden: golden.log aktualny", function()
	ok(oldContent == nil or oldContent == newContent, "golden.log był nieaktualny — wygenerowano nową wersję, zatwierdź ją (git add mod/test/golden.log)")
end)
