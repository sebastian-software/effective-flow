# 0054: Commit-Typ nach Wirkung wählen (Config/Env-Änderungen als `fix:`/`feat:`)

**Planungsstatus:** Umgesetzt
**Quelle:** /plan
**Empfohlener Workflow:** Bugfix (`/fix`)

## Anforderung

GitHub-Issue [#2](https://github.com/fastner/sf-claude-plugin/issues/2) verlangt eine
zusätzliche Leitplanke im „Commit-Message-Regeln"-Block: Der Commit-Typ soll **nach der
Wirkung** einer Änderung gewählt werden, nicht nach der Dateiart. Verhaltensändernde
Änderungen – auch reine Config-/Env-/Secret-/CI-Änderungen mit Deployment- oder
Laufzeitwirkung – müssen `fix:` (bzw. `feat:` bei neuer Funktionalität) sein, `chore:`
bleibt ausschließlich für deploy-neutrale Änderungen ohne Verhaltenswirkung.

Hintergrund ist ein konkreter Vorfall: Ein verhaltensändernder Prod-Config-Fix ging als
`chore:` ein, woraufhin **release-please keinen Release und keinen Changelog-Eintrag**
erzeugte, obwohl sich das Produktivverhalten geändert hatte. Der Fix musste nachträglich
über einen separaten `fix:`-Commit nachversioniert werden.

Da die Ziel-Projekte generell release-please nutzen (Vorgabe des Users), ist die Regel
konsequent auf release-please- bzw. Conventional-Commit-Semantik auszurichten und muss
ausdrücklich auch für den **Squash-PR-Titel** gelten, der bei Squash-Merge den
release-please-Bump bestimmt.

### Begründung der Workflow-Empfehlung

Die Empfehlung lautet **Bugfix (`/fix`)**: Die bestehende Guidance produziert ein falsches
Ergebnis (verhaltensändernde Änderungen werden als `chore:` committet → verpasster
Release). Die Ergänzung korrigiert diesen Defekt in der Anleitung, ohne neue Funktionalität
einzuführen. Konsistent dazu ist auch der Umsetzungs-Commit selbst nach der neuen Regel ein
`fix:`, weil er das Laufzeitverhalten der Commit-Skills ändert.

## Architekturentscheidungen

- **Single-Source-Edit statt Mehrfachpflege.** Der „Commit-Message-Regeln"-Block ist
  bereits zentralisiert in `skills/_shared/commit-message-rules.md` (siehe Plan
  `0039-shared-workflow-deduplication`). Der Build (`build.mjs`, Funktion `resolveIncludes`)
  inlint diesen Block über die ` ```include\ncommit-message-rules\n``` `-Direktive in
  alle konsumierenden Skills. Die im Issue genannte „in allen Skills identisch nachziehen"-
  Anweisung ist damit überholt: Es wird **nur die eine geteilte Datei** geändert; die
  Propagierung in die 11 konsumierenden Skills erfolgt automatisch beim Build.
- **Kein Editieren der Einzel-Skills.** Weder die fünf im Issue genannten Skills noch die
  weiteren Konsumenten werden direkt angefasst; sie enthalten nur die Include-Direktive.
- **Sprache und Ort.** Die Regel wird auf Deutsch formuliert (die geteilte Datei ist
  deutsch) und als zusätzliche(r) Aufzählungspunkt(e) direkt unter dem bestehenden
  Conventional-Commit-Präfix-Punkt eingefügt, weil sie diesen präzisiert.
- **Keine Änderung der sf-commit-Präfixlegende.** Die inline-Kurzbedeutung der Präfixe in
  `skills/sf-commit/SKILL.md` (Schritt 2 der Vorgehensliste) bleibt unverändert; sie ist nur
  eine knappe Legende und widerspricht der neuen Regel nicht. Bewusst außerhalb des Scopes.

## Betroffene Dateien

| Datei                                    | Beschreibung                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `skills/_shared/commit-message-rules.md` | Neue(r) Aufzählungspunkt(e) mit der Wirkungs-Regel ergänzen (einzige inhaltliche Änderung) |

Nicht editiert, aber durch den Build automatisch aktualisiert (nur zur Nachvollziehbarkeit,
keine manuelle Änderung nötig): die 11 Skills mit `include commit-message-rules` –
`sf-commit`, `sf-build`, `sf-fix`, `sf-refactor`, `sf-docs`, `sf-maintain`, `sf-pr`,
`sf-apply-review`, `sf-nodejs-implementer`, `sf-ui-implementer`, `sf-rust-implementer`.

## Implementierungsdetails

### Vorgehen

1. In `skills/_shared/commit-message-rules.md` direkt nach dem bestehenden Punkt
   „Nutze Conventional-Commit-Präfixe: …" die neue Wirkungs-Regel als Aufzählungspunkt
   ergänzen. Inhaltlich abzudecken sind:
   - Commit-Typ nach **Wirkung**, nicht nach Dateiart wählen.
   - Verhaltensändernde Änderungen – auch reine **Config/Env/Secrets/CI** mit Deployment-
     oder Laufzeitwirkung (z. B. korrigierte Werte in Env-/Secret-Artefakten, die per Sync
     remote wirken) – sind `fix:`, bei neuer Funktionalität `feat:`.
   - `chore:` nur für **deploy-neutrale** Änderungen ohne Verhaltenswirkung (reine Wartung,
     Formatting, Tooling ohne Laufzeitwirkung).
   - Gilt ebenso für den **Squash-PR-Titel**, der bei Squash-Merge den release-please-Bump
     bestimmt.
2. Deutsche Typografie prüfen: Umlaute/ß, „…"-Anführungszeichen, Halbgeviertstrich (–);
   Code-Spans wie `fix:`, `feat:`, `chore:` als Inline-Code belassen.
3. `node build.mjs` ausführen, damit die Direktive fehlerfrei aufgelöst und der neue Text in
   die Build-Ausgaben unter `dist/` inlined wird. `dist/` ist gitignored, wird also nicht
   committet; der Lauf dient der Verifikation der Include-Auflösung.
4. `pnpm run agent:check` bzw. `oxfmt --check` auf die geänderte Markdown-Datei anwenden.

Als Zielformulierung (minimales Text-Fragment, kein Code) eignet sich ein Punkt in der Art:

> - Wähle den Commit-Typ nach der **Wirkung**, nicht nach der Dateiart: verhaltensändernde
>   Änderungen – auch reine **Config/Env/Secrets/CI** mit Deployment- oder Laufzeitwirkung
>   (z. B. korrigierte Werte in Env-/Secret-Artefakten, die per Sync remote wirken) – sind
>   `fix:` (bzw. `feat:` bei neuer Funktionalität). `chore:` nur für **deploy-neutrale**
>   Änderungen ohne Verhaltenswirkung. Das gilt auch für den **Squash-PR-Titel**, der bei
>   Squash-Merge den release-please-Bump bestimmt.

Die exakte Endformulierung liegt beim umsetzenden Workflow; Inhalt und Präzision müssen den
vier Teilpunkten aus Schritt 1 entsprechen.

### Edge Cases

- **Include-Auflösung darf nicht brechen.** `resolveIncludes` liest die Datei roh ein und
  trimmt nur trailing Newlines; eingebettete Code-Fences oder mehrzeilige Blockzitate im
  geteilten File könnten die umgebende Markdown-Struktur der Ziel-Skills stören. Deshalb die
  Regel als schlichten Aufzählungspunkt (ggf. mit Inline-Code), **ohne** eigene Code-Fence
  im geteilten File formulieren.
- **Konsistenz mit `no-coauthor`-Regel.** Die neue Regel darf die bestehenden Punkte (kein
  `Co-Authored-By`, keine internen Tracking-IDs) nicht verdrängen; nur ergänzen.

## Akzeptanzkriterien

- [x] `skills/_shared/commit-message-rules.md` enthält einen neuen Aufzählungspunkt, der alle
      vier Teilaspekte abdeckt: (a) Typ nach Wirkung statt Dateiart, (b) verhaltensändernde
      Config/Env/Secrets/CI → `fix:` bzw. `feat:`, (c) `chore:` nur deploy-neutral,
      (d) Geltung für den Squash-PR-Titel als release-please-Bump-Treiber.
- [x] `node build.mjs` läuft fehlerfrei durch (Exit 0) und der neue Regeltext erscheint in
      den generierten Ausgaben aller 11 konsumierenden Skills unter `dist/`
      (prüfbar via Grep auf einen markanten Teilstring, z. B. „nach der **Wirkung**").
- [x] Die bestehenden Punkte des Blocks (Co-Authored-By-Verbot, Präfixliste, Tracking-ID-
      Verbot) bleiben unverändert erhalten.
- [x] Deutsche Typografie ist korrekt (Umlaute/ß, „…", –) und `oxfmt --check` meldet keine
      Formatabweichung für die geänderte Datei.

## Validierungsplan

- Build-Lauf `node build.mjs` → Exit 0, keine „Include file not found"-Fehler.
- Grep auf einen Ausschnitt des neuen Regeltexts in `dist/claude/**/commands/*.md` und
  `dist/codex/skills/*/SKILL.md`: Treffer in allen 11 Konsumenten bestätigt die Propagierung.
- `oxfmt --check` auf `skills/_shared/commit-message-rules.md`.
- Manuelle Sichtprüfung der Formulierung gegen Issue #2 (Wirkung vs. Dateiart, `fix:`/`feat:`
  vs. `chore:`, Squash-PR-Titel/release-please) und der deutschen Typografie.

## Annahmen und offene Punkte

- **Annahme:** „Alles auf release-please ausrichten" bezieht sich auf die **Wortwahl der
  Regel** (release-please-/Conventional-Commit-Semantik, Squash-PR-Titel), nicht auf die
  Einführung von release-please in diesem Plugin-Repo selbst. Das Repo hat aktuell keine
  release-please-Konfiguration; eine solche Adoption wäre ein separater, größerer Scope
  außerhalb von Issue #2 und ist hier bewusst nicht enthalten.
- **Annahme:** Es genügt, die geteilte Datei zu ändern; die 11 Konsumenten werden nicht
  manuell editiert, da der Build sie inlint. Verifiziert über `build.mjs`/`resolveIncludes`.
- **Bewusst außerhalb Scope:** Die inline-Präfixlegende in `skills/sf-commit/SKILL.md`
  (Schritt 2) wird nicht angepasst; sie bleibt eine knappe Kurzbedeutung.
- **Offen (unkritisch):** Ob die Regel zusätzlich einen expliziten `test:`-Hinweis für
  verhaltensrelevante Testinfrastruktur erhalten soll. Nicht Teil des Issues; im Zweifel
  weglassen, um den Scope eng zu halten.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       0 |       1 |
| Security    |        0 |       0 |       0 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       0 |       1 |
| Testbarkeit |        0 |       0 |       0 |
| Scope       |        0 |       0 |       1 |
| Wartbarkeit |        0 |       0 |       0 |

### Befunde

- Architektur (Hinweis): Verifizierter Kontext – der Block ist zentral in
  `skills/_shared/commit-message-rules.md` und wird von 11 Skills per `include` konsumiert;
  `build.mjs`/`resolveIncludes` inlint ihn. Der veraltete „überall nachziehen"-Teil des
  Issues wird dadurch obsolet und ist im Plan aufgelöst.
- Fehlerfälle (Hinweis): Include-Auflösung ist textbasiert; die Regel bewusst ohne eigene
  Code-Fence im geteilten File formulieren, um die Markdown-Struktur der Ziel-Skills nicht zu
  stören. Im Plan unter „Edge Cases" adressiert.
- Scope (Hinweis): Repo-eigene release-please-Adoption und Anpassung der sf-commit-
  Präfixlegende sind bewusst ausgeschlossen und als Annahmen dokumentiert, um Scope Creep zu
  vermeiden.
