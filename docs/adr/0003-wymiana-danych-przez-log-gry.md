# Wymiana danych gra → serwer przez log gry

Krok 0 wykazał, że skrypty Transport Fever 3 (Lua 5.2, w wątkach symulacji i w GUI) nie mają `io`, `package.loadlib` ani natywnych modułów, więc mod nie może zapisywać plików ani otwierać połączeń. Jedynym wyjściem jest `debugPrint`, który gra dopisuje do `crash_dump/stdout.txt`. Mod wypisuje więc każdą sekcję jako jedną samowystarczalną linię `[TFLIVE] …` z identyfikatorami Rozgrywki, sesji i kolejności (format w spec §7), a serwer czyta log przyrostowo i rozpoznaje restart gry po identyfikatorze sesji w nagłówku logu. Log zostaje na SSD: użytkownik odrzucił podpięcie katalogu logów gry na RAM-dysk. Ochronę dysku zapewniają rzadkie interwały, wpisy tylko przy zmianie, brak wpisów w pauzie i to, że gra nadpisuje log przy każdym starcie.

## Rozważane opcje

- **Pliki sekcji (ADR 0001)**: niemożliwe, `io=nil`.
- **Symlink `crash_dump` na RAM-dysk**: technicznie możliwy do sprawdzenia, odrzucony przez użytkownika (zmiana w katalogu danych gry, utrata logów awaryjnych po restarcie komputera).
- **Natywny moduł sieciowy przez `require`**: niemożliwe, gra używa własnego loadera bez `package.loadlib`/`cpath`.
