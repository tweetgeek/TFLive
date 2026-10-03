# TFLive — centrum dowodzenia na dużym ekranie (uzupełnienie spec §6)

Data: 2026-10-02. Zaakceptowane przez użytkownika w rozmowie („ok”). Uzupełnia `2026-10-01-tflive-dashboard-design.md` §6.

## Cel
Na monitorach 1920×1080, 2048×1152, 2560×1440 i ekranach MacBooków z Retiną (okno od 1400×720) panel ma pokazywać jak najwięcej danych na jednym ekranie i wypełniać go niemal w 100%, bez przewijania strony.

## Kiedy
- Szerokość okna ≥ 1400 px **i** wysokość ≥ 720 px („duży ekran”; zmienione 2026-10-03 z 1800×900, żeby objąć MacBooki z Retiną): adres `#/przeglad` (domyślny) pokazuje **centrum dowodzenia**.
- Pozostałe adresy (`#/alerty`, `#/linie`, …) na dużym ekranie pokazują pełne widoki zakładek (bez limitu szerokości).
- Poniżej progu (tablet, telefon): obecne zakładki bez zmian.

## Układ centrum dowodzenia
- Całość mieści się w `100vh`; przewijają się tylko wnętrza paneli (nagłówki tabel przyklejone).
- Wiersz KPI (6 wartości w jednej linii, zwarte).
- Siatka 3 kolumn ok. 25% / 45% / 30%:
  - lewa: 🔔 Alerty na całą wysokość (zwarte wiersze, chipsy kategorii, ⏰/🔕 jako małe przyciski z etykietą dostępności);
  - środkowa: 🛤️ Linie (~55% wysokości; pełna tabela z sortowaniem, mini-wykres 3 mies. w wierszu, szczegóły rozwijane w wierszu) i 🚆 Pojazdy (~45%; tabela z filtrami);
  - prawa: 📊 Wynik operacyjny (słupki, koszty bieżące, najlepszy pojazd), 🏭 Przemysł (kompaktowe wiersze, groźba zamknięcia na górze), 🏙️ Miasta (kompaktowe wiersze: ludność, potrzeby, 💡 szanse).
- Każdy panel ma nagłówek z liczbą elementów i link „↗” do pełnego widoku.
- Na 2560×1440 ta sama siatka; tekst skaluje się płynnie 13→15 px, więcej wierszy w panelach.

## Wąskie panele (1400–1800 px)
- Układ dopasowuje się do szerokości panelu (container queries): w Liniach chowa się kolumna trybu, a tagi pokazują samo emoji (z `title`); w Pojazdach chowa się wiek i pasek stanu, nagłówki i stan ruchu się zawijają.
- Etykiety KPI w centrum stoją nad wartością i mogą się zawijać — nie są ucinane.

## Gęstość i dostępność
- Odstępy 8–12 px, wiersze tabel ~30 px.
- Na dużym ekranie (mysz) cele interakcji ≥ 28 px z odstępami — świadome odstępstwo od ≥ 44 px, które nadal obowiązuje na tablecie i telefonie.
- Kontrast ≥ 4,5:1 i widoczny fokus bez zmian.

## Poza zakresem
Bez zmian w serwerze i modzie; te same dane, magazyn stanu i funkcje pomocnicze.
