# Plan 4 — weryfikacja centrum dowodzenia (2026-10-02)

Środowisko: `npm run demo`, Chromium (Playwright), macOS. Automatycznie: `npm test` 259/259, typecheck i build OK.

| Rozdzielczość | Centrum | Przewijanie strony | Wypełnienie wysokości | Panele | Uwagi |
|---|---|---|---|---|---|
| 1920×1080 | tak | brak | 99% | 6 | baner demo widoczny, mieści się |
| 2048×1152 | tak | brak | 99% | 6 | |
| 2560×1440 | tak | brak | 99% | 6 | tekst 15 px (skala płynna) |
| 1280×800 | nie (Przegląd) | brak poziomego | — | — | jak dotąd |
| 390×844 | nie (zakładki) | brak poziomego we wszystkich 6 widokach | — | — | jak dotąd |

- Przełączanie układu przy zmianie rozmiaru okna działa bez przeładowania (2048 → 1280).
- Klawiatura: wiersz linii z fokusem, Enter rozwija szczegóły (`aria-expanded="true"`), strona się nie przewija.
- Proporcje kolumn przy 1920: 472 / 850 / 566 px; Linie 511 px i Pojazdy 418 px wysokości (≈ 55/45).

## Uwagi
- Demo ma mało danych (3 linie, 8 pojazdów), więc panele mają wolne miejsce; przy prawdziwej grze panele przewijają się wewnątrz.
- Drobne: w rozwiniętych szczegółach linii brak odstępu między etykietą („PRZYSTANKI”, „POJAZDY”) a pierwszą pozycją.
- Demo nadal pokazuje „offline” i baner „Brak nowych danych” (stałe znaczniki czasu w logu demo — plan 1).
