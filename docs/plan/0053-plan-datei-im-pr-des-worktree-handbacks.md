# 0053: Plan-Datei im PR des Worktree-Handbacks einbringen

**Planungsstatus:** Umgesetzt
**Quelle:** /build
**Empfohlener Workflow:** Feature (`/build`)

## Anforderung

Wird ein Plan über den Worktree-Modus (`worktree.enabled`) umgesetzt und per Pull-Request abgeschlossen, landet die Plan-Datei selbst bisher **nicht** im PR. Sie bleibt stattdessen uncommittet bzw. offen im Haupt-Repo (auf `main` oder dem Feature-Branch) liegen. Gewünscht ist, dass die Plan-Datei in ihrem finalen Zustand (Statusmarker auf abgeschlossen, Findings-Zusammenfassung) zusammen mit dem Code im selben PR eingebracht wird.

**Begründung der Workflow-Empfehlung:** Es ändert sich das Verhalten des gemeinsamen Bausteins `worktree-integration.md` in den fünf Code-ändernden Workflows – eine Erweiterung des Handback-Verhaltens, also ein Feature des Plugins (`/build`).

## Architekturentscheidungen

- **Trennung von „Plan-Datei“ und „Plugin-Buchhaltung“:** Bisher behandelte der Baustein die Plan-Datei gemeinsam mit den `.sf-plugin/`-Artefakten als reine Haupt-Repo-Buchhaltung und hielt beides „bewusst nicht Teil des PRs“. Die Plan-Datei wird nun als Deliverable behandelt, das mit in den Liefer-Branch/PR reist, während `.sf-plugin/` (Laufzeitstatus, Review-Reports, Wisdom) unverändert außerhalb des PRs im Haupt-Repo bleibt.
- **Autorisierung im Haupt-Repo, Übernahme beim Handback:** Nummern-Reservierung und Statusaktualisierung der Plan-Datei laufen weiterhin im Haupt-Repo, weil die `.sf-plugin/`-Buchhaltung sie referenziert und der Worktree frisch aus dem Basis-Branch entsteht (und die Datei zunächst nicht enthält). Erst beim Handback wird der finale Stand in den Worktree übernommen und dort mitcommittet.
- **Aufräumen im Haupt-Repo:** Die dadurch redundante, untrackte Plan-Datei wird nach der Übernahme aus dem Arbeitsbaum des Haupt-Repos entfernt. Das verhindert eine „dangling“-Datei (genau die Beschwerde) und eine „untracked working tree file“-Kollision beim `merge`-Abschluss.
- **Kein neuer Config-Schalter:** Das neue Verhalten ist der Worktree-Modus-Default, kein zusätzliches Flag. Es ist eine strikte Verbesserung (Plan liegt nicht mehr uncommittet herum) und vermeidet zusätzliche Config-Oberfläche.
- **Verträglich mit der Plan-Nummern-Konvention:** Weil der Plan nun auf dem Liefer-Branch entsteht, greift bis zum Merge die bereits vorhandene Kollisionsauflösung für über Branches erzeugte Pläne; Review-Report-Referenzen lösen über Nummer bzw. Slug auf.
- **Zentrale Änderung im Shared-Include:** Der Fix liegt vollständig in `skills/_shared/worktree-integration.md`; alle fünf einbindenden Workflows erben ihn beim Build automatisch.

## Betroffene Dateien

| Datei                                                       | Beschreibung                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/_shared/worktree-integration.md`                    | Abschnitt „Was im Worktree liegt …“ in drei Kategorien aufgeteilt (Deliverables / Plan-Datei / nur `.sf-plugin/`); Handback um Schritt „Plan-Datei in den Liefer-Branch übernehmen“ erweitert, Commit-Schritt zieht die Plan-Datei mit, Folgeschritte neu nummeriert. |
| `README.md`                                                 | §Worktree-Integration um einen Absatz ergänzt, der beschreibt, dass die Plan-Datei mit in den PR reist und nur `.sf-plugin/` außerhalb bleibt.                                                                                                                        |
| `docs/plan/0053-plan-datei-im-pr-des-worktree-handbacks.md` | Diese Plan-Datei.                                                                                                                                                                                                                                                     |

## Implementierungsdetails

### Abschnitt „Was im Worktree liegt und was im Haupt-Repo bleibt“

Statt zwei Kategorien (Worktree-Deliverables / alles andere im Haupt-Repo) nun drei:

1. Code-, Test-, Doku-Deliverables → Worktree/Liefer-Branch.
2. Plan-Datei → im Haupt-Repo autorisiert, finaler Stand beim Handback in den Worktree übernommen und mitcommittet (Teil des PRs).
3. Nur `.sf-plugin/`-Artefakte → ausschließlich im Haupt-Repo.

### Handback-Ablauf (neu)

1. **Plan-Datei in den Liefer-Branch übernehmen:** finalen Stand aus dem Haupt-Repo im Worktree unter `docs/plan/NNNN-…md` bereitstellen; anschließend die redundante untrackte Kopie aus dem Haupt-Repo-Arbeitsbaum entfernen. `.sf-plugin/` bleibt unangetastet. Ohne geführte Plan-Datei entfällt der Schritt.
2. **Commit sicherstellen:** Deliverables **plus** übernommene Plan-Datei über die `sf-commit`-Logik committen.
3. **Abschluss-Aktion bestimmen** (`pr`/`merge`/`branch`).
4. **Worktree zurückziehen.**
5. **Aktion ausführen.**

### Build/Validierung

- `pnpm build` löst das Include in alle fünf Workflows sowie die Codex-/Claude-Artefakte auf.
- `pnpm agent:check` (oxfmt) prüft die Formatierung.

## Testergebnisse

- `pnpm build`: erfolgreich, Includes für die fünf Code-ändernden Skills korrekt aufgelöst.
- `pnpm agent:check` (oxfmt `--check`): keine Formatierungsabweichungen.

## Review-Findings

**Datum:** 2026-07-01
**Reviewer:** keiner

### Zusammenfassung

Reine Spec-/Dokumentationsänderung am gemeinsamen Worktree-Baustein ohne Laufzeitcode, Tests oder UI. Es wurde kein separater Reviewer-Skill gestartet; die Verifikation erfolgte über `pnpm build` (Include-Auflösung) und `pnpm agent:check` (Formatierung) sowie eine sorgfältige Selbstprüfung des geänderten Ablaufs.
