-- Granice miesięcy gry z kalendarza i stałej długości dnia (krok 0 #21). Czysty moduł.
local type Calendar = function(number) : (integer, integer, integer)

local record Months
	MONTH_CAP : integer
	index : function(integer, integer) : integer
	lastMonths : function(integer, integer, integer, Calendar) : {{integer}}
end

local months : Months = { MONTH_CAP = 1200 }

months.index = function(y : integer, m : integer) : integer
	return y * 12 + (m - 1)
end

months.lastMonths = function(now : integer, dayMs : integer, n : integer, cal : Calendar) : {{integer}}
	local out : {{integer}} = {}
	local y, m, d = cal(now)
	local from = math.floor(now / dayMs) * dayMs - (d - 1) * dayMs
	local to = now
	while #out < n do
		if from < 0 then from = 0 end
		table.insert(out, 1, { months.index(y, m), from, to })
		if from <= 0 then break end
		to = from
		local py, pm, pd = cal(from - 1)
		y, m = py, pm
		from = math.floor((from - 1) / dayMs) * dayMs - (pd - 1) * dayMs
	end
	return out
end

return months
