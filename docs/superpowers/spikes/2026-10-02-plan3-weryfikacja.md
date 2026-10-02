# Plan 3 — weryfikacja interfejsu (2026-10-02)

Środowisko: `npm run demo` (log `server/fixtures/demo.log`), Chromium przez Playwright, macOS.
Automatycznie: `npm test` 224/224, `npm run typecheck` bez błędów, `npm run build` OK (`web/dist`).

| Widok | 1280×800 | 390×844 | Uwagi |
|---|---|---|---|
| Przegląd | OK (zrzut) | bez przewijania w poziomie | KPI, top 5 alertów, słupki miesięcy zgodne z makietą |
| Alerty | OK | bez przewijania w poziomie | |
| Linie | OK (zrzut) | bez przewijania w poziomie | tabela + panel szczegółów; wyciszony alert ukryty w panelu |
| Pojazdy | OK | OK (zrzut) | filtry zawijają się; tabela przewija się wewnątrz ramki |
| Przemysł | OK | bez przewijania w poziomie | |
| Miasta | OK | OK (zrzut) | dolny pasek nawigacji z licznikiem alertów |

Konsola: jedyny błąd to brak `favicon.ico` (404).

## Rozbieżności i uwagi
- **Demo zawsze „offline”** — status „na żywo” serwer liczy ze znacznika czasu w linii logu; `demo.log` ma stałe znaczniki, więc w trybie demo widać baner „Brak nowych danych z gry”, choć dane płyną (data gry się zmienia). Problem planu 1 (generator/odtwarzanie demo), nie interfejsu.
- Nazwy towarów w potrzebach miast wyświetlają się wielkimi literami (dziedziczą `text-transform` z `.lbl`).
- „Pozostałe 1 miast nieobsługiwanych” — brak odmiany liczebnika.
- Brak `favicon.ico`.
