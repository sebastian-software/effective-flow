# 0060: Firmo Teil 2 – Router, Lazy-Loading, `build.mjs`-Umbau und `sf-*` → `firmo`

**Planungsstatus:** Nicht umgesetzt
**Quelle:** /plan
**Empfohlener Workflow:** Feature (`/build`)

## Anforderung

Teil 2 der Staffelung von [0058](0058-firmo-rename-and-lazy-tool-router.md) – das Herzstück. Baut die Auslieferung von einem Marketplace/Plugin (Claude) bzw. Skill+TOML (Codex) auf **ein universelles `firmo`-Skill je Harness** mit **dünnem Router und Lazy-Loading** um und entfernt den `sf-`-Präfix. Setzt Teil 1 (0059, `.firmo/`-Verzeichnis) voraus.

## Scope-Abgrenzung

- **In Scope:** `build.mjs`-Umbau (Ein-Skill-Layout je Harness: Router-`SKILL.md` + `tools/<tool>.md` + genestete `agents/<agent>.md`, kein Marketplace/Plugin/TOML), Router-Template (`skills/_router/SKILL.md`), Platzhalter-Transforms (`{{SKILL:sf-X}}` → `/firmo X` bzw. Codex-Analog; `{{AGENT:sf-X}}` → Subagent-Referenz), Entfernung des `sf-`-Präfix aus Quell-/Ausgabe-Namen, „internes Tool"-Markierung für `apply-plan`/`apply-review`/`apply-issues` (lazy von `apply`), `plan-issues` → `plan-issue`, Frontmatter-Validitäts-Guard, Version-Drift-Guard.
- **Nicht in Scope:** Deploy-Skripte/Auslieferung (Teil 3), README/Doku (Teil 4).

## Betroffene Dateien

| Datei                           | Beschreibung                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `build.mjs`                     | Kernumbau; Marketplace/Plugin-/TOML-Zweige entfernen; Ein-Skill-Ausgabe je Harness; Transforms; Guards |
| `skills/_router/SKILL.md` (neu) | Router-Template: 15-Tool-Katalog + Dispatch-/Lazy-Load-Regel                                           |
| `skills/sf-*/` (27)             | `sf-`-Präfix entfernen; `type` behalten; `apply-*` als intern markieren; `plan-issues` → `plan-issue`  |
| `skills/_shared/*.md`           | Aufruf-Referenzen konsistent (`/firmo <tool>` / Codex)                                                 |

## Implementierungsdetails

Details, Router-/Lazy-Load-Mechanik, `build.mjs`-Änderungen und Edge Cases siehe [0058](0058-firmo-rename-and-lazy-tool-router.md), Abschnitte „Architekturentscheidungen", „Implementierungsdetails", „Edge Cases" und „Learnings".

### Vorgehen (Kurzfassung)

1. Namensabbildung: `sf-<x>` → `<x>`; `plan-issues` → `plan-issue`; `apply-plan`/`apply-review`/`apply-issues` als intern kennzeichnen.
2. Router-Template anlegen (Katalog der 15 Tools + Dispatch-Regel „lies `tools/<tool>.md`, sonst Liste").
3. `build.mjs` umbauen: Scan ohne `sf-`-Filter; Kategorisierung über `type` + „intern"-Flag; je Harness ein `firmo/`-Skill (`SKILL.md` aus Router-Template + Katalog, `tools/`, genestete `agents/`); Transforms; Frontmatter-Guard (Descriptions strikt quoten); Version-Drift-Guard (Claude/Codex gleiche Version).
4. Interne `apply-*`-Anweisungen unter `firmo/tools/_apply/<source>.md`, nur von `apply` referenziert.

## Akzeptanzkriterien

Maßgeblich sind die betreffenden Kriterien aus [0058](0058-firmo-rename-and-lazy-tool-router.md); für diesen Teil insbesondere:

- [ ] `node build.mjs` erzeugt je Harness **ein** `firmo/`-Skill (Router-`SKILL.md` + `tools/<tool>.md` für die 15 Tools + `agents/<agent>.md`); kein `marketplace.json`, kein `plugins/`- und kein separates Codex-Agent-TOML-Layout.
- [ ] Router-`SKILL.md` enthält nur Katalog + Dispatch; `/firmo` listet 15 Tools, `/firmo <tool>` lädt nur `tools/<tool>.md`; unbekanntes Tool → Liste.
- [ ] Kein `sf-`-Präfix mehr in Ausgabe/nutzer-sichtbaren Referenzen; `{{SKILL:…}}`/`{{AGENT:…}}` transformieren korrekt; `apply-*` intern; `plan-issue` vorhanden.
- [ ] Frontmatter strikt valide (Guard); Claude/Codex tragen dieselbe Version (Guard).

## Validierungsplan

- `node build.mjs` grün; Ausgabe-Layout inspizieren (Router/`tools`/`agents`, kein Marketplace).
- Router-Smoke-Test; Grep-Gegenprobe `sf-` in `dist/`.
- Referenz-Konsistenz aller Platzhalter; `oxfmt --check`.
