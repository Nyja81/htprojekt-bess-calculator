#!/bin/bash
# Wklej w Terminal po `cd ~/Desktop/bess-calculator`:
#   bash deploy.sh
# Albo skopiuj komendy ręcznie linijka po linijce.

set -e
cd "$(dirname "$0")"
echo "📂 Folder: $(pwd)"
echo ""

# ============== GIT (zacommituj wszystkie ostatnie zmiany) ==============
echo "🔁 Git — sync ostatnich zmian..."
git add -A
git commit -m "Update — pełna symulacja 8760h + arbitraż + wykres roczny + branding HT" || echo "  (nothing to commit)"
echo ""

# ============== GITHUB (utwórz repo i wypchnij) ==============
echo "📤 GitHub — utworzenie repo + push..."
if command -v gh &> /dev/null; then
  if gh auth status &> /dev/null; then
    gh repo create htprojekt-bess-calculator --public --source=. --remote=origin --push 2>&1 || \
      git push -u origin main 2>&1 || echo "  (already pushed)"
  else
    echo "⚠️  Zaloguj się do GitHub CLI: gh auth login"
    exit 1
  fi
else
  echo "⚠️  Brak GitHub CLI. Zainstaluj: brew install gh"
  echo "    Albo utwórz repo ręcznie na https://github.com/new i wykonaj:"
  echo "    git remote add origin git@github.com:TWOJ_USER/htprojekt-bess-calculator.git"
  echo "    git push -u origin main"
  exit 1
fi
echo ""

# ============== VERCEL (deploy production) ==============
echo "🚀 Vercel — deploy production..."
if ! command -v vercel &> /dev/null; then
  echo "📦 Instaluję Vercel CLI..."
  npm i -g vercel
fi

if [ ! -d ".vercel" ]; then
  echo "ℹ️  Pierwsze uruchomienie — Vercel zapyta o nazwę projektu i autoryzację."
fi

vercel --prod --yes
echo ""
echo "✅ GOTOWE. Odśwież vercel.com — nowy URL widoczny w dashboardzie."
echo "   Każdy kolejny: git commit + git push   →   auto-deploy w ~30 s."
