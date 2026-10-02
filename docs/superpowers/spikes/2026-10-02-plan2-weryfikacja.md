# Plan 2 — weryfikacja w grze (macOS)

Data: 2026-10-02 · Mod `tflive` (gałąź plan2 @ d8546d2) zainstalowany przez `npm run mod:install`, serwer `npm start`, czysta baza Historii.
Mapa testowa: 14 linii, 29 pojazdów, 20 fabryk, 10 miast, 24 przystanki obsługiwane liniami. Przebieg: ~2,5 min gry (w tym najszybsza prędkość), ~20 s pauzy, zapis, wyjście do menu > 30 s, wczytanie zapisu, ~1 min gry.

| Warunek | Wynik | Dowód |
|---|---|---|
| Wszystkie sekcje docierają i dekodują się | tak | 99 linii `[TFLIVE]`: meta 22, finance 18, lines/vehicles/stops 3, industries/towns 2, backfill 46; `status.lastError = null`, `meta.errors = []` |
| Brak błędów modu | tak | 0 linii `[TFLIVE-ERR]` w logu |
| Pierwsza linia sesji to `meta` | tak | obie sesje zaczynają się od `meta` |
| Harmonogram | tak | lines/vehicles/stops co 60 s, industries/towns co 120 s, rozłożone na kolejne wywołania (11:31:33–34) |
| Pauza | tak | `paused=1` w meta, inne sekcje i backfill wstrzymane; przerwy w meta wyłącznie podczas zapisu/menu (gra nie wywołuje skryptu) — wtedy serwer poprawnie pokazuje „nie na żywo” |
| Wczytanie zapisu (> 30 s) | tak | nowy `sessionId` (6c98… → 42a6…), pełny zestaw sekcji ponownie |
| Uzupełnienie historii | tak | `metrics_global`: 85 miesięcy (1900-01 … 1907-01), `metrics_line`: 734 wiersze dla 14 linii, `metrics_town`: 20 |
| Wartości zgodne z grą | tak | dayMs 4000; finanse (saldo, kredyt, ops12, run12, opsM); tryby linii RAIL/ROAD/WATER, kolor `#ffb266`; pojazdy: stany AT_TERMINAL/EN_ROUTE/IN_DEPOT, ładunek/pojemność, części z modelem, żywotnością 29220 s i stanem; fabryki: magazyny wej./wyj., poziomy; miasta: ludność, hałas, zanieczyszczenie, potrzeby; przystanki: count/bad |
| Alerty | sensowne | 9: Nierentowna linia ×4, Linia bez pojazdów ×2, Zalegająca produkcja ×2, Spadek dostaw ×1 |
| `json.NULL` dociera jako `null` (I4) | tak | pola opcjonalne (np. `firstLedgerTime`, `lastReceivedTime`) dekodują się jako `null` |
| Klucze LOG_BOOK (T7) | częściowo potwierdzone | `lastServedTime` niepuste dla 3 fabryk i 3 miast, `lastReceivedTime` dla 1 wejścia — klucze działają przynajmniej dla obsługiwanych obiektów |
| Zapis na dysk | ~1 MB/h na tej mapie | `status.diskMBPerHour` 0,8–1,5 |
| `meta.map` | nazwa firmy gracza („MnicH Transport”) | zgodnie z decyzją (brak API nazwy mapy) |

Otwarte (warunki dalszych etapów):
- Mapa z setkami pojazdów: czas kolektorów i ewentualne przycięcia — nie ustalono (brak takiego zapisu); dzielenie pojazdów na partie między tickami czeka na ten pomiar.
- Windows: `spike/WINDOWS-CHECKLIST.md` — oczekuje.
- Odczucia płynności gry na tej mapie: do potwierdzenia przez użytkownika.
