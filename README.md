# 🏓 Tischtennis Hobbyturnier-Manager

Eine webbasierte Software zur flexiblen Organisation und Durchführung von Tischtennis-Turnieren für **2er-Mannschaften** im **Schweizer System** mit intuitiver Ergebniserfassung, Beamer-Monitoren, Buchholz-Feinwertung und optionaler KO-Endrunde.

---

## ✨ Features im Überblick

### 1. Turniermodus & Regeln
- **2er-Mannschaften:** Jedes Team besteht aus 2 festen Spielern (Position 1 & 2).
- **Vorrunde (Schweizer System):**
  - **4 Einzel pro Begegnung:**
    1. Überkreuz: Team A Pos. 1 vs. Team B Pos. 2
    2. Überkreuz: Team A Pos. 2 vs. Team B Pos. 1
    3. Direkt: Team A Pos. 1 vs. Team B Pos. 1
    4. Direkt: Team A Pos. 2 vs. Team B Pos. 2
  - **Feste Aufstellung:** Spieler 1 und 2 sind fest beim Team hinterlegt – kein zeitaufwändiges Erfassen der Aufstellung vor jedem Spiel.
  - **Wertung:** Direkte Zählung gewonnener Einzelspiele (z. B. 4:0, 3:1, 2:2). Unentschieden möglich.
  - **Tie-Breaker:** 1. Gewonnene Spielpunkte, 2. Buchholz-Wertung (Gegnerstärke), 3. Satzdifferenz, 4. Balldifferenz.
  - **Rematches ausgeschlossen:** Ein Team spielt in der Vorrunde nie zweimal gegen denselben Gegner.
  - **Freilos (BYE):** Automatisches Freilos bei ungerader Teamanzahl mit Punktgutschrift.
  - **Variable Rundenanzahl:** Runden können spontan während des Turniers angepasst oder beendet werden.

### 2. Optionale KO-Endrunde
- **Qualifikation:** Top 4 (Halbfinale) oder Top 8 (Viertelfinale) aus der Schweizer-Tabelle wählbar.
- **Entscheidung:** Vorzeitiges Match-Ende bei 3 Einzelsiegen ("Best of 5 Matches" - 3:0 oder 3:1).
- **Entscheidungsdoppel:** Bei 2:2-Gleichstand nach allen 4 Einzeln wird automatisch das 5. Spiel (Doppel A vs. Doppel B) für die Entscheidung (3:2) freigeschaltet.

### 3. Smarte Ergebniserfassung
- **Authentifizierung ohne Account:** Jede Begegnung kann einfach per 4-stelliger PIN (oder QR-Code) aufgerufen und erfasst werden.
- **Intelligente Schnelleingabe:**
  - Direkte Erfassung der Sätze (z. B. Best of 3 / Best of 5).
  - **Auto-Vervollständigung der Satzpunkte:** Wird eine Zahl `< 10` eingegeben, wird der Gewinner automatisch mit `11` befüllt. Bei Eingaben `>= 10` (z. B. Verlängerung `12`) wird automatisch `Zahl + 2` ergänzt.
  - Manuelle Hallen-Tischverwaltung: Tische werden flexibel vor Ort in der Halle belegt.

### 4. Hallen-Monitor & Großanzeige (Beamer / TV)
- **Split-Screen & Auto-Carousel:**
  - **Live-Begegnungen:** Anzeige aller aktiven und abgeschlossenen Spiele mit Zwischenständen in Echtzeit (WebSocket-gestützt).
  - **Tabelle:** Schweizer Gesamttabelle mit Buchholz-Feinwertung.
  - **Ergebnis-Ticker:** Durchlaufende Anzeige der beendeten Spiele.
  - **KO-Turnierbaum:** Graphische Baumansicht der Endrunde.
  - Konfigurierbarer automatischer Wechsel (z. B. alle 15 Sekunden) oder geteilter Bildschirm.

### 5. Organisation & Backup
- **CSV-Import & Export:** Schneller Import von Teams via CSV sowie vollständiger CSV-Export der Abschlusstabelle.
- **Druckbare Spielzettel:** Standardisierte DIN A4 Spielberichtsbögen für die Begegnungen als Papier-Backup.
- **Paarungstausch:** Die Turnierleitung kann vor Spielbeginn Paarungen manuell anpassen.

---

## 🚀 Schnellstart

### Option A: Lokal starten (macOS / Linux)

Voraussetzungen: Python 3.9+ und Node.js 18+.

```bash
# Repository klonen oder in den Projektordner wechseln
cd tt-hobbyturnier

# Turniermodus: installiert Abhängigkeiten bei Bedarf, baut das Frontend und startet den Server
./run.sh
```

- 🏓 **Turnier:** **[http://localhost:8000](http://localhost:8000)** – das Skript zeigt zusätzlich die Adresse im Netzwerk an, über die Handys, Beamer und Tablet den Server erreichen.

Für die Entwicklung gibt es `./dev.sh`: Backend mit Auto-Reload und Vite mit Live-Reload (HMR) auf **[http://localhost:5173](http://localhost:5173)**. Nicht am Turniertag verwenden – jede gespeicherte Datei startet das Backend neu und trennt alle Live-Verbindungen.

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
- End-to-End API Lifecycle (Teams, Runden, Match-PINs, Hallenmonitore)

---

## 📱 Navigation der Software

- 📊 **Hallen-Monitor (`/`):** Für Beamer / Fernseher in der Halle (mit Vollbildmodus und Live-Ticker).
- 🏓 **Ergebniserfassung:** Für Tablets/Smartphones zur schnellen Satz- und Matcherfassung.
- 📈 **Tabelle:** Vollständige Schweizer Rangliste mit Buchholz-Feinwertung und CSV-Download.
- 🏆 **KO-Baum:** Visualisierung der Halbfinals und Finals mit Siegerweiterleitung.
- ⚙️ **Turnierleitung:** Anlegen von Teams, CSV-Import, Runden-Auslosung, PIN-Übersicht und Einstellungen.
- 🖨️ **Spielzettel:** Druckansicht für Spielberichtsbögen.

**Standard Admin-PIN:** `admin123`. Die Turnierleitung (und damit Runden auslosen, Teams und Einstellungen ändern) ist nur mit der Admin-PIN zugänglich – vor dem Turnier unter „Einstellungen“ unbedingt ändern, sonst kann jeder im Turnier-WLAN sie öffnen. Die Ergebniseingabe bleibt bewusst für alle offen.
