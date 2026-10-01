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
| 11 | `calculateBalance` dla linii, `maintenanceIncomeOnly` | działa dla firmy, linii i pojazdów. Bilans linii ≈ suma bilansów jej pojazdów (nie sumować linii i pojazdów razem, bo liczy się podwójnie). Firma: `ops` (14,4 mln) ≠ `all` (1,16 mln) | oczekuje | r1 P5, r2 P13 |
| 12 | Zasięg księgi wstecz | `getFirstIncomeTime = 0`, czyli od początku gry | oczekuje | r1 P5 |
| 13 | Czas księgi dla wszystkich linii | 0,1 ms dla 14 linii | oczekuje | r1 P5 |
| 14 | `getStockSimEntity` + `SimCargo.startTime` | działa (`count=154`, `startTime` dostępny; brak towaru → `longest=-1`) | oczekuje | r1 P6 |
| 15 | `purchaseTime`, `maintenanceState`, `lifespan` | dostępne. `maintenanceState` 0..1 per część. **`lifespan` w sekundach gry** (UI gry: `lifespan * 1000` porównywane z `purchaseTime` w ms); 29220 = 20 lat | oczekuje | r1 P7, `gui/line_vehicle_mgmt/vehicle_util.tl` |
| 16 | `getVehicleProblems` / `getLinesIssues` | wywołania działają; struktura w zrzucie r1 (do użycia w planie 2) | oczekuje | r1 P7 |
| 17 | `saveId` przez zapis i wczytanie | **tak**, `GameScriptState` przetrwał zapis i wczytanie | oczekuje | r1 P8 |
| 18 | `update` w pauzie | wywoływany; `dt = 0`, `gameTime` stoi | oczekuje | r1 P9 |
| 19 | Konstrukcje Teal | gra kompiluje Teal zgodny z `tl` 0.24.8 + definicjami z `api/tealdef`, `base/tealdef`. Globalne typy gry dostępne w definicjach (np. `Date`) **nie muszą istnieć w runtime** (`Date` = nil). Niezadeklarowane globalne odrzucane przez `tl check` | oczekuje | r2 P14 |

## Dodatkowe ustalenia (nieprzewidziane w planie)

- **Pula wątków symulacji.** `update` wywoływany jest z wielu wątków („Sim Pool 1…8”), każdy z **osobnym stanem Lua**. Zmienne modułu nie są wspólne, a moduł bywa ładowany ponownie w nowych stanach. Wspólny jest tylko `GameScriptState` (`state:get()`/`state:set()`). Każdy znacznik „raz” i każdy licznik czasu musi żyć w `GameScriptState`.
- **Duże zrzuty blokują symulację.** `debugPrint` tabeli z ~30 000 liniami zatrzymał symulację na ~6 s, co użytkownik zauważył jako klatkowanie pojazdów i słabą reakcję na zmianę prędkości. Zapisujemy wyłącznie jedną linię na sekcję, bez zrzutów tabel.
- **Ścieżki API.** Funkcje są w podprzestrzeniach: `api.engine.util.finance.*`, `api.engine.util.vehicle.*`, `api.engine.util.line.*`, `api.engine.util.industry.*`. Pojazdy linii: `api.engine.system.transportVehicleSystem.getLineVehicles(line)`.
- **Log gry** (`<userdata>/3493540/local/crash_dump/stdout.txt`) jest nadpisywany przy każdym starcie gry, a w trakcie sesji rośnie. Każda linia ma prefiks ok. 90 znaków (`[czas - MESSAGE - Sim Pool N - Main ]  `).
- Stan GUI (`guiUpdate`) działa w „Main Thread” i ma to samo ograniczone środowisko co symulacja.

## Decyzje dla planów 1–3

- **Kanał wymiany: log gry.** Mod wypisuje sekcje przez `debugPrint` jako pojedyncze linie `[TFLIVE] <sekcja> <json>`. Serwer czyta przyrostowo `stdout.txt` od zapamiętanego offsetu. Zmniejszenie rozmiaru pliku oznacza restart gry, więc serwer czyta wtedy od początku. Uzasadnienie: #3, #6.
- **Katalog wymiany i RAM-dysk: brak.** Log zostaje na SSD (decyzja użytkownika). ADR 0001 zastąpiony przez ADR 0003.
- **Budżet zapisu (domyślne interwały, w czasie rzeczywistym):** `meta`+`finance` co 10 s, `vehicles`/`lines`/`stops` co 60 s, `industries`/`towns` co 120 s, tylko gdy sekcja się zmieniła, nigdy w pauzie. Szacunek dla ok. 2000 pojazdów to < 10 MB/h. Wartość mierzona i pokazywana w UI.
- **Zbieranie pojazdów partiami:** tak, z ostrożności, bo #9 na dużej mapie jest nieustalone. Plan 2 zawiera pomiar na dużej mapie jako warunek ukończenia.
- **Pola niedostępne (zawsze `null`):** brak. Wszystkie pola z §4 mają źródło w API.
- **`saveId`:** w `GameScriptState` (#17).
- **Detekcja pauzy:** `dt == 0` (#18).
- **Uzupełnienie historii:** wykonalne od początku gry (#12), koszt pomijalny (#13). Wynik wysyłany partiami, jedna linia logu na partię.
- **Windows:** wszystkie odpowiedzi „oczekuje”. Najważniejsze do potwierdzenia: odczyt `stdout.txt` przez inny proces podczas gry. Test Windows jest warunkiem ukończenia planu 2.
