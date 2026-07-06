# 0060: Firmo Teil 2 – Router, Lazy-Loading, `build.mjs`-Umbau und `sf-*` → `firmo`

**Planungsstatus:** Umgesetzt
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

## Testergebnisse

- `node build.mjs`: **grün** — je Harness ein `firmo/`-Skill mit `SKILL.md` (Router), `tools/` (15 exponiert + 3 intern) und `agents/` (11; Claude `.md`, Codex `.toml`). Kein `marketplace.json`/`plugins/`/Top-Level-TOML.
- Router-Katalog listet genau die 15 Tools; Dispatch „lies `tools/<tool>.md`"; `apply` referenziert intern `tools/apply-plan.md` / `apply-review.md` / `apply-issues.md`.
- **0** unaufgelöste `{{…}}` in `dist`; **0** `/sf-`/`$sf-`; **0** `# SF `-H1; `docs/plan/`-Pfade unversehrt (kein `docs/firmo`).
- Verbliebene `sf-` in `dist` sind ausschließlich beabsichtigt: Tracker-**Labels** (`sf-review-epic/-finding`, `sf-needs-planning`, `sf-issue-done`, `sf-fix/-refactor/-build/-docs`) und **Legacy-Migrationsrefs** (`.sf-plugin`, `.sf-memory.json`).
- Version-Drift-Guard grün; `pnpm agent:check` (`oxfmt --check`) grün.

## Review-Findings

**Datum:** 2026-07-06
**Reviewer:** Selbst-Review des Orchestrators gegen die Akzeptanzkriterien (Build/Format als unabhängige technische Verifikation; kein separater `nodejs-reviewer`-Lauf in dieser Staffel-Iteration).

### Zusammenfassung

| Status                  | Anzahl |
| ----------------------- | -----: |
| Behoben                 |      0 |
| Offen / Nicht umgesetzt |      0 |

Keine kritischen Findings. Bewusste Abweichungen/Präzisierungen gegenüber dem Ausgangsplan:

- **Quell-Verzeichnisse bleiben `skills/sf-*`** (Präfix wird beim Build gestrippt → Ausgabe-/Tool-Namen ohne `sf-`). Ein reines Umbenennen der 27 Quellordner ist rein kosmetisch und wurde bewusst nicht durchgeführt (build-grün-Fokus). Frontmatter-`name:` wird vom neuen Build ohnehin nicht mehr für Tools/Agents gelesen.
- **Interne `apply-*`-Anweisungen** liegen als `tools/apply-plan.md` / `apply-review.md` / `apply-issues.md` (flach, nicht als Router-Katalog-Einträge) statt unter `tools/_apply/` — funktional gleichwertig, einfacher.
- **`cleanDescription`** strippt jetzt den `sf-`-Präfix aus Platzhaltern (Katalog zeigt `fix`/`refactor`/… statt `sf-fix`).
- **Literale Invocation-Refs** (`/fix`, `/build`, `/plan` …) wurden kontext-sicher zu `/firmo <cmd>` transformiert (Pfade und Globs geschützt).
- Aktions-Wörter `fix/refactor/build/docs` als **Labels** und die `.sf-plugin`/`.sf-memory.json`-**Migrationsrefs** bleiben bewusst `sf-`.

**Hinweis (Folge-Teil):** Die Deploy-Wrapper `local-update.sh`/`local-link.sh` zeigen noch auf den alten Pfad `dist/claude/sf-claude-plugin` und sind bis **Teil 3 (0061)** temporär veraltet. Der eigentliche Build (`node build.mjs`) ist grün; nur das Deployment-Skript wird in Teil 3 auf `dist/…/firmo/` umgestellt.

Kein Commit erstellt.
