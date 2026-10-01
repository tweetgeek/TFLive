# Krok 0 na Windows — checklista (kanał przez log)

Runda macOS wykazała, że mod nie może zapisywać plików (`io=nil`). Na Windows sprawdzamy więc tylko:
(1) czy mod się ładuje, (2) czy wyniki sond są takie same, (3) czy inny proces może czytać `stdout.txt`, gdy gra działa, (4) czy linie trafiają do pliku na bieżąco, (5) czy gra tworzy nowy log, gdy inny proces cyklicznie go czyta.

1. Skopiuj folder `spike\tflive_probe` do
   `C:\Program Files (x86)\Steam\userdata\<steamId>\3493540\local\mods\`
   (`<steamId>` to folder liczbowy w `userdata`, w którym jest `3493540`).
2. Uruchom grę, sprawdź, czy `tflive_probe` jest na liście modów, włącz go, wczytaj **kopię** zapisu i graj ~30 s.
3. **Gdy gra nadal działa**, w PowerShell:
   ```powershell
   $D = (Get-ChildItem "C:\Program Files (x86)\Steam\userdata\*\3493540\local" | Select-Object -First 1).FullName
   $fs = [System.IO.File]::Open("$D\crash_dump\stdout.txt", 'Open', 'Read', 'ReadWrite')
   "otwarto do odczytu podczas gry: rozmiar=$($fs.Length)"; $fs.Close()
   Select-String -Path "$D\crash_dump\stdout.txt" -Pattern "TFLIVE-PROBE" | Where-Object { $_.Line -notmatch 'P15 BEGIN' } | ForEach-Object { $_.Line.Substring(0, [Math]::Min(330, $_.Line.Length)) } | Out-File probe-log-windows.txt
   ```
   Oczekiwane: komunikat `otwarto do odczytu podczas gry` (bez błędu „used by another process”).
4. **Opóźnienie zapisu:** gdy gra działa, w PowerShell:
   ```powershell
   $a = (Get-Item "$D\crash_dump\stdout.txt").Length; Start-Sleep 5; $b = (Get-Item "$D\crash_dump\stdout.txt").Length; "przyrost w 5 s: $($b - $a) B"
   ```
   Oczekiwane: przyrost > 0 (linie P9 co 10 s trafiają do pliku na bieżąco). Powtórz 3 razy.
5. Zapauzuj na ~10 s, wyjdź z gry bez zapisywania.
6. **Nowy log przy cyklicznym odczycie:** uruchom w osobnym oknie PowerShell pętlę, która co sekundę otwiera i zamyka log, a potem uruchom grę ponownie:
   ```powershell
   while ($true) { try { $fs = [System.IO.File]::Open("$D\crash_dump\stdout.txt", 'Open', 'Read', 'ReadWrite,Delete'); $fs.Close() } catch { "błąd: $_" }; Start-Sleep 1 }
   ```
   Oczekiwane: gra startuje normalnie, a w logu jest nowa linia `Startup session with id`. Przerwij pętlę klawiszami Ctrl+C.
7. Przekaż plik `probe-log-windows.txt` i wyniki kroków 3, 4 i 6.
8. Usuń folder `tflive_probe` z katalogu modów.
