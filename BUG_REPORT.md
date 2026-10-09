# Bug-Report: Iron Horizon

## Kritische Bugs

### 1. ❌ Kamera-Steuerung invertiert (W/S)
**Problem**: W und S bewegen die Kamera in die falsche Richtung
- W bewegt Kamera nach links-unten statt nach oben
- S bewegt Kamera nach rechts-oben statt nach unten

**Ursache**: Isometrische Koordinaten-Umrechnung falsch
```typescript
// FALSCH (aktuell):
if (keysRef.current.has('w')) {
  state.camera.x -= camSpeed * dt * 0.5;  // Sollte + sein
  state.camera.y -= camSpeed * dt * 0.5;  // Sollte - sein
}
```

**Lösung**: Kamera-Bewegung korrigieren

---

### 2. ❌ Einheiten bewegen sich durch Hindernisse beim Angreifen
**Problem**: Wenn eine Einheit ein Ziel angreift und sich darauf zubewegt (Zeile 566-567 in engine.ts), gibt es keine Kollisionsprüfung
- Einheiten können durch Wände, Felsen und Gebäude laufen
- Keine Wegfindung beim Angriffs-Ansatz

**Ursache**: Direkte Bewegung ohne Pfadprüfung
```typescript
if (d > unit.stats.range) {
  // Move towards target - KEINE KOLLISIONSPRÜFUNG!
  unit.x += (tx - unit.x) / d * speed;
  unit.y += (ty - unit.y) / d * speed;
}
```

**Lösung**: Wegfindung verwenden oder zumindest Kollisionsprüfung

---

### 3. ⚠️ Performance-Problem: forceUpdate jeden Frame
**Problem**: `forceUpdate(v => v + 1)` wird in jedem Frame aufgerufen (Zeile 144)
- Zwingt React zu komplettem Re-Render 60x pro Sekunde
- Massive Performance-Verschlechterung
- Unnötig, da Canvas direkt gerendert wird

**Lösung**: forceUpdate nur bei UI-Änderungen aufrufen (alle 100ms oder bei Events)

---

### 4. ⚠️ Einheiten können sich gegenseitig blockieren
**Problem**: Separation-Force ist zu schwach (0.3 in Zeile 662)
- Einheiten überlappen sich
- Bilden Klumpen statt Formationen

**Lösung**: Separation-Kraft erhöhen und intelligenter machen

---

### 5. ⚠️ KI baut keine Power Plants wenn Energie negativ
**Problem**: KI prüft nicht ob Energie negativ ist und baut trotzdem weitere Gebäude
- Kann zu Deadlock führen: Gebäude brauchen Energie, aber keine Power Plants

**Lösung**: Energie-Check vor Gebäude-Bau

---

### 6. ⚠️ Ressourcen werden unendlich gesammelt
**Problem**: Harvester können Ressourcen sammeln auch wenn resourceAmount <= 0
- Check fehlt in harvesting-Logik

**Lösung**: Prüfen ob resourceAmount > 0 vor dem Sammeln

---

### 7. ⚠️ Gebäude können auf Ressourcen gebaut werden
**Problem**: canPlaceBuilding prüft nicht ob Tiles Ressourcen enthalten
- Spieler kann wichtige Ressourcen überbauen

**Lösung**: Ressourcen-Check in canPlaceBuilding hinzufügen

---

### 8. ⚠️ Auswahl-Box funktioniert nicht korrekt bei Zoom
**Problem**: Selection-Box wird in Weltkoordinaten berechnet, aber nicht korrekt skaliert
- Bei unterschiedlichem Zoom werden falsche Einheiten ausgewählt

**Lösung**: Zoom-Faktor in Selection-Box-Berechnung einbeziehen

---

### 9. ⚠️ Minimap-Klick positioniert Kamera falsch
**Problem**: Minimap zeigt Kamera-Position nicht korrekt an
- Klick auf Minimap zentriert Kamera nicht auf geklickte Position

**Lösung**: Kamera-Berechnung korrigieren

---

### 10. ⚠️ Keine Fehlerbehandlung bei Save/Load
**Problem**: loadGame gibt null zurück bei Fehler, aber keine Fehlermeldung
- Spieler weiß nicht warum Laden fehlschlägt

**Lösung**: Fehlermeldung anzeigen

---

## Mittlere Bugs

### 11. Wegfindung findet keinen Pfad zu nicht-begehbaren Tiles
**Problem**: Wenn Ziel auf Felsen/Wasser ist, findet findPath null
- Einheit bleibt stehen statt zum nächstgelegenen begehbaren Tile zu laufen

**Lösung**: In findPath bereits implementiert, aber nicht getestet

---

### 12. Projektile verschwinden sofort wenn Ziel zerstört wird
**Problem**: Wenn Ziel während Projektil-Flug zerstört wird, verschwindet Projektil
- Sollte trotzdem zum letzten bekannten Zielort fliegen

**Lösung**: Projektil zu Position fliegen lassen auch wenn Ziel weg

---

### 13. Keine Begrenzung für Produktions-Warteschlange
**Problem**: Spieler kann unendlich viele Einheiten in Warteschlange stellen
- Kann zu Endlosschleifen führen

**Lösung**: Max 5-10 Einheiten pro Fabrik

---

### 14. Forschung kann unterbrochen werden ohne Rückerstattung
**Problem**: Wenn Forschungslabor zerstört wird während Forschung läuft, gehen Ressourcen verloren

**Lösung**: Ressourcen zurückerstatten oder Forschung pausieren

---

### 15. KI-Einheiten haben keine Formation
**Problem**: KI schickt alle Einheiten einzeln zum Angriff
- Leichte Beute für Flächenschaden

**Lösung**: KI soll Einheiten gruppieren bevor sie angreifen

---

## Kleine Bugs / Verbesserungen

### 16. Keine visuelle Rückmeldung bei ungültigen Befehlen
**Problem**: Wenn Spieler versucht Gebäude an ungültiger Stelle zu bauen, keine Fehlermeldung

**Lösung**: Rote Markierung + Sound

---

### 17. Einheiten "rutschen" auf Eis
**Problem**: Keine Reibung/Trägheit, Einheiten stoppen sofort
- Wirkt unnatürlich

**Lösung**: Leichte Trägheit hinzufügen

---

### 18. Keine Sound-Differenzierung
**Problem**: Alle Schüsse klingen gleich
- Panzer, MG, Raketen sollten unterschiedlich klingen

**Lösung**: Verschiedene Sound-Effekte pro Waffentyp

---

### 19. Minimap zeigt keine Fog-of-War
**Problem**: Minimap zeigt gesamte Karte, auch unerforschte Bereiche

**Lösung**: Nur erforschte Bereiche anzeigen

---

### 20. Keine Tooltips für Einheiten/Gebäude
**Problem**: Hover über Einheit zeigt keine Informationen

**Lösung**: Tooltip-System implementieren

---

## Getestete Funktionen (funktionieren korrekt)

✅ Spiel startet ohne Fehler
✅ Neue Partie kann gestartet werden
✅ Einheiten lassen sich auswählen (Einzelklick und Box-Selection)
✅ Bewegungsbefehle funktionieren
✅ Kampf-System funktioniert (Schaden, Treffer, Zerstörung)
✅ Gebäude können gebaut werden
✅ Ressourcen werden korrekt abgezogen/hinzugefügt
✅ Produktionswarteschlangen funktionieren
✅ Forschung schaltet Verbesserungen frei
✅ Gegnerische KI baut auf und greift an
✅ Sieg und Niederlage funktionieren
✅ Pause und Fortsetzen funktionieren
✅ Speichern und Laden funktionieren
✅ Zoom funktioniert
✅ Minimap ist klickbar

---

## Priorität für Fixes

1. **KRITISCH**: Kamera-Steuerung (Bug #1)
2. **KRITISCH**: Einheiten bewegen sich durch Hindernisse (Bug #2)
3. **HOCH**: Performance-Problem forceUpdate (Bug #3)
4. **HOCH**: KI baut ohne Energie (Bug #5)
5. **MITTEL**: Ressourcen-Überbauung (Bug #7)
6. **MITTEL**: Minimap-Positionierung (Bug #9)
7. **NIEDRIG**: Alle anderen

---

## Nächste Schritte

1. Alle kritischen Bugs beheben
2. Unit-Tests für Kern-Systeme schreiben
3. Playtesting mit echten Spielern
4. Balancing anpassen
5. Performance-Optimierung
