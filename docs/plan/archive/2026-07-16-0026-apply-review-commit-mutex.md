# 0026: Git-Commit-Mutex in apply-review

**Planungsstatus:** Umgesetzt

## Problem

`sf-apply-review` kann in Phase 4.3 mehrere Delegations-Sub-Agenten parallel starten. Bei Commit-Strategie „Einzeln“ soll jedes Finding einen eigenen Commit bekommen. Ohne globale Commit-Disziplin können parallele Sub-Agenten jedoch gleichzeitig `git add` oder `git commit` ausführen. Dadurch können Änderungen aus einem anderen Finding in den falschen Commit geraten.

## Root Cause

Die bisherige Parallelitätssteuerung gruppiert Findings anhand der erwarteten Datei-Überlappung. Das reduziert Implementierungskonflikte, schützt aber nicht die globale Git-Staging-Area. Git hat pro Worktree nur einen Index; parallele Agenten teilen sich also denselben Staging-Bereich.

Ein Mutex nur um `git commit` reicht nicht aus, weil fremde Änderungen bereits vorher gestaged worden sein können. Geschützt werden muss die gesamte kritische Sektion aus Statusprüfung, gezieltem Staging, staged Diff-Prüfung und Commit.

## Entscheidung

Für Commit-Strategie „Einzeln“ führt `sf-apply-review` einen globalen Git-Commit-Mutex ein:

- Lock-Pfad: `.sf-plugin/sf-apply-review-commit.lock`
- Lock-Erwerb: atomar per `mkdir`
- Gültigkeitsbereich: `git status`, gezieltes `git add`, `git diff --cached`, `git commit`, Nachprüfung
- Verboten: `git add .`, `git add -A`, `git commit -a`
- Bei fremden staged changes: kein Commit, `ABBRUCH` für das Finding

Der Mutex erlaubt weiterhin parallele Implementierung, serialisiert aber Staging und Commit.

## Betroffene Dateien

| Datei                             | Änderung                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `skills/sf-apply-review/SKILL.md` | Commit-Mutex-Regel in Phase 2 ergänzt und explizit an Delegations-Sub-Agenten in Phase 4.3 weitergegeben |

## Restrisiken

- Der Mutex verhindert keine parallelen Schreibkonflikte in derselben Datei während der Implementierung. Dafür bleibt die Sub-Gruppen-Bildung zuständig.
- Externe Prozesse oder User-Kommandos, die den Mutex nicht beachten, können weiterhin staged changes erzeugen. Der Skill bricht in diesem Fall vor dem Commit ab, statt fremde Änderungen zu übernehmen.
- Ein verwaister Lock muss vom User freigegeben werden; automatische Entfernung wäre riskant.
