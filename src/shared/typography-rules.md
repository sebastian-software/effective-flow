## Locale typography

Map `de` to `de-DE` and `en` to `en-US`. Locale-specific typography of visible prose — quotation
marks, dashes, umlauts and ß, non-breaking spaces, number and date formats — is owned by the
central `effective-writing` skill, which carries locale typography alongside its prose craft. Its
locale guidance is authoritative; Effective Flow keeps no second typography checklist.

If the skill is unavailable (not installed, `skills.enabled: false`, or disabled via `exclude`),
use only this minimal fallback for German prose: real umlauts and ß rather than ASCII
transliterations, German quotation marks „…“, and a spaced en dash – for parenthetical dashes.
Do not alter code, identifiers, commands, paths, or machine-readable values for typography.

This rule is locale-shaped rather than resolution-shaped: it applies to whichever `de`/`en` value a
run holds, no matter who resolved it. An orchestrated agent is handed concrete values instead of
resolving them, so it carries this fragment eagerly and never reaches the rule through the
resolver.
