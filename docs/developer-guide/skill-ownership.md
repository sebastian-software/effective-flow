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

| Zentraler Skill            | Effective-Flow-Tool(s)/Agent(s)                                                                        | Klassifikation                                     | Domänen-Deckung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `locale-typography`        | `src/shared/language-rules.md` (Typografie-Teil), `code-documenter`, `docs-writer`, `marketing-writer` | delegate                                           | vollständig – echtes Superset (13 Locales). Effective Flow behält nur die Sprach-Policy (Code EN / Doku DE / Commits EN).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `effective-web`            | `frontend-reviewer`, `ui-implementer`, `test-writer`, `e2e-tester`, `plan`/`plan-review` (via Gate)    | delegate (Reviewer/UI) / route (Test-Agents, Plan) | vollständig – Barrierefreiheit, Core Web Vitals, CSS-Architektur, React, Forms, i18n (versionierte Standards wie WCAG bleiben im Skill). Für `plan`/`plan-review` route-when-relevant: Browser-/Barrierefreiheits-Detail eines Plans wird nur bei gekreuzter Boundary über das Relevanz-Gate hinzugezogen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `smart-dependency-updater` | `maintain`                                                                                             | delegate                                           | vollständig – `maintain` ist ein dünner Adapter: der Skill besitzt Ecosystem-Erkennung, Gruppierung, Changelog-Research, Kompatibilitäts-Anpassung, Validierungsstrategie und Update-Reporting; Effective Flow behält nur die Orchestrierung + Delivery (Scope-Gate, Baseline, Commit pro Gruppe, Worktree, Handback) und gibt dem Skill „EF besitzt Delivery“ als Constraint mit, damit keine zwei Delivery-Schleifen laufen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `codebase-improvement`     | `review`, `refactor`, `plan`, `plan-review`                                                            | route-when-relevant                                | Tool-Level-Audit-Reasoning in `review`/`refactor` an den Skill delegiert (via `src/shared/audit-reasoning-delegation.md` + minimaler Fallback): Reconnaissance, Evidence-Standards, Finding-Validierung/-Dedup, Leverage-Priorisierung, Komplexität, Root-Cause, Scope/Risiko, Plan-Qualität. Effective Flow behält Orchestrierung, Finding-Schema/IDs, Konfidenz-/Scorecard-Gates sowie Report-/Tracker-/Baseline-/Delivery-Contract; die Reviewer-Agents (Line-Level-Checks) bleiben unberührt. `plan`/`plan-review` delegieren zusätzlich das generische Plan-Quality-/Review-**Urteil** (Gap-Analysis, Scorecard, Plan-Review-Befunde – `plan` Phasen 4–6, `plan-review` Phase 2) über den eigenen Shared-Include `src/shared/central-reasoning-delegation.md` und normalisieren das Ergebnis in Status-/Scorecard-/Befund-Form; der Plan-Artefakt-Lifecycle bleibt bei Effective Flow, und bei fehlendem Skill greift ein minimaler generischer Fallback. |
| `port-codebases`           | `refactor` (Cross-Language-Zweig)                                                                      | route-when-relevant                                | vollständig für den Spezialzweig; greift nur bei Cross-Language-/Runtime-Migration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `software-architecture`    | `nodejs-reviewer`, `rust-reviewer`                                                                     | route-when-relevant                                | **Lücke:** trägt Architektur-Reasoning, **nicht** die Line-Level-Checks (Injection, Event-Loop-Blocking, unhandled rejections, Clippy-Idiomatik).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `decision-records`         | `apply-review` (`src/shared/adr-convention.md`)                                                        | delegate (mit Fallback)                            | `apply-review` übergibt abgelehnte Findings als Entscheidungs-Kandidaten; der Skill entscheidet über ADR-Würdigkeit und autort nach der deklarierten Repo-Konvention (Effective Flows lebendes Slug-Modell aus `adr-convention.md`), das zugleich der minimale Fallback ist, wenn der Skill fehlt. Effective Flow behält Mapping, Approval-/Status-Fluss, Backlink und Summary-Tracking. Die frühere `no-overlap`-Einstufung beruhte auf dem Prä-#85-Stand des Skills (angeblich immutabel/nummeriert); seit der living/mutable-Variante entfällt der Modell-Konflikt.                                                                                                                                                                                                                                                                                                                                                                                         |
| `product-management`       | `plan`, `plan-review` (via Relevanz-Gate)                                                              | route-when-relevant                                | Product-Outcomes, what/why/for-whom, Prioritisierung und Release-Urteil – nur, wenn ein konkreter Plan die Product-Boundary kreuzt (über das Relevanz-Gate geladen, nicht hart verdrahtet). Ein schmaler Engineering-Plan lädt den Skill nicht.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `product-design`           | `plan`, `plan-review` (via Relevanz-Gate)                                                              | route-when-relevant                                | Research, Problem-Framing, Information-Architecture, Flows, Prototyp – nur bei gekreuzter Design-Boundary über das Relevanz-Gate. **Im aktuellen Default-Branch-Skillset nicht installiert**; die generische Spezialisten-Regel lädt den Owner automatisch, sobald verfügbar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Bewusste Ausnahmen

- **`codebase-improvement` ↔ `review`/`refactor`:** Delegiert ist ausschließlich das
  **Tool-Level-Reasoning** (über den Shared-Include `src/shared/audit-reasoning-delegation.md`).
  Die **Reviewer-Agents** (`frontend-reviewer`, `nodejs-reviewer`, `rust-reviewer`) und ihre
  Line-Level-Checks bleiben unangetastet, ebenso das Finding-Schema/IDs, die Profiles/Gates und
  der Report-/Tracker-/Baseline-/Delivery-Contract. Die Einstufung bleibt `route-when-relevant`,
  weil der Skill die Orchestrierung nicht abdeckt.
- **`codebase-improvement` ↔ `plan`/`plan-review`:** Der Firmo-Plan-Lifecycle (Naming, Status,
  Kategorie-Metadaten, Storage, Archiv, offene Punkte, Handoff, interaktiver Schreib-/Review-Loop
  mit edit-only-referenced-plan) bleibt bei Effective Flow. Das **generische Plan-Quality- und
  Plan-Review-Urteil** kommt aus `codebase-improvement` über den eigenen Shared-Include
  `src/shared/central-reasoning-delegation.md`. Er ist bewusst vom Audit-Include
  (`src/shared/audit-reasoning-delegation.md`, `review`/`refactor`) getrennt, weil das
  Plan-Artefakt keinen Finding-/Report-/Delivery-Contract kennt, sondern Scorecard, Plan-Review
  und offene Punkte; beide Includes teilen aber dieselbe Regel (delegiere das Urteil, route
  Spezialisten via Relevanz-Gate, minimaler Fallback). Spezialisten (`product-management`,
  `product-design`, `effective-web`, `software-architecture`, `web-legal-compliance` …) werden
  **nicht** hart pro Skill verdrahtet, sondern nur bei gekreuzter Boundary geladen; ein noch nicht
  installierter Owner (z. B. `product-design`) wird still übersprungen, bis er verfügbar ist.
- **`software-architecture` ↔ Reviewer:** Die Line-Level-Security-, Performance- und
  Error-Handling-Checklisten der `nodejs-reviewer`/`rust-reviewer` bleiben in Effective Flow –
  der zentrale Skill ergänzt Architektur-Reasoning, ersetzt die Prüftiefe aber nicht.
- **`decision-records` ↔ `apply-review`:** `apply-review` delegiert das ADR-Authoring an den
  Skill. Effective Flows lebendes Slug-ADR-Modell (`src/shared/adr-convention.md`) ist dabei
  **keine Divergenz mehr**, sondern die für dieses Repo **deklarierte Konvention**, der der
  Skill folgt (er entdeckt und befolgt die Repo-Konvention), sowie der **minimale Fallback**,
  wenn der Skill fehlt. Sowohl die ADR-_Craft_ („wann/was als ADR") als auch das Authoring
  liegen beim Skill; Effective Flow behält nur Mapping, Approval/Status, Backlink und
  Summary-Tracking. Die frühere `no-overlap`-Einstufung beruhte auf dem Prä-#85-Stand des
  Skills.
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
