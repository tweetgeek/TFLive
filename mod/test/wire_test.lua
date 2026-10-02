local wire = M.load("wire")

test("wire: formatLine", function()
	eq(wire.formatLine("s1", "x9", 7, 10107800, "vehicles", 2, 3, "[[1]]"), "[TFLIVE] 1 s1 x9 7 10107800 vehicles 2/3 [[1]]")
end)

test("wire: chunkRows dzieli wg rozmiaru i zawsze zwraca ≥ 1 część", function()
	eq(wire.chunkRows({}, 100), { "[]" })
	eq(wire.chunkRows({ "[1]", "[2]" }, 100), { "[[1],[2]]" })
	local rows = {}
	for i = 1, 10 do rows[i] = string.rep("9", 20) end
	local parts = wire.chunkRows(rows, 50)
	ok(#parts == 5, "5 części, jest " .. #parts)
	for _, p in ipairs(parts) do ok(#p <= 50, "część ≤ 50 B: " .. #p) end
end)

test("wire: pojedynczy wiersz większy niż limit trafia do osobnej części", function()
	local parts = wire.chunkRows({ "[1]", string.rep("7", 80), "[2]" }, 50)
	eq(#parts, 3)
end)

test("wire: fingerprint stabilny i czuły na zmianę", function()
	eq(wire.fingerprint("abc"), wire.fingerprint("abc"))
	ok(wire.fingerprint("abc") ~= wire.fingerprint("abd"), "różne teksty → różne odciski")
	ok(wire.fingerprint(string.rep("x", 100000)) ~= nil, "duży tekst")
end)
