/**
 * BESS Calculator — engine
 * --------------------------------------------------------
 * Łączy wszystkie tryby pracy (multiselect), modele cen energii (FIX/SPOT/Transze/CFD),
 * symulację godzinową z CSV, parametry BESS, dotacje, finanse.
 */
"use strict";

// =============== STATE ===============
const STATE = {
  step: 1,
  modes: ["pv_bess_classic", "strażnik_mocy"],
  client: {},
  results: null,
  csvProfile: null,           // 8760-elementowa tablica mocy [kW] gdy załadowano CSV
  inputMethod: "archetype",   // "archetype" | "csv"
};

// =============== HELPERS ===============
const fmt = {
  pln:  x => (x >= 0 ? "" : "−") + Math.abs(Math.round(x)).toLocaleString("pl-PL") + " zł",
  plnK: x => {
    const a = Math.abs(x);
    if (a >= 1_000_000) return (x / 1_000_000).toFixed(2) + " mln zł";
    if (a >= 10_000) return Math.round(x / 1000).toLocaleString("pl-PL") + " tys zł";
    if (a >= 1000) return (x / 1000).toFixed(1) + " tys zł";
    return Math.round(x).toLocaleString("pl-PL") + " zł";
  },
  kWh: x => Math.round(x).toLocaleString("pl-PL") + " kWh",
  pct: x => (x * 100).toFixed(1) + "%",
  lat: x => x === Infinity ? "∞" : x.toFixed(1) + " lat",
};

function priceForKWp(kWp, type) {
  for (const t of window.PRICING.pv[type]) if (kWp <= t.do_kWp) return t.zl_per_kWp;
  return window.PRICING.pv[type].slice(-1)[0].zl_per_kWp;
}
function priceForBESSScale(kWh) {
  for (const t of window.PRICING.bess.tier_skali) if (kWh <= t.do_kWh) return t.zl_per_kWh;
  return window.PRICING.bess.tier_skali.slice(-1)[0].zl_per_kWh;
}

// =============== EFEKTYWNA CENA ZAKUPU ENERGII ===============
function effectiveBuyPrice(in_) {
  const Pe = window.PRICING.ceny_energii;
  switch (in_.energyProduct) {
    case "FIX":
      return in_.priceFIX;
    case "SPOT":
      return in_.priceRDN + in_.priceMarza;
    case "TRANSZE": {
      const sum = in_.tr.q1 + in_.tr.q2 + in_.tr.q3 + in_.tr.q4;
      if (sum < 1) return 600;
      return (in_.tr.q1 * in_.tr.q1p + in_.tr.q2 * in_.tr.q2p + in_.tr.q3 * in_.tr.q3p + in_.tr.q4 * in_.tr.q4p) / sum;
    }
    case "CFD": {
      const cfdShare = in_.cfdVolumePct / 100;
      return cfdShare * in_.priceCFD + (1 - cfdShare) * (in_.priceRDN + in_.priceMarza);
    }
    default: return 600;
  }
}

// Spread użyty do arbitrażu (większy dla SPOT/CFD)
function effectiveSpread(in_) {
  const baseSpread = window.PRICING.ceny_energii.spread_dzien_noc_PLN_per_MWh;
  if (in_.energyProduct === "FIX")     return baseSpread * 0.4;  // FIX nie pozwala arbitrażu z TGE bezpośrednio
  if (in_.energyProduct === "SPOT")    return baseSpread * 1.2;
  if (in_.energyProduct === "TRANSZE") return baseSpread * 0.8;
  if (in_.energyProduct === "CFD")     return baseSpread * 1.0;
  return baseSpread;
}

// =============== AUTO-SIZING ===============
function autoSizePV(in_) {
  const u = window.PRICING.pv.uzysk_kWh_per_kWp[in_.voivodeship] || 1000;
  return Math.round((in_.yearly * 0.7) / u / 5) * 5;
}
function autoSizeBESS(in_) {
  if (in_.modes.includes("strażnik_mocy")) {
    const dP = in_.shavingTarget;
    return Math.max(20, Math.round((dP * 4) / 10) * 10);
  }
  return Math.max(20, Math.round((in_.yearly * 0.1) / 200 / 10) * 10);
}

// =============== DOBÓR DOTACJI ===============
function pickDotacja(in_, bessKWh, bessKW) {
  const ds = window.PRICING.dotacje;
  if (in_.dotacjaId !== "auto") {
    const f = ds.find(d => d.id === in_.dotacjaId);
    if (f) return f;
  }
  const prio = { AKTYWNY: 4, OGLOSZONE: 3, PRZED_NABOREM: 2, ZAMKNIETY: 1 };
  return ds.filter(d => d.id !== "BEZ_DOTACJI")
    .filter(d => d.target.includes(in_.target) || d.target.includes("wszyscy"))
    .filter(d => d.id !== "FUNDUSZ_MODERNIZACYJNY_BESS" || (bessKWh >= 4000 && bessKW >= 2000))
    .sort((a, b) => (prio[b.status] || 0) - (prio[a.status] || 0) || b.pct_dofinansowania - a.pct_dofinansowania)[0]
    || ds.find(d => d.id === "BEZ_DOTACJI");
}

// =============== STRUMIENIE ===============
function calculateStreams(in_, pvKWp, bessKWh, bessKW) {
  const Pe = window.PRICING.ceny_energii;
  const Pr = window.PRICING.rynek_mocy;

  const buyPrice = effectiveBuyPrice(in_);
  const spread = effectiveSpread(in_);

  const u = window.PRICING.pv.uzysk_kWh_per_kWp[in_.voivodeship] || 1000;
  const pvProductionKWh = pvKWp * u;
  const auto0 = Math.min(pvProductionKWh, in_.yearly * 0.40);
  const auto1 = bessKWh > 0
    ? Math.min(pvProductionKWh, in_.yearly * Math.min(0.85, 0.4 + bessKWh / in_.yearly * 100))
    : auto0;
  const surplusKWh = Math.max(0, pvProductionKWh - auto1);

  // 1. Autokonsumpcja (zawsze gdy PV) — uniknięty zakup po cenie efektywnej
  const autokonsumpcja = auto1 * (buyPrice / 1000);

  // 2. Sprzedaż RCEm
  const rcem = in_.pvRcem ? surplusKWh * (Pe.RCEm_srednia_roczna_PLN_per_MWh / 1000) : 0;

  // 3. Arbitraż BESS — zależy od trybu
  const arbitrażMode = in_.modes.includes("arbitraz_tge") ? 1.1 : 0.7;
  const cyklRocznie = in_.bess_params.cykli_rocznie * arbitrażMode;
  const dod = in_.bess_params.DOD_pct / 100;
  const eff = in_.bess_params.sprawnosc_round_trip_pct / 100;
  const energiaPrzezBESS = bessKWh * cyklRocznie * dod * eff;
  const arbitraz = energiaPrzezBESS * (spread / 1000);

  // 4. Strażnik mocy: obniżenie mocy umownej (zł/kW/m-c × 12)
  const dP = in_.modes.includes("strażnik_mocy") ? in_.shavingTarget : 0;
  const stalyTaryfy = Pe.skladnik_staly_taryfy_PLN_per_kW_miesiac[in_.tariff] || 10;
  const obnizenieMocyUmownej = dP * stalyTaryfy * 12;

  // 5. Eliminacja kar — używamy rzeczywistej liczby przekroczeń (z CSV lub deklaracji)
  const stawkaKary = stalyTaryfy * Pe.kara_przekroczenie_mocy_mnoznik;
  const eliminacjaKar = in_.modes.includes("strażnik_mocy")
    ? in_.przekroczenia * dP * stawkaKary
    : 0;

  // 6. Reklasyfikacja K (gdy BESS jest częścią scenariusza)
  const wS = Pe.wspolczynniki_K[in_.kCoef] || 1.0;
  const wN = (in_.modes.includes("strażnik_mocy") || bessKWh > 0)
    ? Math.max(0.05, wS - 0.33) : wS;
  const oszczednoscK = (wS - wN) * Pe.oplata_mocowa_K4_baza_PLN_per_MWh / 1000 * in_.yearly;

  // 7. Rynek Mocy / DSR — tylko gdy tryb wybrany i BESS ≥ 1 MW
  let rynekMocy = 0, dsr = 0;
  if (in_.modes.includes("dsr_rynek_mocy") && bessKW >= 1000) {
    rynekMocy = bessKW * Pr.aukcja_2029_PLN_per_kW_rocznie;
    dsr = (bessKW / 1000) * Pr.DSR_PLN_per_MW_rocznie;
  }

  // Złożenie strumieni — wszystkie pojawiają się gdy mają wartość > 0
  const items = [
    { label: "Autokonsumpcja PV",        value: autokonsumpcja },
    { label: "Sprzedaż nadwyżek RCEm",   value: rcem },
    { label: "Arbitraż BESS dzień/noc",  value: arbitraz },
    { label: "Obniżenie mocy umownej",   value: obnizenieMocyUmownej },
    { label: "Eliminacja kar",           value: eliminacjaKar },
    { label: "Reklasyfikacja opł. mocowej (K)", value: oszczednoscK },
    { label: "Rynek Mocy",               value: rynekMocy },
    { label: "DSR / aFRR",               value: dsr },
  ].filter(it => it.value > 0);

  return { items, totalYearly: items.reduce((s, it) => s + it.value, 0), pvProductionKWh, surplusKWh, buyPrice };
}

// =============== KALKULACJA GŁÓWNA ===============
function calculate(in_) {
  const Pf = in_.fin;

  const pvKWp  = in_.pvKWp > 0 ? in_.pvKWp : (in_.pvStatus !== "brak" ? autoSizePV(in_) : 0);
  const bessKWh = in_.bessKWh > 0 ? in_.bessKWh : autoSizeBESS(in_);
  const bessKW  = in_.bessKW > 0 ? in_.bessKW : Math.max(10, Math.round(bessKWh / 4));

  // CAPEX
  const pvCapex = pvKWp * priceForKWp(pvKWp, in_.pvType);
  let bessCapex;
  if (in_.bessProduct) {
    const prod = window.PRICING.bess.katalog.find(p => p.name === in_.bessProduct);
    bessCapex = prod ? prod.pricePLN : bessKWh * priceForBESSScale(bessKWh);
  } else {
    bessCapex = bessKWh * priceForBESSScale(bessKWh);
  }
  const sprzet = pvCapex + bessCapex;
  const N = window.PRICING.narzuty;
  const projekt = sprzet * N.projekt_uzgodnienia_pnb_pct / 100;
  const montaz = sprzet * N.montaz_uruchomienie_pct / 100;
  const rozdzielnice = sprzet * N.rozdzielnice_okablowanie_pct / 100;
  const ems = bessKWh >= 500 ? bessCapex * N.ems_scada_pct_dla_BESS_500plus / 100 : N.ems_scada_ryczalt_PLN;
  const subtotal = sprzet + projekt + montaz + rozdzielnice + ems;
  const marza = subtotal * N.marza_handlowa_pct / 100;
  const rezerwa = subtotal * N.rezerwa_kontyngencja_pct / 100;
  const capexNetto = subtotal + marza + rezerwa;

  // Dotacja
  const dotacja = pickDotacja(in_, bessKWh, bessKW);
  let pctDot = dotacja.pct_dofinansowania;
  if (dotacja.id === "FUNDUSZ_MODERNIZACYJNY_BESS" && (bessKWh < 4000 || bessKW < 2000)) pctDot = 0;
  const kwotaDotacji = capexNetto * pctDot / 100;
  const capexPoDotacji = capexNetto - kwotaDotacji;

  // Strumienie
  const streams = calculateStreams(in_, pvKWp, bessKWh, bessKW);

  // Cashflow
  const cashflow = [];
  let cumulative = -capexPoDotacji;
  let payback = Infinity;
  let npvAccum = -capexPoDotacji;
  cashflow.push({ year: 0, cf: -capexPoDotacji, cumulative });
  const yearlyOpex = (pvCapex * Pf.opex_PV_pct_rocznie + bessCapex * Pf.opex_BESS_pct_rocznie) / 100;

  for (let y = 1; y <= Pf.horyzont_lat; y++) {
    const escalation = Math.pow(1 + Pf.eskalacja_cen_energii_pct_rocznie / 100, y - 1);
    const degradacja = Math.pow(1 - in_.bess_params.degradacja_rocznie_pct / 100, y - 1);
    const yearlySavings = streams.totalYearly * escalation * degradacja;
    const yearlyOpexEsc = yearlyOpex * escalation;
    const cf = yearlySavings - yearlyOpexEsc;
    const prev = cumulative;
    cumulative += cf;
    npvAccum += cf / Math.pow(1 + Pf.stopa_dyskonta_pct / 100, y);
    if (payback === Infinity && cumulative >= 0) payback = (y - 1) + (-prev) / cf;
    cashflow.push({ year: y, cf, cumulative });
  }

  // IRR (bisekcja)
  let lo = -0.5, hi = 1.0;
  for (let it = 0; it < 80; it++) {
    const mid = (lo + hi) / 2;
    let npv = -capexPoDotacji;
    for (let y = 1; y <= Pf.horyzont_lat; y++) {
      const e = Math.pow(1 + Pf.eskalacja_cen_energii_pct_rocznie / 100, y - 1);
      const d = Math.pow(1 - in_.bess_params.degradacja_rocznie_pct / 100, y - 1);
      npv += streams.totalYearly * e * d / Math.pow(1 + mid, y);
    }
    if (Math.abs(npv) < 100) { lo = hi = mid; break; }
    if (npv > 0) lo = mid; else hi = mid;
  }
  const irr = (lo + hi) / 2;

  return {
    sizing: { pvKWp, bessKWh, bessKW },
    capex: { pv: pvCapex, bess: bessCapex, sprzet, projekt, montaz, rozdzielnice, ems, marza, rezerwa,
             netto: capexNetto, dotacja, kwotaDotacji, pctDotacji: pctDot, poDotacji: capexPoDotacji },
    streams, cashflow, payback, npv: npvAccum, irr, yearlyOpex,
  };
}

// =============== CSV PROFIL ===============
function parseCSV(text, format) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const values = [];
  for (const line of lines) {
    // skip header
    if (/[a-zA-Złłą]/.test(line) && values.length === 0) continue;
    // separator: ;, , lub tab
    const parts = line.split(/[;,\t]/).map(p => p.trim().replace(",", "."));
    let kw = NaN;
    if (parts.length === 1) kw = parseFloat(parts[0]);
    else kw = parseFloat(parts[parts.length - 1]); // zakładamy że moc jest w ostatniej kolumnie
    if (!isNaN(kw)) values.push(kw);
  }
  if (format === "quarter") {
    // Agregacja 35040 → 8760: średnia z 4 kolejnych wartości
    if (values.length < 30000) throw new Error("Plik 15-min powinien mieć ~35040 wierszy, znaleziono " + values.length);
    const hourly = new Array(8760).fill(0);
    for (let h = 0; h < 8760; h++) {
      let sum = 0, cnt = 0;
      for (let q = 0; q < 4; q++) {
        const idx = h * 4 + q;
        if (idx < values.length) { sum += values[idx]; cnt++; }
      }
      hourly[h] = cnt > 0 ? sum / cnt : 0;
    }
    return hourly;
  }
  if (values.length < 8000) throw new Error("Plik godzinowy powinien mieć ~8760 wierszy, znaleziono " + values.length);
  return values.slice(0, 8760);
}

function analyzeCSV(profile, mocUmowna) {
  let yearly = 0, peak = 0, exceedCount = 0, exceedKWh = 0, exceedSum = 0;
  for (const kw of profile) {
    yearly += kw;  // 1h × kW = kWh
    if (kw > peak) peak = kw;
    if (kw > mocUmowna) {
      exceedCount++;
      exceedSum += (kw - mocUmowna);
      exceedKWh += (kw - mocUmowna);
    }
  }
  return { yearly: Math.round(yearly), peak: Math.round(peak * 100) / 100, exceedCount, exceedKWh: Math.round(exceedKWh) };
}

// =============== UI ===============
function gatherInputs() {
  const modes = Array.from(document.querySelectorAll('input[name="mode"]:checked')).map(c => c.value);
  if (modes.length === 0) modes.push("pv_bess_classic");

  const ep = document.getElementById("in-energy-product").value;
  const tr = {
    q1: parseFloat(document.getElementById("in-tr-q1").value || 25),
    q2: parseFloat(document.getElementById("in-tr-q2").value || 25),
    q3: parseFloat(document.getElementById("in-tr-q3").value || 25),
    q4: parseFloat(document.getElementById("in-tr-q4").value || 25),
    q1p: parseFloat(document.getElementById("in-tr-q1-p").value || 580),
    q2p: parseFloat(document.getElementById("in-tr-q2-p").value || 480),
    q3p: parseFloat(document.getElementById("in-tr-q3-p").value || 460),
    q4p: parseFloat(document.getElementById("in-tr-q4-p").value || 620),
  };

  // Profil — auto z CSV jeśli wczytano
  let yearly, archetype, peak, przekroczenia, shavingTarget;
  if (STATE.inputMethod === "csv" && STATE.csvProfile) {
    const m = parseFloat(document.getElementById("in-moc-umowna").value);
    const an = analyzeCSV(STATE.csvProfile, m);
    yearly = an.yearly;
    peak = an.peak;
    przekroczenia = an.exceedCount;
    archetype = "csv";
    shavingTarget = parseFloat(document.getElementById("in-shaving-target-csv").value);
  } else {
    yearly = parseFloat(document.getElementById("in-yearly").value);
    archetype = document.getElementById("in-archetype").value;
    peak = parseFloat(document.getElementById("in-peak").value);
    przekroczenia = parseInt(document.getElementById("in-przekroczenia").value, 10);
    shavingTarget = parseFloat(document.getElementById("in-shaving-target").value);
  }

  return {
    modes,
    clientName: document.getElementById("in-client-name").value,
    voivodeship: document.getElementById("in-voivodeship").value,
    tariff: document.getElementById("in-tariff").value,
    mocUmowna: parseFloat(document.getElementById("in-moc-umowna").value),
    kCoef: document.getElementById("in-k-coef").value,
    target: document.getElementById("in-target").value,
    energyProduct: ep,
    priceFIX: parseFloat(document.getElementById("in-price-fix").value || 600),
    priceRDN: parseFloat(document.getElementById("in-price-rdn").value || 450),
    priceMarza: parseFloat(document.getElementById("in-price-marza").value || 100),
    priceCFD: parseFloat(document.getElementById("in-price-cfd").value || 550),
    cfdVolumePct: parseFloat(document.getElementById("in-cfd-volume").value || 80),
    tr,
    yearly, archetype, peak, przekroczenia, shavingTarget,
    pvStatus: document.getElementById("in-pv-status").value,
    pvKWp: parseFloat(document.getElementById("in-pv-kwp").value),
    pvType: document.getElementById("in-pv-type").value,
    pvRcem: document.getElementById("in-pv-rcem").checked,
    bessKWh: parseFloat(document.getElementById("in-bess-kwh").value),
    bessKW: parseFloat(document.getElementById("in-bess-kw").value),
    bessProduct: document.getElementById("in-bess-product").value,
    bess_params: {
      DOD_pct: parseFloat(document.getElementById("in-bess-dod").value),
      max_SOC_pct: parseFloat(document.getElementById("in-bess-maxsoc").value),
      min_SOC_pct: parseFloat(document.getElementById("in-bess-minsoc").value),
      sprawnosc_round_trip_pct: parseFloat(document.getElementById("in-bess-eff").value),
      degradacja_rocznie_pct: parseFloat(document.getElementById("in-bess-degr").value),
      cykli_rocznie: parseFloat(document.getElementById("in-bess-cycles").value),
    },
    fin: {
      stopa_dyskonta_pct: parseFloat(document.getElementById("in-fin-disc").value),
      horyzont_lat: parseInt(document.getElementById("in-fin-years").value, 10),
      eskalacja_cen_energii_pct_rocznie: parseFloat(document.getElementById("in-fin-esc").value),
      opex_BESS_pct_rocznie: window.PRICING.finanse.opex_BESS_pct_rocznie,
      opex_PV_pct_rocznie: window.PRICING.finanse.opex_PV_pct_rocznie,
    },
    dotacjaId: document.getElementById("in-dotacja").value,
  };
}

let chartStreams, chartCashflow, chartDaily;

function renderResults(r, in_) {
  document.getElementById("hero-client").textContent = in_.clientName || "Klient bez nazwy";
  const modesLabel = {
    pv_bess_classic: "PV+BESS klasyczny",
    "strażnik_mocy": "Strażnik mocy",
    arbitraz_tge: "Arbitraż TGE",
    dsr_rynek_mocy: "DSR / Rynek Mocy"
  };
  document.getElementById("hero-modes").textContent = "Tryby: " + in_.modes.map(m => modesLabel[m]).join(" + ");

  document.getElementById("kpi-payback").textContent = fmt.lat(r.payback);
  document.getElementById("kpi-payback-sub").textContent = "IRR: " + (r.irr * 100).toFixed(1) + "%";
  document.getElementById("kpi-npv").textContent = fmt.plnK(r.npv);
  document.getElementById("kpi-irr").textContent = "Stopa dyskonta " + in_.fin.stopa_dyskonta_pct + "%";
  document.getElementById("kpi-monthly").textContent = fmt.plnK(r.streams.totalYearly / 12);
  document.getElementById("kpi-capex").textContent = fmt.plnK(r.capex.poDotacji);
  document.getElementById("kpi-capex-sub").textContent = "brutto VAT: " + fmt.plnK(r.capex.poDotacji * 1.23);

  document.getElementById("config-summary").innerHTML = `
    <div><div class="text-xs text-slate-500">Moc PV</div><div class="font-semibold">${r.sizing.pvKWp} kWp</div></div>
    <div><div class="text-xs text-slate-500">Pojemność BESS</div><div class="font-semibold">${r.sizing.bessKWh} kWh</div></div>
    <div><div class="text-xs text-slate-500">Moc BESS</div><div class="font-semibold">${r.sizing.bessKW} kW</div></div>
    <div><div class="text-xs text-slate-500">Województwo / taryfa</div><div class="font-semibold">${in_.voivodeship} / ${in_.tariff}</div></div>
    <div><div class="text-xs text-slate-500">Zużycie roczne</div><div class="font-semibold">${fmt.kWh(in_.yearly)}</div></div>
    <div><div class="text-xs text-slate-500">Cena energii efektywna</div><div class="font-semibold">${Math.round(r.streams.buyPrice)} zł/MWh</div></div>
    <div><div class="text-xs text-slate-500">Profil</div><div class="font-semibold">${in_.archetype === "csv" ? "Z licznika (CSV)" : in_.archetype}</div></div>
    <div><div class="text-xs text-slate-500">Klient</div><div class="font-semibold">${in_.clientName || "—"}</div></div>
  `;

  document.getElementById("streams-table").innerHTML = `
    <table class="w-full text-sm">
      <thead><tr class="border-b text-left"><th class="py-2">Strumień</th><th class="text-right">zł/rok</th><th class="text-right">% udział</th></tr></thead>
      <tbody>
      ${r.streams.items.map(it => `
        <tr class="border-b border-slate-100">
          <td class="py-2">${it.label}</td>
          <td class="text-right font-medium">${fmt.plnK(it.value)}</td>
          <td class="text-right text-slate-500">${(it.value / r.streams.totalYearly * 100).toFixed(0)}%</td>
        </tr>`).join("")}
        <tr class="font-bold bg-slate-50">
          <td class="py-2">Razem rocznie</td>
          <td class="text-right">${fmt.plnK(r.streams.totalYearly)}</td><td></td>
        </tr>
      </tbody>
    </table>`;

  if (chartStreams) chartStreams.destroy();
  chartStreams = new Chart(document.getElementById("chart-streams"), {
    type: "doughnut",
    data: {
      labels: r.streams.items.map(it => it.label),
      datasets: [{ data: r.streams.items.map(it => it.value),
        backgroundColor: ["#3765AD", "#1F4181", "#5B85C9", "#F59E0B", "#d18509", "#10b981", "#06b6d4", "#8b5cf6"] }],
    },
    options: { responsive: true, plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } } } },
  });

  // CAPEX
  const N = window.PRICING.narzuty;
  document.getElementById("capex-table").innerHTML = `
    <table class="w-full text-sm">
      <tbody>
        <tr class="border-b"><td class="py-2">PV (${r.sizing.pvKWp} kWp × ${priceForKWp(r.sizing.pvKWp, in_.pvType)} zł/kWp)</td><td class="text-right">${fmt.plnK(r.capex.pv)}</td></tr>
        <tr class="border-b"><td class="py-2">BESS (${r.sizing.bessKWh} kWh)${in_.bessProduct ? ' — ' + in_.bessProduct : ''}</td><td class="text-right">${fmt.plnK(r.capex.bess)}</td></tr>
        <tr class="border-b text-slate-500"><td class="py-2">Projekt + uzgodnienia (${N.projekt_uzgodnienia_pnb_pct}%)</td><td class="text-right">${fmt.plnK(r.capex.projekt)}</td></tr>
        <tr class="border-b text-slate-500"><td class="py-2">Montaż + uruchomienie (${N.montaz_uruchomienie_pct}%)</td><td class="text-right">${fmt.plnK(r.capex.montaz)}</td></tr>
        <tr class="border-b text-slate-500"><td class="py-2">Rozdzielnice + okablowanie (${N.rozdzielnice_okablowanie_pct}%)</td><td class="text-right">${fmt.plnK(r.capex.rozdzielnice)}</td></tr>
        <tr class="border-b text-slate-500"><td class="py-2">EMS / SCADA</td><td class="text-right">${fmt.plnK(r.capex.ems)}</td></tr>
        <tr class="border-b text-slate-500"><td class="py-2">Marża handlowa (${N.marza_handlowa_pct}%)</td><td class="text-right">${fmt.plnK(r.capex.marza)}</td></tr>
        <tr class="border-b text-slate-500"><td class="py-2">Rezerwa / kontyngencja (${N.rezerwa_kontyngencja_pct}%)</td><td class="text-right">${fmt.plnK(r.capex.rezerwa)}</td></tr>
        <tr class="border-b font-bold"><td class="py-2">CAPEX netto (przed dotacją)</td><td class="text-right">${fmt.plnK(r.capex.netto)}</td></tr>
        <tr class="border-b text-emerald-700"><td class="py-2">Dotacja: ${r.capex.dotacja.nazwa} (${r.capex.pctDotacji}%)</td><td class="text-right">−${fmt.plnK(r.capex.kwotaDotacji)}</td></tr>
        <tr class="border-b font-bold text-lg bg-htblue-50 text-htblue-700"><td class="py-2">CAPEX po dotacji (netto)</td><td class="text-right">${fmt.plnK(r.capex.poDotacji)}</td></tr>
        <tr><td class="py-2 text-slate-500">Brutto z VAT 23%</td><td class="text-right text-slate-500">${fmt.plnK(r.capex.poDotacji * 1.23)}</td></tr>
      </tbody>
    </table>`;

  if (chartCashflow) chartCashflow.destroy();
  chartCashflow = new Chart(document.getElementById("chart-cashflow"), {
    type: "line",
    data: {
      labels: r.cashflow.map(c => "Rok " + c.year),
      datasets: [{ label: "Skumulowany cashflow [zł]",
        data: r.cashflow.map(c => c.cumulative),
        borderColor: "#3765AD", backgroundColor: "rgba(55,101,173,.1)",
        fill: true, tension: 0.2 }],
    },
    options: { responsive: true,
      scales: { y: { ticks: { callback: v => fmt.plnK(v) } } },
      plugins: { legend: { display: false } } },
  });

  // Daily — symulacja dla typowego dnia
  const dailyData = simulateDailyProfile(in_, r);
  if (chartDaily) chartDaily.destroy();
  chartDaily = new Chart(document.getElementById("chart-daily"), {
    type: "line",
    data: {
      labels: Array.from({ length: 24 }, (_, i) => i + ":00"),
      datasets: [
        { label: "Zużycie", data: dailyData.consumption, borderColor: "#3765AD", fill: false, tension: 0.3 },
        { label: "Produkcja PV", data: dailyData.pv, borderColor: "#10b981", fill: false, tension: 0.3 },
        { label: "Stan BESS [kWh]", data: dailyData.soc, borderColor: "#F59E0B", fill: false, tension: 0.3, yAxisID: "y2" },
        { label: "Z sieci", data: dailyData.grid, borderColor: "#ef4444", fill: false, tension: 0.3 },
      ],
    },
    options: { responsive: true,
      scales: { y: { title: { display: true, text: "Moc [kW]" } },
                y2: { position: "right", title: { display: true, text: "BESS [kWh]" }, grid: { drawOnChartArea: false } } } },
  });

  const d = r.capex.dotacja;
  document.getElementById("dotacja-summary").innerHTML = `
    <div class="font-bold text-lg">💰 Dotacja: ${d.nazwa}</div>
    <div class="mt-2"><strong>Status:</strong> ${d.status}${d.aktywny_do ? " (do " + d.aktywny_do + ")" : ""}</div>
    <div class="mt-1"><strong>Wsparcie:</strong> ${r.capex.pctDotacji}% kosztów netto = ${fmt.plnK(r.capex.kwotaDotacji)}</div>
    <div class="mt-2 text-sm text-slate-700">${d.uwagi}</div>`;
}

function simulateDailyProfile(in_, r) {
  const consumption = new Array(24).fill(0);
  const pv = new Array(24).fill(0);
  const soc = new Array(24).fill(0);
  const grid = new Array(24).fill(0);

  let baseProfile;
  if (STATE.inputMethod === "csv" && STATE.csvProfile) {
    // weź typowy dzień roboczy z CSV — pn. lipca
    const startH = (31 * 24) + 6 * 24;
    baseProfile = STATE.csvProfile.slice(startH, startH + 24);
  } else {
    const profile = window.PROFILES.consumption[in_.archetype]?.generator;
    if (!profile) return { consumption, pv, soc, grid };
    const startH = (31 * 24) + 6 * 24;
    const avgKW = in_.yearly / 8760;
    baseProfile = profile.slice(startH, startH + 24).map(v => v * avgKW);
  }

  let socKWh = r.sizing.bessKWh * 0.5;
  const max = r.sizing.bessKWh * (in_.bess_params.max_SOC_pct / 100);
  const min = r.sizing.bessKWh * (in_.bess_params.min_SOC_pct / 100);
  for (let h = 0; h < 24; h++) {
    consumption[h] = baseProfile[h] || 0;
    const pvProd = (r.sizing.pvKWp * (h >= 6 && h <= 20 ? Math.sin(((h - 6) * Math.PI) / 14) : 0));
    pv[h] = pvProd;
    let net = consumption[h] - pvProd;
    if (net < 0 && socKWh < max) {
      const charge = Math.min(-net, r.sizing.bessKW, max - socKWh);
      socKWh += charge; net += charge;
    } else if (net > 0 && socKWh > min) {
      const dis = Math.min(net, r.sizing.bessKW, socKWh - min);
      socKWh -= dis; net -= dis;
    }
    soc[h] = socKWh;
    grid[h] = Math.max(0, net);
  }
  return { consumption, pv, soc, grid };
}

// =============== UI events ===============
function showStep(n) {
  STATE.step = n;
  for (let i = 1; i <= 5; i++) {
    document.getElementById("section-" + i).classList.toggle("hidden", i !== n);
    const el = document.getElementById("step-" + i);
    el.className = "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap " +
      (i === n ? "step-active" : (i < n ? "step-done" : "step-todo"));
  }
  if (n === 5) document.getElementById("btnPDF").disabled = false;
  window.scrollTo(0, 0);
}

document.querySelectorAll(".btn-next").forEach(b => b.addEventListener("click", () => showStep(STATE.step + 1)));
document.querySelectorAll(".btn-back").forEach(b => b.addEventListener("click", () => showStep(STATE.step - 1)));
document.getElementById("btn-next-1").addEventListener("click", () => showStep(2));
document.getElementById("btnReset").addEventListener("click", () => {
  if (confirm("Wyczyścić wszystko?")) location.reload();
});

// Mode card highlight
document.querySelectorAll('input[name="mode"]').forEach(cb => {
  cb.addEventListener("change", e => {
    e.target.closest(".mode-card").classList.toggle("selected", e.target.checked);
  });
});

// Energy product toggle
document.getElementById("in-energy-product").addEventListener("change", e => {
  document.querySelectorAll(".energy-section").forEach(s => s.classList.add("hidden"));
  document.getElementById("energy-" + e.target.value.toLowerCase()).classList.remove("hidden");
});

// Profile tabs
document.getElementById("tab-archetype").addEventListener("click", () => {
  STATE.inputMethod = "archetype";
  document.getElementById("tab-archetype").className = "flex-1 px-4 py-3 text-sm font-medium bg-htblue-50 text-htblue-700 border-r border-slate-200";
  document.getElementById("tab-csv").className = "flex-1 px-4 py-3 text-sm font-medium hover:bg-slate-50";
  document.getElementById("panel-archetype").classList.remove("hidden");
  document.getElementById("panel-csv").classList.add("hidden");
});
document.getElementById("tab-csv").addEventListener("click", () => {
  STATE.inputMethod = "csv";
  document.getElementById("tab-csv").className = "flex-1 px-4 py-3 text-sm font-medium bg-htblue-50 text-htblue-700 border-l border-slate-200";
  document.getElementById("tab-archetype").className = "flex-1 px-4 py-3 text-sm font-medium hover:bg-slate-50";
  document.getElementById("panel-csv").classList.remove("hidden");
  document.getElementById("panel-archetype").classList.add("hidden");
});

// CSV upload
function handleCSV(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const fmt_ = document.getElementById("in-csv-format").value;
      const profile = parseCSV(e.target.result, fmt_);
      STATE.csvProfile = profile;
      const m = parseFloat(document.getElementById("in-moc-umowna").value);
      const an = analyzeCSV(profile, m);
      const status = document.getElementById("csv-status");
      status.classList.remove("hidden");
      status.innerHTML = `
        <div class="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm">
          ✅ <strong>Plik wczytany.</strong>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <div><div class="text-xs text-slate-500">Roczne zużycie</div><div class="font-bold">${an.yearly.toLocaleString("pl-PL")} kWh</div></div>
            <div><div class="text-xs text-slate-500">Szczyt mocy</div><div class="font-bold">${an.peak} kW</div></div>
            <div><div class="text-xs text-slate-500">Przekroczeń mocy umownej</div><div class="font-bold text-red-700">${an.exceedCount} h/rok</div></div>
            <div><div class="text-xs text-slate-500">Energia ponad limit</div><div class="font-bold">${an.exceedKWh} kWh</div></div>
          </div>
          ${an.exceedCount > 0 ? `<div class="text-xs mt-2 text-red-700">⚠ Klient regularnie przekracza moc umowną — strażnik mocy uzasadniony.</div>` : ""}
        </div>`;
    } catch (err) {
      document.getElementById("csv-status").classList.remove("hidden");
      document.getElementById("csv-status").innerHTML = `<div class="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">❌ Błąd: ${err.message}</div>`;
    }
  };
  reader.readAsText(file);
}
const csvDrop = document.getElementById("csv-drop");
const csvFile = document.getElementById("csv-file");
csvDrop.addEventListener("click", () => csvFile.click());
csvDrop.addEventListener("dragover", e => { e.preventDefault(); csvDrop.classList.add("dragover"); });
csvDrop.addEventListener("dragleave", () => csvDrop.classList.remove("dragover"));
csvDrop.addEventListener("drop", e => { e.preventDefault(); csvDrop.classList.remove("dragover");
  if (e.dataTransfer.files.length) handleCSV(e.dataTransfer.files[0]); });
csvFile.addEventListener("change", e => { if (e.target.files.length) handleCSV(e.target.files[0]); });

// Sliders
document.getElementById("in-shaving-target").addEventListener("input", e => {
  document.getElementById("shaving-display").textContent = e.target.value + " kW";
});
document.getElementById("in-shaving-target-csv").addEventListener("input", e => {
  document.getElementById("shaving-display-csv").textContent = e.target.value + " kW";
});

// Product BESS dropdown
function fillBessProducts() {
  const sel = document.getElementById("in-bess-product");
  window.PRICING.bess.katalog.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.name;
    opt.textContent = `${p.name} — ${Math.round(p.pricePLN).toLocaleString("pl-PL")} zł netto (${(p.pricePLN/p.kWh).toFixed(0)} zł/kWh)`;
    sel.appendChild(opt);
  });
  sel.addEventListener("change", () => {
    const name = sel.value;
    if (name) {
      const p = window.PRICING.bess.katalog.find(x => x.name === name);
      if (p) {
        document.getElementById("in-bess-kwh").value = p.kWh;
        // moc BESS dla AIO/produktów seryjnych zwykle ~ pojemność/4
        document.getElementById("in-bess-kw").value = Math.max(3, Math.round(p.kWh / 4));
      }
    }
  });
}

// Fill dotacje
function fillDotacje() {
  const sel = document.getElementById("in-dotacja");
  window.PRICING.dotacje.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = `${d.nazwa} (${d.pct_dofinansowania}%, ${d.status})`;
    sel.appendChild(opt);
  });
  sel.addEventListener("change", () => {
    if (sel.value === "auto") {
      document.getElementById("dotacja-info").textContent = "Narzędzie samo dobierze najlepszą dotację dla profilu klienta.";
    } else {
      const d = window.PRICING.dotacje.find(x => x.id === sel.value);
      if (d) document.getElementById("dotacja-info").textContent = d.uwagi;
    }
  });
}

document.getElementById("btn-calculate").addEventListener("click", () => {
  const in_ = gatherInputs();
  STATE.client = in_;
  STATE.results = calculate(in_);
  showStep(5);
  setTimeout(() => renderResults(STATE.results, in_), 50);
});

// PDF export
async function exportPDF() {
  if (!STATE.results) return alert("Najpierw policz wyniki.");
  const node = document.getElementById("results-content");
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
  const img = canvas.toDataURL("image/jpeg", 0.92);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = 210, pageH = 297;
  const ratio = canvas.height / canvas.width;
  const w = pageW - 20;
  const h = w * ratio;
  if (h <= pageH - 20) {
    pdf.addImage(img, "JPEG", 10, 10, w, h);
  } else {
    let pos = 0;
    const sliceH = (pageH - 20) / w * canvas.width;
    while (pos < canvas.height) {
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = Math.min(sliceH, canvas.height - pos);
      slice.getContext("2d").drawImage(canvas, 0, -pos);
      pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", 10, 10, w, slice.height / canvas.width * w);
      pos += sliceH;
      if (pos < canvas.height) pdf.addPage();
    }
  }
  pdf.save("HT-PROJEKT_oferta_" + (STATE.client.clientName || "klient").replace(/\s+/g, "_") + ".pdf");
}
document.getElementById("btnPDF").addEventListener("click", exportPDF);
document.getElementById("btn-pdf-bottom").addEventListener("click", exportPDF);

// Init
fillBessProducts();
fillDotacje();
showStep(1);
