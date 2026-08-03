'use strict';
/* Oberflaeche fuer die Persuch-Engine. */

const SPEICHER = 'persuch.db.v1';
const STANDARD_DATEI = 'data.json';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/* ------------------------------------------------------------------ */
/* Zustand                                                             */
/* ------------------------------------------------------------------ */

let db = null;
let globals = neueGlobals();
let spiel = null;

/* Gespeicherte, hochgeladene und mitgelieferte Daten nehmen denselben Weg:
   JSON parsen -> Db.validate -> new Db. Die Standarddaten sind darum eine
   ganz gewoehnliche JSON-Datei, die sich durch eine heruntergeladene
   ersetzen laesst. */

let standardCache = null;

async function standardDaten() {
  if (!standardCache) {
    let antwort;
    try {
      antwort = await fetch(STANDARD_DATEI, { cache: 'no-cache' });
    } catch (e) {
      throw new Error(`${STANDARD_DATEI} ist nicht erreichbar (${e.message}).`);
    }
    if (!antwort.ok) throw new Error(`${STANDARD_DATEI}: HTTP ${antwort.status}.`);
    standardCache = Db.validate(await antwort.json());
  }
  return standardCache;
}

async function datenLaden() {
  const roh = localStorage.getItem(SPEICHER);
  if (roh) {
    try {
      return Db.validate(JSON.parse(roh));
    } catch (e) {
      console.warn('Gespeicherte Daten unbrauchbar, nehme die Standarddaten:', e);
    }
  }
  return standardDaten();
}

let speicherFehler = false;
function speichern() {
  try {
    localStorage.setItem(SPEICHER, JSON.stringify(db.toJSON()));
    speicherFehler = false;
  } catch (e) {
    speicherFehler = true;
    console.error('Speichern fehlgeschlagen:', e);
  }
  speicherInfo();
}

function speicherInfo() {
  if (!db) return;
  const roh = localStorage.getItem(SPEICHER);
  const kb = roh ? Math.round(roh.length / 1024) : 0;
  $('speicher-info').textContent = speicherFehler
    ? 'Achtung: Speichern in localStorage schlug fehl – Änderungen gehen beim Neuladen verloren. Lade die Daten als JSON herunter.'
    : (roh
      ? `${db.neu} Personen, ${db.eig.length} Eigenschaften – ${kb} kB in localStorage.`
      : `${db.neu} Personen, ${db.eig.length} Eigenschaften – noch nichts gespeichert, es gilt der Ausgangsstand.`);
  $('speicher-info').classList.toggle('meldung', speicherFehler);
  $('speicher-info').classList.toggle('fehler', speicherFehler);
}

/* ------------------------------------------------------------------ */
/* Reiter                                                              */
/* ------------------------------------------------------------------ */

/** Jede neue Ansicht beginnt oben. */
function nachOben() { window.scrollTo(0, 0); }

document.querySelectorAll('#tabs button').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('#tabs button').forEach((x) => x.classList.remove('aktiv'));
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('aktiv'));
    b.classList.add('aktiv');
    $('tab-' + b.dataset.tab).classList.add('aktiv');
    if (b.dataset.tab === 'datenbank') { dbZeichnen(); speicherInfo(); }
    if (b.dataset.tab === 'spiel' && spiel) {
      // Zurueck in eine laufende Partie: dorthin, wo weitergespielt wird.
      scrollNoetig = true;
      nachZeichnen();
    } else {
      nachOben();
    }
  };
});

document.querySelectorAll('#db-tabs button').forEach((b) => {
  b.onclick = () => dbReiter(b.dataset.db);
});

function dbReiter(name) {
  document.querySelectorAll('#db-tabs button').forEach((x) => {
    x.classList.toggle('aktiv', x.dataset.db === name);
  });
  document.querySelectorAll('.db-panel').forEach((x) => {
    x.hidden = x.id !== 'db-' + name;
  });
  $('db-meldung').hidden = true;
  if (name === 'daten') speicherInfo();
  nachOben();
}

/* ------------------------------------------------------------------ */
/* Spiel                                                               */
/* ------------------------------------------------------------------ */

$('btn-start').onclick = spielStarten;
$('btn-abbruch').onclick = () => { spiel = null; zeigeStart(); };

function ladefehlerAnzeigen(e) {
  console.error('Datenbank konnte nicht geladen werden:', e);
  $('ladefehler').hidden = false;
  $('start-normal').hidden = true;
  $('start').hidden = false;
  $('spiel').hidden = true;
}

function zeigeStart() {
  $('ladefehler').hidden = true;
  $('start-normal').hidden = false;
  $('start').hidden = false;
  $('spiel').hidden = true;
  $('start-info').textContent =
    `${db.neu} Personen in der Datenbank. Was du beantwortest, verschiebt die Bewertungen – ` +
    `das Programm lernt mit.`;
  nachOben();
}

function spielStarten() {
  spiel = new Game(db, globals);
  $('start').hidden = true;
  $('spiel').hidden = false;
  $('protokoll').innerHTML = '';
  nachOben();
  zeichnen();
}

let scrollNoetig = false;

function protokollAnhaengen(eintraege) {
  const p = $('protokoll');
  eintraege.forEach((e) => p.appendChild(protokollZeile(e)));
  scrollNoetig = true;
}

function protokollZeile(e) {
  const z = el('p', e.kind);
  fettSetzen(z, e.text);
  return z;
}

/**
 * Minimaler Markdown-Ersatz: **so markierter** Text wird fett, alles andere
 * bleibt wörtlich stehen. Unpaarige Sternchen sind gewöhnlicher Text.
 */
const FETT = /\*\*(.+?)\*\*/g;

function fettSetzen(ziel, text) {
  if (!text.includes('**')) { ziel.textContent = text; return; }
  FETT.lastIndex = 0;
  let pos = 0, m;
  while ((m = FETT.exec(text)) !== null) {
    if (m.index > pos) ziel.appendChild(document.createTextNode(text.slice(pos, m.index)));
    ziel.appendChild(el('strong', null, m[1]));
    pos = m.index + m[0].length;
  }
  if (pos < text.length) ziel.appendChild(document.createTextNode(text.slice(pos)));
}

function zeichnen() {
  const g = spiel;
  $('runde').textContent = `Frage ${Math.min(g.bx + 1, 20)} von 20`;
  const frage = $('frage'), dlg = $('dialog');
  frage.hidden = true; dlg.hidden = true; dlg.innerHTML = '';

  if (g.phase === 'frage') {
    frage.hidden = false;
    const box = $('optionen');
    box.innerHTML = '';
    g.optionen.forEach((o, i) => {
      const b = el('button');
      b.appendChild(el('span', 'nr', (i + 1) + '.'));
      b.appendChild(document.createTextNode(o.text));
      b.onclick = () => {
        g.antworten(i);
        protokollAnhaengen(g.log);
        g.log = [];
        speichern();
        zeichnen();
      };
      box.appendChild(b);
    });
    nachZeichnen();
    return;
  }

  dlg.hidden = false;
  const schreib = (t, cls) => dlg.appendChild(el('p', cls, t));
  const reihe = () => { const r = el('div', 'knopfreihe'); dlg.appendChild(r); return r; };
  const knopf = (r, text, fn, cls) => {
    const b = el('button', cls, text); b.onclick = fn; r.appendChild(b); return b;
  };
  const weiter = () => { protokollAnhaengen(spiel.log); spiel.log = []; speichern(); zeichnen(); };
  /** Die Antwort des Spielers ins Protokoll – wie die angeklickte Eigenschaft. */
  const antwort = (t) => { g.log.push({ text: '› ' + (t || '(keine Antwort)'), kind: 'wahl' }); };

  switch (g.phase) {

    case 'raten': {
      schreib('Gell, ich hab das toll gemacht!');
      const r = reihe();
      const ab = (ja, text) => () => { antwort(text); g.ratenBestaetigen(ja); weiter(); };
      knopf(r, 'Ja, das ist sie', ab(true, 'Ja, das ist sie'));
      knopf(r, 'Nein, falsch geraten', ab(false, 'Nein, falsch geraten'));
      break;
    }

    case 'aufgeben': {
      schreib('Wen hast du gesucht? Bitte gib einen vernünftigen Namen ein (mind. 4 Zeichen).');
      const eing = el('input'); eing.type = 'text'; eing.size = 34;
      eing.setAttribute('list', 'namen-liste');
      dlg.appendChild(eing);
      const dl = el('datalist'); dl.id = 'namen-liste';
      db.names.forEach((n) => { const o = el('option'); o.value = n; dl.appendChild(o); });
      dlg.appendChild(dl);
      const r = reihe();
      const ab = () => {
        const v = eing.value.trim();
        if (v.length < 4) { eing.focus(); return; }
        g.log = [];
        antwort(v);
        g.personGenannt(v);
        weiter();
      };
      knopf(r, 'Abschicken', ab);
      eing.onkeydown = (e) => { if (e.key === 'Enter') ab(); };
      setTimeout(() => eing.focus(), 0);
      break;
    }

    case 'wirklichNeu': {
      schreib('Ist sie wirklich neu für mich?');
      const r = reihe();
      knopf(r, 'Ja, neu', () => {
        antwort('Ja, neu');
        g.phase = 'sollten';
        weiter();
      });
      knopf(r, 'Nein, du solltest sie kennen', () => {
        g.log = [];
        antwort('Nein, du solltest sie kennen');
        g.say('So wollen wir die Person zusammen suchen.');
        g.kath = g.perName.slice(0, 4);
        g.phase = 'gemeinsam';
        weiter();
      });
      break;
    }

    case 'sollten': {
      schreib('Sollten wir „' + g.perName + '“ wohl aufnehmen?');
      const r = reihe();
      knopf(r, 'Ja, aufnehmen', () => {
        g.log = [];
        antwort('Ja, aufnehmen');
        g.personAufnehmen(g.perName);
        weiter();
      });
      knopf(r, 'Nein', () => { antwort('Nein'); g.phase = 'fertig'; weiter(); });
      knopf(r, 'Nochmals schreiben', () => {
        antwort('Nochmals schreiben');
        g.phase = 'nochmalsSchreiben';
        weiter();
      });
      break;
    }

    case 'nochmalsSchreiben': {
      schreib('Dann gib mir bitte den Namen nochmals sorgfältig und fehlerfrei ein.');
      const eing = el('input'); eing.type = 'text'; eing.size = 34; eing.value = g.perName;
      dlg.appendChild(eing);
      const r = reihe();
      const ab = () => {
        const v = eing.value.trim();
        if (v.length < 4) { eing.focus(); return; }
        g.perName = v; g.log = [];
        antwort(v);
        g.personAufnehmen(v);
        weiter();
      };
      knopf(r, 'Aufnehmen', ab);
      eing.onkeydown = (e) => { if (e.key === 'Enter') ab(); };
      setTimeout(() => eing.focus(), 0);
      break;
    }

    case 'gemeinsam': {
      const treffer = g.kandidaten(g.kath);
      if (treffer.length) {
        schreib('Bist du eine davon?');
        const box = el('div', 'kandidaten');
        treffer.forEach((idx) => {
          const b = el('button', null, db.names[idx]);
          b.onclick = () => {
            g.log = [];
            antwort(db.names[idx]);
            g.kandidatBestaetigen(idx);
            weiter();
          };
          box.appendChild(b);
        });
        dlg.appendChild(box);
      } else {
        schreib('Ich hab\'s leider nicht geschafft.');
      }
      schreib('Willst du\'s mit einer anderen Schreibweise versuchen? ' +
              'Gib diesmal besser nur einen Namensteil ein, dafür einen sicheren.', 'klein');
      const eing = el('input'); eing.type = 'text'; eing.size = 24; eing.value = g.kath;
      dlg.appendChild(eing);
      const r = reihe();
      knopf(r, 'Nochmals suchen', () => {
        const v = eing.value.trim();
        if (!v) { eing.focus(); return; }
        antwort('Nochmals suchen: ' + v);
        g.kath = v;
        weiter();
      });
      knopf(r, 'Nein – sie ist neu für dich', () => {
        g.log = [];
        antwort('Nein – sie ist neu für dich');
        g.say('Du stellst mir also eine neue Person vor – interessant.');
        g.phase = 'sollten';
        weiter();
      });
      break;
    }

    case 'protest': {
      schreib('Hast du zu diesem leidigen Thema noch was vorzubringen?');
      const eing = el('input'); eing.type = 'text'; eing.size = 40;
      dlg.appendChild(eing);
      const r = reihe();
      const ab = () => {
        const v = eing.value.trim();
        g.log = [];
        antwort(v);
        g.protestAntwort(v);
        weiter();
      };
      knopf(r, 'Abschicken', ab);
      eing.onkeydown = (e) => { if (e.key === 'Enter') ab(); };
      setTimeout(() => eing.focus(), 0);
      break;
    }

    case 'codewort': {
      const eing = el('input'); eing.type = 'text'; eing.size = 20;
      dlg.appendChild(eing);
      const r = reihe();
      const ab = () => {
        const v = eing.value.trim();
        g.log = [];
        antwort(v);
        g.codewortAntwort(v);
        weiter();
      };
      knopf(r, 'Abschicken', ab);
      eing.onkeydown = (e) => { if (e.key === 'Enter') ab(); };
      setTimeout(() => eing.focus(), 0);
      break;
    }

    case 'fertig': {
      schreib('Nochmals?');
      const r = reihe();
      knopf(r, 'Ja, neue Runde', spielStarten);
      knopf(r, 'Nein, danke', () => { spiel = null; zeigeStart(); });
      break;
    }

    default:
      break;
  }
  nachZeichnen();
}

/** Nach einer Antwort ans Ende scrollen, damit Protokoll und Frage sichtbar sind. */
function nachZeichnen() {
  if (!scrollNoetig) return;
  scrollNoetig = false;
  requestAnimationFrame(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  });
}

/* ------------------------------------------------------------------ */
/* Datenbankansicht                                                    */
/* ------------------------------------------------------------------ */

$('filter-personen').oninput = personenZeichnen;
$('filter-eigenschaften').oninput = eigenschaftenZeichnen;

function dbZeichnen() { if (!db) return; personenZeichnen(); eigenschaftenZeichnen(); }

/* ---- Tabellenbausteine ------------------------------------------- */

/**
 * Erzeugt <div class=tabelle-huelle><table class=tabelle><thead>…<tbody>.
 * Die Huelle scrollt nur waagrecht; senkrecht scrollt die Seite.
 * @param {Array<{text:string, cls?:string}>} spalten
 */
function tabelle(spalten) {
  const huelle = el('div', 'tabelle-huelle');
  const t = el('table', 'tabelle');
  const thead = el('thead');
  const kopf = el('tr');
  spalten.forEach((s) => kopf.appendChild(el('th', s.cls, s.text)));
  thead.appendChild(kopf);
  t.appendChild(thead);
  const tbody = el('tbody');
  t.appendChild(tbody);
  huelle.appendChild(t);
  return { huelle, tbody, spalten: spalten.length };
}

/** Zelle mit Text. */
function zelle(text, cls) { return el('td', cls, text); }

/** Zelle, deren Inhalt anklickbar und mit der Tastatur erreichbar ist. */
function knopfzelle(text, fn, cls) {
  const td = el('td', cls);
  const b = el('button', 'zellknopf', text);
  b.onclick = (e) => { if (e && e.stopPropagation) e.stopPropagation(); fn(); };
  td.appendChild(b);
  return td;
}

function leerzeile(tbody, spalten, text) {
  const tr = el('tr');
  const td = el('td', 'klein', text);
  td.setAttribute('colspan', String(spalten));
  tr.appendChild(td);
  tbody.appendChild(tr);
}

function personenZeichnen() {
  const f = $('filter-personen').value.trim().toLowerCase();
  const box = $('liste-personen');
  box.innerHTML = '';
  const { huelle, tbody, spalten } = tabelle([
    { text: 'Nr.', cls: 'idx' },
    { text: 'Name' },
    { text: 'stärkste Assoziation' },
    { text: 'schwächste' },
  ]);
  let anzahl = 0;
  for (let i = 0; i < db.neu; i++) {
    if (f && !db.names[i].toLowerCase().includes(f)) continue;
    const mm = db.minimax(i);
    const tr = el('tr', 'klickbar');
    tr.onclick = () => personDetail(i);
    tr.appendChild(zelle(String(i), 'idx'));
    tr.appendChild(knopfzelle(db.names[i], () => personDetail(i)));
    tr.appendChild(zelle(db.eig[mm.maza], 'plus'));
    tr.appendChild(zelle(db.eig[mm.miza], 'minus'));
    tbody.appendChild(tr);
    anzahl++;
  }
  if (!anzahl) leerzeile(tbody, spalten, 'Nichts gefunden.');
  box.appendChild(huelle);
}

function eigenschaftenZeichnen() {
  const f = $('filter-eigenschaften').value.trim().toLowerCase();
  const box = $('liste-eigenschaften');
  box.innerHTML = '';
  const { huelle, tbody, spalten } = tabelle([
    { text: 'Nr.', cls: 'idx' },
    { text: 'Eigenschaft' },
  ]);
  let anzahl = 0;
  db.eig.forEach((e, i) => {
    if (f && !e.toLowerCase().includes(f)) return;
    const tr = el('tr', 'klickbar');
    tr.onclick = () => eigDetail(i);
    tr.appendChild(zelle(String(i), 'idx'));
    tr.appendChild(knopfzelle(e, () => eigDetail(i)));
    tbody.appendChild(tr);
    anzahl++;
  });
  if (!anzahl) leerzeile(tbody, spalten, 'Nichts gefunden.');
  box.appendChild(huelle);
}

/* ---- Bausteine fuer die Detailansichten ------------------------- */

/** Ein laufendes Spiel arbeitet mit Indizes – nach dem Loeschen ungueltig. */
function spielVerwerfen() {
  globals = neueGlobals();
  if (!spiel) return;
  spiel = null;
  zeigeStart();
}

function listeZeigen(panel) {
  $(panel === 'person' ? 'personen-liste' : 'eigenschaften-liste').hidden = false;
  $(panel === 'person' ? 'person-detail' : 'eig-detail').hidden = true;
  nachOben();
}

function detailZeigen(panel) {
  $(panel === 'person' ? 'personen-liste' : 'eigenschaften-liste').hidden = true;
  $(panel === 'person' ? 'person-detail' : 'eig-detail').hidden = false;
  nachOben();
}

/** Kopfzeile: "‹ Zurück", Umbenennen-Feld und Löschen-Knopf. */
function detailKopf(d, wert, zurueck, umbenennen, loeschen) {
  const nav = el('div', 'detail-nav');
  const zur = el('button', 'link', '‹ Zurück zur Liste');
  zur.onclick = zurueck;
  nav.appendChild(zur);
  d.appendChild(nav);

  const reihe = el('div', 'detail-kopf');
  const eing = el('input');
  eing.type = 'text';
  eing.value = wert;
  eing.className = 'namensfeld';
  const um = el('button', null, 'Umbenennen');
  um.onclick = () => umbenennen(eing.value.trim());
  eing.onkeydown = (e) => { if (e.key === 'Enter') umbenennen(eing.value.trim()); };
  const lo = el('button', 'warnung', 'Löschen');
  lo.onclick = loeschen;
  reihe.appendChild(eing);
  reihe.appendChild(um);
  reihe.appendChild(lo);
  d.appendChild(reihe);
  return eing;
}

/* ---- Person ------------------------------------------------------ */

let assoOrdnung = [];   // Anzeigereihenfolge, damit Zeilen beim Tippen nicht springen

function personDetail(i) {
  const d = $('person-detail');
  d.innerHTML = '';
  dbReiter('personen');
  detailZeigen('person');

  detailKopf(d, db.names[i],
    () => { listeZeigen('person'); personenZeichnen(); },
    (neu) => personUmbenennen(i, neu),
    () => personLoeschen(i));

  const info = el('p', 'klein', '');
  d.appendChild(info);

  d.appendChild(el('h2', null, 'Assoziationen'));
  d.appendChild(el('p', 'klein',
    `Werte von ${-25} bis ${38}. Änderungen werden sofort gespeichert.`));
  const filter = el('input');
  filter.type = 'search';
  filter.placeholder = 'Eigenschaft filtern…';
  d.appendChild(filter);
  const box = el('div');
  d.appendChild(box);

  assoOrdnung = db.eig.map((e, k) => k)
    .sort((a, b) => db.bewWert(i, b) - db.bewWert(i, a) ||
                    db.eig[a].localeCompare(db.eig[b], 'de'));

  const kopfSetzen = () => {
    const mm = db.minimax(i);
    info.textContent = `Nr. ${i} · höchste Assoziation: „${db.eig[mm.maza]}“ (${mm.max}) · ` +
                       `tiefste: „${db.eig[mm.miza]}“ (${mm.min})`;
  };
  const zeichnen2 = () => {
    const f = filter.value.trim().toLowerCase();
    box.innerHTML = '';
    const { huelle, tbody, spalten } = tabelle([
      { text: 'Wert', cls: 'wertspalte' },
      { text: 'Eigenschaft' },
    ]);
    let anzahl = 0;
    assoOrdnung.forEach((k) => {
      if (f && !db.eig[k].toLowerCase().includes(f)) return;
      const tr = el('tr');
      const td = el('td', 'wertspalte');
      const nr = el('input');
      nr.type = 'number'; nr.min = -25; nr.max = 38; nr.step = 1;
      nr.value = String(db.bewWert(i, k));
      nr.setAttribute('aria-label', 'Bewertung für ' + db.eig[k]);
      nr.onchange = () => {
        const w = db.bewSetzen(i, k, Number(nr.value) || 0);
        nr.value = String(w);
        speichern();
        kopfSetzen();
      };
      td.appendChild(nr);
      tr.appendChild(td);
      tr.appendChild(knopfzelle(db.eig[k], () => eigDetail(k)));
      tbody.appendChild(tr);
      anzahl++;
    });
    if (!anzahl) leerzeile(tbody, spalten, 'Nichts gefunden.');
    box.appendChild(huelle);
  };
  filter.oninput = zeichnen2;
  kopfSetzen();
  zeichnen2();
}

function personUmbenennen(i, neu) {
  if (!neu) return melden('db-meldung', 'Der Name darf nicht leer sein.', true);
  if (db.names.some((n, k) => k !== i && n === neu))
    return melden('db-meldung', 'Diesen Namen gibt es schon.', true);
  const alt = db.names[i];
  if (alt === neu) return;
  db.names[i] = neu;
  speichern();
  personDetail(i);
  melden('db-meldung', `„${alt}“ heißt jetzt „${neu}“.`);
}

function personLoeschen(i) {
  const name = db.names[i];
  if (db.neu <= 1) return melden('db-meldung', 'Die letzte Person lässt sich nicht löschen.', true);
  if (!confirm(`„${name}“ mitsamt allen Assoziationen löschen?` +
               (spiel ? '\n\nDas laufende Spiel wird dabei verworfen.' : ''))) return;
  db.personLoeschen(i);
  spielVerwerfen();
  speichern();
  listeZeigen('person');
  dbZeichnen();
  melden('db-meldung', `„${name}“ wurde gelöscht.`);
}

/* ---- Eigenschaft ------------------------------------------------- */

function eigDetail(x) {
  const d = $('eig-detail');
  d.innerHTML = '';
  dbReiter('eigenschaften');
  detailZeigen('eig');

  detailKopf(d, db.eig[x],
    () => { listeZeigen('eig'); eigenschaftenZeichnen(); },
    (neu) => eigUmbenennen(x, neu),
    () => eigLoeschen(x));

  d.appendChild(el('p', 'klein', `Eigenschaft Nr. ${x}`));
  d.appendChild(el('h2', null, 'Die 20 stärksten Assoziationen'));
  const r = db.eigRangliste(x);
  const ul = el('ul', 'rangliste');
  r.top.forEach((t, i) => {
    const li = el('li');
    li.appendChild(el('span', null, (i + 1) + '.'));
    const a = el('span', 'verweis', t.name);
    a.onclick = () => personDetail(t.idx);
    li.appendChild(a);
    li.appendChild(el('span', 'wert', String(t.wert)));
    ul.appendChild(li);
  });
  const li = el('li', 'letzter');
  li.appendChild(el('span', null, '…'));
  const a = el('span', 'verweis', 'and last but not least: ' + r.letzter.name);
  a.onclick = () => personDetail(r.letzter.idx);
  li.appendChild(a);
  li.appendChild(el('span', 'wert', String(r.letzter.wert)));
  ul.appendChild(li);
  d.appendChild(ul);
}

function eigUmbenennen(x, neu) {
  if (!neu) return melden('db-meldung', 'Die Eigenschaft darf nicht leer sein.', true);
  if (db.eig.some((e, k) => k !== x && e === neu))
    return melden('db-meldung', 'Diese Eigenschaft gibt es schon.', true);
  const alt = db.eig[x];
  if (alt === neu) return;
  db.eig[x] = neu;
  speichern();
  eigDetail(x);
  melden('db-meldung', `„${alt}“ heißt jetzt „${neu}“.`);
}

function eigLoeschen(x) {
  const name = db.eig[x];
  if (db.eig.length <= 9)
    return melden('db-meldung', 'Für eine Frage braucht es neun Eigenschaften – ' +
                                'weniger geht nicht.', true);
  if (!confirm(`„${name}“ löschen? Die Bewertungen aller ${db.neu} Personen zu dieser ` +
               `Eigenschaft gehen verloren.` +
               (spiel ? '\n\nDas laufende Spiel wird dabei verworfen.' : ''))) return;
  db.eigLoeschen(x);
  spielVerwerfen();
  speichern();
  listeZeigen('eig');
  dbZeichnen();
  melden('db-meldung', `„${name}“ wurde gelöscht.`);
}

$('btn-eig-neu').onclick = () => {
  const name = $('eig-neu-name').value.trim();
  if (!name) return melden('db-meldung', 'Bitte gib einen Namen ein.', true);
  if (db.eig.includes(name)) return melden('db-meldung', 'Diese Eigenschaft gibt es schon.', true);
  const x = db.eigHinzufuegen(name);
  speichern();
  $('eig-neu-name').value = '';
  dbZeichnen();
  eigDetail(x);
  melden('db-meldung', `„${name}“ hinzugefügt – bei allen ${db.neu} Personen auf 0.`);
};

/* ------------------------------------------------------------------ */
/* Daten: Export / Import / Zuruecksetzen                              */
/* ------------------------------------------------------------------ */

function melden(id, text, fehler) {
  const p = $(id);
  p.textContent = text;
  p.hidden = false;
  p.classList.toggle('fehler', !!fehler);
}

$('btn-export').onclick = () => {
  const blob = new Blob([JSON.stringify(db.toJSON(), null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a');
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  a.href = url;
  a.download = `persuch-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-` +
               `${p2(d.getHours())}${p2(d.getMinutes())}.json`;
  a.click();
  URL.revokeObjectURL(url);
  melden('daten-meldung', 'Datei ' + a.download + ' wurde erzeugt.');
};

$('btn-import').onclick = () => $('datei').click();
$('btn-ladefehler-import').onclick = () => $('datei').click();

$('datei').onchange = (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  const leser = new FileReader();
  leser.onload = () => {
    try {
      const obj = Db.validate(JSON.parse(leser.result));
      db = new Db(obj);
      globals = neueGlobals();
      spiel = null;
      speichern();
      zeigeStart();
      dbZeichnen();
      melden('daten-meldung', `Übernommen: ${db.neu} Personen, ${db.eig.length} Eigenschaften.`);
    } catch (e) {
      melden('daten-meldung', 'Import fehlgeschlagen: ' + e.message, true);
    }
  };
  leser.readAsText(f);
  ev.target.value = '';
};

$('btn-reset').onclick = async () => {
  if (!confirm('Wirklich alles Gelernte verwerfen und den Ausgangsstand herstellen?')) return;
  let obj;
  try {
    standardCache = null;                 // frisch holen, data.json kann ersetzt worden sein
    obj = await standardDaten();
  } catch (e) {
    melden('daten-meldung', 'Zurücksetzen fehlgeschlagen: ' + e.message, true);
    return;
  }
  db = new Db(obj);
  globals = neueGlobals();
  spiel = null;
  speichern();
  zeigeStart();
  dbZeichnen();
  melden('daten-meldung', `Auf den Ausgangsstand zurückgesetzt: ${db.neu} Personen.`);
};

/* ------------------------------------------------------------------ */

(async function starten() {
  try {
    db = new Db(await datenLaden());
  } catch (e) {
    ladefehlerAnzeigen(e);
    return;
  }
  zeigeStart();
  speicherInfo();
}());
