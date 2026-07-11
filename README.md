# Kalkulator HT PROJEKT — narzędzie sprzedażowe PV+BESS

Jednoplikowa aplikacja webowa do prowadzenia rozmowy z klientem biznesowym o instalacji PV i magazynu energii. Działa w przeglądarce, bez instalacji niczego, brandowane pod **HT PROJEKT** (htprojekt.pl).

---

## Co to robi (5-stepowy kreator)

**Krok 1 — Tryby pracy** (multiselect, można wybrać kilka jednocześnie)
- **PV + BESS klasyczny** — autokonsumpcja, sprzedaż RCEm, arbitraż dzienny
- **Strażnik mocy** ★ — peak shaving, obniżenie mocy umownej, eliminacja kar, reklasyfikacja K3→K2
- **Arbitraż TGE / SPOT** — kupuj P20, sprzedaj P80
- **DSR / Rynek Mocy** (≥1 MW) — usługi systemowe PSE

**Krok 2 — Klient i taryfa**
- Województwo (uzysk PV per region)
- Taryfa (B/C/G — wszystkie polskie)
- Moc umowna [kW]
- Współczynnik K (1-4) opłaty mocowej
- **Produkt energetyczny:** FIX / SPOT / Transze (Q1-Q4) / CFD

**Krok 3 — Profil zużycia** (dwie metody do wyboru)
- **A) Archetyp** — 7 typów (hala 8-16, hala 24/7, biuro, sklep, hotel, chłodnia, ferma drobiu)
- **B) CSV** — drag&drop z licznika 15-min lub godzinowego. Auto-liczy: roczne zużycie, szczyt, **liczbę przekroczeń mocy umownej**, energię ponad limit

**Krok 4 — PV + BESS**
- Status PV (planowana / istniejąca / brak)
- Auto-dobór mocy lub ręczne wpisanie
- Konkretny produkt z katalogu (Kstar AIO / HyxiPower / Sofar BTS / Kostal Helvior)
- **Parametry techniczne BESS:** DOD, Max/Min SOC, sprawność, degradacja roczna, cykli rocznie
- **Parametry finansowe:** stopa dyskonta, horyzont, eskalacja cen energii
- Dotacja (auto-picker lub ręczny wybór)

**Krok 5 — Wyniki**
- 4 KPI cards: payback, NPV 15 lat, oszczędność/m-c, CAPEX po dotacji
- Wykres strumieni oszczędności (doughnut)
- Tabela CAPEX z rozbiciem
- Cashflow 15 lat (z realną degradacją BESS-zależnych strumieni)
- Pokrycie zużycia 12-miesięcy (stacked bar: sieć + autokonsumpcja PV + BESS + eksport)
- Koszt energii BEZ vs Z instalacją (słupki miesięczne)
- Profil dobowy BESS (typowy dzień lipca)
- Eksport PDF jednym klikiem

---

## Co liczy silnik (godzinowo, 8760 h/rok)

Dla każdej z 8760 godzin roku, narzędzie buduje:
- `consumption[h]` — z archetypu klienta lub CSV
- `pv[h]` — z krzywej PV × moc kWp × uzysk regionalny
- `priceRDN[h]` — krzywa cen RDN (intra-day cosinus + sezonowość zima/lato + niedzielne dno)

I symuluje BESS:
```
net = consumption[h] - pv[h]
jeśli net < 0:           → ładuj BESS z PV, reszta eksport
jeśli net > 0:           → rozładuj BESS na zużycie
jeśli arbitraż aktywny:
   cena tania (P20)      → ładuj BESS z sieci
   cena droga (P80)      → rozładuj BESS (najpierw na unikniony zakup, potem eksport)
jeśli strażnik mocy:     → priorytet: ścinaj szczyt by import < (mocUmowna - ΔP)
```

Z symulacji wynikają **realne** liczby:
- autokonsumpcja kWh, eksport kWh, import kWh
- cykli BESS rocznie (nie hardcoded 280)
- liczba godzin przekroczenia mocy umownej (po BESS)
- zysk z arbitrażu = przychód_eksport - koszt_ładowanie

### 6 strumieni oszczędności (sumują się ze wszystkich aktywnych trybów)

| # | Strumień | BESS-zależny (degraduje)? |
|---|----------|---------------------------|
| 1 | Autokonsumpcja PV | ✅ tak |
| 2 | Sprzedaż nadwyżek po RCEm | ✅ tak |
| 3 | Arbitraż BESS dzień/noc | ✅ tak |
| 4 | Obniżenie mocy umownej | ❌ nie (tylko eskaluje z cenami) |
| 5 | Eliminacja kar za przekroczenia | ❌ nie |
| 6 | Reklasyfikacja opłaty mocowej K | ❌ nie |
| 7 | Rynek Mocy + DSR (utility) | ❌ nie |

**To dlatego cashflow nie jest liniowy**: strumienie BESS-zależne maleją z degradacją (typowo -3%/rok), niezależne tylko rosną z eskalacją cen (+5%/rok). Krzywa skumulowana staje się wypukła w pierwszych latach.

---

## Cennik (HT PROJEKT × 1.20 z ICD)

Konkretne produkty z `Kalkulator MEPH ICD 26032026.xlsm` i `Kalkulator ICDPH 26032026.xlsm` × 20% narzutu HT:
- **Kstar AIO** 5,12 / 10,24 / 15,36 / 20,48 / 25,60 / 30,72 / 35,90 / 41,02 kWh
- **HyxiPower HYX-E50/100/150/200/250/300/400/500** (H2/H3)
- **Sofar BTS E5-E30 DS5**
- **Kostal Helvior HV** 6,4 / 9,6 / 12,8 kWh

Plus tier_skali dla większych pojemności (>50 kWh): **1080-1380 zł/kWh** netto.

Falowniki: KSTAR / HyxiPower / SOFAR ESI / Kostal PLENTICORE G3.
Moduły PV: JA Solar 500 W (~660 zł/kWp).

PV razem z montażem, systemem i okablowaniem:
- Dach: 2500-4200 zł/kWp (w zależności od skali)
- Grunt: 2220-3360 zł/kWp

---

## Dotacje aktywne (5 maja 2026)

| Program | Status | % | Target |
|---------|--------|---|--------|
| RPO regionalne (Q2 2026, 16 województw) | OGŁOSZONE | 40% | MŚP, JST, klastry |
| FEnIKS 11.2 — magazyny | PRZED NABOREM | 50% | OSD, przedsiębiorca |
| Kredyt Ekologiczny BGK V | ZAMKNIĘTY | 70% | MŚP, midcap |
| Energia dla Wsi (NFOŚiGW) | PRZED NABOREM | 20% + 100% pożyczka | rolnik, MŚP wiejski |
| Fundusz Modernizacyjny (≥2 MW/4 MWh) | AKTYWNY | 45% | przedsiębiorca, JST |
| Grant OZE BGK | AKTYWNY (do 30.06.2026) | 50% | wspólnoty mieszkaniowe |

Auto-picker dobiera odpowiednią dotację wg profilu klienta. Można zmienić ręcznie.

---

## Jak otworzyć

1. Dwuklik `index.html` → otwiera w przeglądarce (Chrome / Safari / Edge)
2. Internet potrzebny tylko przy pierwszym otwarciu (CDN: Tailwind, Chart.js, jsPDF)
3. Po pierwszym uruchomieniu działa offline w cache

---

## Jak edytować cennik

Cennik to plik **`pricing.js`** — czytelny obiekt JS.

```javascript
// Przykład: zmiana ceny BESS po nowej dostawie
window.PRICING.bess.tier_skali = [
  { do_kWh:  100, zl_per_kWh: 1700 },  // ← edytuj tutaj
  ...
];

// Marża handlowa
window.PRICING.narzuty.marza_handlowa_pct = 15;

// Status dotacji
// Zmień: "AKTYWNY" / "PRZED_NABOREM" / "OGLOSZONE" / "ZAMKNIETY"
```

Po edycji — odśwież stronę (Cmd+R / Ctrl+R). Zmiany działają natychmiast.

---

## Jak edytować profile zużycia

`profiles.js` — 7 archetypów + krzywa PV + krzywa cen RDN. Każdy profil to funkcja zwracająca względną intensywność na każdą z 8760 godzin roku. Można dodać własny profil dla nietypowego klienta.

---

## Jak prowadzić rozmowę z klientem (cheatsheet handlowca)

**Pierwsze 30 sekund:**
> "Pokażę dokładnie, ile zaoszczędzi Pana firma na BESS+PV. Mam 6 strumieni oszczędności, których konkurencja nie pokaże. Wystarczy że odpowie Pan na 4 pytania z faktury."

**4 pytania do klienta:**
1. *"Jaka moc umowna i taryfa z faktury?"* → step 2
2. *"Ile MWh rocznie zużywacie?"* → step 3 (lub poprosić CSV z licznika)
3. *"Kiedy macie szczyty — rano, południe, wieczór, ciągle?"* → archetyp
4. *"Czy zdarzało się przekroczenie mocy umownej?"* → step 2 (przekroczenia)

**Najsilniejszy hak (klienci K3/K4 z przekroczeniami):**
> "Sam BESS, bez PV, na 2-3 lata zwraca przez **obniżenie mocy umownej + eliminację kar + reklasyfikację K3 do K2**. Tych trzech rzeczy razem żaden konkurent Panu nie pokaże, a to są realne pieniądze już od pierwszego miesiąca."

**Po wyniku:** kliknij **Eksport PDF** → wydrukuj na spotkaniu lub wyślij mailem.

---

## Założenia i ograniczenia

- Profile dobowe są syntetyczne (generator funkcyjny). Dokładność ±15% wzg. realnej krzywej. Dla wstępnej oferty wystarczy. **Dla finalnego projektu zawsze prosić o profil 15-min od klienta** — tu używasz CSV.
- Krzywa cen RDN jest typowa (intra-day cosinus + sezonowość). Realne ceny TGE odbiegają — w wersji 1.1 będzie backtest historyczny (scheduled task `bess-calc-backtest-monte-carlo` ustawiony na 2:05 nocą).
- Strategia BESS = greedy. Realny EMS używa LP-optymalizacji z lookahead. Dla SME OK, dla utility (DSR/RM) może niedoszacowywać o ~15%.
- Dotacje sprawdzane były 5.05.2026 — przed użyciem w finalnej ofercie zawsze weryfikuj status na stronie programu.
- CAPEX nie zawiera kosztu warunków przyłączenia od OSD (kaucja 30 zł/kW przy zwiększaniu mocy). To pozycja po stronie klienta.

---

## Struktura plików

```
bess-calculator/
├── index.html                       ← UI (otwierasz dwukliem)
├── engine.js                        ← silnik symulacji 8760h + obliczenia
├── pricing.js                       ← edytujesz cennik
├── profiles.js                      ← profile zużycia, PV, RDN
├── README.md                        ← ten plik
├── DEPLOY.md                        ← instrukcja git + Vercel
├── deploy.command                   ← klikalny skrypt deploy
├── deploy.sh                        ← alternatywny skrypt deploy
├── vercel.json                      ← config Vercel
├── .gitignore
└── _OBSIDIAN_NOTE_bess-calculator.md ← notatka do skopiowania do Obsidian
```

---

## Backlog (wersja 1.1+)

- Import CSV z konkretnych systemów OSD (Tauron eLicznik, PSGAS, Energa) z timestamp
- White-label: wstaw logo i kolory swojej firmy (zamiast HT PROJEKT)
- Wersja Next.js + Neon zintegrowana z CRM EE — Q3 2026
- Backtest TGE 2024-2025 + Monte Carlo (scheduled task)
- Strategia BESS LP-optymalizowana (zamiast greedy) dla utility-scale
- Multi-tenancy + zapis klientów (Postgres)
- Heatmapa godzinowa zużycia (24×365 grid)

---

## Wsparcie / debug

Gdy coś nie działa — F12 → Console. Najczęstsze problemy:
- *"Cannot read property 'pv' of undefined"* — `pricing.js` ma błąd składni
- *"PROFILES is not defined"* — brak `profiles.js`
- PDF wychodzi pusty/urwany — przeglądarka blokuje, spróbuj w Chrome
- Wykresy nie ładują się — sprawdź czy CDN Chart.js się wczytał (Network tab)

---

## Brand

- Kolor primary: `#3765AD` (granat z logo HT PROJEKT)
- Kolor secondary: `#1F4181` (ciemniejszy)
- Akcent: `#F59E0B` (amber, CTA)
- Strona: https://htprojekt.pl
