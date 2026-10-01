# TFLive — dashboard live dla Transport Fever 3

Data: 2026-10-01 · Status: projekt do przeglądu

## 1. Cel

Dashboard otwierany w przeglądarce (tablet lub komputer w sieci domowej), który podczas gry w Transport Fever 3 pokazuje na żywo stan bieżącej rozgrywki: finanse, pojazdy, linie, przemysł i miasta, oraz zgłasza alerty o problemach wymagających reakcji.

### Zakres

| Etap | Zawartość |
|---|---|
| v1 | (A) podgląd live: kafelki KPI i tabele; (B) alerty w 4 kategoriach; zbieranie historii od pierwszego dnia; wymiana danych przez RAM-dysk, gdy dostępny |
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
│  emitter    → pliki sekcji | log (zapas)  │
└───────────────┬───────────────────────────┘
                │ pliki nadpisywane w miejscu
┌───────────────▼──────── Node (server/) ───┐
│ source/   FileSource | LogSource | Replay │
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

- **Mod** tylko zbiera surowe dane i je zapisuje. Nie liczy alertów ani wartości pochodnych.
- **Serwer** waliduje dane, liczy wartości pochodne (wiek w latach, obłożenie %, zysk/km), wykrywa alerty, zapisuje historię i rozsyła stan.
- **Web** tylko prezentuje dane. Jedyny zapis inicjowany z przeglądarki to wyciszenie alertu.

## 3. Mod gry

- Hook `update` (lub `guiUpdate`, zależnie od wyniku kroku 0) w skrypcie gry. Harmonogram jest per sekcja (§7).
- Każdy collector działa w `pcall`. Błąd jednej sekcji nie blokuje pozostałych i trafia do `errors[]` w `meta`.
- Duże kolekcje (pojazdy) można zbierać partiami w kolejnych tickach (rotacyjnie), żeby uniknąć przycięć. Pełny zestaw partii tworzy jeden zapis sekcji.
- `saveId`: identyfikator rozgrywki. Losowy identyfikator jest generowany przy pierwszym uruchomieniu modu w danym zapisie i trzymany w stanie skryptu gry, który jest zapisywany razem z savegame. Jeśli to niemożliwe, używamy nazwy mapy lub savegame.
- Ustawienia modu (parametry mod.json): interwały sekcji, włączenie kanału.
- Mod liczy zapisane bajty i raportuje `bytesWritten` w `meta`.

## 4. Model danych

Pole oznaczone `?` jest opcjonalne. Krok 0 ustala, czy API je udostępnia. Brakujące pole ma wartość `null`.

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
- Wykorzystanie żywotności: `(gameTime - purchaseTime) / lifespan` dla każdej części.
- Rezerwa: `balance / (runningCosts12m / 12)`.
- Obłożenie linii: średnia z `departureLoads` z ostatnich 3 miesięcy, trzymana w buforze serwera.
- Czas oczekiwania na Przystanku: `gameTime - longestWaitStartTime`, z `getStockSimEntity`.


Na dysku dane są w formacie kompaktowym: tablice wartości w ustalonej kolejności pól i słowniki nazw (cargo, modele) wysyłane raz. `server/ingest` rozpakowuje je do powyższego modelu. Format kompaktowy jest wersjonowany razem z `schemaVersion`. Nieznana wersja jest odrzucana, a UI pokazuje czytelny komunikat.

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
- **Uzupełnienie historii:** po każdym wczytaniu Zapisu gry mod sam odczytuje z księgi gry miesięczne Wyniki operacyjne firmy i każdej istniejącej Linii, od początku księgi do bieżącego miesiąca. Robi to partiami (np. 12 miesięcy na tick) i zapisuje wynik jednorazowo w sekcji `backfill.json`. Serwer robi upsert do `metrics_global` i `metrics_line`. Tak samo obsłużone jest pierwsze zobaczenie Rozgrywki i Cofnięcie, a przepływ danych pozostaje jednokierunkowy. Wolumen to jednorazowo ok. 1–3 MB na wczytanie zapisu. Populacji, produkcji ani liczby Pojazdów z przeszłości nie da się odtworzyć, więc te serie zaczynają się od instalacji.

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

## 7. Zapis na dysk (ochrona SSD)

Kanał gra → serwer przechodzi przez pliki, bo Lua w grze najpewniej nie ma dostępu do sieci. Celem jest mały, przewidywalny i zmierzony budżet zapisu.

1. **Plik na sekcję, nadpisywany w miejscu**: `meta.json`, `finance.json`, `vehicles.json`, `lines.json`, `stops.json`, `industries.json`, `towns.json`. Pliki nie rosną i nie powstają nowe.
2. **Harmonogram domyślny:**

   | Sekcja | Interwał |
   |---|---|
   | `meta`, `finance` | 2 s |
   | `vehicles`, `lines`, `stops` | 30 s |
   | `industries`, `towns` | 60 s |

3. **Brak zapisu w pauzie, w menu i gdy sekcja się nie zmieniła** (porównanie taniego odcisku, np. sumy kontrolnej pól liczbowych).
4. **Format kompaktowy** (§4), ok. 2–3× mniej bajtów niż obiekty z kluczami.
5. **Szacunek:** 25–70 MB/h przy ok. 2000 pojazdów, czyli ok. 40–100 GB/rok przy 4 h gry dziennie (~0,01–0,03% TBW typowego SSD). Wartość rzeczywista jest mierzona (`bytesWritten`) i pokazywana w UI.
6. **Spójność bez dodatkowych zapisów:** pojedynczy zapis z `\n` na końcu jako znacznik kompletności. Serwer ignoruje plik bez znacznika lub z niepoprawnym JSON i zachowuje ostatnią dobrą wersję. Rename przez plik tymczasowy tylko wtedy, gdy krok 0 wykaże, że czytanie niepełnych plików jest realnym problemem.
7. **Kanał zapasowy (log gry):** log rośnie i nie kontrolujemy go, więc ten kanał wysyła tylko `meta` i `finance` co 30 s. Pełne dane wymagają kanału plikowego.
8. **Serwer:**
   - SQLite zapisuje metryki raz na miesiąc gry w jednej transakcji;
   - logi tylko przy błędach i zmianach stanu;
   - wyciszenia to pojedyncze zapisy przy kliknięciu;
   - odczyt plików przez polling `stat` co 1 s (same odczyty).
9. **Katalog wymiany na RAM-dysku, gdy jest dostępny** (§7a). Wtedy wymiana gra → serwer nie zapisuje nic na SSD. Punkty 1–8 obowiązują nadal: zmniejszają obciążenie CPU i są budżetem w trybie awaryjnym.

### 7a. RAM-dysk dla wymiany

Mod zawsze zapisuje do tego samego katalogu wymiany w katalogu danych użytkownika gry. Mod nie musi znać RAM-dysku: przy starcie serwer podmienia katalog wymiany na dowiązanie do katalogu na RAM-dysku.

| System | Tworzenie RAM-dysku | Dowiązanie |
|---|---|---|
| macOS | automatycznie przez serwer, bez sudo: `hdiutil attach -nomount ram://<sektory>` + `diskutil erasevolume APFS TFLive <dev>`; rozmiar domyślny 64 MB | symlink |
| Windows | brak wbudowanego mechanizmu. Serwer używa RAM-dysku wskazanego w `config.json` (`ramDiskPath`, np. `R:\` z ImDisk/OSFMount, utworzonego przez użytkownika) | junction (`mklink /J`, bez uprawnień administratora) |

- Gdy RAM-dysk jest niedostępny (Windows bez `ramDiskPath`, błąd `hdiutil`, brak miejsca), serwer zostawia zwykły katalog na dysku (tryb awaryjny z budżetem §7), loguje przyczynę i pokazuje w UI tryb: „RAM” albo „dysk: X MB/h”.
- Dane wymiany są ulotne. Utrata po restarcie systemu jest akceptowalna, bo to tylko bieżący stan, a trwała historia trafia do SQLite. Zrzutów wymiany na dysk nie robimy.
- Przy zamknięciu serwer usuwa dowiązanie i odtwarza zwykły katalog. RAM-dysk na macOS odmontowuje (`hdiutil detach`) tylko wtedy, gdy sam go utworzył.
- Jeśli serwer nie działa, a gra tak, mod pisze do zwykłego katalogu (tryb awaryjny). Gdy przy starcie serwera dowiązanie nie może zastąpić katalogu, bo pliki są zablokowane przez grę, serwer ponawia próbę przy następnym cyklu, a do tego czasu czyta zwykły katalog.
- Krok 0 weryfikuje, że `io.open` w grze poprawnie zapisuje przez symlink (macOS) i junction (Windows).

## 8. Wieloplatformowość (Windows + macOS)

- Autodetekcja katalogu gry i katalogu danych użytkownika per system (Steam) oraz nadpisanie w `config/config.json`. Wszystkie ścieżki budowane przez `path.join`.
- Katalog wymiany plików leży w katalogu danych użytkownika gry, nie w katalogu instalacji (na Windows `Program Files` może nie być zapisywalny). Dokładną lokalizację, czyli dokąd trafia ścieżka względna `io.open` na każdym systemie, ustala krok 0.
- `npm run install-mod` **kopiuje** mod (bez symlinków, które na Windows wymagają uprawnień).
- Obserwacja plików przez polling `stat` zamiast `fs.watch`.
- Parser odporny na `\r\n`.
- Natywna zależność SQLite: `better-sqlite3` z prebuildami dla Windows i macOS (x64/arm64). Alternatywą jest wbudowany `node:sqlite`, jeśli wymagana wersja Node na to pozwala. Wybór zapada w planie implementacji.
- Wymagany Node LTS (≥ 22).

## 9. Obsługa błędów

| Sytuacja | Zachowanie |
|---|---|
| Błąd collectora w modzie | sekcja pominięta, wpis w `meta.errors`, ostrzeżenie diagnostyczne w UI |
| Niepoprawny lub niepełny plik | pominięty, zachowana ostatnia dobra wersja, log raz na serię błędów |
| Brak nowych danych > 15 s | status „gra nie odpowiada / pauza / menu”, baner w UI |
| Nieznana `schemaVersion` | dane odrzucone, komunikat „zaktualizuj mod lub serwer” |
| Zmiana `saveId` | reset stanu w pamięci i buforów alertów; historia per `saveId` |
| Zerwanie WebSocket | reconnect z backoffem, baner w UI |
| Brak katalogu gry lub wymiany | serwer startuje, `/api/health` i UI wskazują, co skonfigurować |

## 10. Testy

- **Vitest (server, shared):**
  - reguły alertów na fixture'ach,
  - ingest (rozpakowanie formatu kompaktowego, walidacja, pola `null`),
  - historia (jeden zapis na miesiąc gry, brak duplikatów, rozdział per `saveId`),
  - `FileSource` (pliki niepełne, `\r\n`, brak pliku),
  - `LogSource`,
  - ścieżki per system.
- **Integracyjny:** `ReplaySource` z nagranych snapshotów → WebSocket → weryfikacja stanu klienta.
- **Tryb demo/replay:** `npm run demo` uruchamia serwer z nagranymi danymi, bez gry.
- **Mod:** ręczna checklista w grze na macOS i Windows. Prawdziwe snapshoty z gry trafiają do fixture'ów.

## 11. Kolejność prac

0. **Test modu w grze (spike):**
   - czy `io.open` działa w `update`/`guiUpdate` i dokąd zapisuje (macOS, Windows);
   - które pola z §4 są dostępne;
   - czas zbierania danych i zapisany wolumen na dużej mapie;
   - czy hook działa w pauzie;
   - mechanizm `saveId`;
   - jak daleko wstecz sięga księga gry (`calculateBalance`) i czy działa dla encji Linii i Pojazdów;
   - zapis przez symlink (macOS) i junction (Windows) do RAM-dysku.

   Wynik: wybór kanału, lista pól `?`, rzeczywiste interwały. Kod spike'a jest do wyrzucenia.
1. Monorepo, `shared/` (typy, `SCHEMA_VERSION`), `ReplaySource`, fixture'y.
2. Serwer: ingest, state, WebSocket, REST, `FileSource`, health, zarządzanie RAM-dyskiem i dowiązaniem (§7a).
3. Mod: collectors, serializer kompaktowy, emitter, harmonogram, `bytesWritten`.
4. Silnik alertów i konfiguracja progów.
5. Historia SQLite, Uzupełnienie historii, obsługa Cofnięcia i Wyciszenia.
6. Widoki Vue.
7. `install-mod`, README (instalacja na Windows i macOS, konfiguracja, przygotowanie RAM-dysku na Windows przez ImDisk/OSFMount).
