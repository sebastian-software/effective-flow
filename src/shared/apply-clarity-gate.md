## Klärungs-Gate (vollständig geklärt?)

Bevor eine Grundlage (Plan-Datei, Issue oder Review-Finding) umgesetzt wird, prüft dieses
Gate, ob sie **vollständig geklärt** und **ohne Rückfrage umsetzbar** ist. Das Gate greift
an **beiden** Einstiegspunkten: in der Apply-Kette (`{{SKILL:apply}}` →
`{{SKILL:apply-plan}}`/`{{SKILL:apply-issues}}`/`{{SKILL:apply-review}}`) **und** bei
Direktaufruf eines umsetzenden Workflows (`{{SKILL:build}}`, `{{SKILL:fix}}`,
`{{SKILL:refactor}}`, `{{SKILL:docs}}`) mit einer Plan-Datei.

Leitprinzip: **Keine Annahmen außer absolut offensichtlichen.** Im Zweifel lieber eine
Klärungsrunde zu viel als eine zu wenig.

### Abbruchkriterien (mindestens eines trifft zu → nicht umsetzen)

- **Offene Punkte:** Der Plan enthält einen Abschnitt `## Offene Punkte` bzw.
  `## Open Points` mit anderen Einträgen als dem Leerzustand (`- Keine offenen Punkte.` /
  `- No open points.`).
- **Fehlende messbare Akzeptanzkriterien:** Es gibt keine Akzeptanzkriterien, oder sie sind
  ohne benannte Prüfung/Messgröße formuliert (kein konkreter Check, kein prüfbarer
  Zielzustand).
- **Umsetzungsrelevante Annahmen:** Der Plan enthält als Annahme markierte Unklarheiten, die
  das Verhalten, den Scope oder das Risiko der Umsetzung wesentlich beeinflussen.
- **Nicht self-contained (Issues/Findings):** Ein Issue oder Finding beschreibt die
  gewünschte Umsetzung nicht ausreichend eigenständig, um sie ohne Rückfrage abzuarbeiten.

Reine, unkritische Annahmen ohne Umsetzungsrelevanz blockieren nicht.

### Verhalten am Gate

- **Bestanden** (kein Kriterium trifft zu): weiter zur Umsetzung.
- **Nicht bestanden:** die betroffenen Punkte kurz benennen, in eine Klärungsrunde
  zurückverweisen und den aktuellen Skill beenden, statt teilweise umzusetzen oder zu raten.
  Zielskill der Klärung: eine Plan-Datei geht an `{{SKILL:plan}}` bzw. dessen vertieften
  Plan-Review (`{{SKILL:review}} <plandatei>`); ein Issue oder Finding geht an
  `{{SKILL:plan-issue}}`.

Das Gate ersetzt die frühere separate „Offene Punkte prüfen“-Prüfung: Wo ein Workflow diese
Prüfung bisher einzeln ausgeführt hat, gilt nun dieses Gate als die eine maßgebliche Instanz,
um Doppelpflege zu vermeiden.
