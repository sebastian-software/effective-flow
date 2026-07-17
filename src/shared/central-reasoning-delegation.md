## Delegation des Domänen-Urteils an zentrale Skills

Das **generische fachliche Urteil** des aufrufenden Tools — für Planung die
Plan-Quality- und Plan-Review-Disziplin (Executable-Plan-Schärfe, Gap-/Drift-Prüfung,
Scope, Evidenz, Verifikation, Wartungsfokus) — besitzt der zentrale Skill
`codebase-improvement`. Effective Flow ist hier der **Artefakt-Orchestrator**, kein zweites
Fach-Handbuch: Das eigene Source trägt **keine zweite Kopie** dieser Heuristiken, sondern
delegiert das Urteil und normalisiert das Ergebnis in den eigenen Artefakt-Contract (Status,
Scorecard/Befund-Form, offene Punkte, Handoff).

### Was delegiert wird (das „Wie“ des Urteils)

- generische Qualitäts-Heuristiken: Over-Engineering, Scope Creep, unausgesprochene Annahmen,
  fehlende oder nicht messbare Akzeptanzkriterien, Edge Cases, Umsetzungsrisiken, Evidenz vs.
  Raten, Verifizierbarkeit;
- das Review-**Urteil** (welche Befunde bestehen und wie schwer sie wiegen) auf Artefakt-Ebene.

Wende dafür `codebase-improvement` an, sofern verfügbar und für die konkrete Aufgabe relevant;
es ist der **Default-Owner** für dieses generische Reasoning. Das Ergebnis bringst du danach in
die Effective-Flow-Artefakt-Form.

### Spezialisten nur bei gekreuzter Boundary (eine generische Regel)

Deklarierte Domänen-Owner werden **nicht** hart pro Skill verdrahtet, sondern über **eine**
Regel geladen: Kreuzt die konkrete Aufgabe die deklarierte Boundary eines Spezialisten, lade
dessen Owner über das Relevanz-Gate (Baustein „Skill-Discovery“) und das Ownership-Inventar
(`docs/developer-guide/skill-ownership.md`). Typische Owner:

- `product-management` — Product-Outcomes, what/why/for-whom, Prioritisierung, Release-Urteil;
- `product-design` — Research, Problem-Framing, Information-Architecture, Flows, Prototyp;
- `effective-web` — Browser-Implementierungs- und Barrierefreiheits-Detail;
- weitere deklarierte Owner (z. B. `software-architecture`, `web-legal-compliance`) analog.

Das Relevanz-Gate **hält schmale Aufgaben schmal**: Ein kleiner Engineering-Plan lädt weder
Product- noch Design-Owner, und Product-Discovery wird nicht erzwungen.

### Autoritäts-Vertrag und minimaler Fallback

Es gilt der geschichtete Vertrag aus dem Baustein „Skill-Discovery“: Effective Flow besitzt die
**Orchestrierung** (Artefakt-Lifecycle, Status, offene Punkte, Handoff, User-Interaktion und
die jeweilige No-Code-/Edit-Grenze), die zentralen Skills besitzen das **Domänen-Urteil**. Ist
der maßgebliche Skill nicht verfügbar (nicht installiert, `skills.enabled: false` oder via
`exclude` deaktiviert), greift ein **minimaler generischer Fallback**: eine kurze essentielle
Kern-Checkliste (Over-Engineering, Scope Creep, fehlende messbare Akzeptanzkriterien, Edge
Cases, Umsetzungsrisiken), damit das Tool funktionsfähig bleibt und sauber degradiert — **kein**
vollständiges lokales Handbuch.
