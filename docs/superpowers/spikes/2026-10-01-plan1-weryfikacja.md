# Plan 1 — weryfikacja warunków ukończenia

Data: 2026-10-01 · macOS (Windows: oczekuje — `spike/WINDOWS-CHECKLIST.md`, warunek ukończenia planu 2).
Metoda: `npm start` działał w tle przez całą sesję; skrypt co 5 s zapisywał rozmiar `stdout.txt`, identyfikator z linii `Startup session with id` oraz `logState` z `/api/health`. Gra z modem sond (`spike/tflive_probe`, linie P9 co 10 s): sesja ok. 2 min, zamknięcie do pulpitu, ponowne uruchomienie, sesja ok. 45 s.

| Warunek (spec §8) | macOS | Windows | Dowód |
|---|---|---|---|
| (a) odczyt `stdout.txt` podczas gry | tak | oczekuje | `logState: "ok"` w każdej z 287 próbek, także przy działającej grze |
| (b) gra tworzy nowy log przy cyklicznym odczycie | tak | oczekuje | dwa restarty gry przy działającym serwerze: identyfikator sesji `e5ff9cba` → `7d5a4e06` → `b7f1ea43`, rozmiar pliku spadał do ok. 25 KB i rósł dalej |
| (c) opóźnienie zapisu logu | linie trafiają do pliku na bieżąco | oczekuje | przyrosty co 5–10 s po ~144 B (pojedyncze linie P9), bez okresów buforowania |

Uwagi:
- Serwer nie zgłosił błędu odczytu ani nie zablokował tworzenia nowego logu (otwiera plik tylko na czas odczytu).
- Danych gry w formacie `[TFLIVE]` nie było (mod sond ich nie wysyła); poprawność przetwarzania sekcji pokrywają testy i tryb demo. Pełny test end-to-end — po planie 2 (mod).
- Pomiar na mapie z setkami pojazdów: nadal nieustalony (warunek planu 2).
