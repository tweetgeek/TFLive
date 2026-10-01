# Mod tylko zbiera surowe dane, cała logika ocen jest w serwerze

Mod w Lua odczytuje dane z `api.engine` i zapisuje je bez interpretacji. Wartości pochodne (Wiek i Stan pojazdu, Rezerwa, Obłożenie linii) oraz wszystkie reguły alertów żyją w serwerze Node jako czyste funkcje. Dzięki temu logikę da się testować jednostkowo, zmieniać progi bez restartu gry i nie obciążać pętli symulacji. Przeniesienie reguł do Lua, choć kuszące jako „mniej danych do przesłania”, utrudniłoby testy i zwiększyło ryzyko przycięć gry.
