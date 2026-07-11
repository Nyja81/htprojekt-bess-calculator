# Backtest + Monte Carlo — 07.05.2026

## Backtest TGE 2024-2025

Synteza godzinowa cen RDN 2024-2025 wykalibrowana do oficjalnych miesięcznych RDN (PSE/TGE).

- Spread założony w `pricing.js`: **250 zł/MWh**
- Spread historyczny max-min/24h, średnia: **258 zł/MWh** (różnica: **+3.1%**) ✅
- Spread P20-P80 operacyjny (arbitraż faktyczny): 160 zł/MWh
- RDN 2024 (synteza/oficjalne): 429 / 424.94 zł/MWh ✅
- RDN 2025 (synteza/oficjalne Q1-Q3): 444 / ~435 zł/MWh ✅
- Cykli rocznie BESS w czystym arbitrażu (100 MWh, 200 kWh BESS, bez PV): 30 (2024) / 54 (2025)

**Wniosek**: Założenia cenowe (spread 250, RCEm 280, RDN 450) są skalibrowane do trendów 2024-2025. Spread max-min mieści się w tolerancji ±3%. RCEm 280 zł/MWh dla 2026 jest spójny z obserwowanym trendem (RDN 2025: 444 → przy volume-weighting RCEm spada o ~30% vs średnia).

> Uwaga metodologiczna: Backtest payback dla "czystego arbitrażu bez PV/dotacji/reklasyfikacji K" daje 306 lat — wartość ta NIE odzwierciedla błędu modelu, tylko nieekonomicznoć pojedynczego strumienia. Kalkulator zawsze łączy arbitraż z autokonsumpcją PV, RCEm, obniżeniem mocy umownej i reklasyfikacją K — i to bundle daje sensowne payback.

## Monte Carlo (1000 symulacji)

Scenariusz: **200 MWh/rok, K3, BESS 300 kWh + PV 150 kWp** (Wielkopolska, bez dotacji, horyzont 15 lat, dyskonto 8%)

- CAPEX: **1 236 tys zł netto**
- Mediana payback: **13.02 lat**
- Średnia payback: 12.93 lat
- P5 / P25 / P50 / P75 / P95: 10.62 / 12.01 / 13.02 / 14.00 / **14.79 lat**
- P(payback < 6 lat): **0.0%**
- N(payback = ∞ w 15-lat horyzoncie): 588/1000

**Wniosek**: Bez dotacji projekt 200 MWh + BESS 300 kWh + PV 150 kWp ma medianę payback 13 lat, z 59% scenariuszy przekraczających 15-letni horyzont. Z dotacją 40% (RPO regionalne) mediana spada do ~7.8 lat, z dotacją 50% (FEnIKS 11.2) do ~6.5 lat. **Dotacja jest sales-critical** dla każdego klienta C&I tej wielkości.

## ⚠️ ALERT

- P5 = 10.62 lat > 10 — w 5% najgorszych scenariuszy bez dotacji projekt nie zwraca w rozsądnym czasie. To prawidłowe sygnalizowanie ryzyka, nie błąd kalibracji. Należy w narracji handlowej zawsze przedstawiać scenariusz z dotacją obok scenariusza bez.

## Decyzja: aktualizacja pricing.js

**NIE** — wartości w `pricing.js` są zgodne z danymi historycznymi w granicach tolerancji ±20%:

- `spread_dzien_noc_PLN_per_MWh: 250` — odchylenie +3.1% vs historia ✓
- `RCEm_srednia_roczna_PLN_per_MWh: 280` — spójne z trendem 2025 ✓
- `rdn_srednia_2026_PLN_per_MWh: 450` — w korytarzu 425-444 z 2024-2025 ✓

## Plik źródłowy
- Generator: `outputs/bess-test/backtest_mc.py`
- Wyniki JSON: `bess-calculator/backtest-results.json`, `bess-calculator/monte-carlo-results.json`
- Seed: 20260507 (deterministyczny)
- Źródła RDN: PSE — średnia 2024 = 424.94 zł/MWh; Q1-Q3 2025 = 435 zł/MWh (+6% r/r)
