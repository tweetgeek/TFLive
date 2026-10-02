local months = M.load("months")
local DAY = 4000

-- Kalendarz testowy: t=0 → 1900-01-01, długość dnia DAY, kalendarz gregoriański.
local function cal(t)
	local days = math.floor(t / DAY)
	local y, m = 1900, 1
	local function dim(yy, mm)
		local d = ({ 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 })[mm]
		if mm == 2 and (yy % 4 == 0 and (yy % 100 ~= 0 or yy % 400 == 0)) then d = 29 end
		return d
	end
	while days >= dim(y, m) do
		days = days - dim(y, m)
		m = m + 1
		if m > 12 then m = 1; y = y + 1 end
	end
	return y, m, days + 1
end

test("months: index", function()
	eq(months.index(1906, 12), 1906 * 12 + 11)
end)

test("months: ostatnie 3 miesiące z granicami dni", function()
	local now = (31 + 28 + 10) * DAY + 1234 -- 1900-03-11
	local r = months.lastMonths(now, DAY, 3, cal)
	eq(r, {
		{ months.index(1900, 1), 0, 31 * DAY },
		{ months.index(1900, 2), 31 * DAY, 59 * DAY },
		{ months.index(1900, 3), 59 * DAY, now },
	})
end)

test("months: zatrzymuje się na początku gry", function()
	local now = 40 * DAY -- 1900-02-10
	local r = months.lastMonths(now, DAY, 12, cal)
	eq(#r, 2)
	eq(r[1], { months.index(1900, 1), 0, 31 * DAY })
end)

test("months: wszystkie miesiące od początku (backfill)", function()
	local now = 2526 * DAY -- 1906-12-02 (jak w kroku 0)
	local r = months.lastMonths(now, DAY, months.MONTH_CAP, cal)
	eq(#r, 7 * 12)
	eq(r[#r][1], months.index(1906, 12))
	eq(r[1][2], 0)
end)
