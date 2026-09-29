# 🏓 Tischtennis Hobbyturnier-Manager

Eine webbasierte Software zur flexiblen Organisation und Durchführung von Tischtennis-Turnieren für **2er-Mannschaften** im **Schweizer System** mit Live-Ergebniserfassung, Beamer-Monitoren, Buchholz-Feinwertung und optionaler KO-Endrunde.

---

## ✨ Features im Überblick

### 1. Turniermodus & Regeln
- **2er-Mannschaften:** Jedes Team besteht aus 2 Spielern.
- **Vorrunde (Schweizer System):**
  - **4 Einzel pro Begegnung:**
    1. Überkreuz: Team A Pos. 1 vs. Team B Pos. 2
    2. Überkreuz: Team A Pos. 2 vs. Team B Pos. 1
    3. Direkt: Team A Pos. 1 vs. Team B Pos. 1
    4. Direkt: Team A Pos. 2 vs. Team B Pos. 2
  - **Aufstellung (Position 1 & 2):** Vor jedem Spiel wählbar (direkt am Schiedsrichter-Tablet oder per Turnierleitung).
  - **Wertung:** Direkte Zählung gewonnener Einzelspiele (z. B. 4:0, 3:1, 2:2). Unentschieden möglich.
  - **Tie-Breaker:** 1. Gewonnene Spielpunkte, 2. Buchholz-Wertung (Gegnerstärke), 3. Satzdifferenz, 4. Balldifferenz.
  - **Rematches ausgeschlossen:** Ein Team spielt in der Vorrunde nie zweimal gegen denselben Gegner.
  - **Freilos (BYE):** Automatisches Freilos bei ungerader Teamanzahl mit Punktgutschrift.
  - **Variable Rundenanzahl:** Runden können spontan während des Turniers angepasst oder beendet werden.

### 2. Optionale KO-Endrunde
- **Qualifikation:** Top 4 (Halbfinale) oder Top 8 (Viertelfinale) aus der Schweizer-Tabelle wählbar.
- **Entscheidung:** Vorzeitiges Match-Ende bei 3 Einzelsiegen ("Best of 5 Matches" - 3:0 oder 3:1).
- **Entscheidungsdoppel:** Bei 2:2-Gleichstand nach allen 4 Einzeln wird automatisch das 5. Spiel (Doppel A vs. Doppel B) für die Entscheidung (3:2) freigeschaltet.

### 3. Tisch-Zählgerät & Ergebniserfassung
- **Authentifizierung ohne Account:** Jede Begegnung und jeder Tisch hat eine einfache 4-stellige PIN (bzw. QR-Code).
- **Dualer Erfassungsmodus:**
  - **Live-Zählgerät:** Große Touch-Flächen für +1/-1 am Smartphone/Tablet, Anzeige von Aufschlagwechseln (alle 2 Punkte bzw. ab 10:10 nach jedem Punkt), Erkennung von Satzbällen und Satzgewinn (bis 11 mit 2 Differenz).
  - **Schnell-Erfassung:** Direkteingabe aller Sätze (z. B. 11:9, 7:11, ...) mit 1-Klick-Übernahme.

### 4. Hallen-Monitor & Großanzeige (Beamer / TV)
- **Split-Screen & Auto-Carousel:**
  - **Live-Tische:** Anzeige aller aktiven Spiele mit Punkteständen in Echtzeit (WebSocket-gestützt).
  - **Tabelle:** Schweizer Gesamttabelle mit Buchholz-Feinwertung.
  - **Ergebnis-Ticker:** Durchlaufende Anzeige der letzten beendeten Spiele.
  - **KO-Turnierbaum:** Graphische Baumansicht der Endrunde.
  - Konfigurierbarer automatischer Wechsel (z. B. alle 15 Sekunden) oder geteilter Bildschirm.

### 5. Organisation & Backup
- **CSV-Import & Export:** Schneller Import von Teams via CSV sowie vollständiger CSV-Export der Abschlusstabelle.
- **Druckbare Spielzettel:** Standardisierte DIN A4 Spielberichtsbögen für die Tische als Papier-Backup.
- **Paarungstausch:** Die Turnierleitung kann vor Spielbeginn Paarungen und Tische manuell tauschen.

---

## 🚀 Schnellstart

### Option A: Lokal starten (macOS / Linux)

Voraussetzungen: Python 3.9+ und Node.js 18+.

```bash
# Repository klonen oder in den Projektordner wechseln
cd tt-hobbyturnier

# Start-Skript ausführen (installiert Abhängigkeiten automatisch und startet den Server)
./run.sh
```

Öffne anschließend im Browser: **[http://localhost:8000](http://localhost:8000)**

---

### Option B: Mit Docker / Docker-Compose

```bash
docker compose up --build -d
```

Der Server ist danach auf Port 8000 verfügbar. Die Spieldaten werden persistent im Ordner `./data/turnier.db` gesichert.

---

## 🧪 Tests ausführen

Das Backend verfügt über eine vollständige automatisierte Testsuite:

```bash
PYTHONPATH=. backend/venv/bin/pytest backend/tests/ -v
```

Getestet werden:
- Schweizer-System-Paarungen und strikter Ausschluss von Rematches
- Buchholz-Zahlenberechnung & Tie-Breaker
- Freilos-Logik (BYE) bei ungerader Mannschaftszahl
- KO-Endrunden-Fortschritt & Entscheidungsdoppel bei 2:2
- End-to-End API Lifecycle (Teams, Runden, Live-Scores, Tisch-PINs, Hallenmonitore)

---

## 📱 Navigation der Software

- 📊 **Hallen-Monitor (`/`):** Für Beamer / Fernseher in der Halle (mit Vollbildmodus und Live-Ticker).
- 🏓 **Tisch-Zähler:** Für Tablets/Smartphones der Schiedsrichter und Spieler an den Tischen.
- 📈 **Tabelle:** Vollständige Schweizer Rangliste mit Buchholz-Feinwertung und CSV-Download.
- 🏆 **KO-Baum:** Visualisierung der Halbfinals und Finals mit Siegerweiterleitung.
- ⚙️ **Turnierleitung:** Anlegen von Teams, CSV-Import, Runden-Auslosung, Tisch-PIN-Übersicht und Einstellungen.
- 🖨️ **Spielzettel:** Druckansicht für Spielberichtsbögen.

**Standard Admin-PIN:** `admin123` (kann in den Einstellungen beliebig geändert werden).
