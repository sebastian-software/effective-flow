# 0024: Projektweites Verbot von Co-Authored-By-Trailern

**Planungsstatus:** Umgesetzt

## Anforderung

Sicherstellen, dass kein Skill in diesem Plugin `Co-Authored-By`-Trailer in Commit-Messages erzeugt — insbesondere nicht solche, die LLMs (Claude, Codex, GPT, …) als Default vorschlagen oder einfügen. Bisher hatte nur `sf-commit` die explizite Regel; andere committende Skills (`sf-apply-review`, `sf-build-feature`, `sf-fix`, `sf-refactor`, `sf-ui-implementer`, `sf-nodejs-implementer`) hatten keine entsprechende Anweisung.

## Architekturentscheidungen

- **Neuer Shared-Include `_shared/commit-message-rules.md`** als Single Source of Truth für Commit-Message-Konventionen (kein Co-Authored-By, kein generischer Wortlaut, Conventional-Commit-Präfixe, Anweisung zum aktiven Entfernen vorhandener Trailer).
- **Klare Trennung von `pre-commit-gate.md`:** Der bestehende Include behandelt weiterhin nur „was muss vor dem Commit bestehen“; der neue Include adressiert „was darf in der Commit-Message stehen“.
- **Inklusion in alle 7 committenden Skills.** `sf-commit` ersetzt seine Inline-Regel durch das Include; die übrigen 6 ergänzen den Include neben/nach `pre-commit-gate`.
- **Keine Modifikation von Skills, die nicht committen** (sf-review, sf-version, sf-test-writer, sf-docs-writer, sf-code-validator, sf-code-documenter, sf-e2e-tester, sf-frontend-reviewer, sf-nodejs-reviewer): kein Include nötig.
- **Explizite Weitergabe in sf-apply-review Phase 2 Commit-Strategie:** zusätzlich zum Include ein Inline-Hinweis im Commit-Strategie-Text, weil der Skill die Strategie als String an Sub-Agenten weitergibt.
- **Konsolidierung der Conventional-Commit-Präfix-Liste** in sf-commit: der `## Vorgehen`-Block verweist jetzt auf den Include statt die Liste zu duplizieren.
- **Auto-Memory:** parallel wird ein Feedback-Memory-Eintrag erzeugt, damit die Präferenz auch in Sessions außerhalb dieses Plugins gilt.

## Betroffene Dateien

| Datei                                    | Beschreibung                                                   |
| ---------------------------------------- | -------------------------------------------------------------- |
| `skills/_shared/commit-message-rules.md` | **Neu** — Shared-Include mit Commit-Message-Konventionen       |
| `skills/sf-commit/SKILL.md`              | Inline-Regeln durch Include ersetzt; Präfix-Liste konsolidiert |
| `skills/sf-apply-review/SKILL.md`        | Include ergänzt; Phase-2-Commit-Strategie explizit erweitert   |
| `skills/sf-build-feature/SKILL.md`       | Include nach pre-commit-gate ergänzt                           |
| `skills/sf-fix/SKILL.md`                 | Include nach pre-commit-gate ergänzt                           |
| `skills/sf-refactor/SKILL.md`            | Include nach pre-commit-gate ergänzt                           |
| `skills/sf-ui-implementer/SKILL.md`      | Include nach pre-commit-gate ergänzt                           |
| `skills/sf-nodejs-implementer/SKILL.md`  | Include nach pre-commit-gate ergänzt                           |
| `docs/plan/0024-no-coauthor-trailer.md`  | Diese Plan-Datei                                               |

## Implementierungsdetails

### Inhalt des neuen Includes

```markdown
## Commit-Message-Regeln

- Setze **niemals** `Co-Authored-By`-Trailer in Commit-Messages, unabhängig davon, ob ein LLM (Claude, Codex, GPT, …) oder ein anderes Tool die Zeile vorschlägt oder als Default einfügt.
- Falls eine `Co-Authored-By`-Zeile in einem Commit-Template, `commit.template`, `--trailer`-Aufruf oder einer Draft-Message bereits vorhanden ist: entferne sie vor dem Commit.
- Vermeide generische Messages wie `update files` oder `misc changes`.
- Beschreibe konkret, was geändert wurde und warum.
- Nutze Conventional-Commit-Präfixe: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
```

### Validierung

- `node build.mjs` bestanden — 7 Commands und 9 Agents korrekt gebaut, alle 7 betroffenen Output-Dateien enthalten die Co-Authored-By-Regel im gerenderten Markdown.

## Review-Findings

**Datum:** 2026-05-03
**Reviewer:** feature-dev:code-reviewer (extern)

### Zusammenfassung

| Schweregrad | Anzahl | Behoben | Offen |
| ----------- | ------ | ------- | ----- |
| Kritisch    | 0      | 0       | 0     |
| Wichtig     | 3      | 3       | 0     |
| Hinweis     | 4      | 0       | 4     |

| Komplexität | Anzahl |
| ----------- | ------ |
| Leicht      | 6      |
| Mittel      | 1      |
| Schwer      | 0      |

### Findings

#### [F1] sf-commit: Conventional-Commit-Präfix-Liste doppelt im Vorgehen-Block und im Include

- **Schweregrad**: Wichtig
- **Komplexität**: Leicht
- **Bereich**: Wartbarkeit / Single-Source-of-Truth
- **Datei**: skills/sf-commit/SKILL.md:30-35
- **Problem**: Nach dem Include-Refaktor ist die Präfix-Liste sowohl im Include (`commit-message-rules.md`) als auch im `## Vorgehen`-Block aufgeführt. Bei einer Änderung müssten beide Stellen synchron gehalten werden.
- **Empfehlung**: Im `## Vorgehen`-Block auf den Include verweisen statt die Liste zu duplizieren.
- **Status**: Behoben

#### [F2] sf-apply-review: Phase-2-Commit-Strategie gibt Co-Authored-By-Verbot nicht inline an Sub-Agenten weiter

- **Schweregrad**: Wichtig
- **Komplexität**: Mittel
- **Bereich**: Regelweitergabe an delegierte Sub-Agenten
- **Datei**: skills/sf-apply-review/SKILL.md:136-139
- **Problem**: Der Include gilt für den Orchestrator, aber der Strategie-Text in Phase 2 wird als String an Delegations-Sub-Agenten weitergegeben. Ohne expliziten Inline-Hinweis könnte ein Sub-Agent das Verbot übersehen.
- **Empfehlung**: Im Strategie-Text der Option „Einzeln“ einen expliziten Hinweis ergänzen.
- **Status**: Behoben

#### [F5] commit-message-rules: Formulierung zu schwach, kein aktiver Entfernungs-Hinweis

- **Schweregrad**: Wichtig
- **Komplexität**: Leicht
- **Bereich**: Regelschärfe / LLM-Zuverlässigkeit
- **Datei**: skills/\_shared/commit-message-rules.md:3
- **Problem**: „anbieten könnten“ war konditionell. Außerdem fehlte die Anweisung, vorhandene Co-Authored-By-Zeilen aus Templates/Drafts aktiv zu entfernen.
- **Empfehlung**: Auf unbedingte Formulierung verschärfen und aktiven Entfernungs-Hinweis ergänzen.
- **Status**: Behoben

#### [F3] Include-Platzierung außerhalb der `## Regeln`-Sektion

- **Schweregrad**: Hinweis
- **Komplexität**: Leicht
- **Bereich**: Konsistenz der Include-Platzierung
- **Datei**: mehrere
- **Problem**: pre-commit-gate und commit-message-rules stehen vor `## Regeln`, nicht innerhalb. Strukturell vertretbar, aber stilistisch inkonsistent.
- **Empfehlung**: Aktuelle Platzierung beibehalten — kein Handlungsbedarf.
- **Status**: Offen (bewusst nicht umgesetzt)

#### [F4] sf-test-writer und sf-docs-writer ohne Include — korrekt ausgeschlossen

- **Schweregrad**: Hinweis
- **Komplexität**: Leicht
- **Bereich**: Vollständigkeit der Include-Abdeckung
- **Datei**: keine
- **Problem**: Bestätigung, dass diese Skills keinen Commit ausführen und der Include daher nicht nötig ist.
- **Empfehlung**: Keine Aktion.
- **Status**: Offen (bestätigt, keine Aktion)

#### [F6] sf-commit-Frontmatter-Description erwähnt weiterhin „ohne Co-Authored-By-Zeilen“

- **Schweregrad**: Hinweis
- **Komplexität**: Leicht
- **Bereich**: Frontmatter-Konsistenz
- **Datei**: skills/sf-commit/SKILL.md:3
- **Problem**: Nach dem Refaktor steht die Information auch im Include. Die Frontmatter-Description ist aber primärer Lesetext für aufrufende Skills und Marketplace-Indexer und dient als Kurzreferenz.
- **Empfehlung**: Beibehalten — Description ist Kurzhinweis, nicht Quelle der Wahrheit.
- **Status**: Offen (bewusst nicht umgesetzt)

#### [F7] Kein Konflikt zwischen den drei Includes

- **Schweregrad**: Hinweis
- **Komplexität**: Leicht
- **Bereich**: Konfliktfreiheit
- **Datei**: keine
- **Problem**: Bestätigung, dass pre-commit-gate (Validierung), language-rules (Sprache) und commit-message-rules (Inhalt) klar getrennt sind.
- **Empfehlung**: Keine Aktion.
- **Status**: Offen (bestätigt, keine Aktion)
