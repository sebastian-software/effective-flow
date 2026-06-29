## Wisdom Accumulation

Erzeuge zu Beginn eine Session-ID (z. B. via Timestamp `date +%Y%m%d%H%M%S`) und verwende sie konsistent für die Wisdom-Datei `.sf-plugin/.wisdom-accumulation-<SESSION_ID>.tmp.md`. Das verhindert Kollisionen bei parallelen Läufen.

Inhalte:

- verworfene Root-Cause-Hypothesen
- Reproduktionsschritte und Ergebnisse
- entdeckte Abhängigkeiten und Seiteneffekte
- falsche Annahmen

Schreibe nach jeder Phase ein Summary und gib es an spätere Phasen weiter. Lösche die Datei am Ende.
