## Report format

The English form is shown below. For `language.workflow = de`, render the complete report in
German: `# Code-Review-Bericht`, `Datum`, `Umfang`, `Projekttyp`, `Zusammenfassung`,
`Schweregrad`, `Anzahl`, `Komplexität`, `Aktion`, `Befunde`, `Titel`, `Bereich`, `Datei`,
`Problem`, `Empfehlung`, `Prompt-Vorschlag`, `Entwicklernotiz`, `Sicherheit`, and
`Übersprungene Befunde (Architekturentscheidungen)`, with German displayed severity/complexity values and the German banner sentence from "Security disclosure gate". Keep finding IDs, paths, skill/action values, the `external`/`internal` exposure tokens, and other machine tokens unchanged. A report uses one complete form; readers accept both forms.

```markdown
# Code review report

**Date:** YYYY-MM-DD
**Scope:** [Entire code / Described area]
**Project type:** [Frontend / Backend / CLI / Rust / Generic product / Tooling / Mixed]

## Summary

| Severity | Count |
|---|---|
| Critical | X |
| Important | Y |
| Note | Z |

| Complexity | Count |
|---|---|
| Low | X |
| Medium | Y |
| High | Z |

| Action | Count |
|---|---|
| {{SKILL:fix}} | X |
| {{SKILL:refactor}} | Y |
| {{SKILL:build}} | Z |
| {{SKILL:docs}} | W |

## Findings

### [R-0000001] [Title]
- **Severity**: Critical / Important / Note
- **Complexity**: Low / Medium / High
- **Area**: [...]
- **File**: [path:line]
- **Security**: external | internal | none <!-- publication class of the security gate: external and internal are withheld from the tracker, none is publishable; omitted in workflow reports that ran no classification -->
- **Admission outcome**: admitted
- **Admission reason**: material-harm | irreversible-commitment
- **Admission gate**: v1
- **Evidence**: [type + concrete reference]
- **Evidence digest**: [stable digest]
- **Current reachability**: [role/input/configuration/state + anchor/digest]
- **Root-cause signature**: [normalized dedup identity]
- **Scope and containment**: [why not current-scope; why containment is insufficient]
- **Why now**: [deadline or current consequence]
- **Completion condition**: [one objective condition]
- **Problem**: [...]
- **Recommendation**: [...]
- **Action**: `{{SKILL:fix}}` | `{{SKILL:refactor}}` | `{{SKILL:build}}` | `{{SKILL:docs}}`
- **Prompt suggestion**: [...]
- **Developer note**: <!-- to be filled in manually by the developer only; always leave empty when generating the report, never fill automatically. Later developer values: free text or "Do not implement: [reason]" (the German form "Nicht umsetzen: [reason]" is also recognized) -->

## Skipped findings (design decisions)

| Finding | Design decision | Source |
|---|---|---|
| [...] | [DD-XXX] | [...] |
```

For an explicitly requested standalone audit, `closed` observations may appear only after the
actionable findings in this non-executable appendix. Omit the appendix everywhere else:

```markdown
## Closed observations

- [Short title] — [closure reason]
```

Appendix entries carry no finding ID, severity/action field, prompt suggestion, or invocation. They
do not count in the actionable summary tables and never produce an `apply` recommendation.

If a finding is later implemented, augment the existing report in its preserved report language
with a matching short status note. English and German field labels and displayed values remain
readable; stable action values and IDs are never translated.
