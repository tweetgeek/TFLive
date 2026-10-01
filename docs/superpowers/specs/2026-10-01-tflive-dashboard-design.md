# TFLive — dashboard live dla Transport Fever 3

Data: 2026-10-01 · Status: zaktualizowany po kroku 0 (wyniki: `docs/superpowers/spikes/2026-10-01-krok0-wyniki.md`)

## 1. Cel

Dashboard otwierany w przeglądarce (tablet lub komputer w sieci domowej), który podczas gry w Transport Fever 3 pokazuje na żywo stan bieżącej rozgrywki: finanse, pojazdy, linie, przemysł i miasta, oraz zgłasza alerty o problemach wymagających reakcji.

### Zakres

| Etap | Zawartość |
|---|---|
| v1 | (A) podgląd live: kafelki KPI i tabele; (B) alerty w 4 kategoriach; zbieranie historii od pierwszego dnia |
| później | (C) wykresy trendów na podstawie zebranej historii |

### Kryteria sukcesu

- Użytkownik włącza grę z modem `tflive`, uruchamia `npm start`, otwiera `http://<ip-komputera>:<port>` na tablecie i bez ręcznych akcji widzi aktualne dane i alerty.
- Działa na **Windows i macOS** (gra i serwer na tym samym komputerze).
- Budżet zapisu na dysk jest mały, mierzony i widoczny w UI (patrz §7).
- Gra nie przycina się zauważalnie z powodu modu.

### Ograniczenia i decyzje

- Tylko odczyt wobec gry: dashboard nigdy nie wysyła poleceń do gry.
- Serwer działa na tym samym komputerze co gra, dostęp z LAN, bez logowania.
- Singleplayer.
- Interfejs po polsku, responsywny, z myślą o tablecie w poziomie.

### Poza zakresem v1

Mapa i minimapa, sterowanie grą, dostęp z internetu, multiplayer, wykresy trendów.

## 2. Architektura

```
┌──────────── Transport Fever 3 ────────────┐
│ mod "tflive" (Lua, game script)           │
│  collectors → dane z api.engine           │
│  serializer → kompaktowy JSON             │
│  emitter    → debugPrint: linie [TFLIVE]  │
└───────────────┬───────────────────────────┘
                │ log gry crash_dump/stdout.txt
┌───────────────▼──────── Node (server/) ───┐
│ source/   LogSource | ReplaySource        │
│ ingest    walidacja + rozpakowanie        │
│ state     bieżący snapshot + bufor        │
│ alerts    czyste reguły → Alert[]         │
│ history   SQLite (metryki co miesiąc gry) │
│ api       HTTP (REST + statyczny web) + WS│
└───────────────┬───────────────────────────┘
                │ WebSocket
┌───────────────▼──────── Vue 3 (web/) ─────┐
│ Przegląd | Alerty | Linie | Pojazdy |     │
│ Przemysł | Miasta                         │
└───────────────────────────────────────────┘
```

### Repozytorium (monorepo, npm workspaces)

- `mod/tflive/`: mod gry (`mod.json`, `modinfo.json`, skrypt gry w `content/`).
- `shared/`: typy TypeScript snapshotu i alertów, stała `SCHEMA_VERSION`.
- `server/`: Node + TypeScript.
- `web/`: Vue 3 + Vite + Pinia. Zbudowany frontend serwuje proces Node, więc jest jeden port i jedna komenda.
- `scripts/`: m.in. `install-mod` (kopiowanie modu do katalogu `mods` gry).
- `config/`: `config.json` (ścieżki, port, kanał) i `alerts.json` (progi).

### Granice odpowiedzialności

- **Mod** tylko zbiera surowe dane i wypisuje je do logu gry. Nie liczy alertów ani wartości pochodnych.
- **Serwer** waliduje dane, liczy wartości pochodne (wiek w latach, obłożenie %, zysk/km), wykrywa alerty, zapisuje historię i rozsyła stan.
- **Web** tylko prezentuje dane. Jedyny zapis inicjowany z przeglądarki to wyciszenie alertu.

## 3. Mod gry

- Hook `update` w skrypcie gry (`*.gs.lua` → `*.script.tl`, język Teal). Harmonogram jest per sekcja (§7). (krok 0: #3, #18)
- `update` wywoływany jest z puli wątków symulacji, każdy z osobnym stanem Lua, więc stan modu żyje w `GameScriptState`, a nie w zmiennych modułu. Odstępy czasu liczone są zegarem ściennym `os.time()`. (krok 0: dodatkowe ustalenia)
- `GameScriptState` jest **zapisywany razem z grą i przywracany przy wczytaniu** (krok 0: #17), a gra nie ma hooka „wczytano zapis”. Dlatego stan dzieli się na dwie części:
  - **trwały** (ma przetrwać zapis): `saveId`;
  - **sesyjny** (ważny tylko w bieżącym uruchomieniu modu): `sessionId`, `lastEmitWall`, czasy ostatniego wysłania sekcji, odciski sekcji, postęp partii i Uzupełnienia historii.
- **Wykrywanie nowej sesji modu:** jeśli `os.time() - lastEmitWall > 30 s` albo `lastEmitWall` jest pusty, mod uznaje, że to nowa sesja (start gry, wczytanie zapisu, powrót z menu). Wtedy:
  - losuje nowy `sessionId` (z jawnym `math.randomseed` w bieżącym stanie Lua),
  - zeruje wszystkie pola sesyjne,
  - wysyła wszystkie sekcje bez porównywania odcisków,
  - uruchamia Uzupełnienie historii.

  Działająca gra aktualizuje `lastEmitWall` co najmniej co 10 s, także w pauzie, wysyłając samo `meta`. Wczytanie zapisu zrobionego mniej niż 30 s wcześniej może nie zostać wykryte jako nowa sesja. To akceptowalne: serwer ma już wtedy aktualne dane, bo log nie jest nadpisywany przy wczytaniu, tylko przy starcie gry.
- Mod nigdy nie wypisuje do logu całych tabel (`debugPrint(tabela)`). Każda sekcja to jedna linia tekstu. (krok 0: dodatkowe ustalenia)
- Ścieżki API: `api.engine.util.finance.*`, `api.engine.util.vehicle.*`, `api.engine.util.line.*`, `api.engine.util.industry.*`, `api.engine.system.transportVehicleSystem.getLineVehicles`. (krok 0: dodatkowe ustalenia)
- Każdy collector działa w `pcall`. Błąd jednej sekcji nie blokuje pozostałych i trafia do `errors[]` w `meta`.
- Duże kolekcje (pojazdy) można zbierać partiami w kolejnych tickach (rotacyjnie), żeby uniknąć przycięć. Pełny zestaw partii tworzy jeden zapis sekcji.
- `saveId`: identyfikator rozgrywki. Losowy identyfikator jest generowany przy pierwszym uruchomieniu modu w danym zapisie i trzymany w `GameScriptState`, który przetrwa zapis i wczytanie. (krok 0: #17)
- Ustawienia modu (parametry mod.json): interwały sekcji.
- Mod liczy bajty wypisane do logu i raportuje `bytesWritten` w `meta`.
- Każda linia jest samowystarczalna: nazwy (cargo, modele, encje) są w tej samej linii co dane. Nie ma osobnych słowników „wysyłanych raz”.

## 4. Model danych

Pole oznaczone `?` jest opcjonalne (np. brak danych dla nowej encji). Krok 0 potwierdził źródła części pól. Pola oznaczone w wynikach kroku 0 jako „nie ustalono” weryfikuje plan 2 (krok 0: #11–#16). Brakujące pole ma wartość `null`.

Jednostki czasu: `gameTime`, `purchaseTime`, `closureTimeStamp`, `startTime` w **ms czasu gry**; 1 dzień gry = 4000 ms; datę wyznacza `GameTime.dates`. `lifespan` modelu jest w **sekundach** czasu gry (×1000 → ms). (krok 0: #10, #15)

Terminologia (Rozgrywka, Wynik operacyjny, Pojazd, Część pojazdu, Przystanek, Obsługiwana fabryka itd.) jest zdefiniowana w `CONTEXT.md` i obowiązuje w kodzie, UI i dokumentach.

```ts
Snapshot {
  schemaVersion: 1
  meta:      { saveId /* = id Rozgrywki */, mapName?, gameTime, date: {y, m, d}, gameSpeed, paused,
               capturedAtMs, bytesWritten, errors: string[] }
  finance:   { balance, loan,
               // z księgi gry (calculateBalance, maintenanceIncomeOnly = true), Okno kroczące:
               operatingResult12m, runningCosts12m, investments12m?,
               operatingResultByMonth: [{ month, value }] /* ostatnie 3 miesiące */ }
  lines:     [{ id, name, mode, color?, stops: stopId[], vehicleIds,
                firstLedgerTime? /* Początek linii */, operatingResult12m, investments12m?,
                departureLoads: [{ stopIndex, load, capacity, time }] /* do Obłożenia linii */ }]
  vehicles:  [{ id, name, lineId | null, mode, state /* IN_DEPOT|EN_ROUTE|AT_TERMINAL|GOING_TO_DEPOT */,
                userStopped, noPath, daysAtTerminal, daysInDepot,
                load, capacity, operatingResult12m?,
                parts: [{ model, purchaseTime, lifespan, maintenanceState }] }]
  industries:[{ id, name, type, level, maxLevel, closureTimeStamp?, upgradeProgress,
                inputs:  [{ cargo, stock, lastReceivedTime? }],
                outputs: [{ cargo, stock, capacity }],
                lastServedTime? /* do Obsługiwanej fabryki */ }]
  towns:     [{ id, name, population, developmentActive, noise, pollution,
                needs: [{ district, cargo, demand, supplied? }], lastServedTime? }]
  stops:     [{ id, name, waiting: [{ cargo, count }], longestWaitStartTime? }]
}
```

Wartości pochodne liczone przez serwer:
- Wiek i Stan pojazdu: z `parts`, najstarsza i najgorsza część.
- Wykorzystanie żywotności: `(gameTime - purchaseTime) / (lifespan * 1000)` dla każdej części.
- Rezerwa: `balance / (runningCosts12m / 12)`.
- Obłożenie linii: średnia z `departureLoads` z ostatnich 3 miesięcy, trzymana w buforze serwera.
- Czas oczekiwania na Przystanku: `gameTime - longestWaitStartTime`, z `getStockSimEntity`.


W logu dane są w formacie kompaktowym: tablice wartości w ustalonej kolejności pól. Nazwy są zawarte w tej samej linii (§3). `server/ingest` rozpakowuje je do powyższego modelu. Format kompaktowy jest wersjonowany razem z `schemaVersion`. Nieznana wersja jest odrzucana, a UI pokazuje czytelny komunikat.

Wartości pochodne liczy serwer: `ageYears`, `loadPct`, wskaźniki obłożenia linii, procent zaspokojenia potrzeb miast.

### 4a. Historia i Uzupełnienie historii

Tabele SQLite, każdy wiersz kluczowany przez `(saveId, month)`, gdzie `month` to miesiąc czasu gry:

| Tabela | Zawartość |
|---|---|
| `metrics_global` | saldo, kredyt, Wynik operacyjny, Koszty bieżące, Inwestycje, liczba Pojazdów i Linii |
| `metrics_line` | `lineId`, Wynik operacyjny, Obłożenie linii, liczba Pojazdów |
| `metrics_town` | `townId`, populacja |
| `metrics_industry` | `industryId`, poziom, produkcja |
| `mutes` | `saveId`, rodzaj alertu, encja, rodzaj Wyciszenia, `untilGameTime?` |
| `games` | `saveId`, nazwa mapy, ostatnio widziany czas gry |

- Zapis odbywa się raz na miesiąc gry, w jednej transakcji, jako upsert, więc duplikatów nie ma.
- **Uzupełnienie historii:** na początku każdej sesji modu (§3: wykrywanie nowej sesji) mod sam odczytuje z księgi gry miesięczne Wyniki operacyjne firmy i każdej istniejącej Linii, od początku księgi do bieżącego miesiąca. Robi to partiami (np. 12 miesięcy na tick) i wypisuje każdą partię jako jedną linię logu sekcji `backfill`. Serwer robi upsert do `metrics_global` i `metrics_line`. Tak samo obsłużone jest pierwsze zobaczenie Rozgrywki i Cofnięcie, a przepływ danych pozostaje jednokierunkowy. Wolumen to jednorazowo ok. 1–3 MB w logu na wczytanie zapisu. Księga sięga początku gry, a odczyt jest tani (krok 0: #12, #13). Bilans Linii pobieramy z encji Linii; nie sumujemy Linii z jej Pojazdami, bo wpisy liczą się wtedy podwójnie (krok 0: #11). Populacji, produkcji ani liczby Pojazdów z przeszłości nie da się odtworzyć, więc te serie zaczynają się od instalacji.

## 5. Silnik alertów

Reguła to czysta funkcja `(snapshot, recent: Snapshot[], history, config) → Alert[]`.

```ts
Alert { id /* stabilny, np. "line-unprofitable:123" */, category, severity: 'info'|'warn'|'critical',
        entityType, entityId, title, detail, firstSeenGameTime }
```

Reguły v1 (progi domyślne w `config/alerts.json`):

Definicje pojęć są w `CONTEXT.md`.

| Kategoria | Reguła (pojęcie z `CONTEXT.md`) | Warunek domyślny | Ważność |
|---|---|---|---|
| Finanse | Niska rezerwa | Rezerwa < 3 mies. / < 1 mies. | warn / critical |
| Finanse | Ujemny Wynik operacyjny | suma z ostatnich 3 miesięcy < 0 | warn |
| Linie | Nierentowna linia | po Rozruchu (6 mies.), Wynik operacyjny 12 mies. < 0 | warn |
| Linie | Niskie obłożenie | Obłożenie linii < 25% (3 mies.) | info |
| Linie | Linia bez pojazdów | 0 Pojazdów | warn |
| Linie | Przeciążony przystanek | najdłuższe oczekiwanie > 14 dni gry | warn |
| Pojazdy | Pojazd bez trasy | `noPath` | critical |
| Pojazdy | Pojazd czekający | `daysAtTerminal` > 30 | warn |
| Pojazdy | Bezczynny pojazd | brak Linii lub `daysInDepot` > 30 | warn |
| Pojazdy | Stary pojazd | Wykorzystanie żywotności dowolnej Części ≥ 100% | warn |
| Pojazdy | Niski stan pojazdu | Stan pojazdu < 50% | warn |
| Dostawy | Niedostarczony surowiec | Obsługiwana fabryka; surowiec nie wpłynął > 2 mies. (alert dla każdego surowca) | warn |
| Dostawy | Zalegająca produkcja | Obsługiwana fabryka; magazyn wyjściowy ≥ 80% > 1 mies. | warn |
| Dostawy | Groźba zamknięcia | Obsługiwana fabryka; `closureTimeStamp` ustawiony | critical |
| Miasta | Spadek dostaw | Obsługiwane miasto; dostarczany towar < 50% potrzeby lub spadek > 30% w 3 mies. | warn |

Bez alertu, tylko oznaczenia w UI:
- Pojazd zatrzymany (`userStopped`);
- Wykorzystanie żywotności ≥ 90% („zbliża się koniec”);
- Rozruch linii;
- Niezaspokojona potrzeba miasta („szansa”);
- Fabryki i miasta nieobsługiwane (domyślnie odfiltrowane).

Zachowanie:

- Reguła, której wymagane pole jest `null`, nie generuje alertu.
- Alert trwa, dopóki warunek jest spełniony. Serwer pamięta `firstSeenGameTime`.
- Reguły czasowe korzystają z bufora ostatnich snapshotów w pamięci (`recent`) oraz z Historii w SQLite.
- Wyciszenie dotyczy pary (rodzaj alertu, encja) w danej Rozgrywce i występuje w dwóch rodzajach:
  - **Ignorowanie**: bezterminowe, cofane ręcznie.
  - **Odłożenie**: do wskazanego czasu gry (domyślnie +3 miesiące), potem alert wraca, jeśli warunek trwa.

  Obie zapisywane są w SQLite. Zakładka Alerty ma filtr „pokaż wyciszone”.
- Zmiana Rozgrywki (`saveId`) czyści stan alertów w pamięci.
- Cofnięcie (czas gry mniejszy niż ostatnio widziany dla tej samej Rozgrywki) obcina Historię od tego momentu, czyści bufory i uruchamia Uzupełnienie historii dla obciętego okresu. Wyciszenia zostają.

## 6. UI (Vue 3)

- Nawigacja: zakładki u góry (tablet/desktop), dolny pasek (wąski ekran). Ciemny motyw domyślnie, z przełącznikiem.
- **Pasek stanu** (zawsze widoczny): data gry, prędkość/pauza, status połączenia (`live` / „brak danych od N s”), zapis na dysk (MB/h).
- **Przegląd:** kafelki KPI (saldo, kredyt, przychód roczny, liczba pojazdów i linii, populacja łączna) oraz 5 najważniejszych alertów.
- **Alerty:** pełna lista z filtrami (kategoria, ważność) i wyciszaniem.
- **Linie:** tabela z sortowaniem (zysk, obłożenie, liczba pojazdów). Szczegóły: przystanki, pojazdy, oczekujący pasażerowie i towary.
- **Pojazdy:** tabela z filtrami (typ, linia, stan, „stare”).
- **Przemysł:** wejścia i wyjścia, poziom, wskaźnik zagrożenia zamknięciem.
- **Miasta:** populacja, zaspokojenie potrzeb dla każdej dzielnicy, hałas i zanieczyszczenie.
- Puste pole wyświetlane jest jako „—”. Nieaktualne dane nigdy nie są prezentowane jako live: gdy dane są nieaktualne, wyświetla się baner.

Transport: WebSocket wysyła pełny stan przy połączeniu, a potem aktualizacje per sekcja. Klient ma reconnect z backoffem. REST służy do: stanu początkowego, listy i zmiany wyciszeń, diagnostyki (`/api/health`).

## 7. Kanał wymiany i zapis na dysk (ochrona SSD)

Skrypty gry nie mają `io` ani natywnych modułów, więc jedynym kanałem gra → serwer jest log gry: mod wypisuje dane przez `debugPrint`, a gra dopisuje je do `<dane użytkownika>/crash_dump/stdout.txt`. Log leży na SSD (RAM-dysk odrzucony przez użytkownika). Celem jest mały, przewidywalny i zmierzony budżet zapisu. Zob. ADR 0003. (krok 0: #3, #7)

1. **Format linii:** `[TFLIVE] <schemaVersion> <saveId> <sessionId> <seq> <gameTime> <sekcja> <część>/<części> <json-kompaktowy>`, jedna linia na sekcję lub partię.
   - `seq` rośnie w obrębie sesji modu.
   - Partie jednej sekcji mają ten sam `seq` startowy i licznik `<część>/<części>`. Serwer stosuje sekcję dopiero po zebraniu kompletu, a niekompletny komplet porzuca, gdy pojawi się nowszy `seq` tej sekcji.
   - Gra dodaje prefiks ok. 72 znaków (czas, poziom, wątek), zakończony `]  `. Serwer dopasowuje linie po kotwicy `]  [TFLIVE] `, a nie po wystąpieniu w dowolnym miejscu, bo linie błędów Lua mogą cytować kod.
   - Maksymalna długość linii: 100 KB, bo dłuższych nie testowano. Większe sekcje dzielone są na partie.
   - `debugPrint` 100 KB kosztował ok. 0,8 ms czasu CPU; czas ścienny i opóźnienie zapisu na dysk nie zostały zmierzone. (krok 0: #6)
2. **Harmonogram domyślny (czas rzeczywisty, `os.time()`):**

   | Sekcja | Interwał |
   |---|---|
   | `meta`, `finance` | 10 s |
   | `vehicles`, `lines`, `stops` | 60 s |
   | `industries`, `towns` | 120 s |

3. **W pauzie (`dt == 0`) wysyłane jest tylko `meta`** (co 10 s, z `paused = true`, żeby utrzymać `lastEmitWall` i status w UI). Inne sekcje nie są wysyłane w pauzie ani gdy się nie zmieniły (porównanie taniego odcisku z sesyjnej części `GameScriptState`). Zachowanie w menu gry (czy `update` w ogóle działa) nie zostało zbadane. (krok 0: #18)
4. **Format kompaktowy** (§4), ok. 2–3× mniej bajtów niż obiekty z kluczami.
5. **Szacunek (do weryfikacji pomiarem):** ok. 10–35 MB/h przy ok. 2000 pojazdów, gdy wszystkie sekcje się zmieniają. Główną część stanowią `vehicles`: 2000 × ~60–150 B co 60 s, czyli ok. 7–18 MB/h; reszta to ok. 3–17 MB/h. Log jest nadpisywany przy każdym starcie gry, więc nie rośnie między sesjami. Wartość rzeczywista jest mierzona (`bytesWritten`) i pokazywana w UI.
6. **Odczyt przez serwer (`LogSource`):**
   - Co 1 s: otwarcie pliku, odczyt przyrostowy od zapamiętanego offsetu, zamknięcie. Serwer nie trzyma otwartego uchwytu, żeby nie blokować gry przy tworzeniu nowego logu, zwłaszcza na Windows.
   - **Tożsamość pliku** to identyfikator z linii `Startup session with id <uuid>` na początku logu. Inny identyfikator albo plik mniejszy niż offset oznacza restart gry: offset wraca do 0, a stan bieżący w pamięci jest czyszczony. Historia zostaje.
   - **Start serwera:** czyta bieżący log od offsetu 0 i przetwarza wszystkie linie po kolei. Log obejmuje tylko bieżące uruchomienie gry, więc jest ograniczony. Linie innej Rozgrywki (`saveId`) wczytanej wcześniej w tej sesji są przetwarzane normalnie, a wygrywa ostatnia.
   - Ostatnia niepełna linia (bez `\n`) czeka na kolejny odczyt. Linia z niepoprawnym JSON jest pomijana i zostaje ostatnia dobra wersja sekcji.
7. **Serwer:**
   - SQLite zapisuje metryki raz na miesiąc gry w jednej transakcji;
   - logi serwera tylko przy błędach i zmianach stanu;
   - wyciszenia to pojedyncze zapisy przy kliknięciu.

## 8. Wieloplatformowość (Windows + macOS)

- Autodetekcja katalogu gry i katalogu danych użytkownika per system (Steam) oraz nadpisanie w `config/config.json`. Wszystkie ścieżki budowane przez `path.join`.
- Log gry: `<Steam>/userdata/<steamId>/3493540/local/crash_dump/stdout.txt`; mody użytkownika: `<Steam>/userdata/<steamId>/3493540/local/mods/`. (krok 0: #1)
- Windows: przed ukończeniem planu 1 (serwer) trzeba potwierdzić testem z `spike/WINDOWS-CHECKLIST.md`, że: (a) serwer może czytać `stdout.txt` podczas działania gry, (b) gra może utworzyć nowy log przy starcie, gdy serwer go cyklicznie czyta, (c) linie trafiają do pliku bez dużego opóźnienia (bufor). Punkt (c) dotyczy też macOS. (krok 0: Windows oczekuje)
- `npm run install-mod` **kopiuje** mod (bez symlinków, które na Windows wymagają uprawnień).
- Obserwacja logu przez polling `stat` zamiast `fs.watch`.
- Parser odporny na `\r\n`.
- Natywna zależność SQLite: `better-sqlite3` z prebuildami dla Windows i macOS (x64/arm64). Alternatywą jest wbudowany `node:sqlite`, jeśli wymagana wersja Node na to pozwala. Wybór zapada w planie implementacji.
- Wymagany Node LTS (≥ 22).

## 9. Obsługa błędów

| Sytuacja | Zachowanie |
|---|---|
| Błąd collectora w modzie | sekcja pominięta, wpis w `meta.errors`, ostrzeżenie diagnostyczne w UI |
| Niepoprawna lub niepełna linia `[TFLIVE]` | pominięta, zachowana ostatnia dobra wersja sekcji, log raz na serię błędów |
| Brak nowych danych > 15 s | status „gra nie odpowiada / pauza / menu”, baner w UI |
| Nieznana `schemaVersion` | dane odrzucone, komunikat „zaktualizuj mod lub serwer” |
| Zmiana `saveId` | reset stanu w pamięci i buforów alertów; historia per `saveId` |
| Zerwanie WebSocket | reconnect z backoffem, baner w UI |
| Brak katalogu gry lub logu | serwer startuje, `/api/health` i UI wskazują, co skonfigurować |

## 10. Testy

- **Vitest (server, shared):**
  - reguły alertów na fixture'ach,
  - ingest (rozpakowanie formatu kompaktowego, walidacja, pola `null`),
  - historia (jeden zapis na miesiąc gry, brak duplikatów, rozdział per `saveId`),
  - `LogSource` (odczyt przyrostowy, niepełna ostatnia linia, `\r\n`, skrócenie pliku po restarcie gry, brak pliku, obce linie),
  - ścieżki per system.
- **Integracyjny:** `ReplaySource` z nagranych snapshotów → WebSocket → weryfikacja stanu klienta.
- **Tryb demo/replay:** `npm run demo` uruchamia serwer z nagranymi danymi, bez gry.
- **Mod:** ręczna checklista w grze na macOS i Windows. Prawdziwe snapshoty z gry trafiają do fixture'ów.

## 11. Kolejność prac

Plany implementacji:
- **plan 0**: krok 0;
- **plan 1**: kroki 1, 2, 4, 5 (shared + serwer);
- **plan 2**: krok 3 (mod);
- **plan 3**: krok 6 (web);
- krok 7 dzieli się między plany 1 i 2.

0. **Test modu w grze (spike):** wykonany na macOS (wyniki: `docs/superpowers/spikes/2026-10-01-krok0-wyniki.md`). Windows oczekuje.
1. Monorepo, `shared/` (typy, `SCHEMA_VERSION`), `ReplaySource`, fixture'y.
2. Serwer: ingest, state, WebSocket, REST, `LogSource`, health. Warunek ukończenia: test Windows (§8: a, b, c) i pomiar opóźnienia zapisu logu na macOS.
3. Mod: collectors, serializer kompaktowy, emitter `debugPrint`, harmonogram w `GameScriptState`, `bytesWritten`, zbieranie pojazdów partiami. Warunki ukończenia: pomiar na mapie z setkami pojazdów (czas zbierania, wolumen MB/h, koszt Uzupełnienia historii), weryfikacja pól §4 oznaczonych w wynikach kroku 0 jako „nie ustalono”, test pustej rozgrywki (0 linii i pojazdów), test na Windows.
4. Silnik alertów i konfiguracja progów.
5. Historia SQLite, Uzupełnienie historii, obsługa Cofnięcia i Wyciszenia.
6. Widoki Vue.
7. `install-mod`, README (instalacja na Windows i macOS, konfiguracja).
