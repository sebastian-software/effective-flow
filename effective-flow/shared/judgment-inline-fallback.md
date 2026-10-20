## Judgment fallback and skip records

These rules govern a judgment spawn of "Judgment handoff" and the `investigate` skeptic step when the
spawn is unavailable, declined, aborted, or escalated past Retry 1, and every later run on an
artifact that already holds one of their records or open points.

- **Inline fallback:** when no spawn mechanism is available, the delegation is declined, or the user
  picks "complete manually" after a failed escalation, judge inline, say so in one visible chat line,
  and write the inline record.
- **Skip:** when the user picks "continue with the next phase", or the spawn returns `ABORT`, which
  is terminal for the step and starts no retry, write the skip record and one
  implementation-blocking open point that names the re-entry invocation:
  `effective-flow plan-issue <issue>` for a planning comment, otherwise
  `effective-flow review <artifact file>`; an investigation writes none (see Location). The skip open
  point counts as deliberately deferred; only its replacement clears it.
- **Reduced scope:** a Retry 2 or Retry 3 result is accepted and gets the reduced-scope record.

An inline or reduced-scope judgment may still be approved, and its record stays visible; a skip
blocks release through its open point, which every host gate already honors.

### Records

The artifact receives only the variant of its resolved language. `<step>` is the step kind in that
language: gap analysis / Gap-Analyse, plan review / Plan-Review, concept self-check /
Konzept-Selbstprüfung, concept review / Konzept-Review, independent challenge / Unabhängige
Gegenprüfung. `<scope>` is the reduced scope that retry handed over, `<invocation>` the re-entry;
the German column names them `<Schritt>`, `<Umfang>` and `<Aufruf>`.

| Record        | English                                                                                       | German                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Inline        | `Record (<step>): judged inline in the authoring context, without a fresh-context reviewer.`  | `Vermerk (<Schritt>): inline im erstellenden Kontext beurteilt, ohne Prüfung in frischem Kontext.`                  |
| Reduced scope | `Record (<step>): judged in a fresh context with reduced scope only: <scope>.`                | `Vermerk (<Schritt>): in frischem Kontext nur mit reduziertem Umfang beurteilt: <Umfang>.`                          |
| Skip          | `Record (<step>): judgment not performed; an open point blocks implementation until it runs.` | `Vermerk (<Schritt>): Beurteilung nicht durchgeführt; ein offener Punkt blockiert die Umsetzung bis zum Nachholen.` |
| Open point    | `- <step> not performed: run <invocation> before implementation.`                             | `- <Schritt> nicht durchgeführt: vor der Umsetzung <Aufruf> ausführen.`                                             |

Records carry no plan- or concept-contract label and no review-result value, so they change no
contract reading, and they name no harness, model, or session ID.

### Location and lifetime

- **Plans and planning comments:** directly below the result line of `## Plan review` /
  `## Plan-Review` (`###` in a comment); the open point goes into the open-points section.
- **Concepts:** in `## Risks and open questions` / `## Risiken und offene Fragen`; the open point
  goes into the open-points section.
- **Investigation:** in "Independent challenge" when the Phase 5 report is written. There the
  admission rule replaces the review result and the open point: a skip routes the diagnosis per
  `investigate` Phase 4 (classification `unclear`, admission outcome `uncertain`).

Every writer keeps a record until a later full judgment of the same step kind replaces it; a
reduced-scope result is not full. A full judgment in a later run of the re-entry tool on that
artifact replaces the records of every step kind of its artifact; a different step kind in the same
run never replaces a record. Replacing a skip record removes its open point.
