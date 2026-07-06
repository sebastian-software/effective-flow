## Laufzeitverzeichnis `.firmo/` und Migration von `.sf-plugin/`

Firmo hält projektlokale Laufzeitdaten unter `.firmo/` (`config.json`, `memory.json`, `cache.json`, `review/`, `investigation/`, `.worktrees/`, Wisdom-Dateien). Frühere Versionen nutzten `.sf-plugin/`. Wenn dieser Skill `.firmo/`-Daten liest oder schreibt, gelten diese Regeln:

1. **Kein ungefragter Footprint:** Lege `.firmo/` nur an, wenn tatsächlich Laufzeitdaten geschrieben werden. Ein Lauf ohne zu speichernde Daten erzeugt kein `.firmo/`.
2. **Fallback-Lesen:** Fehlt `.firmo/`, existiert aber ein altes `.sf-plugin/`, lies die benötigten Dateien (`config.json`, `memory.json`, Report-/Investigation-Dateien …) aus `.sf-plugin/`, solange noch nicht migriert wurde.
3. **Einmalige, nicht-destruktive Migration:** Sobald nach `.firmo/` geschrieben würde und noch kein `.firmo/` existiert, ein `.sf-plugin/` aber vorhanden ist: lege `.firmo/` an und übernimm den vorhandenen Inhalt aus `.sf-plugin/` (kopieren, nicht verschieben), dann schreibe die Änderung in `.firmo/`. Existiert `.firmo/` bereits, findet **keine** erneute Migration statt (idempotent). Parallel-sicher: eine im Ziel bereits vorhandene Datei wird nicht überschrieben.
4. **Keine stille Löschung:** `.sf-plugin/` bleibt erhalten; das Aufräumen überlässt Firmo dem User.

Die `.gitignore`-Umstellung (`.firmo/*` plus `!.firmo/config.json`, inklusive Migration einer pauschalen `.firmo/`- oder `.sf-plugin/`-Ignore-Zeile) übernimmt `{{SKILL:setup}}`.
