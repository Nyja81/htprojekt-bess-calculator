/**
 * BESS Calculator — cennik HT PROJEKT (PL 2026)
 * --------------------------------------------------------
 * Bazowane na cenniku ICD MEPH/ICDPH (kwiecień 2026) + 20% narzut HT PROJEKT.
 * Wszystkie wartości netto.
 *
 * Edytuj liczby tutaj, zmiany działają natychmiast po refresh.
 */

(function () {
const NARZUT = 1.20;  // +20% narzut HT PROJEKT na ceny ICD

// Konkretne pozycje cennikowe z plików Kalkulator MEPH/ICDPH 26032026.xlsm
const _bess_lista = [
  // [nazwa, kWh, cena netto z ICD]
  ["Kstar AIO 5,12 kWh",      5.12,  7365],
  ["Kstar AIO 10,24 kWh",    10.24, 11691],
  ["Kstar AIO 15,36 kWh",    15.36, 16016],
  ["Kstar AIO 20,48 kWh",    20.48, 20342],
  ["Kstar AIO 25,60 kWh",    25.60, 25809],
  ["Kstar AIO 30,72 kWh",    30.72, 31275],
  ["Kstar AIO 35,90 kWh",    35.90, 36741],
  ["Kstar AIO 41,02 kWh",    41.02, 42208],
  ["HyxiPower HYX-E50-H3",    5.12,  8051],
  ["HyxiPower HYX-E100-H3",  10.40, 11557],
  ["HyxiPower HYX-E150-H3",  15.36, 16418],
  ["HyxiPower HYX-E200-H3",  20.80, 19246],
  ["HyxiPower HYX-E100-H2",  10.60, 17965],
  ["HyxiPower HYX-E150-H2",  15.90, 23902],
  ["HyxiPower HYX-E200-H2",  21.20, 29840],
  ["HyxiPower HYX-E250-H2",  26.50, 35777],
  ["HyxiPower HYX-E300-H2",  31.80, 44832],
  ["HyxiPower HYX-E400-H2",  42.40, 56707],
  ["HyxiPower HYX-E500-H2",  53.00, 68582],
  ["Sofar BTS E5-DS5",        5.12,  9641],
  ["Sofar BTS E10-DS5",      10.24, 15066],
  ["Sofar BTS E15-DS5",      15.36, 20491],
  ["Sofar BTS E20-DS5",      20.48, 25915],
  ["Sofar BTS E25-DS5",      25.60, 31340],
  ["Sofar BTS E30-DS5",      30.72, 36765],
  ["Kostal Helvior HV 6,4",   6.40, 14464],
  ["Kostal Helvior HV 9,6",   9.60, 18505],
  ["Kostal Helvior HV 12,8", 12.80, 22545],
];

// Falowniki hybrydowe — z ICD (cena z narzutem) + 20%
const _falowniki = [
  ["KSTAR E3.68-D22",   3.68,  3527],
  ["KSTAR E4KT-D22",    4,     4731],
  ["KSTAR E5KT-D22",    5,     4759],
  ["KSTAR E6KT-D22",    6,     4809],
  ["KSTAR E8KT-D22",    8,     5379],
  ["KSTAR E10KT-D22",  10,     5659],
  ["KSTAR E12KT-D22",  12,     5960],
  ["HyxiPower HYX-H5K-HT",   5,  5624],
  ["HyxiPower HYX-H6K-HT",   6,  5846],
  ["HyxiPower HYX-H8K-HT",   8,  6139],
  ["HyxiPower HYX-H10K-HT", 10,  6409],
  ["HyxiPower HYX-H12K-HT", 12,  6874],
  ["HyxiPower HYX-H15K-HT", 15,  8176],
  ["SOFAR ESI-5K PowerAll",   5,  6674],
  ["SOFAR ESI-6.5K PowerAll", 6.5, 7113],
  ["SOFAR ESI-8K PowerAll",   8,  7905],
  ["SOFAR ESI-10K PowerAll", 10,  8040],
  ["SOFAR ESI-12K PowerAll", 12,  8774],
  ["Kostal PLENTICORE G3 S 4.0",   4, 9550],
  ["Kostal PLENTICORE G3 S 5.5",   5.5, 10110],
  ["Kostal PLENTICORE G3 S 7.0",   7, 10669],
  ["Kostal PLENTICORE G3 M 8.5",   8.5, 12060],
  ["Kostal PLENTICORE G3 M 10.0", 10, 12620],
  ["Kostal PLENTICORE G3 M 12.0", 12, 13179],
  ["Kostal PLENTICORE G3 L 15.0", 15, 14116],
  ["Kostal PLENTICORE G3 L 17.5", 17.5, 14675],
  ["Kostal PLENTICORE G3 L 20.0", 20, 15234],
];

// Cena PV: moduł 500 W + falownik + montaż + system + okablowanie + elementy
// JA Solar 500 W = 329 zł = 658 zł/kWp moduł (bez montażu)
// Razem z resztą: ~3000-3500 zł/kWp dla małych, mniej dla większych
const _bess_kwh_per_pln = _bess_lista.map(([n, k, c]) => ({ name: n, kWh: k, pricePLN: c * NARZUT }));
const _falowniki_pln = _falowniki.map(([n, k, c]) => ({ name: n, kW: k, pricePLN: c * NARZUT }));

window.PRICING = {
  // ============================================================
  // META
  // ============================================================
  brand: {
    name: "HT PROJEKT",
    color_primary: "#3765AD",       // logo blue
    color_secondary: "#1F4181",     // ciemniejszy granat dla akcentów
    color_accent: "#F59E0B",        // amber (CTA, ostrzeżenia)
    website: "https://htprojekt.pl",
    tagline: "Twoja transformacja energetyczna",
  },

  // ============================================================
  // PV — koszt całościowy [zł/kWp] (moduł + falownik + montaż + system + okablowanie + elementy)
  // Wartości skalowane wg wielkości projektu.
  // ============================================================
  pv: {
    dach: [
      { do_kWp:    10, zl_per_kWp: Math.round(3500 * NARZUT) },  // mikro 5-10 kWp
      { do_kWp:    50, zl_per_kWp: Math.round(2900 * NARZUT) },  // mała firma
      { do_kWp:   200, zl_per_kWp: Math.round(2500 * NARZUT) },  // średnia hala
      { do_kWp:   500, zl_per_kWp: Math.round(2250 * NARZUT) },  // duży zakład
      { do_kWp: Infinity, zl_per_kWp: Math.round(2080 * NARZUT) },// utility roof
    ],
    grunt: [
      { do_kWp:   200, zl_per_kWp: Math.round(2300 * NARZUT) },
      { do_kWp:   999, zl_per_kWp: Math.round(2000 * NARZUT) },
      { do_kWp: Infinity, zl_per_kWp: Math.round(1850 * NARZUT) },
    ],
    uzysk_kWh_per_kWp: {
      pomorskie:           950,
      zachodniopomorskie: 1000,
      warminsko_mazurskie: 950,
      podlaskie:           980,
      mazowieckie:        1000,
      lodzkie:            1010,
      lubelskie:          1050,
      podkarpackie:       1080,
      swietokrzyskie:     1050,
      malopolskie:        1080,
      slaskie:            1020,
      opolskie:           1030,
      dolnoslaskie:       1030,
      lubuskie:           1010,
      wielkopolskie:      1010,
      kujawsko_pomorskie:  980,
    },
  },

  // ============================================================
  // BESS — pełny katalog konkretnych produktów + tier dla większych
  // ============================================================
  bess: {
    katalog: _bess_kwh_per_pln,    // konkretne produkty (do zakresu 5-53 kWh)
    tier_skali: [                   // dla większych projektów wyceniamy per kWh
      { do_kWh:   100, zl_per_kWh: Math.round(1450 * NARZUT) },  // SME
      { do_kWh:   500, zl_per_kWh: Math.round(1230 * NARZUT) },  // średnie
      { do_kWh:  2000, zl_per_kWh: Math.round(1080 * NARZUT) },  // duże C&I
      { do_kWh: Infinity, zl_per_kWh: Math.round( 920 * NARZUT) },// utility
    ],
  },

  falowniki: _falowniki_pln,

  // ============================================================
  // Narzuty
  // ============================================================
  narzuty: {
    projekt_uzgodnienia_pnb_pct:   5,
    montaz_uruchomienie_pct:       8,    // dla większych / utility (mały montaż w cenie PV)
    rozdzielnice_okablowanie_pct:  7,
    ems_scada_ryczalt_PLN:    Math.round(2638 * NARZUT),
    ems_scada_pct_dla_BESS_500plus: 4,
    marza_handlowa_pct:         12,
    rezerwa_kontyngencja_pct:    3,
    ht_narzut_globalny_pct:     20,    // narzut HT PROJEKT już wliczony w ceny powyżej
  },

  // ============================================================
  // Ceny energii 2026
  // ============================================================
  ceny_energii: {
    // FIX
    cena_zakupu_FIX_PLN_per_MWh:        600,
    // SPOT (RDN + marża)
    rdn_srednia_2026_PLN_per_MWh:       450,
    marza_RDN_PLN_per_MWh:              100,
    rdn_zmienność_pct: 30,                  // sigma cen RDN
    // RCEm
    RCEm_srednia_roczna_PLN_per_MWh:    280,
    RCEm_min_PLN_per_MWh:               150,
    RCEm_max_PLN_per_MWh:               420,
    // Spread dzień-noc dla arbitrażu
    spread_dzien_noc_PLN_per_MWh:       250,
    // Transze (zakup w transzach Q1-Q4 + spot)
    transze_oferta: {
      // typowy mix dla klienta C&I
      Q1: { share: 0.25, price_PLN_per_MWh: 580 },
      Q2: { share: 0.25, price_PLN_per_MWh: 480 },
      Q3: { share: 0.25, price_PLN_per_MWh: 460 },
      Q4: { share: 0.25, price_PLN_per_MWh: 620 },
    },
    // Opłaty mocowe
    oplata_mocowa_K4_baza_PLN_per_MWh:  219.4,
    wspolczynniki_K: { K1: 0.05, K2: 0.17, K3: 0.50, K4: 1.00 },
    // Składnik stały (zł/kW/m-c)
    skladnik_staly_taryfy_PLN_per_kW_miesiac: {
      B11: 9.5,  B12: 10, B21: 11, B22: 11.5, B23: 12,
      C11: 8,    C12A: 9, C12B: 9, C12W: 9,  C21: 10, C22A: 11, C22B: 11, C23: 12,
      G11: 7,    G12: 7,  G12W: 7,
    },
    kara_przekroczenie_mocy_mnoznik: 10,
    akcyza_PLN_per_MWh:                5,
    VAT_pct:                          23,
  },

  // ============================================================
  // Dotacje aktywne 2026-05
  // ============================================================
  dotacje: [
    { id: "RPO_REGIONALNE_2026", nazwa: "RPO regionalne (Q2 2026)", status: "OGLOSZONE",
      target: ["MSP", "JST", "klastry"], pct_dofinansowania: 40,
      uwagi: "Każde województwo własne kryteria. Łączny budżet 3,2 mld PLN. Q2 2026." },
    { id: "FENIKS_11_2", nazwa: "FEnIKS 11.2 — magazyny energii", status: "PRZED_NABOREM",
      target: ["OSD", "przedsiebiorca"], pct_dofinansowania: 50,
      uwagi: "Kryteria zatwierdzone IV.2026, nabór nieogłoszony." },
    { id: "KREDYT_EKOLOGICZNY_BGK", nazwa: "Kredyt Ekologiczny BGK (V nabór)", status: "ZAMKNIETY",
      target: ["MSP", "midcap"], pct_dofinansowania: 70,
      uwagi: "IV nabór zamknięty 8.01.2026. Kolejny przypuszczalnie 2026." },
    { id: "ENERGIA_DLA_WSI", nazwa: "Energia dla Wsi (NFOŚiGW)", status: "PRZED_NABOREM",
      target: ["rolnik", "spoldzielnia_energetyczna", "MSP_wiejski"],
      pct_dofinansowania: 20, pozyczka_pct: 100,
      uwagi: "Budżet 3 mld PLN. Nabór 2026 — daty NFOŚiGW jeszcze nieogłoszone." },
    { id: "FUNDUSZ_MODERNIZACYJNY_BESS", nazwa: "Fundusz Modernizacyjny — Magazyny ≥2 MW / ≥4 MWh",
      status: "AKTYWNY", target: ["przedsiebiorca", "JST"], pct_dofinansowania: 45,
      uwagi: "Budżet 4,15 mld PLN. TYLKO BESS ≥2 MW i ≥4 MWh.",
      warunki: { min_moc_MW: 2, min_pojemnosc_MWh: 4 } },
    { id: "GRANT_OZE_BGK", nazwa: "Grant OZE BGK (wspólnoty mieszkaniowe)", status: "AKTYWNY",
      aktywny_do: "2026-06-30",
      target: ["wspolnota_mieszkaniowa", "spoldzielnia_mieszkaniowa"],
      pct_dofinansowania: 50,
      uwagi: "Aktywny do 30.06.2026. Tylko budynki wielorodzinne." },
    { id: "BEZ_DOTACJI", nazwa: "Bez dotacji", status: "AKTYWNY",
      target: ["wszyscy"], pct_dofinansowania: 0,
      uwagi: "Klient finansuje 100% z własnych środków lub kredytu komercyjnego." },
  ],

  // ============================================================
  // Parametry finansowe (defaults — użytkownik może zmienić w UI)
  // ============================================================
  finanse: {
    stopa_dyskonta_pct:                  8,
    horyzont_lat:                       15,
    eskalacja_cen_energii_pct_rocznie:   5,
    opex_BESS_pct_rocznie:               1.5,
    opex_PV_pct_rocznie:                 1,
  },

  // ============================================================
  // BESS — parametry techniczne (defaults — użytkownik może zmienić w UI)
  // ============================================================
  bess_params: {
    DOD_pct:                       90,    // głębokość rozładowania (LFP)
    max_SOC_pct:                  95,    // maksymalny stan naładowania
    min_SOC_pct:                   5,    // minimalny stan
    sprawnosc_round_trip_pct:     88,
    degradacja_rocznie_pct:        3,
    EOL_SOH_pct:                  70,    // koniec życia przy 70% pojemności początkowej
    cykli_rocznie_default:       280,    // dla typowego BESS C&I z liquid cooling
    EOL_cykli:                  7000,    // do EOL (zwykle 6000-8000 dla LFP)
    C_rate_default:                0.25, // 4-godzinny BESS
  },

  // ============================================================
  // Rynek mocy / DSR (utility)
  // ============================================================
  rynek_mocy: {
    aukcja_2029_PLN_per_kW_rocznie:    240,
    DSR_PLN_per_MW_rocznie:        200000,
    FCR_PLN_per_MW_rocznie:        180000,
    aFRR_PLN_per_MW_rocznie:       130000,
    min_moc_DSR_MW:                  1.0,
  },
};
})();
