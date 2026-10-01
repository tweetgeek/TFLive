# Krok 0 na Windows — checklista (kanał przez log)

Runda macOS wykazała, że mod nie może zapisywać plików (`io=nil`). Na Windows sprawdzamy więc tylko:
(1) czy mod się ładuje, (2) czy wyniki sond są takie same, (3) czy inny proces może czytać `stdout.txt`, gdy gra działa.

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
4. Zapauzuj na ~10 s, wyjdź z gry bez zapisywania.
5. Przekaż plik `probe-log-windows.txt` i wynik kroku 3.
6. Usuń folder `tflive_probe` z katalogu modów.
