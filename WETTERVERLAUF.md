# Wetterverlauf – Umsetzung und Prüfung

## 1. Bestandsanalyse

- Statische GitHub-Pages-PWA ohne Buildsystem: `index.html`, `styles.css`, `app.js`, `sw.js`.
- GitHub Actions ruft `scripts/collect.py` alle zehn Minuten auf. Weathercloud liefert Stationswerte, Open-Meteo die Prognose, PEGELONLINE den Rheinpegel.
- Historie existiert bereits: `data/YYYY-MM.json` und `data/latest.json`. Bestehende Datensätze bleiben erhalten; keine rückwirkend erfundenen Messwerte.
- Bisher: Zeitstempel mit lokalem Offset, Duplikatvergleich als Zeichenfolge, Ersatzzeit bei fehlendem Stationszeitpunkt. Neue Daten verwenden echte Stationszeit in UTC; Monatsdateien bleiben nach Berliner Kalendermonat partitioniert, damit die vorhandene Tagesnavigation funktioniert.
- Vorhandene SVG-Grafiken, Dark Mode und responsive Karten werden weiterverwendet. Neue Diagramme benötigen keine Bibliothek.
- Platzierung: direkt nach der aktuellen Temperaturkarte samt Messzeitpunkt; alle vorhandenen Karten behalten ihre relative Reihenfolge.
- Die geöffnete Arbeitskopie hatte kein Git-Repository. Lokaler Branch `feature/wetterverlauf` mit vollständigem Ausgangscommit; die separate Kopie `../github-publish` wird nicht verändert. Keine Veröffentlichung.

## Arbeitsschritte

Ausgangssicherung sowie fünf getrennte lokale Commits: Analyse, Speicherung, Diagramme, responsive Prüfung, Abschlussdokumentation. Jeder Schritt ist über Git vergleichbar und reversibel.
