# Glossar

Kurze Erklärungen der wiederkehrenden Fachbegriffe rund um Effective Flow, alphabetisch sortiert.
Englische Begriffe (Tool, Agent, Worktree, Pull-Request) werden bewusst nicht übersetzt –
das entspricht dem Sprachgebrauch der Effective Flow-Doku und der Tools selbst.

## Agent

Ein Spezialist, den ein Tool **intern** als Subagent aufruft – etwa ein Implementer, ein
Reviewer, ein Validator oder ein Doku-Schreiber. Agents sind selbst **keine** `/effective-flow`-Tools
und werden nie direkt aufgerufen; du bekommst sie höchstens in Zwischenmeldungen eines Tools
zu sehen (z. B. „delegiert an den UI-Implementer“).

## Delivery / Liefer-Branch

Delivery bezeichnet das Einbringen fertiger Änderungen in deinen Zielbranch. Sie ist immer
dann aktiv, wenn in einem [Worktree](#worktree) oder auf einem eigenen **Liefer-Branch**
gearbeitet wird – einen separaten Ein-/Aus-Schalter dafür gibt es nicht. Der Liefer-Branch
folgt dem Muster `<branchPrefix>/<skill>/<slug>` (z. B. `effective-flow/build/user-login`) und endet
je nach `delivery.completion` als Merge, Pull-Request oder als bloß liegen gelassener Branch.
Details in [Worktree und Delivery](./worktree-und-delivery.md).

## Finding

Ein einzelner, konkret verortbarer Befund aus [`/effective-flow review`](./tools-qualitaet.md) – z. B.
ein Bug, eine fehlende Fehlerbehandlung oder eine Sicherheitslücke – mit Schweregrad
(kritisch/wichtig/Hinweis), betroffener Datei, Problem- und Empfehlungstext sowie einer
vorgeschlagenen Ziel-Aktion (`effective-flow-fix`, `effective-flow-refactor`, `effective-flow-build`, `effective-flow-docs`).
Findings landen je nach `tracker.mode` entweder in einem lokalen Markdown-Report oder als
Issue auf einem Remote-Tracker (siehe [Remote-Tracker](./remote-tracker.md)) und werden von
[`/effective-flow apply`](./tools-umsetzen.md) abgearbeitet.

## Goal-Steuerung

Ein einheitliches Muster, mit dem interaktive Effective Flow-Tools an einer Freigabe-Grenze anbieten,
die verbleibenden Phasen **autonom** statt schrittweise gated laufen zu lassen – über das
native `/goal` deines Harnesses. Effective Flow formuliert dafür eine messbare, aus den
Akzeptanzkriterien abgeleitete Abschlussbedingung, gibt einen fertigen, einfügbaren
`/goal`-String aus und verifiziert die Bedingung anschließend über unabhängige Instanzen
(z. B. einen Validator oder Reviewer) statt per Selbsteinschätzung. Ohne dein ausdrückliches
Einfügen des `/goal`-Strings läuft das Tool ganz normal gated weiter.

## Harness

Die Umgebung, in der Effective Flow als Skill läuft – aktuell Claude Code und Codex. Effective Flow wird aus
einem gemeinsamen Quelltree für beide Harnesses gebaut; als Nutzer merkst du davon meist
nichts, außer beim genauen Aufrufsyntax (`/effective-flow <tool>` auf Claude Code, `$effective-flow <tool>` auf
Codex).

## Klärungs-Gate

Die Prüfung, ob eine Grundlage – Plan-Datei, Issue oder Review-[Finding](#finding) –
**vollständig geklärt** und ohne weitere Rückfrage umsetzbar ist, bevor ein umsetzendes Tool
tatsächlich mit der Arbeit beginnt. Besteht die Grundlage das Gate nicht (z. B. wegen offener
Punkte oder fehlender messbarer Akzeptanzkriterien), verweist Effective Flow zurück auf die Klärung
statt zu raten oder teilweise umzusetzen. Siehe
[Troubleshooting](./troubleshooting.md#das-klärungs-gate-wurde-nicht-bestanden).

## Plan(-Datei)

Eine von [`/effective-flow plan`](./tools-verstehen.md) erzeugte Markdown-Datei unter `<plan.dir>`
(Default `docs/plan`), die eine Anforderung analysiert, offene Fragen klärt, Architektur- und
Implementierungsentscheidungen festhält und den passenden nachfolgenden Workflow empfiehlt
(`build`, `fix`, `refactor` oder `docs`). Der Dateiname folgt dem Muster
`YYYY-MM-DD-<slug>.md`; nach der Umsetzung wird die Datei als umgesetzt markiert und nach
`<plan.dir>/archive/` verschoben.

## Skill-Discovery

Der Mechanismus, mit dem Effective Flow-Tools und -Agents zur Laufzeit verfügbare Host-Skills (z. B.
`humanizer`, `impeccable`, `context7`) sichten und die für die konkrete Aufgabe passenden
zusätzlich einbinden – gesteuert über den `skills`-Block in `.effective-flow/config.json`, global
sowie pro Agent und Tool. Details in [Skill-Discovery](./skill-discovery.md).

## Tool

Ein über `/effective-flow <tool>` aufgerufener Workflow, z. B. `plan`, `build`, `review` oder `pr`.
Jedes Tool deckt eine klar umrissene Absicht ab (Verstehen, Umsetzen, Qualität, Einbringen,
Einrichten); die vollständige Tool-Referenz steht in den fünf Guides unter
[Tools verstehen](./tools-verstehen.md), [Tools umsetzen](./tools-umsetzen.md),
[Tools Qualität](./tools-qualitaet.md), [Tools einbringen](./tools-einbringen.md) und
[Tools einrichten](./tools-einrichten.md).

## Worktree

Ein separater Git-Arbeitsbereich (`git worktree`) mit eigenem Checkout und eigenem Branch,
in dem Effective Flow standardmäßig (`worktree.enabled: true`) die eigentliche Umsetzung ausführt –
unabhängig von deinem aktuellen Checkout. Nicht zu verwechseln mit dem
findingsinternen Isolations-Mechanismus von `applyReview.worktree.*`, der parallele
Review-Findings isoliert statt einen Liefer-Branch zu erzeugen. Details in
[Worktree und Delivery](./worktree-und-delivery.md).
