# Krok 0 — wyniki testu w grze

Data: 2026-10-01 · Platformy: macOS tak (2 rundy), Windows oczekuje (checklista: `spike/WINDOWS-CHECKLIST.md`) · Mapa testowa: 14 linii, 29 pojazdów, 20 fabryk, 10 miast, 46 przystanków.
Logi: `spike/probe-log-macos.txt` (runda 1), `spike/probe-log-macos-r2.txt` (runda 2).

## Odpowiedzi

| # | Pytanie | macOS | Windows | Źródło |
|---|---|---|---|---|
| 1 | Gdzie mod jest wykrywany | `userdata/<steamId>/3493540/local/mods/` | oczekuje | widoczny na liście modów |
| 2 | Skrypt gry dodaje się do istniejącego zapisu | tak (zapis `Nowa gra22` sprzed instalacji modu) | oczekuje | r1, P0 po wczytaniu |
| 3 | `io` / `os` | **`io=nil`** w wątkach symulacji i w GUI; Lua 5.2; `os.getenv`, `os.clock`, `os.time` są; `os.rename`/`os.remove` brak; `package.loadlib`, `package.cpath`, `dofile`, `loadstring`, `collectgarbage` brak; `load` i `debug` są | oczekuje | r1 P1, r2 P11/P12 |
| 4 | Dokąd trafia ścieżka względna `io.open` | nie dotyczy, brak `io` | — | r1 P2 |
| 5 | Zapisywalne ścieżki bezwzględne | nie dotyczy | — | r1 P2 |
| 6 | Koszt zapisu 300 KB | nie dotyczy; zamiast tego `debugPrint` 100 KB = 0,77 ms, 10 KB = 0,07 ms | oczekuje | r2 P15 |
| 7 | Dowiązanie dla zapisu z gry | nie dotyczy (brak zapisu plików). Wariant „symlink `crash_dump` na RAM-dysk” odrzucony przez użytkownika | — | decyzja użytkownika |
| 8 | `hdiutil` bez sudo | nie testowano (nie dotyczy) | n/d | — |
| 9 | Liczby encji i czasy | lista encji < 0,5 ms; odczyt 29 pojazdów 0,0–5,2 ms; księga 14 linii 0,1 ms. **Duża mapa: nie ustalono** (brak zapisu z setkami pojazdów) | oczekuje | r1 P4/P5 |
| 10 | Jednostka `gameTime` | **ms**. `dt` = 0,2 s/tick, `gameTime` +200 na tick. **1 dzień gry = 4000 ms.** `GameTime.dates`: lista `{t, Date}` po jednym wpisie na dzień (2527 wpisów; `t=0` → 1900-01-01) | oczekuje | r1 P9, r2 P14 |
| 11 | `calculateBalance` dla linii, `maintenanceIncomeOnly` | działa dla firmy, linii i pojazdów. Bilans linii jest zbliżony do sumy bilansów jej obecnych pojazdów (różnica do 11%, np. linia 53369: −56 063 vs −63 013, prawdopodobnie pojazdy zmieniające linię); w r1 pierwsza linia miała bilans 0 (nie sumować linii i pojazdów razem, bo liczy się podwójnie). Firma: `ops` (14,4 mln) ≠ `all` (1,16 mln) | oczekuje | r1 P5, r2 P13 |
| 12 | Zasięg księgi wstecz | `getFirstIncomeTime = 0` wskazuje najwcześniejszy wpis, ale **nie zaobserwowano niezerowej wartości historycznej** (przedziały r1 dotyczyły linii z bilansem 0). **Nie ustalono**, czy księga przechowuje pełną historię | oczekuje | r1 P5 |
| 13 | Czas księgi dla wszystkich linii | 0,1 ms dla 14 wywołań na cały zakres. Uzupełnienie historii wymaga miesiące × linie wywołań; **koszt nie ustalony** | oczekuje | r1 P5 |
| 14 | `getStockSimEntity` + `SimCargo.startTime` | działa (`count=154`, `startTime` dostępny; brak towaru → `longest=-1`) | oczekuje | r1 P6 |
| 15 | `purchaseTime`, `maintenanceState`, `lifespan` | dostępne. `maintenanceState` 0..1 per część. **`lifespan` w sekundach gry**, ustalone z kodu UI gry (`lifespan * 1000` porównywane z `purchaseTime` w ms) i rachunku 29220 s × 1000 / 4000 ms = 7305 dni = 20 lat; bez potwierdzenia w runtime (sonda r2 P14 przerwała się na `Date`) | oczekuje | r1 P7, `gui/line_vehicle_mgmt/vehicle_util.tl` |
| 16 | `getVehicleProblems` / `getLinesIssues` | wywołania nie zgłosiły błędu; **struktura nie ustalona** (zrzut nie został zachowany przed nadpisaniem logu) | oczekuje | r1 P7 |
| 17 | `saveId` przez zapis i wczytanie | **tak**, `GameScriptState` przetrwał zapis i wczytanie | oczekuje | r1 P8 |
| 18 | `update` w pauzie | wywoływany; `dt = 0`, `gameTime` stoi | oczekuje | r1 P9 |
| 19 | Konstrukcje Teal | gra kompiluje Teal zgodny z `tl` 0.24.8 + definicjami z `api/tealdef`, `base/tealdef`. Globalne typy gry dostępne w definicjach (np. `Date`) **nie muszą istnieć w runtime** (`Date` = nil). Niezadeklarowane globalne odrzucane przez `tl check` | oczekuje | r2 P14 |

## Dodatkowe ustalenia (nieprzewidziane w planie)

- **Pula wątków symulacji.** `update` wywoływany jest z wielu wątków („Sim Pool 1…8”), każdy z **osobnym stanem Lua**. Zmienne modułu nie są wspólne, a moduł bywa ładowany ponownie w nowych stanach. Wspólny jest tylko `GameScriptState` (`state:get()`/`state:set()`). Każdy znacznik „raz” i każdy licznik czasu musi żyć w `GameScriptState`.
- **Duże zrzuty blokują symulację.** `debugPrint` tabeli z ~30 000 liniami zatrzymał symulację na ~6 s, co użytkownik zauważył jako klatkowanie pojazdów i słabą reakcję na zmianę prędkości. Zapisujemy wyłącznie jedną linię na sekcję, bez zrzutów tabel.
- **Ścieżki API.** Funkcje są w podprzestrzeniach: `api.engine.util.finance.*`, `api.engine.util.vehicle.*`, `api.engine.util.line.*`, `api.engine.util.industry.*`. Pojazdy linii: `api.engine.system.transportVehicleSystem.getLineVehicles(line)`.
- **Log gry** (`<userdata>/3493540/local/crash_dump/stdout.txt`) jest nadpisywany przy każdym starcie gry, a w trakcie sesji rośnie. Każda linia ma prefiks ok. 72 znaków (`[czas - MESSAGE - Sim Pool N - Main ]  `).
- Stan GUI (`guiUpdate`) działa w „Main Thread” i ma to samo ograniczone środowisko co symulacja.

## Decyzje dla planów 1–3

- **Kanał wymiany: log gry.** Mod wypisuje sekcje przez `debugPrint` jako pojedyncze linie w formacie ze spec §7. Serwer czyta `stdout.txt` przyrostowo, a tożsamość pliku rozpoznaje po linii `Startup session with id <uuid>`. Uzasadnienie: #3, #6.
- **Stan modu:** `GameScriptState` trafia do zapisu gry (#17), więc stan dzieli się na trwały (`saveId`) i sesyjny, z wykrywaniem nowej sesji przez przerwę w `lastEmitWall` (spec §3). Ustalenie z przeglądu końcowego.
- **Katalog wymiany i RAM-dysk: brak.** Log zostaje na SSD (decyzja użytkownika). ADR 0001 zastąpiony przez ADR 0003.
- **Budżet zapisu (domyślne interwały, w czasie rzeczywistym):** `meta`+`finance` co 10 s, `vehicles`/`lines`/`stops` co 60 s, `industries`/`towns` co 120 s, tylko gdy sekcja się zmieniła, nigdy w pauzie. Szacunek dla ok. 2000 pojazdów to ok. 10–35 MB/h (spec §7.5), do weryfikacji pomiarem. Wartość mierzona i pokazywana w UI.
- **Zbieranie pojazdów partiami:** tak, z ostrożności, bo #9 na dużej mapie jest nieustalone. Plan 2 zawiera pomiar na dużej mapie jako warunek ukończenia.
- **Pola niedostępne (zawsze `null`):** nie stwierdzono. **Nie ustalono** jednak źródeł dla: `departureLoads`, potrzeb, hałasu i zanieczyszczenia miast, `upgradeProgress`, `lastReceivedTime`, pojemności magazynu wyjściowego, `lastServedTime`, `gameSpeed`, `mapName`, `load`/`capacity` pojazdu, `color`/`mode` linii. Weryfikuje je plan 2.
- **Pusta rozgrywka (0 linii, 0 pojazdów):** nie testowano; przeniesione do planu 2.
- **`saveId`:** w `GameScriptState` (#17).
- **Detekcja pauzy:** `dt == 0` (#18).
- **Uzupełnienie historii:** wykonalność i koszt **nie ustalone** (#12, #13). Pomiar w planie 2 na dużej mapie; jeśli księga nie trzyma historii albo koszt jest zbyt wysoki, Uzupełnienie wypada z v1 (decyzja użytkownika). Wynik wysyłany partiami, jedna linia logu na partię.
- **Windows:** wszystkie odpowiedzi „oczekuje”. Do potwierdzenia przed ukończeniem planu 1: odczyt `stdout.txt` podczas gry, utworzenie nowego logu przy cyklicznym odczycie, opóźnienie zapisu (spec §8).

## Runda 3 (2026-10-01, macOS) — niewiadome planu 2

Log: `spike/probe-log-macos-r3.txt`. Mapa API: wnioski poniżej są wiążące dla planu 2.

| # | Pytanie | Wynik |
|---|---|---|
| 20 | Moduły modu | `ug_require "<modId>::/<modId>/plik.tl"` działa; `"/<modId>/…"` i `"::/<modId>/…"` nie |
| 21 | Długość dnia, pauza | `GAME_SPEED.millisPerDay` = 4000 niezależnie od prędkości; `speedup` = 1/4/0 (0 = pauza) |
| 22 | Koszty bieżące | `calcIncomeSince(t0, player) − ops12` (3 058 214) = −(VEHICLE + INFRASTRUCTURE + VEHICLE_MAINTENANCE); kategoria `OTHER` w filtrze zwraca przychody — nie używać |
| 23 | Inwestycje | `computeFinanceTable` daje tylko rok kalendarzowy → `inv12 = null` w v1 |
| 24 | Wynik miesięczny | `calculateBalance(ents, startMiesiąca, startNastępnego, true)` z granic z `GameTime.dates` (`day == 1`) — działa dla firmy i linii; historia linii sprzed 2 lat niezerowa → Uzupełnienie historii wykonalne; 14 linii × 25 mies. = 0,1 ms |
| 25 | Początek linii | `finance.getFirstIncomeTime(line)` działa (np. 4 748 250) |
| 26 | Pojazdy gracza | `getEntitiesWithComponent(TRANSPORT_VEHICLE, {requireOwnedByPlayer = player})` (29/29) |
| 27 | Ładunek pojazdu | `getVehicleSimEntitiesCount` zwraca **tabelę** — używać `getVehicleSimEntitiesCountForCargoType(v, cargoId)` dla `cargoId` z `config.capacities[cargoId+1] > 0` |
| 28 | Odjazdy | `tv.lineStopDepartures` = czas ostatniego odjazdu per przystanek (indeks = stopIndex+1), `tv.lastLineStopDeparture` |
| 29 | Enumy w runtime | liczby: `Carrier.ROAD=0, RAIL=1`, `TransportVehicleState.EN_ROUTE=1`, `LandUseType.RESIDENTIAL=0`, `StockListType.InputStock=0` — mapować przez `api.type["enum"]` |
| 30 | Miasta | ludność `getTownCapacityUsage(t)[RES+1].capacity`; potrzeby `townBuildingSystem.getCargoSupplyAndLimit(t, lu)` → `{[cargoId] = {supplied, limit}}`; emisje `getTownEmissionDB(t)` (hałas dB, zanieczyszczenie surowe) |
| 31 | Dzienniki (LOG_BOOK) | fabryki: `itemsProduced<cargo>`, `itemsDestroyed<cargo>` (inne klucze, np. `itemsLoaded`, `itemsConsumed<cargo>`, pojawiają się zapewne dopiero przy obsłudze — brak → `null`); linie: `itemsTransported<cargo>`, `itemsAtStop<n>_c<cargo>` |
| 32 | Oczekujący na przystanku | `util.cargo.getCargoQualityDataAtStationGroup(sg, cargo)` → `countTotal`, `countBad`, `isVeryBad`; **czasu oczekiwania nie da się odczytać** (`getLineStopSimEntities` puste dla pasażerów) → „Przeciążony przystanek” przedefiniowany na ocenę gry (decyzja użytkownika) |
| 33 | Zdarzenia | handleEvent dostaje wszystkie zdarzenia (np. `OnCargoLoaded`, `handleLegacy`), struktura `param` inna niż zakładana — w v1 nie używamy zdarzeń |
| 34 | Kolor i tryb linii | `COLOR.color` (x,y,z 0..1), `util.line.getLineTransportModesUnion(line)` |
