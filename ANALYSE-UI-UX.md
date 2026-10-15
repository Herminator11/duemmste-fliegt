# UI/UX-Analyse: Der Dümmste fliegt

Stand: 15.10.2026. Grundlage: `css/style.css` (711 Zeilen, vollständig gelesen), Messung der Kontraste und Werte per Skript, Webrecherche zu etablierten Richtlinien.
**Nicht geprüft:** Die Seite wurde nicht im Browser gerendert, und die `js/view-*.js`-Dateien wurden nur per Stichprobe angesehen (ARIA, Markup). Aussagen zu Rendering und Screenreader-Verhalten sind daher offen.

## 1. Gesamtbild

| Bereich | Note | Kurzurteil |
|---|---|---|
| Touch-Ziele und Abstände | B | Hauptbedienung ≥ 44–48 px, einige Host-Mini-Knöpfe darunter |
| Schrift (Größe, Zeilenhöhe) | B– | Gute Schriften, aber 26 Schriftgrößen und 14 Stellen unter 14 px |
| Kontrast Text | A– | Fast alles ≥ 5:1, eine Ausnahme (Grün) |
| Kontrast Bedienelemente | D | Rahmen aller Felder und Knöpfe nur 1,5–1,8:1 (Soll 3:1) |
| Abstände / Raster | B– | Meist 4er/8er-Raster, aber viele Ausreißer |
| Buttons (Hierarchie, Layout) | B+ | Klare Stufen, schöne Druck-Mechanik; Icon-Abstand zu eng |
| Animation | B+ | Beachtet `prefers-reduced-motion`, gute Easing-Kurven; Einstieg zu lang |
| Barrierefreiheit allgemein | B | Fokusring, `lang`, Viewport vorhanden; Farbe teils einziger Informationsträger |
| Konsistenz (Tokens) | C+ | Farben als Variablen, Größen/Radien/Zeiten nicht |

## 2. Prinzipien aus der Recherche und Vergleich

Quellen sind überwiegend Zusammenfassungen, nicht die Originalspezifikationen. Wo ich nur aus eigenem Wissen ergänze, steht „(Wissen)“.

### 2.1 Touch-Ziele
- **Richtwerte:** WCAG 2.2 AA (2.5.8) mindestens 24×24 CSS-px; AAA (2.5.5) 44×44; Apple 44 pt; Material 48 dp mit mindestens 8 dp Abstand zwischen Zielen. Das Ziel darf größer sein als die sichtbare Fläche (24-dp-Icon mit 48-dp-Trefferfläche).
- **Bei uns gut:** `.btn` 48 px, `.btn-sm` 40 px (44 px auf dem Handy), `.pl-big` 64 px, `.rbtn` 44 px, Eingabefelder 48 px, `gap:8px` zwischen Knöpfen.
- **Bei uns zu klein:**

| Element | Ist | Ort |
|---|---|---|
| `.hb-heart`, `.hb-hbtn` | 24×28 px | Host-Kacheln (Leben ±) |
| `.hb-gear` | 32×32 px | Host-Kacheln |
| `.dd-btn` (Fragekreise) | 16 + 2×6 = 28 px | Game Screen |
| `.sw-c` (Farbfelder) | 34 px | Avatar-Editor, **Handy** |
| `.lbtn` | 40 px | Leben-Knöpfe |
| `.rgroup` | 4 px Abstand | Richtig/Falsch/Keine, Soll 8 px |
| `.rule input` | 20 px Checkbox | Spielregeln (Zeile klickbar, daher ok) |

Alles ≥ 24 px erfüllt WCAG AA, bleibt aber unter Apple/Material. Auf dem Handy (Avatar-Editor) ist 34 px zu knapp.

### 2.2 Abstände, Margins, Raster
- **Richtwerte:** 8-px-Raster für Layout, 4-px-Raster für Feinheiten (Material). Apple: 16 pt Seitenrand, Inhaltsabstände 8/16/24. Feste Skala statt Zufallswerten, z. B. 4, 8, 16, 24, 32, 48, 64 (Refactoring-UI-Zusammenfassung).
- **Bei uns gut:** Seitenrand 16 px, Kartenpolster 16 px, Abschnittsabstand `h2` 36/12 (Nähe-Prinzip stimmt: Überschrift hängt an dem, was folgt), Maximalbreite 1180 px.
- **Bei uns uneinheitlich:** Es gibt Werte wie 6, 7, 10, 14, 18, 22, 28 px (`.pl-big` gap 10, `.dsp-grid` gap 14/18, `.rbtn` gap 7, `.cur-q` margin 22, `.next` margin 28). Das sind keine Fehler, aber ohne Skala driftet es mit jeder neuen Ansicht.

### 2.3 Schrift
- **Richtwerte:** Fließtext ≥ 16 px, Zeilenhöhe ca. 1,5 für Text und 1,1–1,3 für Überschriften, Zeilenlänge 45–75 Zeichen (Ideal ca. 66), feste Größenskala (z. B. Faktor 1,25 oder 1,5) statt freier Werte, relative Einheiten.
- **Bei uns gut:** `rem` durchgehend, Basis 1 rem, Zeilenhöhe 1,45 (Text) und 1,08–1,2 (Überschriften), `text-wrap:balance/pretty`, `tabular-nums` für Zeiten, Atkinson Hyperlegible für Lesetext, Bowlby nur groß.
- **Bei uns schwach:**
  - **26 verschiedene `rem`-Größen** (0,7 bis 3). Eine Skala würde 7–8 Stufen brauchen.
  - **14 Deklarationen unter 0,875 rem (14 px)**, bis hinunter zu 0,7 rem = 11,2 px (`.turn-tag`, Bowlby!) und 0,72 rem (`.hb-face small`, Großbuchstaben mit Sperrung).
  - **Keine Zeilenlängenbegrenzung** für `.lead`, `.hint`, `.block p`: Auf breiten Bildschirmen sind das über 100 Zeichen.
  - **Game Screen:** Namen 1 rem, Pillen 0,95 rem, Kopf-Pillen 0,9 rem Großbuchstaben. Für einen Fernseher in mehreren Metern Abstand ist das klein (Wissen: für „10-foot UI“ gelten ca. 24 px und mehr als Untergrenze für wichtige Angaben).

### 2.4 Kontrast und Farbe
- **Richtwerte:** WCAG 1.4.3: Text 4,5:1, großer Text 3:1; 1.4.11: Bedienelemente und Grafiken 3:1; 1.4.1: Farbe nie als einziger Informationsträger (Wissen).
- **Messung bei uns:**

| Paar | Verhältnis | Urteil |
|---|---|---|
| Text auf Fläche | 14,1:1 | sehr gut |
| Gedimmter Text auf Grund / Fläche | 8,4 / 7,0:1 | gut |
| Rot auf Grund / Fläche | 6,2 / 5,2:1 | gut |
| Dunkel auf Amber (Haupt-Knopf) | 10,2:1 | sehr gut |
| Heller Text auf Richtig-Grün `#2e8b57` | **3,78:1** | **zu niedrig** für 14,4-px-Fettschrift (`.rbtn.on`) |
| Rahmen `--line` auf Grund | **1,77:1** | **zu niedrig** (Knöpfe) |
| Rahmen `--line` auf Fläche | **1,48:1** | **zu niedrig** (alle Eingabefelder, Karten) |

- **Farbe als einziger Träger:** Die Kreise je Frage auf dem Game Screen (`.dd.r-richtig/-falsch/-keine`) unterscheiden sich nur durch Farbe (Grün, Rot, Grau, je 14–16 px). Wer rot-grün-schwach sieht, erkennt das Ergebnis nicht ohne Hover. Die Knöpfe `.rbtn` sind dagegen vorbildlich (Icon + Wort + Farbe).

### 2.5 Buttons
- **Richtwerte:** Primär gefüllt, sekundär umrandet, tertiär nur Text; je Ansicht eine Primäraktion. Material M3 (Wissen, nicht bestätigt): Abstand Icon–Text 8 dp, Icon 18 dp bei 40 dp Höhe, Seitenpolster 24 dp (16 dp auf der Icon-Seite). Höhe mindestens 44–48.
- **Bei uns gut:** Dreistufig (`.btn-main`, `.btn`, `.btn-danger`), 48 px, Spielautomaten-Kante (3 px Schatten, beim Drücken `translateY(3px)`; Weg und Schatten sind gleich groß, das wirkt stimmig), Deaktiviert-Zustand, Hover/Active/Focus vorhanden.
- **Bei uns schwach:**
  - **Icon–Text-Abstand im `.btn` nur 2 px** (`.btn .ic{margin-right:2px}`, kein `gap`). Soll 8 px.
  - `.dsp-round .ic` 4 px, `.rbtn` 7 px: uneinheitlich.
  - Seitenpolster 18 px, Soll 20–24 px bei Text-Knöpfen.
  - Keine tertiäre Stufe (Text-Knopf). Alles Sekundäre hat einen vollen Rahmen und konkurriert mit der Hauptaktion (z. B. die Zeilenaktionen in `.qact`).
  - Radien: 4, 6, 10, 11, 12, 14, 18 px, dazu 99 px und 50 %. Eine Skala (6 / 12 / Pille / Kreis) reicht.

### 2.6 Animation
- **Richtwerte:** Kleine Rückmeldungen 150–250 ms, große Bewegungen 250–500 ms, Bounce 800–1200 ms (web.dev), Standard-Easing ease-out, Austritt ca. 75 % der Eintrittszeit, `prefers-reduced-motion` respektieren, nichts Endloses ohne Pause-Möglichkeit (Wissen: WCAG 2.2.2 für Bewegung über 5 s).
- **Bei uns gut:** Mikro-Rückmeldungen .08–.35 s, eigene Kurven (`--out`, `--spring` per `linear()`), alle 7 Bewegungsblöcke mit `reduce`-Ausnahme, Einstieg nur beim Seitenwechsel (kein Flackern beim Neuzeichnen), Aufklappen mit `::details-content`, Hover-Fenster mit `@starting-style`.
- **Bei uns schwach:**
  - **Einstieg 0,65 s + bis 0,28 s Versatz = fast 0,95 s** bis alles steht (Soll ≤ 500 ms).
  - **Spieler-Ansage:** `--i * .35s` je Spieler, bei 8 Spielern fast 3 s plus Blitz. Als Showmoment denkbar, aber nicht überspringbar.
  - **Federung .35 s** (`--spring`): die Überschwinger (1,12) haben kaum Zeit zu wirken; entweder 0,5 s oder weniger Überschwingen.
  - **Endlosschleifen:** `sway` (16 s, Hintergrund), `pulse`, `beat`, `turnpulse`. Reduziert-Modus greift, aber ein Schalter „Bewegung aus“ in der Seite fehlt (Host nutzt es evtl. dauerhaft auf einem Beamer).
  - **Keine Austritts-Animationen** (Fenster und Tabs verschwinden hart).
  - **Zeiten nicht als Variablen** (17 verschiedene Dauern).

### 2.7 Weitere Bereiche
- **Fokus:** 3 px Ring mit 3 px Abstand und `scroll-padding-top:140px` gegen verdeckte Elemente unter der Sticky-Leiste. Das ist besser als bei den meisten Seiten. Eingabefelder ersetzen den Ring durch Rahmenfarbe + Schein (sichtbar, aber der Rahmen davor ist schwach, siehe 2.4).
- **Responsive:** Fünf nahe beieinander liegende Breakpoints (520, 560, 700, 900, 960). Zwei bis drei genügen. `.side{top:130px}` ist fest, obwohl die Leiste darüber variabel hoch ist.
- **Hover-abhängig:** Antwort-Fenster der Kreise (`.dsp-pop`) öffnet bei Hover/Fokus; auf Touchgeräten per Klasse `.open`. `cursor:help` ist ok. Der Game Screen läuft aber meist auf einem Fernseher ohne Maus, wo Hover nie auslöst. Prüfen, wie die Fragen dort sichtbar werden.
- **Sprache/Meta:** `lang="de"`, `viewport-fit=cover`, `safe-area-inset-bottom` genutzt: gut.
- **ARIA:** In 9 von 14 JS-Dateien kommt `aria-` vor (insgesamt 54 Treffer), aber Livebereiche für Timer und Ergebnisse habe ich nicht geprüft.

## 3. Verbesserungsliste (nach Wirkung sortiert)

| # | Problem | Heute | Besser | Aufwand |
|---|---|---|---|---|
| 1 | Rahmen von Knöpfen/Feldern zu blass | `--line:#25424d`, 1,5–1,8:1 | Zweite Variable `--edge` (ca. `#5f7f8c`, ≥ 3:1 auf Grund und Fläche) für alle bedienbaren Rahmen. `--line` bleibt für Trennlinien. | klein |
| 2 | Weißer Text auf Grün | `#2e8b57`, 3,78:1 | `#1f7a4a` (ca. 5:1) oder dunkle Schrift auf dem hellen Grün `#3ddc97` (wie auf dem Game Screen) | klein |
| 3 | Icon–Text-Abstand im Knopf | 2 px | `.btn{gap:8px}`, `margin-right` entfernen; `.dsp-round/.timer/.mode` und `.rbtn` ebenfalls auf 8 px (auf kleinen Pillen 6 px) | klein |
| 4 | Kreise nur durch Farbe | Punkt grün/rot/grau | Zusätzlich Form: ✓ / ✕ / – im Kreis (Icons liegen schon in `icons.js`), Größe 18–20 px | klein |
| 5 | Schrift unter 14 px | 11,2–13,6 px an 14 Stellen | Untergrenze 0,8125 rem (13 px) nur für Großbuchstaben-Etiketten, sonst 0,875 rem; `.turn-tag` auf 0,8 rem | klein |
| 6 | Zu viele Schriftgrößen | 26 Werte | Skala als Variablen: 0,875 / 1 / 1,125 / 1,25 / 1,5 / 2 / 3 rem plus `clamp()`-Stufen für Anzeige | mittel |
| 7 | Game Screen aus der Ferne | Namen 16 px, Pillen 15 px | Eigene Größenstufe `--tv` ab Breite 1280: Namen ≥ 1,5 rem, Pillen ≥ 1,25 rem, Kopf-Pillen ≥ 1,1 rem | mittel |
| 8 | Mini-Knöpfe im Host | 24–34 px | Sichtbar klein lassen, Trefferfläche per `::after{inset:-8px}` auf ≥ 44 px; `.sw-c` auf dem Handy 44 px | klein |
| 9 | Zeilenlänge | unbegrenzt | `.lead,.hint,.block p{max-width:65ch}` | klein |
| 10 | Einstieg zu lang | .65 s, bis .93 s gesamt | .45 s, Versatz 50 ms je Element, Obergrenze 3 Schritte | klein |
| 11 | Spieler-Ansage | .35 s je Spieler | Gesamtdauer deckeln (`min(.35s, 2s / n)`), Klick überspringt | mittel |
| 12 | Abstandsskala | freie Werte | Variablen `--s1…--s6` = 4/8/16/24/32/48; Ausreißer (10, 14, 18, 22, 28) einsammeln | mittel |
| 13 | Radien | 9 verschiedene | `--r-s:6px`, `--r-m:12px`, `--r-pill:99px` | klein |
| 14 | Zeiten | 17 verschiedene | `--t-fast:.15s`, `--t-mid:.3s`, `--t-slow:.5s` | klein |
| 15 | Tertiärer Knopf fehlt | alles mit Rahmen | `.btn-text` ohne Rahmen/Schatten für Zeilenaktionen (Bearbeiten, Löschen) | klein |
| 16 | Breakpoints | 5 | 600 / 960 / 1280, Rest per `clamp()` und `auto-fit` | mittel |
| 17 | Animationsschalter | nur OS-Einstellung | Host-Schalter „Ruhige Bühne“ (setzt `data-calm` am `body`, stoppt `sway/pulse/beat/turnpulse`) | klein |
| 18 | Austritte | harter Wechsel | Fenster/Pop-ups mit 75 % der Eintrittszeit ausblenden (`@starting-style` + `allow-discrete` ist schon im Einsatz) | klein |
| 19 | Feste Sticky-Höhe | `top:130px` | Höhe der Leiste in `--bar-h` messen (ResizeObserver) und verwenden | klein |
| 20 | Livebereiche | ungeprüft | Timer und Abstimmungsstand mit `role="status"`/`aria-live="polite"` (nicht jede Sekunde ansagen) | klein |

**Reihenfolge-Empfehlung:** 1, 2, 3, 4 (Barrierefreiheit und sichtbarste Fehler, zusammen unter einer Stunde), danach 5, 8, 9, 10, danach die Token-Arbeit (6, 12–14, 16) in einem Rutsch, weil sie dieselben Zeilen anfasst.

## 4. Was bereits überdurchschnittlich ist (nicht anfassen)
- 48-px-Standardknopf mit `touch-action:manipulation` und ohne graues Tippen.
- Kräftiger Fokusring plus `scroll-padding-top`.
- `prefers-reduced-motion` an allen Stellen, auch bei `scroll-behavior`.
- `tabular-nums` bei Zeiten, `min-width` bei der Uhr, `scrollbar-gutter:stable` (nichts springt).
- Ergebnis-Knöpfe mit Icon + Wort + Farbe (nicht nur Farbe).
- Einstieg läuft nur beim Seitenwechsel, nicht bei jedem Neuzeichnen.
- Wiedererkennbare Richtung (Bühne bei Nacht, Session-Farbe `--c`) und lokale Schriften.

## Quellen
- [Material: Spacing methods (8-dp-/4-dp-Raster, 48 dp, 8 dp Abstand)](https://material.io/design/layout/spacing-methods.html)
- [Material: Applying density (Trefferfläche größer als Element)](https://material.io/design/layout/applying-density.html)
- [Material: Baseline grids (48 dp ≈ 9 mm)](https://m1.material.io:443/layout/metrics-keylines.html)
- [Compose `ButtonDefaults` (Icon-Abstand und Größen je Knopfhöhe)](https://developer.android.com/reference/kotlin/androidx/compose/material3/ButtonDefaults)
- [Front-End-Checklist: Touch targets (WCAG 2.5.8 / 2.5.5, Apple 44, Material 48)](https://frontendchecklist.io/rules/accessibility/touch-targets)
- [Touch target size (specification.website)](https://specification.website/spec/accessibility/touch-target-size/)
- [web.dev: Choosing the right easing (200–500 ms, Bounce 800–1200 ms)](https://web.dev/choosing-the-right-easing/)
- [SAP Fiori: Motion Design (150–250 / 250–500 ms)](https://www.sap.com/design-system/fiori-design-web/v1-96/foundations/visual/motion-design)
- [Valhead: How fast should your UI animations be?](https://valhead.com/?p=2978)
- [Parachute: UX-Animation](https://parachutedesign.ca/blog/ux-animation/)
- [Basis: Typography](https://design.basis.com/typography)
- [UCLA Design System: Typography](https://designsystem.brand.ucla.edu/build/v2.6.0/docs/style-guide/typography.html)
- [Guidewire Jutro: Typography](https://docs.guidewire.com/jutro/documentation/10.12/typography)
- [UX Collective: 7 web typography tips (45–75 Zeichen)](https://uxdesign.cc/7-tips-to-help-improve-your-web-typography-skills-50f4a7e81c60)
- [iOS-HIG-Zusammenfassung (44 pt, 16 pt Rand)](https://skills.cat/skills/ehmo/platform-design-skills/ios-design-guidelines)
- [Refactoring-UI-Zusammenfassung (Skala, Button-Stufen)](https://cdn.jsdelivr.net/npm/claude-code-skills@0.5.0/data/skills/ux-ui-design-system/references/refactoring-ui.md)
- [Cieden: Button-Hierarchie](https://cieden.com/book/atoms/button/how-to-create-button-hierarchy)
- [Stark: WCAG 1.4.3 Contrast (Minimum)](https://www.getstark.co/wcag-explained/perceivable/distinguishable/contrast-minimum/)
- [DAISY: Non-text Contrast](https://kb.daisy.org/publishing/docs/wcag/non-text-contrast.html)
- [Intopia WCAG-2.2-Karte (u. a. 2.4.11, 2.4.13, 2.3.3)](https://intopia.digital/wp-content/uploads/2023/10/Intopia-WCAG-2.2-Map-Portrait-Mode.pdf)

Hinweis zur Quellenlage: Die Material-3-Zahlen für Knopfpolster und Icon-Abstand (8 / 24 / 16 dp), die Entfernungsregel für Fernseher-Oberflächen und WCAG 1.4.1 / 2.2.2 stammen aus meinem Wissen, nicht aus den Suchergebnissen. Vor einer Entscheidung auf m3.material.io und w3.org gegenprüfen.

## Umsetzungsstand (15.10.2026)
Erledigt: 1–20 aus Abschnitt 3. Zu 7: Die größere Schrift greift nur auf dem Game Screen ab 1280 px und 1920 px Breite (nicht am Gerät geprüft). Zu 11: Die Ansage ist auf ca. 2 s gedeckelt und endet bei Klick, Leertaste oder Enter. Zu 17: Der Schalter „Ruhige Bühne“ sitzt in der Kopfleiste und gilt pro Browser (localStorage). Zu 20: Es gibt einen Livebereich für „Noch zehn Sekunden“ und „Zeit abgelaufen“ (Host und Handy); Abstimmungsstände werden nicht angesagt.
