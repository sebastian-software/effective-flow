## Delegations-Vertrag: generisches Audit-Reasoning

Der zentrale Skill `codebase-improvement` ist der **deklarierte Owner** des generischen
Audit-Reasonings (Klassifikation `route-when-relevant`, siehe
[Skill-Ownership](../../docs/developer-guide/skill-ownership.md)). Wo dieses Reasoning greift,
ist seine Guidance **maßgeblich**, nicht optionaler Rat; dieses Tool trägt **keine zweite
Kopie** des Audit-Playbooks – nur den Output-Contract, die Lifecycle-Constraints und einen
minimalen Fallback.

**Der Skill besitzt das generische Reasoning (das „Wie“):**

- Repository-Reconnaissance und Projektkonventions-Erkennung,
- Evidence-Standards sowie Finding-Validierung, -Rejection und Deduplizierungs-Beurteilung,
- Leverage-basierte Priorisierung, Komplexitäts- und Over-Engineering-Linsen,
- Gap-Analyse, Root-Cause-Platzierung, Scope-/Risiko-Kontrolle und Plan-Qualität.

**Dieses Tool besitzt die Orchestrierung und den Output-Contract (das „Was/Wann“):**

- den `{{FIRMO}}`-Einstieg, das Scope-Gate und die Fortschrittsmeldungen,
- die Agent-Auswahl, Parallelisierung und – im Review – die Verzeichnis-Split-Heuristik,
- das Finding-Schema (IDs `R-XXXXXXX`, Schweregrad, Komplexität, Konfidenz-Gate), die
  Report-/Tracker-Persistenz, Baselines/Verhaltens-Invarianz, Resumability und Delivery.

**Output-Contract an den Skill (verbindlich).** Übergib dem Skill das
Effective-Flow-Finding-Schema (Datei+Zeile, Schweregrad, Komplexität, Bereich, Problem,
Empfehlung, Konfidenz) als Zielformat und weise ihn an, **kein eigenes Report-, Issue- oder
Delivery-Artefakt** anzulegen und **nicht** nach einer reinen Zusammenfassung zu stoppen. Er
liefert Reasoning und Finding-Kandidaten in dieses Schema; die deterministischen Schwellen und
Schlüssel (Konfidenz-Gate, Dedup-Schlüssel, Scorecard-Grenzen), die Persistenz, die Baseline
und die Delivery besitzt ausschließlich dieses Tool. So laufen keine zwei
Persistenz-/Lieferschleifen parallel.

**Spezialzweige** routen weiterhin an ihre engeren Owner, wenn deren deklarierter Scope greift:
`effective-web` (Frontend, Barrierefreiheit, CSS-Architektur, React), `software-architecture`
(Architektur-Reasoning), `port-codebases` (Cross-Language-/Runtime-Migration),
`smart-dependency-updater` (Dependency-Updates) und `decision-records` (ADR-Authoring) –
konsistent mit dem [Ownership-Inventar](../../docs/developer-guide/skill-ownership.md).

**Minimaler Fallback (Skill fehlt).** Ist `codebase-improvement` nicht verfügbar (nicht
installiert, `skills.enabled: false` oder via `exclude` deaktiviert), greift die kurze
Kern-Guidance im Abschnitt „Minimaler Fallback ohne Skill“ dieses Tools. Sie hält den Workflow
funktionsfähig, hält aber **kein** zweites vollständiges Audit-Handbuch vor – volle Tiefe kommt
nur mit dem Skill.
