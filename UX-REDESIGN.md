# Mobile UX – Umbau und Ideensicherung

## Sicherer Ausgangspunkt

Git-Tag: `restore/2026-11-25-before-ux-redesign`, Ausgangscommit `51d7574`.
Der Tag sichert den vollständigen bisherigen Code einschließlich Layout,
SVG-Grafiken, Bedienlogik, Datenarchiv, Sammler, Tests und PWA.
Arbeitsbranch: `feature/mobile-ux-redesign`.

Zum verlustfreien Nachsehen: `git show restore/2026-11-25-before-ux-redesign:index.html`.
Eine separate Wiederherstellungskopie lässt sich mit
`git worktree add ../weather-before-ux restore/2026-11-25-before-ux-redesign`
anlegen. Ein Rückbau der Live-App soll nur den App-Code zurücknehmen und neue
Messdaten im Verzeichnis `data/` erhalten; keinen pauschalen Reset verwenden.

## Erhaltene Funktionen und Ideen

- BRESSER-Temperaturtacho mit fester Celsius-Farbskala, gemessener und gefühlter Temperatur.
- Tagesarchiv, Datumsnavigation, Stunden 0 bis 24 und zweiter Tacho.
- Temperatur- und Niederschlagsverlauf, 24 Stunden / 168 Stunden, UTC-Rohdaten und Berliner Zeitzone.
- Orange Temperaturlinie, temperaturabhängige blau/grün/rote Fläche, gestrichelte gefühlte Temperatur.
- Rohe Minima/Maxima, Stundenmittel, Regen-Stunden-/Tagesmengen und erfasste Teilsummen.
- Aktuelle Regenintensität, Tages-/Wochen-/Monatssummen und Vorjahresvergleich.
- Windkompass, Windsack-Skala, dezente Kompassanimation bei Sichtbarkeit.
- Fünf Mondphasenbilder, Beleuchtungsanteil, nächster Vollmond, lokale Astronomie.
- Rheinpegel Wesel mit Zustandsbildern, Quelle, Messzeit und Stundenvergleich.
- Dreitägige Open-Meteo-Prognose und Trendzusammenfassung.
- Manuelle/automatische Aktualisierung, dunkle Darstellung, reduzierte Bewegung und PWA.
- Sammler, echte Messwerte, Duplikatvermeidung, Zählerrücksetzungen und Datenlücken bleiben erhalten.

Die bisherige Zwei-Sekunden-Haltegeste und alle dauerhaft aufgeklappten Karten
bleiben im Wiederherstellungstag erhalten. Die neue Oberfläche ersetzt die
Haltegeste durch einen direkt bedienbaren Regler und bündelt Zusatzdetails.

## Angenommene UX-Ziele

1. „Jetzt“ und „Archiv“ getrennt; Archivbedienung ändert keine aktuellen Wetterwerte.
2. Reihenfolge: Jetzt, Verlauf, Vorhersage, Wetterdetails; Mond und Pegel zusätzlich erreichbar.
3. Direkter nativer Stundenregler, Tastatur und zusätzliche Stunden-Schritte.
4. Gemeinsamer Zeitmarker in beiden Diagrammen, bleibende Messwertauswahl und vertikales Scrollen.
5. Null, unbekannt, unvollständig und veraltet ausdrücklich unterscheiden; Monat ≠ Diagrammzeitraum.
6. Einheitliche Typografie und Kontraste, Farbinformation zusätzlich mit Zahlen und Linienformen.
7. Große Touchflächen, sichere Bildschirmränder, Systemschriftvergrößerung und Dark Mode.
8. Ruhige Aktualisierung, sichtbare Datenfrische, Offline-Letztstand und verständliches PWA-Update.

## Umsetzung und Prüfung

Umgesetzt als App-Version 35:

- Zwei getrennte Ansichten mit dauerhaft erreichbarem Umschalter; alle heutigen Werte bleiben vom Archivdatum unabhängig.
- Kompakter Stationskopf, Temperaturtacho und Regen-/Wind-Schnellwerte; danach die gemeinsamen Diagramme und drei Tageskarten.
- Monatsmenge heißt „Monat bisher“, Diagramme zeigen weiterhin nur ihre 24-/168-Stunden-Mengen. Archiv-Niederschlag hat eigene Felder und Vorjahresvergleich.
- Nativer Regler ohne Halteverzögerung, zusätzliche Stunden-Schritte, native Datumsauswahl, Tastatur und sichtbare Fokuszustände.
- Gemeinsame Marker und Messwertauswahl in beiden Diagrammen. Auswahl bleibt beim Loslassen und Neuzeichnen stehen. Vertikale Touchbewegungen bleiben Scrollgesten.
- Vorhersage mit Tagesdatum, Tiefst-/Höchstwert, Regenmenge und Wahrscheinlichkeit; die bisherige Temperaturtrend- und Böenaussage bleibt erhalten. Prognosen und Pegel sind weiterhin eigenständig gekennzeichnete Quellen.
- Einheitliches Dezimalkomma, ruhige Karten, größere Beschriftungen und erweiterbare statt dauerhaft langer Erklärungstexte.
- Systemschriftvergrößerung auch in den Diagrammen: `rem`-Schriften und entsprechender Achsenrand. Dark Mode, sichere Bildschirmränder und reduzierte Bewegung werden berücksichtigt.
- Wichtige Bedienelemente ab 48 CSS-Pixeln; mobile Datumsauswahl in zwei übersichtlichen Zeilen.
- Datenfrische als relative Zeit, ab 30 Minuten ausdrücklich ältere Messung. Abruffehler verwerfen weder vorhandene Stationswerte noch bereits geladene Vorhersagen.
- Service Worker speichert tatsächliche Stations-JSON-Dateien nach erfolgreichem Abruf. Ein Offline-Abruf kennzeichnet den zurückgelieferten Letztstand mit `X-Bresser-Offline`, den die Oberfläche als „Offline“ anzeigt. Unbekannte Daten werden nicht zu Null.
- Neue App-Version wird über einen Update-Hinweis angeboten. Erst „Jetzt aktualisieren“ aktiviert den wartenden Worker und lädt einmal neu. Daten-Cache bleibt bei App-Updates erhalten.
- Apple-Touch-Icon und 192-/512-Pixel-PWA-Icons übernehmen das vorhandene Sonne-/Wolkenmotiv. SVG-Original und Wettergrafiken bleiben erhalten.

### Tatsächlich geprüfte Punkte

`node scripts/test-ui.cjs`: bestanden. Enthält bisherige Temperatur-, Wind-, Mond-, Pegel-, Datums- und Aktualisierungsprüfungen sowie neue Prüfungen für sofortige Stundenwahl, getrennte Ansichten, unabhängigen aktuellen Niederschlag/Wind, gemeinsame Marker, erhaltene Auswahl, vertikale Gesten, Datenfrische und genau einmaligen Update-Neustart.

`node scripts/test-history.cjs`: bestanden. Originale Rechenregeln einschließlich UTC/Berlin, Zeitumstellungen, Min/Max, Regenzähler, Farbskala, Datenlücken und Zeitgrenzen bleiben geprüft.

`node scripts/test-pwa.cjs`: bestanden. Prüft vorhandene Cache-Dateien, bewusste Aktivierung, erhaltene Daten-Caches, zuerst Netzwerk, tatsächlichen Offline-Letztstand und Fehler statt künstlicher Null bei fehlendem Cache.

`node scripts/test-structure.cjs`: bestanden. Prüft eindeutige IDs, Ansichtsstruktur, Reihenfolge, App-Icon-Größen sowie Textkontraste aus den tatsächlich verwendeten hellen/dunklen Farbwerten.

`python -m unittest discover -s scripts -p 'test_*.py'`: neun Sammler-/Archivtests bestanden. Sammler und Datenformat wurden beim UX-Umbau nicht verändert.

Zusätzlich: JavaScript-Syntax, korrekt verschachteltes HTML und `git diff --check` geprüft. Der Regler-Benchmark bleibt ohne neue Datumsformatierer im Bedienvorgang.

### Sichtprüfung: konkrete Grenze

`scripts/test-browser.html` ist für 320, 360, 390, 412, 768 und 1440 CSS-Pixel, hell/dunkel und 200 % Schriftgröße vorbereitet. Die Seite prüft beide Ansichten, Datum/Regler, gemeinsame Marker, Kartenbreiten, drei Prognosekarten, vergrößerte Schrift und horizontalen Überlauf. Stationswerte kommen aus dem echten Archiv; Prognose und Pegel sind klar gekennzeichnete isolierte UI-Testwerte. Es werden keine Testwerte in `data/` geschrieben.

Diese neue Browsermatrix konnte hier **nicht ausgeführt** werden: Computer Use stoppte beim Öffnen des Edge-Fensters, weil es die aktuelle Browser-URL nicht sicher bestimmen konnte. Es gab deshalb keine visuelle Abnahme dieses Redesigns. Die alten erfolgreichen Browserprüfungen der vorherigen Version gelten nicht als Prüfung des neuen Layouts. Echte iPhone-/Galaxy-S23-Bedienung, Safari, große Systemschrift und Installation/Updates der PWA bleiben manuell zu prüfen.

Lokale Vorschau: `node scripts/serve-qa.cjs`; App unter `http://127.0.0.1:8765/`, Prüfgallerie unter `http://127.0.0.1:8765/scripts/test-browser.html`.

### Dateien

Geändert: `index.html`, `app.js`, `history.js`, `sw.js`, `manifest.webmanifest`, `.github/workflows/weather-update.yml`, `scripts/test-ui.cjs`, `scripts/test-history.cjs`, `scripts/test-browser.html`, `README.md`, `WETTERVERLAUF.md`.

Neu: `mobile.css`, `assets/apple-touch-icon.png`, `assets/icon-192.png`, `assets/icon-512.png`, `scripts/test-pwa.cjs`, `scripts/test-structure.cjs`, diese Dokumentation.

Der ursprüngliche Stil bleibt in `styles.css` als Grundlage für die erhaltenen SVG-Grafiken. `mobile.css` enthält die neue Oberfläche und überschreibt gezielt die Darstellung. Keine neuen Frontend-Abhängigkeiten, Schrift-CDNs oder externen Bildanfragen. Der Pages-Artefakt-Schritt nimmt die neue CSS-Datei und alle App-Icons mit.

Die acht vorgeschlagenen Verbesserungen sind umgesetzt; der noch offene Prüfauftrag ist die visuelle Geräteabnahme. Weder alte Ideen noch frühere Messwerte wurden dafür gelöscht.
