# TFLive

Dashboard pokazujący na żywo stan bieżącej rozgrywki Transport Fever 3 oraz alerty o problemach wymagających reakcji gracza.

## Język

### Rozgrywka i czas

**Rozgrywka**:
Jedna linia rozwoju gry gracza, identyfikowana przez identyfikator nadany przy pierwszym uruchomieniu modu i przechowywany w zapisie gry. Wszystkie zapisy gry z tej linii należą do tej samej Rozgrywki.
_Unikaj_: save, savegame, sesja, gra

**Cofnięcie**:
Wczytanie zapisu Rozgrywki z czasem gry wcześniejszym niż ostatnio widziany. Historia po tym momencie jest porzucana i zastępowana nowymi danymi.
_Unikaj_: rollback, reload

**Okno kroczące**:
Ostatnie 12 miesięcy czasu gry, w którym oceniamy wyniki i aktywność gracza, niezależnie od granic roku kalendarzowego gry.
_Unikaj_: ostatni rok, bieżący rok

**Historia**:
Miesięczne metryki Rozgrywki (finanse, Linie, miasta, Fabryki, liczba Pojazdów) przechowywane przez TFLive.

**Uzupełnienie historii**:
Jednorazowe odtworzenie z księgi gry miesięcznych Wyników operacyjnych firmy i Linii za okres sprzed zbierania Historii przez TFLive lub za okres obcięty przez Cofnięcie.
_Unikaj_: backfill, import

**Zapis gry**:
Plik zapisu Transport Fever 3. Kilka Zapisów gry może należeć do jednej Rozgrywki.
_Unikaj_: save (bez kontekstu)

### Finanse

**Koszty bieżące**:
Wydatki na utrzymanie Pojazdów i infrastruktury oraz odsetki. Nie obejmują budowy ani zakupu Pojazdów.
_Unikaj_: wydatki, koszty (bez przymiotnika)

**Wynik operacyjny**:
Przychody minus Koszty bieżące w danym okresie.
Dotyczy całej firmy gracza albo pojedynczej Linii lub Pojazdu.
_Unikaj_: zysk, bilans

**Inwestycja**:
Wydatek na budowę lub zakup Pojazdów. Nie wpływa na Wynik operacyjny.

**Rezerwa**:
Saldo gracza wyrażone w miesiącach średnich Kosztów bieżących z Okna kroczącego.
_Unikaj_: płynność, poduszka

### Linie

**Linia**:
Trasa gracza złożona z uporządkowanej listy Przystanków, obsługiwana przez przypisane do niej Pojazdy.
_Unikaj_: trasa, route, połączenie

**Początek linii**:
Moment pierwszego wpisu finansowego Linii w księdze gry. Jeśli księga go nie wskazuje, jest to moment, w którym TFLive pierwszy raz zobaczył Linię.
_Unikaj_: data utworzenia, data założenia

**Rozruch**:
Pierwsze 6 miesięcy czasu gry od Początku linii, w których nie oceniamy jej rentowności.
_Unikaj_: okres próbny, nowa linia

**Nierentowna linia**:
Linia po Rozruchu z ujemnym Wynikiem operacyjnym w Oknie kroczącym. Zakupy Pojazdów dla Linii są Inwestycją i nie wpływają na ocenę.
_Unikaj_: stratna linia, linia na minusie

**Obłożenie linii**:
Średni stosunek ładunku do pojemności Pojazdów Linii w chwili odjazdu z przystanku, z ostatnich 3 miesięcy czasu gry.
_Unikaj_: wypełnienie, load factor, wykorzystanie

**Niskie obłożenie**:
Obłożenie linii poniżej 25%. Sugeruje nadmiar Pojazdów, a nie awarię.

**Przystanek**:
Nazwane miejsce, w którym Linia zatrzymuje się, by zabrać lub zostawić pasażerów albo towar, np. dworzec, przystanek autobusowy, port lub lotnisko. Odpowiada temu, co gra pokazuje graczowi jako jedną stację.
_Unikaj_: stacja, terminal, station group

**Przeciążony przystanek**:
Przystanek, który gra ocenia jako źle obsłużony: oznacza go jako bardzo zły albo co najmniej 25% oczekujących pasażerów lub towaru uznaje za źle obsłużonych.
_Unikaj_: przepełniona stacja, zatłoczony przystanek

### Pojazdy

**Pojazd**:
Cała jednostka transportowa przypisywana do Linii, np. pociąg ze wszystkimi wagonami, autobus lub statek.
_Unikaj_: skład (jako osobny termin), vehicle, transport vehicle

**Część pojazdu**:
Pojedynczy element Pojazdu z własną datą zakupu i stanem, np. lokomotywa albo wagon.
_Unikaj_: wagon (jako termin ogólny), vehicle part

**Wiek pojazdu**:
Wiek najstarszej Części pojazdu.

**Stan pojazdu**:
Najgorszy stan utrzymania spośród Części pojazdu.
_Unikaj_: niezawodność, kondycja, zużycie

**Wykorzystanie żywotności**:
Wiek Części pojazdu jako procent żywotności jej modelu określonej przez grę.
_Unikaj_: zużycie, starość

**Stary pojazd**:
Pojazd, w którym co najmniej jedna Część pojazdu ma Wykorzystanie żywotności co najmniej 100%.
_Unikaj_: przestarzały, wysłużony

**Pojazd bez trasy**:
Pojazd, dla którego gra nie potrafi wyznaczyć drogi do następnego celu.
_Unikaj_: zablokowany, zgubiony

**Pojazd czekający**:
Pojazd stojący na przystanku dłużej niż 30 dni gry, zwykle w oczekiwaniu na załadunek.
_Unikaj_: stojący, utknięty

**Bezczynny pojazd**:
Pojazd bez Linii lub przebywający w zajezdni dłużej niż 30 dni gry.
_Unikaj_: nieużywany, wolny

**Pojazd zatrzymany**:
Pojazd celowo zatrzymany przez gracza. Nie jest uznawany za problem.
_Unikaj_: wstrzymany, zapauzowany

### Przemysł

**Fabryka**:
Każdy obiekt przemysłowy na mapie, który zużywa lub wytwarza towar, w tym kopalnie, farmy i zakłady przetwórcze.
_Unikaj_: industry, zakład (jako osobny termin)

**Obsługiwana fabryka**:
Fabryka, którą w Oknie kroczącym zaopatrzyła lub z której odebrała towar co najmniej jedna Linia gracza. Tylko takie Fabryki podlegają alertom łańcucha dostaw.
_Unikaj_: podłączona fabryka, aktywna fabryka

**Niedostarczony surowiec**:
Wymagany surowiec Obsługiwanej fabryki przetwórczej, który nie wpłynął do niej w ostatnich 2 miesiącach czasu gry.
_Unikaj_: brak surowców, fabryka bez wejść

**Zalegająca produkcja**:
Stan, w którym magazyn wyjściowy Obsługiwanej fabryki jest zapełniony co najmniej w 80% dłużej niż 1 miesiąc czasu gry.
_Unikaj_: nieodbierana produkcja, nadprodukcja

**Groźba zamknięcia**:
Termin zamknięcia, który gra wyznaczyła Fabryce.
_Unikaj_: upadek, likwidacja

### Miasta

**Obsługiwane miasto**:
Miasto, do którego gracz dostarczył w Oknie kroczącym co najmniej jeden towar albo w którym ma Przystanek z ruchem pasażerskim. Tylko takie miasta podlegają alertom.
_Unikaj_: podłączone miasto

**Spadek dostaw**:
Sytuacja, w której towar już dostarczany przez gracza do Obsługiwanego miasta pokrywa mniej niż połowę potrzeby albo w ciągu 3 miesięcy spadł o ponad 30%.
_Unikaj_: niedobór, braki

**Niezaspokojona potrzeba**:
Potrzeba towarowa miasta, której gracz w ogóle nie zaspokaja. Jest to szansa, nie problem.
_Unikaj_: niezaspokojony popyt, brak dostaw

### Alerty

**Alert**:
Wykryty problem dotyczący jednej encji gry (Linii, Pojazdu, Fabryki, Miasta, Przystanku lub finansów), który trwa, dopóki jego warunek jest spełniony.
_Unikaj_: powiadomienie, ostrzeżenie (jako osobny termin)

**Ignorowanie**:
Bezterminowe ukrycie Alertu danego rodzaju dla konkretnej encji w Rozgrywce, cofane tylko przez gracza.
_Unikaj_: wyciszenie na zawsze, blokada

**Odłożenie**:
Ukrycie Alertu danego rodzaju dla konkretnej encji do wskazanego momentu czasu gry. Po nim Alert wraca, jeśli warunek nadal jest spełniony.
_Unikaj_: drzemka, snooze

**Wyciszenie**:
Wspólna nazwa Ignorowania i Odłożenia.
