# Persuch – Web-Version von PERSONEN.BAS

Portierung des Atari-GFA-BASIC-Programms `PERSONEN.BAS` (mit `CHARA.DAT`) nach
reinem HTML/CSS/JS. Keine Abhängigkeiten, kein Build-Schritt.

## Starten

Ein lokaler Server ist nötig, weil `data.json` nachgeladen wird – über
`file://` verbieten Browser das:

    python3 -m http.server 8000     # dann http://localhost:8000/

Ohne Server erscheint statt des Spiels ein Hinweis mit der Möglichkeit, eine
JSON-Datei von Hand hochzuladen.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Gerüst und Reiter |
| `style.css` | Darstellung (hell/dunkel je nach Systemeinstellung) |
| `data.json` | Ausgangsdaten – aus `CHARA.DAT` erzeugt (387 Personen, 250 Eigenschaften) |
| `titel.js` | `TITEL_RULES` – die 346 Regeln aus `Procedure Titel` |
| `engine.js` | Die Logik: Fragegenerierung, `Suchen`, `Korr`, `Minimax`, Namensverfremder |
| `app.js` | Oberfläche, Speicherung, Import/Export |

`data.json` und `titel.js` sind maschinell aus den Originaldateien erzeugt.
Die Atari-Zeichen (CP437) sind dabei nach UTF-8 umgesetzt.

Mitgelieferte, gespeicherte und hochgeladene Daten nehmen denselben Weg:
JSON parsen → `Db.validate` → `new Db`. `data.json` hat exakt das Format des
Downloads und lässt sich dadurch ersetzen: heruntergeladene Datei in
`data.json` umbenennen, danebenlegen, „Auf Ausgangsdaten zurücksetzen"
drücken. Beim Zurücksetzen wird die Datei jedes Mal neu geholt.

## Quellen

`PERSONEN.BAS` bricht nach 2416 Zeilen mitten in `Procedure Titel` ab
(`If F>0 And O>0 And E>`). Der fehlende Rest steht in `SAUVAGE.LST`, einer
Variante desselben Programms. In den geteilten Bereichen sind beide Dateien
zeichengleich – `PERSONEN.BAS` 491–2416 entspricht `SAUVAGE.LST` 429–2355,
mit einer einzigen zusätzlichen Zeile (`Gosub Sauvage`) in SAUVAGE. Von dort
stammen daher:

* das Ende von `Procedure Titel` samt der Marke `Tend:` (Zeilen 2356–2483),
* `Procedure Resultat` (2484–2539),
* `Procedure Kons` mit ihren 18 Buchstabenprozeduren `B`…`Z` sowie
  `Uw` und `Umdreh` (2540–3149).

`Tend:` erklärt auch die Kennziffer am Ende jeder Titelzeichenkette
(`"Dr.4"`, `"Horror-6"`, `"Gold-3"`): sie steuert den weiteren Namensaufbau.
`4` setzt `Dr` und erlaubt damit das Suffix `FMH`; `2/3/5/6/7` ersetzen das
Schlusszeichen von `S$` durch `-`; `3/5/7` setzen zusätzlich `Lcount`,
davon `5/7` auch `Graf` und `7` auch `Scount`. Abgeschnitten wird die Ziffer
über `N$=Left$(N$,X-1)`, wobei `X` der erreichte Titelrang ist.

Nicht übernommen ist alles SAUVAGE-Spezifische: das Hitparaden-Menü, der
andere Schlussteil (mehrfache Namenssuche über alle Teilzeichenketten statt
`Left$(Per$,4)`, kein „Flicken") sowie `Procedure Sauvage`/`Ort`, die nach
„Das war wohl ein Tip auf …" Hinweise im Stil eines Krimidinners einstreuen
(„… versteckt sich im brennenden Rollstuhl").

## Bedienung

* **Spiel** – Person ausdenken, dann pro Runde eine der neun Eigenschaften
  anklicken. Nach spätestens 20 Fragen rät das Programm bzw. gibt auf und
  fragt nach. Unbekannte Personen können aufgenommen werden.
* **Datenbank** – drei Unterreiter:
  * *Personen* – Liste mit höchst- und tiefstbewerteter Eigenschaft
    (`Procedure Minimax`). Die Detailansicht erlaubt Umbenennen, Löschen und
    das Bearbeiten aller Assoziationen (Zahlenfelder von −25 bis 38,
    sortiert nach Stärke, mit Filter).
  * *Eigenschaften* – Liste mit Neuanlage; eine neue Eigenschaft startet bei
    allen Personen auf 0. Die Detailansicht erlaubt Umbenennen und Löschen
    und zeigt die 20 stärksten Assoziationen samt „and last but not least".
  * *Up-/Download* – JSON herunter-/hochladen, auf die Ausgangsdaten
    zurücksetzen.

Gelöscht wird nur nach Rückfrage. Personen und Eigenschaften löschen
verschiebt Indizes, deshalb wird ein laufendes Spiel dabei verworfen –
die Rückfrage weist darauf hin. Alle Änderungen landen sofort im
`localStorage`.

Jede Antwort verändert die Bewertungen (`Procedure Korr`, ±2) und wird sofort
in `localStorage` unter `persuch.db.v1` gesichert.

## JSON-Format

```json
{
  "format": "persuch-1",
  "names": ["Lukas Merlach", "…"],
  "bew":   ["[NMLP[MQ…", "…"],
  "eig":   ["Schlange", "…"]
}
```

`names[i]` und `bew[i]` gehören zusammen. `bew[i]` hat ein Zeichen je
Eigenschaft; Zeichen *k* ist die Bewertung für `eig[k]`, der angezeigte Wert
ist `Zeichencode − 85`. Gültig sind die Codes 60–123, also −25 bis 38.
Neu aufgenommene Personen starten wie im Original überall auf `V` = 86 → 1,
neu angelegte Eigenschaften dagegen auf 0.

Höchstens 600 Personen, mindestens 9 Eigenschaften (weniger reichen für keine
Frage). Beim Import wird das geprüft; überzählige Zeichen in `bew` werden
beim Laden abgeschnitten, damit Einfügen und Löschen eindeutig bleiben.
Das Original hatte 250 Eigenschaften fest verdrahtet – hier ist die Zahl
veränderlich. Für ein volles Spiel mit 20 Fragen braucht es 180 davon.

## Abweichungen vom Original

**Bedienung.** Auswahl per Klick statt per Zahleneingabe; ja/nein-Fragen sind
Knöpfe. Statt `Ausdrucke`/`Sav$`-Abfragen gibt es den Reiter *Datenbank*.
Gespeichert wird automatisch statt auf Nachfrage.

**Logik.** Zeilennah übernommen, samt der Eigenheiten des Originals: immer
wahre Teilbedingungen (z. B. Zeile 888), vor der Zuweisung gelesene Variablen
(`Lang` in Zeile 700, `Vl$` in Zeile 869), der doppelte `"ü"`-Vergleich in
Zeile 603, und über Runden hinweg lebende Zustände (`Zuf()`, `Vern`, `Lang`).

**Rekonstruiert ist nichts.** Alle drei zunächst fehlenden Prozeduren liegen
dank `SAUVAGE.LST` im Original vor (siehe *Quellen*).

**Typografie.** Im verfremdeten Namen („Ich sage nur: …") steht hinter jedem
Abkürzungspunkt, dem direkt ein Zeichen folgt, ein schmales geschütztes
Leerzeichen (U+202F): `Cand. med. Macan` statt `Cand.med.Macan`. Der Atari
konnte das nicht darstellen, deshalb fehlt es im Original.

**Nicht portiert.** `Pause`/`Box`/`Cls` (Bildschirmsteuerung des Atari) sowie
`Stop` bei ungültigen Werten – dort steht stattdessen eine Warnung im
Protokoll. Der `Lprint`-Zweig (`Aus2$="l"`, Ausdruck auf Papier) entfällt
zugunsten der Personenliste im Reiter *Datenbank*.
