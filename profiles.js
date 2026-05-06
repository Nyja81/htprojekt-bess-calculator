/**
 * BESS Calculator — archetypy profili zużycia (8760 h każdy)
 * ----------------------------------------------------------
 * Każdy profil jest funkcją (godzina_roku) → względne zużycie [bezwymiarowe].
 * Suma 8760 godzin po normalizacji = roczne zużycie wpisane przez handlowca.
 *
 * Zasada: profile generujemy z prostych funkcji, nie z 8760-elementowych tablic,
 * żeby plik był mały i czytelny. Średnia każdego profilu = 1.0 (po normalizacji).
 */

(function () {
  // Pomocniczo: dla godziny roku zwraca {hour, dayOfWeek, month}
  function timeFromHourOfYear(h) {
    const date = new Date(2026, 0, 1, 0, 0, 0); // 2026 = rok bazowy
    date.setHours(h);
    return {
      hour: date.getHours(),                          // 0-23
      dayOfWeek: date.getDay(),                       // 0=niedziela, 6=sobota
      month: date.getMonth(),                         // 0-11
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      isHoliday: isPolishHoliday(date),
    };
  }

  // Uproszczone święta — 2026
  function isPolishHoliday(date) {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const fixed = [
      [1, 1], [1, 6], [5, 1], [5, 3], [8, 15], [11, 1], [11, 11], [12, 25], [12, 26],
    ];
    return fixed.some(([fm, fd]) => fm === m && fd === d);
  }

  // ============================================================
  //                  GENERATORY PROFILI
  // ============================================================

  // 1. Hala produkcyjna 8-16, dni robocze
  function profile_hala_8_16(t) {
    if (t.isWeekend || t.isHoliday) return 0.20;
    if (t.hour >= 7 && t.hour < 17) return 1.80;
    if (t.hour >= 17 && t.hour < 22) return 0.60;
    return 0.30; // noc
  }

  // 2. Hala 24/7 — produkcja ciągła, 3 zmiany
  function profile_hala_24_7(t) {
    let base = 1.0;
    if (t.isWeekend) base = 0.85;
    if (t.isHoliday) base = 0.50;
    // lekka modulacja w ciągu doby
    const hourMod = 1 + 0.1 * Math.sin(((t.hour - 8) * Math.PI) / 12);
    return base * hourMod;
  }

  // 3. Biuro
  function profile_biuro(t) {
    if (t.isWeekend || t.isHoliday) return 0.15;
    if (t.hour >= 8 && t.hour < 18) return 1.90;
    if (t.hour >= 18 && t.hour < 21) return 0.50;
    return 0.20;
  }

  // 4. Sklep / handel detaliczny
  function profile_sklep(t) {
    if (t.isHoliday) return 0.20;
    let base = 1.0;
    if (t.dayOfWeek === 0) base = 0.4; // niedziele bez handlu
    if (t.hour >= 9 && t.hour < 21) {
      const peak = (t.hour >= 16 && t.hour < 20) ? 1.5 : 1.2;
      return base * peak;
    }
    return 0.25;
  }

  // 5. Hotel — peaki rano (śniadania, prysznice) + wieczór (kuchnia, sauna)
  function profile_hotel(t) {
    let base = 0.7;
    if (t.hour >= 6 && t.hour < 10) base = 1.6;       // poranny szczyt
    else if (t.hour >= 17 && t.hour < 22) base = 1.7; // wieczorny szczyt
    else if (t.hour >= 22 || t.hour < 6) base = 0.6;
    if (t.isWeekend) base *= 1.15; // weekendy — pełniej
    return base;
  }

  // 6. Chłodnia — prawie płaskie, lekko niżej w nocy
  function profile_chlodnia(t) {
    let base = 1.0;
    // Latem chłodnie pracują intensywniej
    const seasonal = 1 + 0.15 * Math.sin(((t.month - 2) * Math.PI) / 6);
    if (t.hour >= 22 || t.hour < 6) base = 0.85;
    return base * seasonal;
  }

  // 7. Ferma drobiu — uproszczenie: stałe 24/7 z lekką sezonowością
  function profile_ferma_drobiu(t) {
    const seasonal = 1 + 0.10 * Math.sin(((t.month - 5) * Math.PI) / 6);
    let base = 0.95;
    if (t.hour >= 6 && t.hour < 22) base = 1.05; // światło dzienne
    return base * seasonal;
  }

  // ============================================================
  //                  PROFIL PRODUKCJI PV
  // ============================================================
  // Krzywa sinusoidalna dzienna × sezonowość roczna × pogoda losowa-deterministyczna
  function profile_pv(t, lat = 52) {
    // Sezonowy uzysk: lipiec ~3-4×, grudzień ~0.3×
    const seasonal =
      0.5 + 0.5 * Math.sin(((t.month - 2) * Math.PI) / 6); // 0..1
    // Dzienne — od wschodu do zachodu (uproszczone: 6:00-20:00 lato, 8:00-16:00 zima)
    const sunrise = 6 + 2 * (1 - seasonal);
    const sunset = 20 - 2 * (1 - seasonal);
    if (t.hour < sunrise || t.hour > sunset) return 0;
    const noon = (sunrise + sunset) / 2;
    const dayLength = sunset - sunrise;
    const x = (t.hour - sunrise) / dayLength;     // 0..1
    const sinDay = Math.sin(x * Math.PI);          // 0..1..0
    // Pogoda: deterministyczne zachmurzenie (deterministyczne pseudo-random)
    const cloudFactor = 0.6 + 0.4 * Math.abs(Math.sin(t.month * 7 + t.hour * 0.3));
    return seasonal * sinDay * cloudFactor;
  }

  // ============================================================
  //                  HELPER: zbuduj 8760-element tablicę
  // ============================================================
  function build8760(generator) {
    const arr = new Array(8760);
    let sum = 0;
    for (let h = 0; h < 8760; h++) {
      const t = timeFromHourOfYear(h);
      arr[h] = generator(t);
      sum += arr[h];
    }
    // Normalizuj do średniej = 1 (czyli całkowita roczna suma = 8760)
    const avg = sum / 8760;
    if (avg > 0) {
      for (let h = 0; h < 8760; h++) {
        arr[h] = arr[h] / avg;
      }
    }
    return arr;
  }

  // PV nie normalizujemy do średniej — używamy faktycznej sumy = uzysk roczny
  function build8760PV(lat = 52) {
    const arr = new Array(8760);
    let sum = 0;
    for (let h = 0; h < 8760; h++) {
      const t = timeFromHourOfYear(h);
      arr[h] = profile_pv(t, lat);
      sum += arr[h];
    }
    // Normalizuj do sumy = 1 (potem skalujemy przez kWp × uzysk_kWh_per_kWp)
    if (sum > 0) {
      for (let h = 0; h < 8760; h++) {
        arr[h] = arr[h] / sum;
      }
    }
    return arr;
  }

  // ============================================================
  //                  EKSPORT
  // ============================================================
  window.PROFILES = {
    // Profile zużycia (znormalizowane: średnia = 1)
    consumption: {
      hala_8_16:     { label: "Hala produkcyjna 8-16",  generator: build8760(profile_hala_8_16)    },
      hala_24_7:     { label: "Hala 24/7 (3 zmiany)",   generator: build8760(profile_hala_24_7)    },
      biuro:         { label: "Biuro",                   generator: build8760(profile_biuro)        },
      sklep:         { label: "Sklep / handel",          generator: build8760(profile_sklep)        },
      hotel:         { label: "Hotel / pensjonat",       generator: build8760(profile_hotel)        },
      chlodnia:      { label: "Chłodnia / mroźnia",      generator: build8760(profile_chlodnia)     },
      ferma_drobiu:  { label: "Ferma drobiu / hodowla",  generator: build8760(profile_ferma_drobiu) },
    },
    // Profil produkcji PV (znormalizowany: suma = 1, skalowane przez kWp × uzysk)
    pv: {
      polska_typowa: { label: "Polska — typowy",   generator: build8760PV(52) },
    },

    // Helper: zwróć etykietę ludzką
    listConsumption() {
      return Object.entries(this.consumption).map(([id, v]) => ({ id, label: v.label }));
    },
  };
})();
