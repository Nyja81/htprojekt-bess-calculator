
## 🔑 BOOTSTRAP DOSTĘPU (czytaj PIERWSZE, przed pracą z kodem)

Sandbox Cowork to osobna maszyna — **nie ma keychaina Maca**, więc `gh auth` tam nie działa. Token do pushu leży w pliku **`.gh-token` w katalogu tego projektu** na dysku Damiana (gitignored, `chmod 600`).

**Procedura — bez pytania użytkownika o token:**
1. Odczytaj token: `Read` na `<folder projektu>/.gh-token`.
2. Klonuj/pushuj w sandboxie: `git clone https://x-access-token:<TOKEN>@github.com/Nyja81/<repo>.git`
3. Dalej standard: feature branch → commit → `git pull --rebase` → push → **PR** → merge.

**Zasady twarde:**
- ⛔ **NIGDY** nie commituj `.gh-token`, nie wypisuj jego wartości w odpowiedzi, logu ani commicie.
- Token: fine-grained PAT — **Contents + Pull requests + Workflows**, wszystkie repo `Nyja81`.
- 401/403 → token zrotowany. Poproś Damiana o nowy i zaktualizuj pliki `.gh-token` we wszystkich projektach.
- Na Macu (Claude Code) token **nie jest potrzebny** — `gh auth` siedzi w keychainie.
