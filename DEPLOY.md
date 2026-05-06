# Deploy na GitHub + Vercel — instrukcja

Repo lokalnie zainicjowane (`git log` pokaże 1 commit). Potrzeba teraz:
1. Utworzyć repo na GitHub.
2. Wypchnąć do GitHuba.
3. Połączyć z Vercel (auto‑deploy).

Wszystko zajmuje ok. **5 minut**.

---

## Krok 1 — GitHub (utwórz repo i wypchnij)

Otwórz Terminal i wklej:

```bash
cd ~/Desktop/bess-calculator

# Stwórz repo na GitHub przez gh CLI (jeśli masz):
gh repo create htprojekt-bess-calculator --public --source=. --remote=origin --push

# LUB ręcznie:
# 1. Wejdź na https://github.com/new
# 2. Nazwa: htprojekt-bess-calculator
# 3. Visibility: Public (lub Private)
# 4. NIE inicjuj README/gitignore/license (już są)
# 5. Skopiuj URL z sekcji "…or push an existing repository"

# Wtedy:
git branch -M main
git remote add origin git@github.com:TWOJ_USER/htprojekt-bess-calculator.git
git push -u origin main
```

Po wypchnięciu repo będzie pod adresem `https://github.com/TWOJ_USER/htprojekt-bess-calculator`.

---

## Krok 2 — Vercel (auto‑deploy z GitHub)

**Wariant A — przez GUI (najszybszy):**

1. Wejdź na https://vercel.com/new
2. Wybierz repo `htprojekt-bess-calculator` (zaloguj się GitHubem jeśli pierwszy raz)
3. **Build settings:**
   - Framework Preset: **Other**
   - Build Command: zostaw puste
   - Output Directory: `.` (kropka) — już jest w `vercel.json`
4. Kliknij **Deploy**
5. Po ~30 s dostaniesz URL `htprojekt-bess-calculator.vercel.app`

**Wariant B — przez CLI:**

```bash
npm i -g vercel
cd ~/Desktop/bess-calculator
vercel login        # autoryzacja przez przeglądarkę
vercel              # deploy preview
vercel --prod       # deploy production
```

---

## Krok 3 — własna domena (opcjonalne)

W panelu Vercel → Settings → Domains → dodaj np. `kalkulator.htprojekt.pl`.
Potem w DNS htprojekt.pl dodaj rekord CNAME:
```
kalkulator   CNAME   cname.vercel-dns.com.
```

---

## Co dalej (auto‑deploy)

Po połączeniu Vercel z GitHubem **każdy commit i push do `main` powoduje automatyczny redeploy**. To znaczy:

- Zmieniasz cennik w `pricing.js` → `git commit -am "cennik kwiecień" && git push` → po 30 s nowa wersja online.
- Możesz zacząć trzymać brand testowy na branchu `staging` (Vercel automatycznie tworzy preview URL).

---

## Backup planu — gdy nie chcesz GitHuba/Vercela

Plik `index.html` działa jako pojedyncza aplikacja webowa offline (po pierwszym otwarciu CDN są cache'owane).

- Dwuklik `~/Desktop/bess-calculator/index.html` → otwiera w przeglądarce.
- Skopiuj cały folder na pendrive — działa z każdego komputera.
- Wrzuć na zwykły hosting (np. home.pl FTP) — to też wystarczy, bo nie ma backendu.

---

## Co dalej rozwijać

- Dorobić integrację z CRM EE (Next.js port).
- Dorobić API dla cennika dynamicznego (np. fetchowanie z Google Sheet z aktualnym cennikiem ICD).
- Dorobić wielu‑użytkownikowy zapis klientów (Neon Postgres + NextAuth).
- Backtesty TGE / Monte Carlo działają jako scheduled task — wyniki zapisują się do `backtest-results.json` i `monte-carlo-results.json`.
