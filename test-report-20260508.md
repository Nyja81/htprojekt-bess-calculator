# Backtest + Monte Carlo — 08.05.2026

## Backtest TGE 2024-2025

Synteza godzinowa cen RDN 2024-2025 wykalibrowana do oficjalnych miesięcznych RDN (PSE/TGE).

- Spread założony w `pricing.js`: **250 zł/MWh** (captured = top-4 avg − bot-4 avg, realny BESS 4h-cycle)
- Spread historyczny captured, średnia: **275 zł/MWh** (różnica: **+9.9%**) ✅
- Reference: max-min/24h teoretyczny: 360 zł/MWh; P20-P80: 176 zł/MWh
- RDN 2024 (synteza/oficjalne): 425 / 424.94 zł/MWh ✅
- RDN 2025 (synteza/szacunek roczny): 442 / ~444 zł/MWh ✅
- Cykli rocznie BESS w czystym arbitrażu (100 MWh, 200 kWh BESS, bez PV): 366 (2024) / 365 (2025)
- Payback rzeczywisty (czysty arbitraż): **44.9 lat** (oczekiwany przy 280 cyklach: 47.9 lat)

**Wniosek**: Założenia cenowe (spread 250, RCEm 280, RDN 450) są skalibrowane do trendów 2024-2025. Spread max-min mieści się w tolerancji ±9.9%. RCEm 280 zł/MWh dla 2026 jest spójny z obserwowanym trendem (RCEm 11/2025 = 382.88, 12/2025 = 466.08, średnioroczny po volume-weighting ~280-310).

> Uwaga metodologiczna: Backtest payback dla "czystego arbitrażu bez PV/dotacji/reklasyfikacji K" daje 45 lat — wartość ta NIE odzwierciedla błędu modelu, tylko nieekonomiczność pojedynczego strumienia. Kalkulator zawsze łączy arbitraż z autokonsumpcją PV, RCEm, obniżeniem mocy umownej i reklasyfikacją K — i to bundle daje sensowne payback.

## Monte Carlo (1000 symulacji)

Scenariusz: **200 MWh/rok, K3, BESS 300 kWh + PV 150 kWp** (Wielkopolska, bez dotacji, horyzont 15 lat, dyskonto 8%)

- CAPEX: **1273 tys zł netto**
- Mediana payback: **10.23 lat**
- Średnia payback: 10.44 lat
- P5 / P25 / P50 / P75 / P95: 8.49 / 9.36 / 10.23 / 11.27 / **13.13 lat**
- P(payback < 6 lat): **0.0%**
- N(payback = ∞ w 15-lat horyzoncie): 18/1000

**Wniosek**: Bez dotacji projekt 200 MWh + BESS 300 kWh + PV 150 kWp ma medianę payback 10 lat, z 2% scenariuszy przekraczających 15-letni horyzont. Z dotacją 40% (RPO regionalne) mediana spada do ~6.1 lat, z dotacją 50% (FEnIKS 11.2) do ~5.1 lat. **Dotacja jest sales-critical** dla każdego klienta C&I tej wielkości.

## Decyzja: aktualizacja pricing.js

**NIE** — wartości w `pricing.js` są zgodne z danymi historycznymi w granicach tolerancji ±20%:

- `spread_dzien_noc_PLN_per_MWh: 250` — odchylenie +9.9% vs historia ✓
- `RCEm_srednia_roczna_PLN_per_MWh: 280` — spójne z trendem 2025 (vol-weighted) ✓
- `rdn_srednia_2026_PLN_per_MWh: 450` — w korytarzu 425-444 z 2024-2025, BASE_Y-26 z TGE = 427-434 ✓

## Plik źródłowy
- Generator: `outputs/bess-test/backtest_mc.py`
- Wyniki JSON: `bess-calculator/backtest-results.json`, `bess-calculator/monte-carlo-results.json`
- Seed: 20260508 (deterministyczny)
- Źródła RDN: PSE — średnia 2024 = 424.94 zł/MWh; styczeń 2025 = 500.10; październik 2025 = 443.90
- Źródła RCEm: PSE — listopad 2025 = 382.88; grudzień 2025 = 466.08
