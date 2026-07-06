# 0062: Firmo Teil 4 – Dokumentation (README + docs)

**Planungsstatus:** Nicht umgesetzt
**Quelle:** /plan
**Empfohlener Workflow:** Dokumentation (`/docs`)
**Doku-Kategorie:** developer-guide
**Ziel-Pfad:** docs/developer-guide/firmo-overview.md

## Anforderung

Teil 4 der Staffelung von [0058](0058-firmo-rename-and-lazy-tool-router.md). Bringt die Dokumentation auf den Firmo-Stand: `README.md` neu (Firmo, `/firmo <tool>`, Lazy-Loading, Auslieferung via `npx skills`/dalo, kein Plugin) sowie die betroffenen `docs/`-Dateien. Setzt die Teile 1–3 voraus, damit die Doku den tatsächlichen Zustand beschreibt.

## Scope-Abgrenzung

- **In Scope:** `README.md` (Struktur-, Deployment-, Konfig-Abschnitte), `docs/naming.md` und `docs/skill-migration-notes.md` (Referenzen/Beispiele auf Firmo/`/firmo`), optional ein knapper Developer-Guide-Einstieg.
- **Nicht in Scope:** Code/Build/Skripte (Teile 1–3); historische Plan-Dateien.

## Betroffene Dateien

| Datei                                                    | Beschreibung                                                                                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`                                              | Neufassung: Firmo, `/firmo <tool>`, Lazy-Loading, Skill-Auslieferung (npx skills/dalo), kein Plugin; Struktur/Deployment/Konfig anpassen |
| `docs/naming.md`                                         | Referenzen/Beispiele auf `/firmo` aktualisieren                                                                                          |
| `docs/skill-migration-notes.md`                          | Firmo-/`/firmo`-Referenzen und ggf. Router-/Lazy-Loading-Notizen                                                                         |
| `docs/developer-guide/firmo-overview.md` (optional, neu) | Kurzüberblick Firmo für Mitwirkende                                                                                                      |

## Akzeptanzkriterien

- [ ] `README.md` beschreibt Firmo, `/firmo <tool>`, Lazy-Loading und die Skill-Auslieferung (npx skills/dalo); keine Plugin-/Marketplace-Anleitung mehr.
- [ ] `docs/naming.md` und `docs/skill-migration-notes.md` referenzieren Firmo/`/firmo` konsistent; keine irreführenden `sf-`/Plugin-Verweise.
- [ ] Doku beschreibt den tatsächlichen Zustand nach Teilen 1–3 (Router, Lazy-Loading, `.firmo/`, Auslieferung).

## Validierungsplan

- Querlesen gegen den realen Zustand nach Teilen 1–3; Grep auf verbliebene `sf-`/Plugin-Erwähnungen (außer bewusst historischen).
- `oxfmt --check` auf geänderten Markdown-Dateien.
