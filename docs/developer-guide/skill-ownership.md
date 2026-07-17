# Skill-Ownership

Effective Flow nutzt die zentrale [Skills-Sammlung](https://github.com/sebastian-software/skills.sebastian-software.com)
als Quelle für wiederverwendbare Fach-Expertise. Dieses Dokument beschreibt die Grenze
zwischen dem, was **Effective Flow selbst besitzt** (Orchestrierung), und dem, was die
**zentralen Skills besitzen** (Domänen-Expertise), sowie ein Inventar, das jede Intersection
mit dem aktuellen Skillset klassifiziert.

## Der geschichtete Vertrag

Der frühere Vertrag lautete „ein Skill informiert das Wie, Effective Flows Regeln gewinnen
immer". Er wird durch ein **geschichtetes** Modell ersetzt (die operative Regel steht in
`src/shared/skill-discovery.md`):

- **Effective Flow besitzt die Orchestrierung** – das **Was/Wann**: `/effective-flow`-Routing
  und User-Interaktion; Plan-/Report-State, Finding-IDs, Backlinks, Tracker-Integration,
  Resumability; Agent-Auswahl, Parallelisierung, Baseline-Vergleich, Worktrees, Commits,
  Delivery; Claude/Codex-Transformation und die Effective-Flow-Konfiguration. Diese Ebene hat
  immer Vorrang.
- **Zentrale Skills besitzen wiederverwendbare Expertise** – das **Wie**: Domänen-Checklisten,
  Heuristiken, Standards, Research-Prozeduren, Spezialisten-Implementierungs-/Review-Guidance
  und wiederverwendbare Artefakt-Konventionen, wo ein Skill diesen Scope deklariert.

Ist ein zentraler Skill der **deklarierte Domänen-Owner** für eine Fachfrage **und** deckt er
sie ab, ist seine Guidance **maßgeblich** – nicht optionaler Rat. Das jeweilige Effective-Flow-Source
trägt dann **keine zweite Kopie** dieses Playbooks, sondern nur Scope-, Output- und
Lifecycle-Constraints plus einen **minimalen generischen Fallback** für den Fall, dass der
Skill fehlt (nicht installiert, `skills.enabled: false` oder via `exclude` deaktiviert).

## Klassifikation

Jede Intersection – also jedes Paar aus einem zentralen Skill und einem
Effective-Flow-Tool/-Agent – gehört in genau eine Klasse. Ein Skill mit mehreren Konsumenten
kann daher je Konsument unterschiedlich eingestuft sein (z. B. `effective-web`: delegate für
den Reviewer/UI, route für die Test-Agents):

- **delegate** – der zentrale Skill ist autoritativ; Effective Flow ist ein dünner Adapter und
  trägt nur Orchestrierung + minimalen Fallback.
- **route-when-relevant** – der zentrale Skill besitzt nur einen Spezialzweig; die
  Effective-Flow-Guidance bleibt führend und routet bei Bedarf.
- **no-overlap** – das Effective-Flow-Verhalten ist genuin produktspezifisch bzw. divergiert
  bewusst; kein Domänen-Transfer.

## Ownership-Inventar (aktueller Default-Branch-Skillset)

| Zentraler Skill            | Effective-Flow-Tool(s)/Agent(s)                                                    | Klassifikation                               | Domänen-Deckung                                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `locale-typography`        | `src/shared/language-rules.md` (Typografie-Teil), `code-documenter`, `docs-writer` | delegate                                     | vollständig – echtes Superset (13 Locales). Effective Flow behält nur die Sprach-Policy (Code EN / Doku DE / Commits EN).                             |
| `effective-web`            | `frontend-reviewer`, `ui-implementer`, `test-writer`, `e2e-tester`                 | delegate (Reviewer/UI) / route (Test-Agents) | vollständig – WCAG 2.1 AA, Core Web Vitals, CSS-Architektur, React, Forms, i18n.                                                                      |
| `smart-dependency-updater` | `maintain`                                                                         | delegate                                     | vollständig – nur der Delivery-Modus (Commit pro Gruppe) bleibt Orchestrierung.                                                                       |
| `codebase-improvement`     | `review`, `refactor`, `plan`, `plan-review`                                        | route-when-relevant                          | Reasoning gedeckt, überlappt aber die Orchestrierung (Plan-/Report-/Artefakt-Management); delegierbar ist nur die Findings-/Simplification-Disziplin. |
| `port-codebases`           | `refactor` (Cross-Language-Zweig)                                                  | route-when-relevant                          | vollständig für den Spezialzweig; greift nur bei Cross-Language-/Runtime-Migration.                                                                   |
| `software-architecture`    | `nodejs-reviewer`, `rust-reviewer`                                                 | route-when-relevant                          | **Lücke:** trägt Architektur-Reasoning, **nicht** die Line-Level-Checks (Injection, Event-Loop-Blocking, unhandled rejections, Clippy-Idiomatik).     |
| `decision-records`         | `apply-review` (`src/shared/adr-convention.md`)                                    | no-overlap                                   | **bewusster Modell-Konflikt:** zentral immutabel/nummeriert vs. Effective Flow lebend/Slug.                                                           |
| `product-management`       | –                                                                                  | no-overlap                                   | keine Intersection.                                                                                                                                   |

## Bewusste Ausnahmen

- **`software-architecture` ↔ Reviewer:** Die Line-Level-Security-, Performance- und
  Error-Handling-Checklisten der `nodejs-reviewer`/`rust-reviewer` bleiben in Effective Flow –
  der zentrale Skill ergänzt Architektur-Reasoning, ersetzt die Prüftiefe aber nicht.
- **`decision-records` ↔ `apply-review`:** Effective Flows lebendes Slug-ADR-Modell
  (`src/shared/adr-convention.md`) divergiert bewusst vom immutabel/nummerierten Modell des
  Skills. Die ADR-_Craft_ („wann/was als ADR") darf geroutet werden, das ADR-_Modell_ bleibt
  produktspezifisch.
- **`pr-review`:** aktuell von keinem Tool empfohlen, überlappt aber stark mit
  `src/tools/iterate.md` (PR-Feedback, CI-Recovery, Branch-Pflege) – ein naheliegender
  künftiger Delegations-Kandidat.

## Ownership-Check beim Erweitern

Beim Hinzufügen oder Erweitern eines Tools, Agents oder Shared-Includes gilt: **Trägt die
Änderung eine zweite Kopie eines zentral geowneten Playbooks?** Falls ja, an den Skill
delegieren und nur einen minimalen Fallback behalten; die Intersection oben ins Inventar
eintragen und klassifizieren.

## Siehe auch

- `src/shared/skill-discovery.md` – die operative Skill-Discovery-Regel inklusive Autoritäts-Vertrag.
- [Architektur](architektur.md) – Gesamtaufbau von Effective Flow.
- [`AGENTS.md`](../../AGENTS.md) – Skill-Discovery-Mechanik und Contributor-Konventionen.
