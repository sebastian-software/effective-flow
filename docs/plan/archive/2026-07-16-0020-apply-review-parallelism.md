# 0020: Mehr Parallelität in apply-review

**Planungsstatus:** Umgesetzt

## Anforderung

Phase 4 von `sf-apply-review` arbeitete bisher pro Aktionsgruppe (`sf-fix` / `sf-refactor` / `sf-build-feature`) sequenziell, mit nur drei parallelen Streams. Bei vielen Findings war das ein Bottleneck. Ziel: mehr Parallelität, ohne den 1-Commit-pro-Finding-Vertrag bei Commit-Strategie „Einzeln“ zu brechen.

Umsetzung: Kombination aus zwei orthogonalen Techniken:

- **Option A — Datei-Overlap-Aware Sub-Gruppen:** Findings ohne gemeinsame Dateien laufen parallel; Findings mit gemeinsamen Dateien sequenziell.
- **Option C — Phasen-Split: Vorabanalyse parallel, Implementierung serialisiert pro Sub-Gruppe:** Code-Untersuchung und Plan-Skizze pro Finding parallel vorab, anschließend reine Implementierung.

## Architekturentscheidungen

- **Phase 4 in 4.1 / 4.2 / 4.3 gesplittet** statt neue Phase einzufügen — die nachfolgenden Phasen (5-8) bleiben in der Nummerierung stabil.
- **Vorabanalyse-Sub-Agenten implementieren nichts** und ändern keine Dateien — nur Analyse mit strukturiertem Output (Datei-Liste, Root Cause / Anforderung, Skizze, Risiken, Konfidenz).
- **Konfidenz-Niedrig-Findings** kommen in eigene Singleton-Sub-Gruppen — Vorrang für Konflikt-Vermeidung über Speedup.
- **Sub-Gruppen-Bildung per Union-Find** auf Datei-Listen aus Phase 4.1; transitive und sternförmige Überlappungen werden erfasst.
- **Aktionsgruppen weiterhin gegenseitig parallel** — Cross-Action-Datei-Konflikte sind in der Praxis selten und werden bewusst nicht erkannt; die Stash-Bereinigung (Phase 6) fängt solche Fälle ab.
- **Sub-Skills (`sf-fix`, `sf-refactor`, `sf-build-feature`) bleiben unverändert.** Vorabanalyse wird als inline-Kontext-Block in den Sub-Agent-Prompt eingebettet — Sub-Skills lesen die Wisdom-Datei nicht.
- **ABBRUCH-Differenzierung:** Phase 4.1 markiert Abbrüche explizit als `fehlgeschlagen (Vorabanalyse)`, Phase 4.3 als `fehlgeschlagen (Delegation)` — Phase 6 Stash-Bereinigung kann beide Fälle korrekt unterscheiden.
- **Working-Tree-Restore nach Delegations-ABBRUCH:** vor dem nächsten Finding derselben Sub-Gruppe wird der `git status` geprüft und ggf. via Stash oder Verwerfen bereinigt — verhindert, dass das nächste Finding auf halbfertigen Änderungen aufsetzt.

## Betroffene Dateien

| Datei                                        | Beschreibung                                                                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/sf-apply-review/SKILL.md`            | Phase 4 in 4.1/4.2/4.3 gesplittet; Wisdom-Accumulation um Vorabanalyse und Sub-Gruppen erweitert; Regeln-Sektion an neue Parallelitätsstruktur angepasst |
| `docs/plan/0020-apply-review-parallelism.md` | Diese Plan-Datei                                                                                                                                         |

## Implementierungsdetails

### Phase 4.1 — Vorabanalyse (parallel pro Finding)

- Pro umsetzbares Finding ein Sub-Agent.
- Output je Finding in der Wisdom-Datei: betroffene Dateien (vollständig), Root Cause / Anforderung, Implementierungsskizze (2-5 Bullets), Risiken, Konfidenz `Hoch` / `Mittel` / `Niedrig`.
- ABBRUCH wird als `fehlgeschlagen (Vorabanalyse)` markiert.

### Phase 4.2 — Sub-Gruppen-Bildung (lokal im Orchestrator)

- Zweistufig: erst Partitionierung in Konfidenz-Niedrig vs. Rest, dann Union-Find nur auf der Rest-Menge, anschließend werden Konfidenz-Niedrig-Findings als Singletons hinzugefügt.
- Edge Cases dokumentiert: alle Konfidenz-Niedrig, Aktionsgruppe mit einem Finding, leere Aktionsgruppe.
- Reihenfolge innerhalb Sub-Gruppe: Report-Reihenfolge (deterministisch).

### Phase 4.3 — Parallele Delegation

- Pro `(Aktionsgruppe × Sub-Gruppe)` ein Sub-Agent. Alle parallel; intern sequenziell.
- Sub-Agent erhält die Vorabanalyse als inline-Kontext-Block.
- ABBRUCH triggert Working-Tree-Check und ggf. Stash/Discard via User-Frage.

### Erwarteter Speedup

Beispiel mit 8 Findings (4 fix, 3 refactor, 1 build-feature) und gestreuten Dateien:

- Heute: max(4, 3, 1) = 4 Einheiten sequenziell.
- Mit A+C: max(2, 2, 1) = 2 Einheiten + ~0,3 Einheiten Vorabanalyse = ~2,3 Einheiten → **~40% Speedup**.

Bei stark geclusterten Findings (alle dieselbe Datei): nur C wirkt → 10-20% Speedup.

## Review-Findings

**Datum:** 2026-05-03
**Reviewer:** feature-dev:code-reviewer (extern)

### Zusammenfassung

| Schweregrad | Anzahl | Behoben | Offen |
| ----------- | ------ | ------- | ----- |
| Kritisch    | 0      | 0       | 0     |
| Wichtig     | 5      | 5       | 0     |
| Hinweis     | 2      | 2       | 0     |

| Komplexität | Anzahl |
| ----------- | ------ |
| Leicht      | 7      |
| Mittel      | 0      |
| Schwer      | 0      |

### Findings

#### [F1] Phase 6 Prüfung B kann Vorabanalyse-Abbrüche nicht von Delegations-Abbrüchen unterscheiden

- **Schweregrad**: Wichtig
- **Komplexität**: Leicht
- **Bereich**: Datenfluss / Phasen-Konsistenz
- **Datei**: skills/sf-apply-review/SKILL.md:227
- **Problem**: Phase 6 Prüfung B liest „in Phase 4 bearbeitete Findings“ aus der Wisdom-Datei. Wenn ein Finding bereits in Phase 4.1 (Vorabanalyse) abgebrochen wurde, kann kein Stash entstanden sein — eine Stash-Zuordnung wäre also irreführend.
- **Empfehlung**: Phase 4.1 ABBRUCH explizit als `fehlgeschlagen (Vorabanalyse)` markieren, Phase 4.3 als `fehlgeschlagen (Delegation)`. Phase 6 kann dann unterscheiden.
- **Status**: Behoben

#### [F2] Sub-Gruppen-Bildung „Sortiere“ ist konzeptuell falsch und mehrdeutig

- **Schweregrad**: Wichtig
- **Komplexität**: Leicht
- **Bereich**: Klarheit für LLM-Orchestrator
- **Datei**: skills/sf-apply-review/SKILL.md:163-166
- **Problem**: Das Wort „Sortiere“ impliziert Reihenfolge, gemeint ist aber Partitionierung. Außerdem unklar, ob Konfidenz-Niedrig vor oder nach Union-Find behandelt wird.
- **Empfehlung**: Explizite Zweistufung: (1) Partitioniere in Niedrig vs. Rest. (2) Union-Find nur auf Rest. (3) Niedrig-Findings als Singletons hinzufügen.
- **Status**: Behoben

#### [F3] Edge Case „alle Findings Konfidenz Niedrig“ nicht abgedeckt

- **Schweregrad**: Wichtig
- **Komplexität**: Leicht
- **Bereich**: Edge Cases / Phase 4.2
- **Datei**: skills/sf-apply-review/SKILL.md:163-178
- **Problem**: Wenn alle Findings einer Aktionsgruppe Konfidenz Niedrig haben, läuft Union-Find auf leerer Menge — das war nirgends explizit dokumentiert.
- **Empfehlung**: Edge-Cases-Block ergänzen: alle Niedrig, Single-Finding-Aktionsgruppe, leere Aktionsgruppe.
- **Status**: Behoben

#### [F4] ABBRUCH in Phase 4.3 hinterlässt potenziell halbfertige Datei für nächstes Finding

- **Schweregrad**: Wichtig
- **Komplexität**: Leicht
- **Bereich**: Klarheit / LLM-Ambiguität — Phase 4.3
- **Datei**: skills/sf-apply-review/SKILL.md:195
- **Problem**: Bei ABBRUCH eines Findings könnte der Sub-Skill die Datei halbfertig hinterlassen. Das nächste Finding derselben Sub-Gruppe würde dann auf inkonsistentem Zustand arbeiten.
- **Empfehlung**: Vor jedem nächsten Finding `git status` prüfen; bei uncommitteten Änderungen User fragen, ob stashen oder verwerfen.
- **Status**: Behoben

#### [F5] Vorabanalyse-Kontext-Übergabe an Delegations-Sub-Agenten nicht spezifiziert

- **Schweregrad**: Wichtig
- **Komplexität**: Leicht
- **Bereich**: Vollständigkeit / Datenfluss — Phase 4.3
- **Datei**: skills/sf-apply-review/SKILL.md:183-193
- **Problem**: Phase 4.3 sagt „Vorabanalyse als zusätzlicher Kontext“ — unklar, ob inline im Prompt oder als Verweis auf Wisdom-Datei. Sub-Skills lesen die Wisdom-Datei nicht.
- **Empfehlung**: Explizit klarstellen: inline-Kontext-Block im Prompt unter Überschrift „Vorabanalyse für dieses Finding:“.
- **Status**: Behoben

#### [F6] „Kette von Datei-Überlappungen“ verschleiert sternförmige Verbindungen

- **Schweregrad**: Hinweis
- **Komplexität**: Leicht
- **Bereich**: Klarheit — Phase 4.2
- **Datei**: skills/sf-apply-review/SKILL.md:170
- **Problem**: „Kette“ suggeriert lineare Abfolge. Ein Stern-Muster (A teilt zwei verschiedene Dateien mit B und C, B–C nicht) gehört aber genauso in eine Sub-Gruppe.
- **Empfehlung**: Klammersatz mit Beispielen für transitive und sternförmige Überlappung ergänzen.
- **Status**: Behoben

#### [F7] „Sortiere nach Konfidenz“ impliziert ungenutzte Ordnung

- **Schweregrad**: Hinweis
- **Komplexität**: Leicht
- **Bereich**: Typo / Formulierung — Phase 4.2
- **Datei**: skills/sf-apply-review/SKILL.md:164
- **Problem**: Redundant zu F2 — siehe dort.
- **Empfehlung**: Wird durch F2-Fix mitbehoben.
- **Status**: Behoben
