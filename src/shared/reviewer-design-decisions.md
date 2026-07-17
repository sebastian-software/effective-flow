## Designentscheidungen respektieren

Wenn der Auftrag ausdrücklich verlangt, Designentscheidungen nicht zu prüfen, hat diese Auftragsregel Vorrang. In diesem Modus suchst du keine Designentscheidungen, filterst keine Findings über Designentscheidungen heraus und rechnest Designentscheidungen nicht in die Konfidenz ein.

Wenn dokumentierte Designentscheidungen übergeben oder im Code gefunden werden:

1. direkter Match -> Konfidenz 0 und mit Designentscheidung markieren
2. indirekter Match -> normales Finding mit Hinweis
3. kein Match -> normales Finding
