# Kalkulator PV + BESS — narzędzie sprzedażowe

Jednoplikowa aplikacja webowa do prowadzenia rozmowy z klientem biznesowym o instalacji PV i magazynu energii. Działa offline, z poziomu przeglądarki, bez instalacji niczego.

## Co liczy

Narzędzie modeluje **6 strumieni przychodu/oszczędności**, których brakuje w innych narzędziach na rynku PL:

1. **Autokonsumpcja PV** — produkcja zużywana na miejscu vs. zakup z sieci.
2. **Sprzedaż nadwyżek po RCEm** — net‑billing prosumenta biznesowego.
3. **Arbitraż dzień/noc BESS** — ładowanie tanio, rozładowanie drogo.
4. **Strażnik mocy / peak shaving** — obniżenie mocy umownej × składnik stały taryfy × 12 mies.
5. **Eliminacja kar za przekroczenia mocy umownej** — historia przekroczeń × stawka kary (10×).
6. **Reklasyfikacja opłaty mocowej K3/K4 → K2/K1** — różnica współczynnika × baza × roczne zużycie.

Plus dla utility (≥ 1 MW): **DSR + Rynek Mocy + FCR/aFRR**.

Wynik: payback, NPV (15 lat), IRR, oszczędność miesięczna, CAPEX z rozbiciem, wykres godzinowy działania BESS, eksport PDF dla klienta.

## Jak otworzyć

1. Otwórz plik `index.html` w przeglądarce (Chrome / Safari / Edge — dwuklik wystarczy).
2. Internet jest potrzebny tylko do pobrania bibliotek z CDN przy pierwszym otwarciu (potem działa offline w cache).
3. Idź przez 5 kroków kreatora:
   - **Krok 1** — wybierz tryb pracy (PV+BESS / Strażnik mocy / Arbitraż / DSR).
   - **Krok 2** — wpisz dane klienta i taryfę.
   - **Krok 3** — wpisz roczne zużycie i wybierz archetyp profilu (lub wgraj CSV w wersji 1.1).
   - **Krok 4** — moc PV i pojemność BESS (zostaw 0 dla auto‑doboru).
   - **Krok 5** — czytasz wyniki, eksportujesz PDF.

## Jak edytować cennik

Cennik to plik `pricing.js` (JavaScript object literal — znajomy format JSON z komentarzami).

**Trzy najczęstsze edycje:**

```javascript
// 1) Zmiana ceny BESS (np. po nowej dostawie):
window.PRICING.bess = [
  { do_kWh:  100, zl_per_kWh: 1700 },  // ← edytuj tutaj
  ...
];

// 2) Zmiana marży handlowej:
window.PRICING.narzuty.marza_handlowa_pct = 15;  // było 12

// 3) Włączenie/wyłączenie konkretnej dotacji:
//    Zmień status: "AKTYWNY" / "PRZED_NABOREM" / "OGLOSZONE" / "ZAMKNIETY"
```

Po edycji pliku odśwież stronę (Cmd+R / Ctrl+R) — zmiany wchodzą natychmiast.

## Profile zużycia

`profiles.js` definiuje **7 archetypów** (hala 8‑16, hala 24/7, biuro, sklep, hotel, chłodnia, ferma drobiu). Każdy to funkcja zwracająca względną intensywność w każdej z 8760 godzin roku.

Jeśli klient ma własny profil z licznika 15‑min/godzinowy — w wersji 1.1 dorobimy import CSV.

## Jak prowadzić rozmowę z klientem (cheatsheet handlowca)

**Pierwsze 30 sekund:** *"Pokażę Panu dokładnie, ile zaoszczędzi Pana firma na BESS i PV, w trzech wariantach. Wystarczy że odpowie Pan na 4 pytania z faktury OSD."*

**Pytania do klienta** (wpisujesz na bieżąco do narzędzia):
1. *"Jaka jest moc umowna i taryfa z faktury?"* → step 2
2. *"Ile MWh rocznie zużywacie?"* → step 3
3. *"Kiedy macie szczyty zużycia — rano, południe, wieczór, ciągle?"* → archetype profile
4. *"Czy zdarzało się przekroczenie mocy umownej?"* → step 2 (przekroczenia)

**Najsilniejszy hak:**

> "Sam BESS, bez PV, na 5 lat zwraca Panu inwestycję poprzez **obniżenie mocy umownej o X kW** + **eliminację kar za przekroczenia** + **reklasyfikację K3 do K2** w opłacie mocowej. Tych trzech rzeczy razem żaden konkurent Panu nie pokaże, a to są realne pieniądze już od pierwszego miesiąca."

**Po wynikach:** kliknij **Eksport PDF** → wydrukuj na spotkaniu lub wyślij mailem od razu.

## Założenia i ograniczenia

- Profile dobowe są syntetyczne (generator funkcji, nie pomiar 15‑min). Dokładność ±15% wzg. realnej krzywej. **Dla wstępnej oferty wystarczy.** Dla finalnego projektu zawsze prosić o profil 15‑min od klienta.
- Ceny RCEm i opłaty mocowej zaszyte w `pricing.js` to wartości **maj 2026**. Przy zmianie regulacji — aktualizuj plik.
- Dotacje sprawdzane były 5 maja 2026. Status każdego programu zmienia się dynamicznie (nabory się otwierają i zamykają). **Przed użyciem dotacji w ofercie — zweryfikuj status na stronie programu.**
- Dla projektów ≥ 2 MW / 4 MWh tryb DSR wymaga umowy z agregatorem VESS (Energy Mesh, Reverion, etc.). Narzędzie liczy potencjalny przychód, nie gwarantuje go.
- **CAPEX nie zawiera kosztu warunków przyłączenia od OSD** (kaucja 30 zł/kW przy zwiększaniu mocy). To pozycja po stronie klienta.

## Struktura plików

```
bess-calculator/
├── index.html      ← otwierasz dwuklik
├── pricing.js      ← edytujesz cennik
├── profiles.js     ← profile zużycia (zaawansowane edycje)
└── README.md       ← ten plik
```

## Dalszy rozwój (backlog)

- Import CSV z licznika 15‑min (PSGAS / OSD / smart meter Tauron).
- Tryb white‑label: wstaw logo i kolory swojej firmy.
- Wersja Next.js + Neon zintegrowana z CRM EE — perspektywa Q3 2026.
- Backtest historyczny TGE 2023‑2025 dla scenariusza arbitrażu.
- Symulacja Monte Carlo dla ścieżki cen energii (5 scenariuszy: niski / bazowy / wysoki / szok-up / szok-down).
- Kalkulator finansowania: kredyt komercyjny vs. leasing operacyjny vs. PPA.

## Wsparcie

Gdy coś nie działa — sprawdź console przeglądarki (F12 → Console). Najczęstsze problemy:
- *"Cannot read property 'pv' of undefined"* — `pricing.js` ma błąd składni. Sprawdź czy nie brakuje przecinka.
- *"PROFILES is not defined"* — `profiles.js` nie wczytał się. Sprawdź czy plik istnieje obok `index.html`.
- PDF wychodzi pusty / urwany — przeglądarka blokuje generowanie. Spróbuj w Chrome.
