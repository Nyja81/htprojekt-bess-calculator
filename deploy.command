#!/bin/bash
# Dwuklik tego pliku w Finder otwiera nowe okno Terminala i uruchamia deploy.
# Twój główny terminal zostaje nietknięty.

cd "$(dirname "$0")"

echo ""
echo "========================================================"
echo "  HT PROJEKT — Deploy BESS Calculator na GitHub + Vercel"
echo "========================================================"
echo "  Folder: $(pwd)"
echo ""

# Usuń stale git lock files (mogły zostać po przerwanym procesie z sandbox)
if [ -f .git/index.lock ] || [ -f .git/HEAD.lock ] || [ -f .git/objects/maintenance.lock ]; then
  echo "⚠️  Wykryto stare lock files w .git — usuwam..."
  rm -f .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock
  rm -rf .git/objects/tmp_obj_* 2>/dev/null
  find .git/objects -name "tmp_obj_*" -delete 2>/dev/null
  echo "   ✓ wyczyszczono"
  echo ""
fi

read -p "  Naciśnij Enter aby kontynuować (Ctrl+C aby anulować)..."
echo ""

# ============== ZACOMITOWANIE ZMIAN ==============
echo "🔁 [1/3] Git — sync ostatnich zmian..."
git add -A 2>&1 | head -3
git commit -m "Update: pełna symulacja 8760h + arbitraż + wykres roczny + branding HT" 2>&1 | head -3 || echo "   (nic nowego do commit'u)"
echo ""

# ============== GITHUB ==============
echo "📤 [2/3] GitHub — utworzenie repo + push..."
if ! command -v gh &> /dev/null; then
  echo ""
  echo "⚠️  Brak GitHub CLI. Aby zainstalować, wpisz:"
  echo "    brew install gh"
  echo ""
  echo "Albo utwórz repo ręcznie na https://github.com/new (nazwa: htprojekt-bess-calculator)"
  echo "Potem wykonaj te 2 polecenia w tym oknie:"
  echo "    git remote add origin git@github.com:TWÓJ_USER/htprojekt-bess-calculator.git"
  echo "    git push -u origin main"
  echo ""
  read -p "Po wykonaniu, naciśnij Enter aby przejść do Vercel..."
else
  if ! gh auth status &> /dev/null 2>&1; then
    echo "🔐 Logowanie do GitHub (otworzy przeglądarkę)..."
    gh auth login --git-protocol https --web
  fi

  if ! git remote get-url origin &> /dev/null; then
    echo "🆕 Tworzę repo na GitHub..."
    gh repo create htprojekt-bess-calculator --public --source=. --remote=origin --push
  else
    echo "⏩ Repo już istnieje, pushuję..."
    git push -u origin main 2>&1 || git push origin main
  fi
fi
echo ""

# ============== VERCEL ==============
echo "🚀 [3/3] Vercel — deploy production..."
if ! command -v vercel &> /dev/null; then
  echo "📦 Instaluję Vercel CLI..."
  npm i -g vercel
fi

if [ ! -d ".vercel" ]; then
  echo "ℹ️  Pierwsze uruchomienie — Vercel zapyta o autoryzację (przeglądarka) i konfigurację projektu."
fi

vercel --prod --yes
echo ""
echo "✅ ✅ ✅  GOTOWE  ✅ ✅ ✅"
echo ""
echo "URL produkcyjny widoczny powyżej i w dashboardzie vercel.com."
echo "Każdy kolejny: 'git commit -am ...' + 'git push' = auto-deploy w 30 s."
echo ""
read -p "Naciśnij Enter aby zamknąć to okno..."
