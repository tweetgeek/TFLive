---
status: superseded by ADR-0003
---

# Wymiana danych gra → serwer przez pliki, z RAM-dyskiem, gdy jest dostępny

Skrypty Lua w Transport Fever 3 nie mają dostępu do sieci, więc mod przekazuje dane serwerowi, nadpisując w miejscu małe pliki sekcji w katalogu wymiany. Serwer odczytuje je pollingiem `stat`. Żeby nie zużywać SSD, serwer podmienia katalog wymiany na dowiązanie (symlink na macOS, junction na Windows) do RAM-dysku: na macOS tworzy go sam przez `hdiutil`, na Windows używa RAM-dysku wskazanego w konfiguracji. Gdy RAM-dysk jest niedostępny, zostaje zwykły katalog z ograniczonym budżetem zapisu. Przepływ jest jednokierunkowy: serwer nigdy nie zapisuje niczego, co czyta gra.

## Rozważane opcje

- **Odczyt logu gry (`print`)**: zostaje jako kanał awaryjny tylko dla `meta` i `finance`, bo log rośnie bez ograniczeń i nie da się go kontrolować.
- **Parsowanie Zapisów gry**: odrzucone. Format jest binarny, a dane są dostępne tylko w momencie zapisu, więc to nie jest „live”.
- **Kanał zwrotny serwer → mod** (np. zlecenia odczytu): odrzucony. Uzupełnienie historii mod wykonuje samodzielnie po wczytaniu Zapisu gry.
