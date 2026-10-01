# TFLive

Dashboard live dla Transport Fever 3: finanse, linie, pojazdy, przemysł i miasta z bieżącej rozgrywki oraz alerty o problemach. Otwierany w przeglądarce na komputerze lub tablecie w sieci domowej.

Stan projektu: serwer (plan 1). Mod gry (plan 2) i interfejs (plan 3) w przygotowaniu.

## Wymagania

- Node.js ≥ 22.13 (testowane na 24.x)
- Transport Fever 3 (Steam) na macOS lub Windows — na tym samym komputerze co serwer

## Uruchomienie

```bash
npm install
npm start        # czyta log gry na żywo
npm run demo     # dane przykładowe, bez gry
npm test         # testy
```

Serwer wypisuje adresy, pod którymi jest dostępny (np. `http://192.168.1.20:8787` dla tabletu).

API: `GET /api/health`, `GET /api/state`, `GET/POST /api/mutes`, `DELETE /api/mutes/:id`, WebSocket `/ws`.

## Konfiguracja

Skopiuj `config/config.example.json` → `config/config.json` i `config/alerts.example.json` → `config/alerts.json`, jeśli chcesz zmienić port, ścieżkę logu albo progi alertów.

Serwer sam szuka logu gry:
- macOS: `~/Library/Application Support/Steam/userdata/<id>/3493540/local/crash_dump/stdout.txt`
- Windows: `C:\Program Files (x86)\Steam\userdata\<id>\3493540\local\crash_dump\stdout.txt`

Jeśli Steam jest w innym miejscu, ustaw `"logPath"` w `config/config.json`.

## Jak to działa

Mod gry wypisuje dane do logu gry (skrypty TF3 nie mogą zapisywać plików ani łączyć się z siecią — zob. `docs/adr/0003-wymiana-danych-przez-log-gry.md`). Serwer czyta log co sekundę, liczy alerty, zapisuje miesięczną Historię w `server/data/tflive.sqlite` i wysyła stan przez WebSocket.

Dokumentacja: `docs/superpowers/specs/2026-10-01-tflive-dashboard-design.md`, słownik pojęć: `CONTEXT.md`.
