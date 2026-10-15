# Der Dümmste fliegt – Hinweise für Claude

Statische Host-Oberfläche plus kleiner Node-Server (ohne Pakete) für ein Quiz-Spiel. Siehe `README.md` für Aufbau und Start.

## Arbeitsregeln
- Sprache der Oberfläche und der Kommentare: Deutsch.
- Keine Fremdserver zur Laufzeit: Schriften, Icons und Bibliotheken liegen lokal (`fonts/`, `js/vendor/`, `js/icons.js`).
- Tests vor dem Abschluss: `npm test`. Oberflächenänderungen zusätzlich im Browser prüfen (Master, Handy `join.html`, Game Screen `#/anzeige`).
- Die richtige Antwort und Entwürfe des Masters dürfen nie in `Store.publicView()` landen, bevor veröffentlicht wurde. Bei anonymer Abstimmung gibt es keine Wähler in der öffentlichen Sicht.

## Design-Vorgaben (Frontend)

```
<frontend_aesthetics>
You tend to converge toward generic, "on distribution" outputs. In frontend design, this creates what users call the "AI slop" aesthetic. Avoid this: make creative, distinctive frontends that surprise and delight. Focus on:

Typography: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics.

Color & Theme: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Draw from IDE themes and cultural aesthetics for inspiration.

Motion: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions.

Backgrounds: Create atmosphere and depth rather than defaulting to solid colors. Layer CSS gradients, use geometric patterns, or add contextual effects that match the overall aesthetic.

Avoid generic AI-generated aesthetics:
- Overused font families (Inter, Roboto, Arial, system fonts)
- Clichéd color schemes (particularly purple gradients on white backgrounds)
- Predictable layouts and component patterns
- Cookie-cutter design that lacks context-specific character

Interpret creatively and make unexpected choices that feel genuinely designed for the context. Vary between light and dark themes, different fonts, different aesthetics. You still tend to converge on common choices (Space Grotesk, for example) across generations. Avoid this: it is critical that you think outside the box!
</frontend_aesthetics>
```

## Umsetzung dieser Vorgaben im Projekt (Stand jetzt)
- **Richtung:** Quizshow-Bühne bei Nacht. Tiefes Tintenblau, Scheinwerferlicht in der Farbe der aktuellen Session (`--c`), grelle Akzente in Rot und Gelb.
- **Schriften:** Bowlby One (Plakatschrift, nur für Marke, große Überschriften, Gewinner- und Verlierer-Zeilen), Bricolage Grotesque (Fragen, Zeiten), Atkinson Hyperlegible (Fließtext, gut lesbar). Alle lokal in `fonts/`. Keine Systemschriften als Gestaltung.
- **Hintergrund:** Mehrere Verläufe, Streifenmuster und ein langsamer Lichtkegel, nie eine einfarbige Fläche (`body` und `body::before` in `css/style.css`).
- **Bewegung:** Nur CSS. Gestaffelter Einstieg beim Seitenwechsel (`body.enter`) und beim ersten Aufbau der Kacheln auf dem Game Screen. Keine Wiederholung bei jedem Neuzeichnen, sonst flackert die Anzeige. `prefers-reduced-motion` wird beachtet.
- **Neue Gestaltung bitte im selben Geist** weiterführen und nicht auf Standardlösungen zurückfallen.
