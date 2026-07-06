## Pre-Commit-Gate

Vor jedem Commit müssen die im Projekt konfigurierten Prüfungen fehlerfrei durchlaufen. Typische Prüfungen sind Type-Checking, Linting und Tests — verwende die im Projekt definierten Scripts (z. B. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm agent:check`).

- Wenn eine Prüfung Fehler meldet: behebe die Fehler zuerst, dann prüfe erneut.
- Committe niemals Code, der diese Prüfungen nicht besteht.
- Diese Regel gilt auch dann, wenn eine separate Verifikationsphase existiert — sie ist eine zusätzliche Absicherung, kein Ersatz.
