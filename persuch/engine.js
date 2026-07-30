'use strict';
/*
 * Persuch – Portierung von PERSONEN.BAS (Atari GFA-BASIC) nach JavaScript.
 *
 * Die Logik ist zeilennah uebernommen; Zeilennummern in Kommentaren beziehen
 * sich auf PERSONEN.BAS. Auch offensichtliche Eigenheiten des Originals
 * (immer wahre Teilbedingungen, vor der Zuweisung gelesene Variablen,
 * ueber Runden hinweg lebende Zustaende) sind absichtlich erhalten.
 *
 * PERSONEN.BAS bricht nach 2416 Zeilen mitten in "Procedure Titel" ab. Der
 * fehlende Rest – Ende von Titel samt "Tend:", Procedure Resultat, Procedure
 * Kons mit ihren 18 Buchstabenprozeduren sowie Uw/Umdreh – stammt aus
 * SAUVAGE.LST (Zeilen 2356-3149). Die beiden Programme sind in den geteilten
 * Bereichen zeichengleich (PERSONEN.BAS 491-2416 == SAUVAGE.LST 429-2355,
 * bis auf ein zusaetzliches "Gosub Sauvage" in SAUVAGE.LST Zeile 1364).
 * SAUVAGE-spezifisches (Hitparaden-Menue, anderer Schlussteil, Sauvage/Ort)
 * ist hier bewusst nicht uebernommen.
 */

/* ------------------------------------------------------------------ */
/* GFA-BASIC-Hilfen                                                    */
/* ------------------------------------------------------------------ */

const Rnd = () => Math.random();
const Int = Math.floor;

/** Asc(Mid$(s, pos)) – 1-basiert, leerer String ergibt 0. */
function ascAt(s, pos) {
  const c = s.charCodeAt(pos - 1);
  return c >= 0 ? c : 0;
}
/** Mid$(s, pos, 1) – 1-basiert, ausserhalb ergibt "". */
function mid1(s, pos) {
  return pos >= 1 && pos <= s.length ? s.charAt(pos - 1) : '';
}
const chr = String.fromCharCode;

/** Zeichen an 1-basierter Position ersetzen (wie Left$+Chr$+Mid$). */
function pokeChar(s, pos, code) {
  return s.slice(0, pos - 1) + chr(code) + s.slice(pos);
}

const MAX_PERSONEN = 600;
const RUNDEN = 20;
/** Fuer eine Frage braucht es neun Eigenschaften. */
const MIN_EIG = 9;
/** Bewertung = Zeichencode - 85; der Code muss zwischen 60 und 123 bleiben. */
const BEW_BASIS = 85, BEW_MIN = 60, BEW_MAX = 123;
const NEUE_PERSON_CODE = 86;   // "V" wie in den Zeilen 355/356
const NEUE_EIG_CODE = BEW_BASIS;  // neue Eigenschaft: ueberall 0

const bewCode = (wert) =>
  Math.min(BEW_MAX, Math.max(BEW_MIN, Math.round(wert) + BEW_BASIS));

/* ------------------------------------------------------------------ */
/* Datenbank                                                           */
/* ------------------------------------------------------------------ */

class Db {
  constructor(obj) {
    this.names = obj.names.slice();
    this.eig = obj.eig.slice();
    // Bewertungen auf genau eine Stelle je Eigenschaft bringen. Einige
    // Eintraege in CHARA.DAT hatten ein ueberzaehliges Zeichen am Ende,
    // das nie gelesen wurde; Einfuegen und Loeschen wird dadurch eindeutig.
    const n = this.eig.length;
    this.bew = obj.bew.map((b) => (b.length === n ? b : b.slice(0, n).padEnd(n, chr(NEUE_EIG_CODE))));
  }
  /** Neu: Index des ersten freien Platzes = Anzahl bekannter Personen. */
  get neu() { return this.names.length; }

  toJSON() {
    return { format: 'persuch-1', names: this.names, bew: this.bew, eig: this.eig };
  }

  static validate(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Kein Objekt.');
    const { names, bew, eig } = obj;
    if (!Array.isArray(names) || !Array.isArray(bew) || !Array.isArray(eig))
      throw new Error('names/bew/eig muessen Listen sein.');
    if (names.length !== bew.length)
      throw new Error(`names (${names.length}) und bew (${bew.length}) sind unterschiedlich lang.`);
    if (names.length > MAX_PERSONEN)
      throw new Error(`Hoechstens ${MAX_PERSONEN} Personen erlaubt (${names.length} gefunden).`);
    if (eig.length < MIN_EIG)
      throw new Error(`Es braucht mindestens ${MIN_EIG} Eigenschaften (${eig.length} gefunden).`);
    names.forEach((n, i) => {
      if (typeof n !== 'string' || n === '') throw new Error(`Name ${i} ist leer.`);
      if (typeof bew[i] !== 'string' || bew[i].length < eig.length)
        throw new Error(`Bewertung ${i} ("${n}") ist kuerzer als ${eig.length} Zeichen.`);
    });
    eig.forEach((e, i) => {
      if (typeof e !== 'string' || e === '') throw new Error(`Eigenschaft ${i} ist leer.`);
    });
    return obj;
  }

  /* --- Bearbeiten ------------------------------------------------- */

  /** Bewertung von Person i zu Eigenschaft k; Rueckgabe der Anzeigewert. */
  bewWert(i, k) { return this.bew[i].charCodeAt(k) - BEW_BASIS; }

  bewSetzen(i, k, wert) {
    const code = bewCode(wert);
    this.bew[i] = pokeChar(this.bew[i], k + 1, code);
    return code - BEW_BASIS;
  }

  personLoeschen(i) { this.names.splice(i, 1); this.bew.splice(i, 1); }

  personHinzufuegen(name) {
    this.names.push(name);
    this.bew.push(chr(NEUE_PERSON_CODE).repeat(this.eig.length));
    return this.names.length - 1;
  }

  eigLoeschen(k) {
    this.eig.splice(k, 1);
    this.bew = this.bew.map((b) => b.slice(0, k) + b.slice(k + 1));
  }

  /** Neue Eigenschaft ans Ende; alle Bewertungen starten auf 0. */
  eigHinzufuegen(name) {
    this.eig.push(name);
    this.bew = this.bew.map((b) => b + chr(NEUE_EIG_CODE));
    return this.eig.length - 1;
  }

  /* --- Procedure Minimax (Zeilen 503-517) ------------------------- */
  minimax(x) {
    let hermi = 120, herma = 0, miza = 0, maza = 0;
    const b = this.bew[x];
    for (let ma = 1; ma <= this.eig.length; ma++) {
      const hil = ascAt(b, ma);
      if (hil < hermi) { hermi = hil; miza = ma - 1; }
      if (hil > herma) { herma = hil; maza = ma - 1; }
    }
    return { maza, miza, max: herma - 85, min: hermi - 85 };
  }

  /* --- Bestenliste zu einer Eigenschaft (Zeilen 42-77) ------------- */
  eigRangliste(x) {
    let mineig = 200, ursk = 0, urskz = 0;
    const hilf = [];
    const top = [];
    for (let z2 = 0; z2 < 20; z2++) {
      let maxeig = 0, ursg = 0, ursgz = 0;
      for (let y = 0; y < this.neu; y++) {
        const z = ascAt(this.bew[y], x + 1);
        if (z <= mineig && z > 10) { mineig = z; ursk = y; urskz = z - 85; }
        if (z > maxeig) {
          let schonda = 0;
          if (z2 > 0) {
            for (let z3 = 0; z3 <= z2; z3++) if (y === hilf[z3]) schonda = 1;
          }
          if (schonda === 0) { maxeig = z; ursg = y; ursgz = z - 85; }
        }
      }
      top.push({ idx: ursg, name: this.names[ursg], wert: ursgz });
      hilf[z2] = ursg;
    }
    return { top, letzter: { idx: ursk, name: this.names[ursk], wert: urskz } };
  }
}

/* ------------------------------------------------------------------ */
/* Namens-Verfremder ("Ich sage nur: ...")                             */
/* ------------------------------------------------------------------ */

const VOKALE = 'AaEeIiOoUuYyüäöÜÖÄ';
const isVokal = (m) => m.length === 1 && VOKALE.includes(m);

/** M$ ist eines der Zeichen in `menge` (M$ ist an dieser Stelle einstellig). */
const einesVon = (m, menge) => m.length === 1 && menge.includes(m);

/** Zaehlt die Buchstaben eines Namens (Zeilen 560-692). */
function zaehleBuchstaben(name) {
  const c = {
    A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0, I: 0, J: 0, K: 0, L: 0, M: 0,
    N: 0, O: 0, P: 0, Q: 0, R: 0, S: 0, T: 0, U: 0, V: 0, W: 0, Xt: 0, Yt: 0, Z: 0,
    Ch: 0, Sch: 0, Ck: 0,
  };
  for (const ch of name) {
    switch (ch) {
      case 'X': case 'x': c.Xt++; break;
      case 'q': case 'Q': c.Q++; break;
      case 'ä': case 'Ä': c.A++; c.E++; break;
      // Zeile 603 prueft zweimal "ü" – "Ü" zaehlt im Original nicht mit.
      case 'ü': c.U++; c.E++; break;
      case 'ö': case 'Ö': c.E++; c.O++; break;
      case 'Y': case 'y': c.Yt++; break;
      case 'J': case 'j': c.J++; break;
      case 'o': case 'O': c.O++; break;
      case 'm': case 'M': c.M++; break;
      case 'd': case 'D': c.D++; break;
      case 'L': case 'l': c.L++; break;
      case 'G': case 'g': c.G++; break;
      case 'i': case 'I': c.I++; break;
      case 'E': case 'e': c.E++; break;
      case 'V': case 'v': c.V++; break;
      case 'A': case 'a': c.A++; break;
      case 'U': case 'u': c.U++; break;
      case 'c': case 'C': c.C++; break;
      case 'h': case 'H': c.H++; break;
      case 'k': case 'K': c.K++; break;
      case 'S': case 's': c.S++; break;
      case 'R': case 'r': c.R++; break;
      case 'f': case 'F': c.F++; break;
      case 'w': case 'W': c.W++; break;
      case 'b': case 'B': c.B++; break;
      case 'p': case 'P': c.P++; break;
      case 'z': case 'Z': c.Z++; break;
      case 't': case 'T': c.T++; break;
      case 'n': case 'N': c.N++; break;
      default: break;
    }
  }
  if (c.C > 0 && c.H > 0) { c.Ch = 1; if (c.S > 0) c.Sch = 1; }
  if (c.C > 0 && c.K > 0) c.Ck = 1;
  return c;
}

/**
 * Erzeugt aus einem Namen den verfremdeten "Spur"-Namen.
 * Zeilen 693-1418 von PERSONEN.BAS.
 * `langVorher` ist Lang aus dem vorigen Aufruf (Zeile 700 liest Lang,
 * bevor Zeile 705 es neu setzt) – im Original eine globale Variable.
 */
function spurName(name, langVorher) {
  const c = zaehleBuchstaben(name);
  const { A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W,
    Xt, Yt, Z, Ch, Sch, Ck } = c;

  let S$ = name + ' ';                                             // 693
  if (S$ === "Jeanne D'Arc ") S$ = 'Jeanne Darc';                   // 694
  if (S$ === 'Panzerknacker 176-761 ') S$ = 'Panzerknacker ';       // 697
  S$ += (Rnd() * langVorher < 12) ? '.' : '-';                      // 700
  const Lang = S$.length;                                           // 705

  let N$ = '', M$ = '', L$ = '', Vl$ = '', Last$ = '', Iz$ = '', Col$ = '';
  let Gross = 1, Konf = 0, Vocf = 0, Voc = 0, Luck = 1, Luck1 = 1, Dluck = 0;
  let Aus = 0, Lcount = 0, Scount = 0, Pcount = 0, Graf = 0, Count = 0;
  let Diphtong = 0, Diph2 = 0, Zbuch = 0, Duble = 0, Mc = 0, Versuchstelle = 0;
  let Jetzt = 0, Vluck = 1, Vlc = 0, Lastluck = 0, Dr = 0;
  let Vlschc = 0, Vlsch$ = '', Vlchc = 0, Vlch$ = '';

  /* ---- Procedure Titel (Zeilen 1466-…, Ende aus SAUVAGE.LST) ---- */
  const fnK = (x) => 1 / (x + 3);
  const fnN = (x) => 2 / (x + 7);
  const fnG = (x) => 2 / (x + 6);
  const wahrsch = (p, x) => {
    switch (p) {
      case 'K': return fnK(x);
      case 'N': return fnN(x);
      case 'G': return fnG(x);
      case 'R1': return 1 / (2 * x + 2);
      case 'G32': return 3 * fnG(x) / 2;
      case 'K43': return 4 * fnK(x) / 3;
      default: return 0;
    }
  };
  /** Tend: – wertet die Kennziffer am Titelende aus (SAUVAGE.LST 2465-2483). */
  function tend(x) {
    const Tcode$ = N$.slice(-1);
    if ('23567'.includes(Tcode$) && Tcode$ !== '') {
      S$ = S$.slice(0, Lang - 1) + '-';
      if (Tcode$ === '3' || Tcode$ === '5' || Tcode$ === '7') {
        Lcount = 1;
        // "6" steht im Original innerhalb des 3/5/7-Zweigs und greift daher nie.
        if (Tcode$ === '7' || Tcode$ === '6') Scount = 1;
        if (Tcode$ === '5' || Tcode$ === '7') Graf = 1;
      }
    }
    if (Tcode$ === '4') Dr = 1;
    N$ = N$.slice(0, x - 1);   // Titel ohne Kennziffer; Laenge = Rang - 1
    return x;
  }
  function titel(x) {
    let A$ = N$;
    for (const r of TITEL_RULES) {
      if (r.tier !== undefined) {
        if (A$ !== N$) { x = r.tier; N$ = A$; }
        continue;
      }
      if (r.end !== undefined) { if (Lang === r.end) return tend(x); continue; }
      if (r.n) continue;                    // "Xt<0"/"Sch<0" – nie erfuellt
      if (!r.v.every((k) => c[k] > 0)) continue;
      if (r.L !== undefined && !(Lang < r.L)) continue;
      if (!(Rnd() < wahrsch(r.p, x))) continue;
      A$ = r.s.length > 1 ? (Rnd() < r.p1 ? r.s[0] : r.s[1]) : r.s[0];
    }
    return tend(x);
  }

  /* ---- Procedure Kons (SAUVAGE.LST 2540-2595) mit ihren
   *      Buchstabenprozeduren B…Z sowie Uw und Umdreh (2596-3149).
   *      Sie greifen direkt auf Konf, Luck, M$, N$ zu – wie die GFA-Globals. */
  const Uw = () => { if (Rnd() < 0.22) { Konf -= 1; Luck = 0; } };
  const Umdreh = () => {
    if (Rnd() < 0.6) Konf -= 1;
    if (Rnd() < 0.7) { N$ = N$.slice(0, -1) + M$; M$ = Last$; }
    else Luck = 0;
  };
  const KONS = {
    B() {
      if ((M$ === 'l' || M$ === 'r') && Vl$ !== 'B') { Konf -= 1; Luck = 0; }
      if (Vlc > 0) {
        if (M$ === 'h') Uw();
        if (Vlc === 1) {
          if ((M$ === 't' || M$ === 's') && (Vl$ === 'A' || Rnd() < 0.3)) Konf -= 1;
          if (einesVon(M$, 'djqb')) Uw();
        }
      }
    },
    C() {
      if (Vlc === 1 || Vl$ === 'L' || Vl$ === 'N' || Vl$ === 'R') {
        if (M$ === 'k') { Konf -= 1; Luck = 1; }
      }
      if (Vlc > 0) {
        if (Vlc === 1) {
          if ((M$ === 'c' && Ch === 0) || M$ === 't') {
            Konf -= 1; if (M$ === 'c') Luck = 0;
          }
          if (M$ === 'c' && Ch > 0) Uw();
          if (M$ === 's') { const Lu = Luck; Uw(); Luck = Lu; }
        }
        if (M$ === 'l' || M$ === 'r') { Konf -= 1; Luck = 0; }
      }
    },
    D() {
      if (Vlc > 0) {
        if (M$ === 'r') { Luck = 0; Konf -= 1; }
        if (Vlc === 1) {
          if (einesVon(M$, 'dghv')) Uw();
          if (einesVon(M$, 'lmn')) Umdreh();
        }
        if (Vlc === 1 || Vl$ === 'L' || Vl$ === 'N' || Vl$ === 'R') {
          if (einesVon(M$, 'stj')) Konf -= 1;
          if (M$ === 'j') Luck = 0;
        }
      }
    },
    F() {
      if (M$ === 'l') { Luck = 0; Konf -= 1; }
      if (Vlc > 0 || Vl$ === 'H' || Vl$ === 'L' || Vl$ === 'N') {
        if (M$ === 'j' || M$ === 'r') { Luck = 0; Konf -= 1; }
      }
      if (Vlc === 1) {
        if (einesVon(M$, 'gkmbsz')) Uw();
        if (M$ === 'f' || M$ === 't') Konf -= 1;
        if (M$ === 'n') Umdreh();
      }
    },
    G() {
      if (M$ === 'l' || M$ === 'r') {
        if (Vlc > 0 || Vl$ === 'N') { Luck = 0; Konf -= 1; }
        // M$="R" kann hier nie zutreffen – Original belassen.
        if (Vl$ === 'H' || Vl$ === 'M' || M$ === 'R') Uw();
      }
      if (Vlc > 0) {
        if (M$ === 'm' || M$ === 'n') {
          if (Vlc === 2) Uw(); else { Luck = 0; Konf -= 1; }
        }
        if (Vlc === 1 || Vl$ === 'R' || Vl$ === 'L') {
          if (M$ === 'w' || M$ === 'j') { Konf -= 1; Luck = 0; }
          if (einesVon(M$, 'dgt')) Konf -= 1;
        }
        if (Vlc === 1 || Vl$ === 'R') {
          if (M$ === 'h' || M$ === 's') { const Lu = Luck; Uw(); Luck = Lu; }
        }
        if (Vlc === 1) { if (einesVon(M$, 'bvf')) Uw(); }
      }
    },
    H() {
      if (Vl$ === 'C') {
        if (N$.slice(-3) === 'Sch' || N$.slice(-3) === 'sch') {
          if (Vlschc > 0) {
            if (einesVon(M$, 'lmnrw')) { Konf -= 1; Luck = 0; }
          }
          if (Vlsch$ === 'L' || Vlsch$ === 'R' || Vlsch$ === 'N') {
            // Vl$="n" ist nie wahr (Vl$ ist gross geschrieben) – Original belassen.
            if (einesVon(M$, 'wmr') || Vl$ === 'n') Uw();
          }
        } else {
          if (Vlchc > 0) {
            if (M$ === 'l' || M$ === 'r' || ((M$ === 'm' || M$ === 'n') && Vlchc === 1)) {
              Konf -= 1; Luck = 0;
            }
            if (Vlchc === 1) {
              if (M$ === 't' || M$ === 's') Konf -= 1;
              if (einesVon(M$, 'gbvw')) Uw();
            }
          }
          if (Vlch$ === 'L' || Vlch$ === 'N' || Vlch$ === 'R') {
            if (M$ === 'x' || M$ === 't') { const Lu = Luck; Uw(); Luck = Lu; }
          }
        }
      } else if (Vlc === 1) {
        if (einesVon(M$, 'bfgkvwz')) Uw();
        if (einesVon(M$, 'jdmntlrs')) Konf -= 1;
      }
    },
    K() {
      if (Vlc > 0 || Vl$ === 'C' || Vl$ === 'N' || Vl$ === 'L' || Vl$ === 'R') {
        if (M$ === 'l' || M$ === 'r') { Luck = 0; Konf -= 1; }
      }
      if (Vlc > 0) {
        if (einesVon(M$, 'njh')) {
          const Lu = (M$ === 'h') ? Luck : 0;
          // "M$='n' And Vlc=0" ist im Vlc>0-Zweig nie wahr – Original belassen.
          if (M$ === 'n' && Vlc === 0) Umdreh();
          else { Uw(); Luck = Lu; }
        }
      }
      if (Vlc === 1 || Vl$ === 'C' || Vl$ === 'L' || Vl$ === 'N' || Vl$ === 'R') {
        if (einesVon(M$, 'mvw')) Uw();
      }
      if (Vlc === 1) {
        if (M$ === 't' || M$ === 's') Konf -= 1;
        if (einesVon(M$, 'kzx')) Uw();
      }
    },
    L() {
      if (Vlc > 0) {
        if (M$ === 'l') Konf -= 1;
        if (Vlc === 1) {
          if (einesVon(M$, 'bcdfgkmnpstvwxz')) Konf -= 1;
          if (M$ === 'h') Umdreh();
          if (M$ === 'c' && Ch === 1) Luck = 0;
          if (einesVon(M$, 'jqr')) Uw();
        }
      }
    },
    M() {
      if (Vlc === 1) {
        if (einesVon(M$, 'bcfgqvz')) Uw();
        if (M$ === 'd' || M$ === 'k' || (M$ === 'm' && Rnd() < 0.6) ||
            M$ === 'p' || M$ === 't' || M$ === 'j') Konf -= 1;
        if (M$ === 'm' && Count > 5 && Rnd() < 0.7) Luck = 0;
        if (einesVon(M$, 'hrl')) Umdreh();
        if (M$ === 'j' || M$ === 'k') Luck = 0;
      }
      if (Vlc === 1) { if (M$ === 's') Konf -= 1; }
    },
    N() {
      if (Vlc === 1 || Vl$ === 'R') { if (M$ === 't') Konf -= 1; }
      if (Vlc === 1 || Vl$ === 'R') { if (einesVon(M$, 'dsz')) Konf -= 1; }
      if (Vlc === 1) {
        if ((M$ === 'n' && Rnd() < 0.6) || einesVon(M$, 'jfgkqcx')) Konf -= 1;
        if (M$ === 'n' && Count > 4 && Rnd() < 0.7) Luck = 0;
        if (M$ === 'r' || M$ === 'h') Umdreh();
        if (M$ === 'c' && Ch > 0) Luck = 0;
        // "Rnd<Counter/10": Counter existiert im Original nicht, also stets 0.
        if (M$ === 'j' || M$ === 'q') Luck = 0;
        if (M$ === 'b' || M$ === 'l') Uw();
        if (einesVon(M$, 'mpvw')) Uw();
      }
    },
    P() {
      if (Vl$ === 'P') {
        if (M$ === 'l' || M$ === 'r') { Konf -= 1; Luck = 0; }
        return;
      }
      if (M$ === 'l') { Konf -= 1; Luck = 0; }
      if (Vlc > 0) { if (M$ === 'n') Uw(); }
      if (Vlc > 0 || Vl$ === 'R' || Vl$ === 'L' || Vl$ === 'M') {
        if (M$ === 's' || M$ === 't') {
          if (Vlc === 2) Uw(); else { Konf -= 1; Luck = 1; }
        }
      }
      if (Vlc > 0 || Vl$ === 'S' ||
          ((Vl$ === 'M' || Vl$ === 'N' || Vl$ === 'R' || Vl$ === 'L') &&
           (M$ !== 'r' || Rnd() < 0.3))) {
        if (einesVon(M$, 'fhr')) {
          Konf -= 1;
          if ((Vlc !== 1 && Vl$ !== 'L' && Vl$ !== 'M' && Vl$ !== 'R') || M$ === 'r') Luck = 0;
        }
      }
      if (Vlc === 1 || Vl$ === 'L' || Vl$ === 'M' || Vl$ === 'R') {
        if (M$ === 'j' || M$ === 'q') Uw();
        if (Vlc === 1) { if (M$ === 'p') Konf -= 1; }
      }
    },
    R() {
      if (Vlc > 0) {
        if (M$ === 'h' && Vlc === 2) Uw();
        if (Vlc === 1) {
          if (einesVon(M$, 'bcdfgklmnp') || (M$ === 'r' && Rnd() < 0.5) ||
              einesVon(M$, 'stvwxz')) Konf -= 1;
          if (M$ === 'h') Umdreh();
          if (M$ === 'c' && Ch === 1) Luck = 0;
          if (M$ === 'r') { if (Count > 5 || Rnd() < 0.6) Luck = 0; }
          if (M$ === 'j' || M$ === 'q') { Konf -= 1; Luck = 0; }
        }
      }
    },
    S() {
      if (M$ === 't') {
        if (Vlc === 0) {
          if (Vl$ === 'R' || Vl$ === 'N' || Vl$ === 'L' || Vl$ === 'P') Konf -= 1;
          else { const Lu = Luck; Uw(); Luck = Lu; }
        } else Konf -= 1;
      }
      if (Vlc > 0 || Vl$ === 'L' || Vl$ === 'M' || Vl$ === 'N' || Vl$ === 'R') {
        if (einesVon(M$, 'pkh')) {
          if ((M$ === 'h' && (Vlc === 2 || Vl$ === 'M' || Sch > 0)) ||
              (M$ === 'k' && Vlc !== 1)) { const Lu = Luck; Uw(); Luck = Lu; }
          else Konf -= 1;
        }
        if (Vlc !== 1 && Vl$ !== 'R' && Vl$ !== 'N' && Vl$ !== 'L') Luck = 0;
      }
      if (Vlc > 0) {
        if (M$ === 'q' || M$ === 'z' || (einesVon(M$, 'nlmw') && Rnd() < 0.4)) Uw();
      }
      if (Vlc > 0) {
        if (M$ === 'c') { if (Sch === 1) Uw(); else Konf -= 1; }
      }
      if (Vlc === 1 || Vl$ === 'L' || Vl$ === 'N') {
        if (einesVon(M$, 'dgj')) { Luck = 0; Konf -= 1; }
        if (M$ === 'b') Uw();
      }
      if (Vlc === 1) {
        if (M$ === 'v') Uw();
        if (M$ === 's') Konf -= 1;
        if (M$ === 'r') Umdreh();
      }
    },
    T() {
      if (Vlc > 0 || Vl$ === 'N' || Vl$ === 'R') { if (M$ === 'h') Konf -= 1; }
      if (M$ === 'r' && Vl$ !== 'P' && Vl$ !== 'W') { Konf -= 1; Luck = 0; }
      if (Vlc > 0) { if (M$ === 'w') Uw(); }
      if (Vlc === 1 || Vl$ === 'R' || Vl$ === 'N' || Vl$ === 'L') {
        if (M$ === 'z' || M$ === 's') Konf -= 1;
        if (M$ === 'm') { Konf -= 1; Luck = 0; }
        if (Vlc === 1) {
          if (einesVon(M$, 'jkqv')) Uw();
          if (((M$ === 'c' && Ch > 0) || M$ === 'l') && Rnd() < 0.75) { Konf -= 1; Luck = 0; }
          if (M$ === 't') Konf -= 1;
          if (M$ === 'n') Umdreh();
        }
      }
    },
    V() {
      if (Vlc > 0) {
        if (M$ === 'r' || M$ === 'l') {
          if (Vlc === 1) { Konf -= 1; Luck = 0; } else Uw();
        }
      }
    },
    W(X) {
      if (Vlc === 2 && Rnd() < 0.5 && X < Lang - 4) {
        if (M$ === 'r' || M$ === 'h') Uw();
      }
      if (Vlc === 1) {
        if (einesVon(M$, 'dklnst')) { Uw(); Konf -= 1; }
        if (einesVon(M$, 'bgjpqw')) Uw();
      }
    },
    X() {
      if (Vlc === 1 || Vl$ === 'R' || Vl$ === 'N') {
        if (M$ === 't') Konf -= 1;
        if (einesVon(M$, 'cfghjklpx')) Uw();
      }
    },
    Z() {
      if (Vlc > 0 || Vl$ === 'L' || Vl$ === 'R') {
        if (M$ === 'w' || M$ === 'j') Uw();
        if (Vlc !== 2) {
          if (M$ === 'm') Uw();
          if (M$ === 't') Konf -= 1;
        }
      }
      if (Vlc === 1) { if (einesVon(M$, 'znl')) Umdreh(); }
    },
  };
  /** Procedure Kons – verzweigt nach dem vorangehenden Konsonanten L$. */
  const kons = (X) => { if (KONS[L$]) KONS[L$](X); };

  /* ---- Hauptschleife (Zeile 728) -------------------------------- */
  for (let X = 1; X <= Lang - 2; X++) {
    if (X === 1 && Lang > 9) X = titel(X);                          // 729

    let sicherluck = false;

    nammach:
    for (;;) {
      Versuchstelle++;                                              // 733
      if (Versuchstelle > 120) { M$ = 'ñ'; sicherluck = true; break; }

      let nachbild = false;
      Zbuch = Int(Rnd() * Lang) + 1;                                // 738
      if (Versuchstelle > 30) {                                     // 739
        Zbuch = ((Versuchstelle + X) % Lang) + 1;
        M$ = mid1(S$, Zbuch);
        nachbild = true;
      }
      if (!nachbild) {
        M$ = mid1(S$, Zbuch);                                       // 744
        if (Duble === 1 && M$ === N$.slice(-1)) continue nammach;   // 745
        if (Lang > 7 && X < Lang - 5) {                             // 748
          if (Count > 2 * Lang / 7 && Lcount === 0 &&
              Rnd() < (Count + 1) / (Lang - 2) && Dluck === 1) M$ = ' ';
        }
        if (((Lcount + Scount === 1 && Count > 5 + Pcount) || Count > 8) &&
            Rnd() < (Count - 4) / 10 && Dluck === 1) M$ = ' ';      // 753
        const r2 = N$.slice(-2);
        if (Count > 4 && (r2 === 'io' || r2 === 'ia' || r2 === 'ya' || r2 === 'yo') &&
            Rnd() < 0.7 && X < Lang - 4) M$ = ' ';                  // 756
      }

      /* Nachbild: (759) */
      if (X > 3 && X < Lang - 5 && X > Lang - 16 && Count === 2 && Graf === 0 && Mc === 0) {
        if (mid1(N$, N$.length - 1) === 'O' && mid1(N$, N$.length - 2) !== '-' &&
            Konf > 0.5 && Rnd() < 0.3) {                            // 761
          N$ = N$.slice(0, -1) + "'" + chr(ascAt(N$.slice(-1), 1) - 32);
          Mc++; Count--; Lcount++; X++; Voc = 0; Graf++;
        }
        const R2$ = N$.slice(-2);                                   // 770
        if (['Le', 'El', 'Lo', 'La', 'Al', 'De', 'Du', 'Da', 'Of', 'Zu'].includes(R2$) &&
            Rnd() < 0.6 && Mc === 0) {                              // 771
          Graf++; Lcount++; Mc++; M$ = ' ';
          N$ = N$.slice(0, -2);
          if (N$.slice(-1) === '-') N$ = N$.slice(0, -1) + ' ';
          N$ += (R2$.charAt(0) === 'L') ? R2$ : chr(R2$.charCodeAt(0) + 32) + R2$.charAt(1);
          sicherluck = true; break;                                 // 785
        }
        if (['Di', 'Do', 'Da'].includes(R2$) && Rnd() < 0.3 && Mc === 0 &&
            mid1(N$, N$.length - 2) !== '-') {                      // 787
          N$ = N$.slice(0, -2) + "D'" + chr(ascAt(N$.slice(-1), 1) - 32);
          Mc++; Count--; Lcount++; X++; Graf++;
        }
        if (N > 0 && R2$ === 'Be' && X < Lang - 6 && Rnd() < 0.4 && Mc === 0 &&
            mid1(N$, N$.length - 2) !== '-') {                      // 795
          Mc++; N$ += 'n'; M$ = ' '; X += 2; Graf++; Lcount++;
          sicherluck = true; break;                                 // 802
        }
      }

      if (M$ === ' ') {                                             // 805
        if (Count < 3 || Gross === 1 || X > Lang - 5 || Voc === 0 || Dluck === 0 ||
            3 * (Count - 1) / Lang < Rnd() ||
            (Jetzt === 1 && N$.slice(-1) !== 'e' && N$.slice(-1) !== 'y' &&
             N$.slice(-1) !== 'a' && N$.slice(-1) !== 'o' && Count < 7 && Rnd() < 0.5) ||
            Pcount > 0) continue nammach;                           // 806
        if (Lcount > 3 || (Lcount > 1 && Count + Lang < 14 + X) ||
            X < Lang / (3 + Rnd() * 2) ||
            Lang - X + Count < 10 + Lcount + Graf) continue nammach; // 809
      }
      if (M$ === '.') {                                             // 813
        if ((Count > 1 && N$.slice(-2) !== 'St') || Mc > 0) continue nammach;
        if (X > Lang - 6 || Gross === 1 || Lcount > 1 || (X === 2 && Lang > 12) ||
            Pcount > 1) continue nammach;
        Pcount++;
      }
      if (M$ === '-') {                                             // 822
        if (Gross === 1 || X > Lang - 5 || Voc === 0 || Dluck === 0 || Count < 3 ||
            Rnd() > Count / 5 || (Vocf > 0 && Rnd() < 0.5) || Scount > 0.5)
          continue nammach;
      }
      if (Gross === 1) {                                            // 827
        if (M$ === 'ä') M$ = 'Ä';
        if (M$ === 'ö') M$ = 'Ö';
        if (M$ === 'ü') M$ = 'Ü';
      }
      if (Gross === 1 && ascAt(M$, 1) > 92 && ascAt(M$, 1) < 125) M$ = chr(ascAt(M$, 1) - 32);
      if (Gross === 0 && ascAt(M$, 1) > 64 && ascAt(M$, 1) < 92) M$ = chr(ascAt(M$, 1) + 32);
      if (N$.length > 0) {                                          // 846
        Last$ = N$.slice(-1);
        if (ascAt(Last$, 1) + 32 === ascAt(M$, 1)) continue nammach;
      }
      let Lc = (ascAt(Last$, 1) < 125 && ascAt(Last$, 1) > 92)
        ? ascAt(Last$, 1) - 32 : ascAt(Last$, 1);                   // 852
      L$ = chr(Lc);
      if (Last$ === 'ä' || Last$ === 'Ä') L$ = 'Ä';
      if (Last$ === 'Ö' || Last$ === 'ö') L$ = 'Ö';
      if (Last$ === 'Ü' || Last$ === 'ü') L$ = 'Ü';
      if (N$.length > 1) {                                          // 867
        let Vl = ascAt(mid1(N$, N$.length - 1), 1);
        // Vl$ stammt hier noch aus dem vorigen Durchgang – wie im Original.
        if (Vl > 92 && Vl < 125 && Vl$ !== 'ä' && Vl$ !== 'ö' && Vl$ !== 'ü') Vl -= 32;
        Vl$ = chr(Vl);
      }
      if (M$ === ' ' || M$ === '.' || M$ === '-') { sicherluck = true; break; } // 874

      if (isVokal(M$)) {                                            // 877
        Jetzt = 1;
        if (Count === 0 && Rnd() < 0.5) continue nammach;
        // GFA: "And" bindet staerker als "Or" – zweiter Teil gilt ohne Count=0.
        if ((Count === 0 && (M$ === 'Ä' || M$ === 'Ö' || M$ === 'Ü') && Rnd() < 0.7) ||
            ((M$ === 'Y' || M$ === 'I' || M$ === 'U' || M$ === 'E') && Rnd() < 0.4))
          continue nammach;                                         // 882
        if (M$ === L$ && Rnd() < (Count + 3) / 8 && Versuchstelle < 33) continue nammach;
        // (M$<>"y" Or M$<>"u" Or M$<>"e") ist immer wahr – Original belassen.
        if (Last$ === 'I' || Last$ === 'U' || Last$ === 'Ä' || L$ === 'Ö' ||
            Last$ === 'Ü' || Last$ === 'O' || (Last$ === 'A' && M$ === 'i'))
          continue nammach;                                         // 888
        if ((L$ === 'Ä' && M$ !== 'u') || (L$ === 'Ü' && M$ !== 'e') ||
            (Vocf > 0 && (M$ === 'ä' || M$ === 'ö' || M$ === 'ü'))) continue nammach;
        if ((M$ === 'u' && (L$ === 'A' || L$ === 'E' || L$ === 'O' || L$ === 'Ä')) ||
            ((L$ === 'E' || L$ === 'A' || L$ === 'O') && (M$ === 'i' || M$ === 'y'))) {
          if (Vocf === 1 && Diph2 === 0) Diphtong = 1;              // 895
        }
        if ((M$ === 'i' && (L$ === 'I' || L$ === 'Y')) ||
            (M$ === 'u' && (L$ === 'I' || L$ === 'U')) ||
            (M$ === 'y' && (L$ === 'Y' || L$ === 'I'))) continue nammach;
        if ((L$ === 'A' && (M$ === 'a' || M$ === 'e' || M$ === 'o')) ||
            (L$ === 'I' && M$ === 'a') || (L$ === 'O' && (M$ === 'e' || M$ === 'a')) ||
            (L$ === 'U' && (M$ === 'o' || M$ === 'i')) || (L$ === 'Y' && M$ === 'u'))
          Vocf += 0.9;                                              // 902
        if (Vocf === 0 && M$ === 'y' && Rnd() < 0.5 && Count < 3) continue nammach;
        if (L$ === 'J' && (M$ === 'y' || M$ === 'i' || (M$ === 'e' && Rnd() < 0.25)))
          continue nammach;
        if ((M$ === 'e' || M$ === 'i' || M$ === 'a') && Rnd() < 0.25 && Diphtong === 0 &&
            Diph2 === 0 && Versuchstelle < 12) continue nammach;
        if (Vl$ === 'J') {                                          // 914
          if ((Diphtong === 0 && (L$ !== 'E' || M$ !== 'a') &&
               (L$ !== 'O' || (M$ !== 'a' && M$ !== 'e')) && (L$ !== 'U' || M$ !== 'a')) ||
              (L$ === 'E' && (M$ === 'i' || M$ === 'y'))) continue nammach;
        }
        Vocf++;                                                     // 919
        if (Diphtong === 0 && ((Diph2 === 0 && Last$ !== 'i') || M$ !== 'e') &&
            ((L$ !== 'Y' && L$ !== 'I') || (M$ !== 'a' && M$ !== 'o')) &&
            (Vocf >= 3 || Rnd() > 8 / (1 + 18 * Vocf))) {
          Vocf = Math.max(Vocf - 1, 0); continue nammach;           // 921
        }
        if (M$ === 'ü' || M$ === 'ö' || M$ === 'ä' ||
            (M$ === 'u' && Diphtong === 0 && Rnd() < 0.8) ||
            (M$ === 'a' && L$ === 'A') || (M$ === 'o' && L$ === 'O') ||
            ((M$ === 'i' || M$ === 'e') && Diphtong === 0 && Rnd() < 0.3)) {
          if (X === Lang - 2) { Vocf = Math.max(Vocf - 1, 0); continue nammach; }
          Vluck = 0;
        } else Vluck = 1;
        if (Diphtong === 1) { Diph2 = 1; Diphtong = 0; } else Diph2 = 0;
      } else {                                                      // 939
        Jetzt = 2;
        Luck1 = Luck;
        if (X === Lang - 3 && Count === 1 && Konf > 0) continue nammach;
        if (Vocf > 0) {                                             // 945
          if (('bwfljsndmzc'.includes(M$) && M$.length === 1 && Rnd() < 0.2) ||
              ((M$ === 'h' || M$ === 'k') && Rnd() < 0.38)) continue nammach;
        }
        if (Count === 0 && (M$ === 'R' || M$ === 'N' || M$ === 'X' ||
            (M$ === 'L' && X === 1)) && Rnd() < 0.4) {              // 950
          if (J > 0 && Rnd() < 0.4) M$ = 'J';
          else if (W > 0 && Rnd() < 0.4) M$ = 'W';
          else if (F > 0 && Rnd() < 0.35) M$ = 'F';
          else if (B > 0 && Rnd() < 0.4) M$ = 'B';
          else if (D > 0 && Rnd() < 0.5) M$ = 'D';
          else if (M > 0 && Rnd() < 0.5) M$ = 'M';
          else if (Z > 0 && Rnd() < 0.6) M$ = 'Z';
          else if (H > 0 && Rnd() < 0.5) M$ = 'H';
          else continue nammach;
        }
        if (L$ === 'J' || L$ === 'Q' || (L$ === 'U' && Vl$ === 'Q')) {
          Vocf = 0; continue nammach;                               // 985
        }
        if (L$ === 'Y') {                                           // 989
          if ('bfhjmnqwz'.includes(M$) && M$.length === 1) continue nammach;
          if (((M$ === 'd' || M$ === 'g' || M$ === 'c') && Rnd() < 0.5) || Rnd() < 0.2)
            continue nammach;
        }
        if (Vl$ === 'J' && M$ === 'j') continue nammach;
        if ('AEIOUYäüöÄÖÜ'.includes(Vl$)) Vlc = 1;                   // 1001
        else if (Vl$ === ' ' || Vl$ === '.' || Vl$ === '-' || N$.length < 2) Vlc = 2;
        else Vlc = 0;
        if (M$ === 'j' || M$ === 'q' || (L$ === 'I' && M$ === 'h') ||
            (M$ === 'c' && (Ck === 1 || Ch === 1) && Rnd() < 0.8)) {
          Luck1 = Luck; Luck = 0;                                   // 1010
        }
        if ((M$ === 'l' || (M$ === 'r' && (L$ !== 'E' || Count < 4))) && Konf === 0 &&
            Rnd() < 0.3) continue nammach;                          // 1014
        if (ascAt(M$, 1) < 125 && ascAt(M$, 1) > 64) {              // 1017
          kons(X);                                                  // Gosub Kons
          Konf++;
        } else { Konf = 0; Jetzt = 0; }
        if (Konf > 1.5) { Konf -= 1; Luck = Luck1; continue nammach; } // 1024
        if (Vocf > 0 && M$ === 'b' && L$ !== 'O' && Diph2 === 0 && L$ !== 'A') Luck = 0;
        if (Vocf > 0 && M$ === 'h' && L$ !== 'A') Luck = 0;
        if (H > 0 && M$ === 'p' && X < Lang - 3 && Lcount < Lang / 10 &&
            (Vlc === 1 || Vl$ === 'L') && Rnd() < 0.25) {           // 1035
          M$ += 'h'; if (Count > 1) Count++; Luck = 1; X += 1;
        }
        if (Sch === 1 && X < Lang - 3 &&
            ((Rnd() < 0.35 * (C + 3) / (S + 3) && M$ === 's' && L$ !== 'S' &&
              L$ !== 'H' && L$ !== 'C') ||
             (M$ === 'S' && Rnd() < 0.45 * (C + 3) / (S + 3) && X < Lang - 5))) {
          Vlschc = 0; Vlsch$ = L$;                                  // 1044
          if (M$ === 'S') Vlschc = 2;
          if (Vocf > 0) Vlschc = 1;
          Luck = 1; M$ += 'ch';                                     // 1043
          if (Count > 3) Count++;
          if (Count !== 0) Count++;
          X += 2;
        }
        if (M$ === 'C' || M$ === 'c') {                             // 1063
          if (Sch === 1 && L$ !== 'S' && Rnd() < 0.4 * (S + 3) / (C + 3)) {
            if (Vocf > 0 || Count === 0) Konf = 0;
            Luck = Luck1; continue nammach;
          }
          if (Ck === 1 && (L$ === 'N' || L$ === 'R' || Vocf > 0) && X < Lang - 2 &&
              Rnd() < 0.38 * (K + 3) / (C + 3)) {
            M$ += 'k'; Luck = 1; if (Count > 1) Count++; X += 1;
          }
          if (Ch === 1 && X < Lang - 2 &&
              (Count === 0 || L$ === 'S' || L$ === 'R' || L$ === 'N' || L$ === 'M' ||
               L$ === 'L' || L$ === 'T' || Vocf > 0) &&
              Rnd() < 0.56 * (H + 3) / (C + 3) && M$ !== 'ck') {
            Vlchc = 0; Vlch$ = L$;                                  // 1080
            if (M$ === 'C') Vlchc = 2;
            if (Vocf > 0) Vlchc = 1;
            Luck = 1; M$ += 'h'; if (Count > 3) Count++; X += 1;
          }
        }
        if (((M$ === 'k' && L$ !== 'C') || M$ === 'K') && Ck === 1) {
          if (Rnd() < 0.3 * (C + 3) / (K + 3)) {                    // 1097
            if (Vocf > 0 || Count === 0) Konf = 0;
            Luck = Luck1; continue nammach;
          }
        }
        if (((M$ === 'h' && L$ !== 'C') || M$ === 'H') && Ch === 1) {
          if (Rnd() < 0.5 * (C + S + P / 2 + 3) / (H + 3)) {        // 1106
            if (Vocf > 0 || Count === 0) Konf = 0;
            Luck = Luck1; continue nammach;
          }
        }
        if (M$ === 'M' && C > 0 && X > 1 && X < Lang - 6 && Mc === 0) { // 1114
          if (A > 0 && X < Lang - 7 && Rnd() < 0.3) { M$ = 'Mac'; X += 2; Mc++; }
          else { M$ = 'Mc'; X += 1; Mc++; }
          sicherluck = true; break;
        }
        if (T > 0 && X < Lang - 2 && Rnd() < 0.23 * (T + 3) / (S + 3) &&
            (M$ === 'S' || (M$ === 's' && (Vocf > 0 || L$ === 'L' || L$ === 'N' || L$ === 'R')))) {
          M$ += 't'; if (Count > 1) Count++; X += 1;                // 1127
        }
        if (S > 0 && Rnd() < 0.2 * (S + 3) / (T + 3) && (M$ === 't' || M$ === 'T') &&
            L$ !== 'S') {
          if (Vocf > 0 || Count === 0) Konf = 0;
          Luck = 1; continue nammach;                               // 1134
        }
        if (Z > 0 && X < Lang - 2 && Rnd() < 0.35 * (Z + 3) / (T + 3) && M$ === 't' &&
            (Vocf > 0 || L$ === 'L' || L$ === 'R' || L$ === 'N')) {
          M$ += 'z'; if (Count > 1) Count++; Luck = 1; X += 1;      // 1141
        }
        if (T > 0 && Rnd() < 0.3 * (T + 3) / (Z + 3) && M$ === 'z' && L$ !== 'T') {
          if (Vocf > 0 || Count === 0) Konf = 0;
          Luck = Luck1; continue nammach;                           // 1149
        }
        if (X === Lang - 2 && Luck === 0) {                         // 1156
          if (Vocf > 0) Konf = 0;
          Luck = Luck1; continue nammach;
        }
      }
      break;   // regulaeres Ende des Nammach-Blocks
    }

    /* Sicherluck: (1165) */
    if (sicherluck || M$ === ' ' || M$ === '-' || M$ === '.') {
      if (M$ === ' ') {
        if (N > 0 && V > 0 && (A > 0 || O > 0) && X > Lang - 20 && X < Lang - 9 &&
            Mc === 0 && Graf === 0) {                               // 1167
          if (A > 0 && Rnd() < 0.5 && X > Lang - 16) {
            N$ += ' van'; X += 4; Lcount++; Graf++;
          }
          if (X < Lang - 12 && Rnd() < (Lang - X - 12 + I) / 16 && O > 0) {
            Iz$ = '';
            if (Rnd() < 0.12) { Iz$ = 'X'; if (Rnd() < 0.2) Iz$ = 'XX'; }
            if (Rnd() < 0.5 || (I === 0 && Iz$ === '')) Iz$ += 'V';
            if (Rnd() < I / 9) Iz$ += 'III.';
            else if (Rnd() < I / 6.5) Iz$ += 'II.';
            else if (Rnd() < I / 3.6 || Iz$ === '') Iz$ += 'I.';
            else Iz$ += '.';
            if (Iz$.slice(-3) === 'XI.' && Rnd() < 0.5) Iz$ = Iz$.slice(0, -3) + 'IX.';
            if (Iz$.slice(-3) === 'VI.' && Rnd() < 0.5) Iz$ = Iz$.slice(0, -3) + 'IV.';
            N$ += ' ' + Iz$ + ' von'; X += 8; Aus++; Lcount++; Graf++;
          }
          if (O > 0 && Rnd() < 0.5 && X > Lang - 16 && Graf === 0) {
            N$ += ' von'; X += 4; Lcount++; Graf++;
          }
        }
        if ((X > Lang / 2 || Pcount > 0) && X > Lang - 18 && X < Lang - 11 && Graf === 0) {
          if (D > 0 && A > 0 && L > 0 && E > 0 && Rnd() < Lang / 120) {
            N$ += ' della'; X += 6; Graf++; Lcount++;
          }
        }
        if ((X > Lang / 2 || Pcount > 0) && X > Lang - 15 && X < Lang - 8 && Graf === 0) {
          Lcount++; Graf++;                                         // 1230
          if (D > 0 && E > 0 && Rnd() < Lang / 100) { N$ += ' de'; X += 3; }
          else if (D > 0 && A > 0 && Rnd() < Lang / 120) { N$ += ' da'; X += 3; }
          else if (Z > 0 && U > 0 && Rnd() < Lang / 100) { N$ += ' zu'; X += 3; Aus++; }
          else if (I > 0 && N > 0 && Rnd() < Lang / 100) { N$ += ' in'; X += 3; Aus++; }
          else if (O > 0 && F > 0 && Rnd() < Lang / 100) { N$ += ' of'; X += 3; }
          else { Lcount--; Graf--; }
        }
        if (A > 0 && U > 0 && S > 0 && Rnd() < Lang / 75 && X > Lang / 2 &&
            X > Lang - 16 && Graf === 0 && X < Lang - 9) {
          N$ += ' aus'; X += 4; Aus++; Graf++; Lcount++;             // 1262
        }
        Lcount++;
        Lastluck = X;
      }
      if (M$ === '-') Scount++;
      Jetzt = 0; Gross = 1; Voc = 0; Vocf = 0; Konf = 0; Dluck = 1; Vluck = 1;
      Count = 0; Luck = 1; Diphtong = 0; Duble = 0;
    } else {
      Gross = 0;
    }

    if (Jetzt === 2) { Vocf = 0; Count++; Dluck = Luck; Vluck = 1; Diphtong = 0; }
    if (Jetzt === 1) { Konf = 0; Dluck = Vluck; Luck = 1; Voc = 1; Count++; }
    if (M$ === 'Q' || M$ === 'q') {                                 // 1303
      M$ += 'u'; if (Count > 2) Count++; Dluck = 0; if (X < Lang - 3) X += 1;
    }
    if (M$ === Last$) Duble = 1;
    N$ += M$;
    Versuchstelle = 0;
    if (X > Lang - 5) {                                             // 1318
      if (M$ === 'e' && R > 0 && Rnd() < 0.25 && Count > 3) { N$ += 'r'; X = Lang - 2; }
      if (X === Lang - 3) {
        if (L$ === 'E' && M$ === 'r' && Count > 3 && Rnd() < 0.7) X += 1;
      }
    }
    if (Aus === 0) {                                                // 1329
      if (((M$ === 'J' && Count === 1 && L$ === ' ' && (Lcount + Pcount > 0)) ||
           (M$ === 'j' && Voc === 1 && Count > 4)) && Rnd() < 0.3) {
        if (R > 0) {
          Col$ = (M$ === 'J') ? '' : ' ';
          N$ = N$.slice(0, -1) + Col$ + 'jr.'; X = Lang - 2;
        }
      }
      if (X > Lang - 6 && Lang > 7) {                               // 1341
        if ((M$ === 'K' && L$ === ' ') || (M$ === 'k' && Count > 4)) {
          if (A > 0 && H > 0 && N > 0 && Rnd() < 0.4 && Graf === 0) {
            Col$ = (L$ === ' ') ? '' : ' ';
            N$ = N$.slice(0, -1) + Col$ + 'Khan'; X = Lang - 2;
          }
        }
        if ((M$ === 'C' && L$ === ' ') || (M$ === 'c' && Count > 4)) {
          if (O > 0 && Rnd() < 0.6) {
            Col$ = (L$ === ' ') ? '' : ' ';
            N$ = N$.slice(0, -1) + Col$ + '& Co.'; X = Lang - 2;
          }
        }
        if (((M$ === 'S' && Count === 1 && L$ === ' ') ||
             (M$ === 's' && Count > 5 && Voc === 1)) && Rnd() < 0.25) {
          if ((N > 0 || L > 0) && E > 0) {
            Col$ = (L$ === ' ') ? '' : ' ';
            N$ = N$.slice(0, -1) + Col$ + ((N > 0 && Rnd() < 0.7) ? 'sen.' : 'sel.');
            X = Lang - 2;
          }
        }
        if (((M$ === 'X' || M$ === 'V' || M$ === 'I') && Lcount > 0 && Rnd() < 0.8) ||
            (((M$ === 'v' || M$ === 'x') || (M$ === 'i' && Vocf > 1)) && Voc === 1 &&
             Count > 4 && I > 0 && Rnd() < Lang / 35)) {            // 1379
          if (M$ === 'v' || M$ === 'x' || M$ === 'i')
            N$ = N$.slice(0, -1) + ' ' + chr(ascAt(M$, 1) - 32);
          let Maia = (M$ === 'I' || M$ === 'i') ? 1 : 0;
          for (let dyn = 0; dyn <= I; dyn++) {
            if (Rnd() < 0.8) { Maia++; if (Maia < 3.5) N$ += 'I'; }
          }
          N$ += '.'; X = Lang - 2;
        }
        if (((M$ === 'F' && Count === 1 && (Lcount + Pcount) > 0) ||
             (M$ === 'f' && Count > 4 && Voc === 1)) && M > 0 && H > 0) {
          if (Rnd() < 0.25 || Dr > 0) {                             // Dr wird in Tend gesetzt
            Col$ = (M$ === 'f') ? ' ' : '';
            N$ = N$.slice(0, -1) + Col$ + 'FMH'; X = Lang - 2;
          }
        }
      }
    }
  }

  if ((L$ === 'Y' && M$ !== 'a' && M$ !== 'o') && Rnd() < 0.7) N$ = N$.slice(0, -1);
  if (Lcount > 1 && Graf === 0 && Scount === 0 && Lastluck >= 1 && Lastluck <= N$.length) {
    N$ = N$.slice(0, Lastluck - 1) + '-' + N$.slice(Lastluck);      // 1417
  }
  return { name: punktAbstand(N$), lang: Lang };
}

/**
 * Setzt hinter jeden Abkuerzungspunkt, dem direkt ein Zeichen folgt, ein
 * schmales geschuetztes Leerzeichen (U+202F) – "Cand. med. Macan" statt
 * "Cand.med.Macan". Auf dem Atari war das nicht darstellbar, deshalb steht
 * es nicht im Original.
 */
const SCHMALES_LEERZEICHEN = ' ';
const punktAbstand = (s) => s.replace(/\.(?=[^\s.])/g, '.' + SCHMALES_LEERZEICHEN);

/* ------------------------------------------------------------------ */
/* Spiel                                                               */
/* ------------------------------------------------------------------ */

class Game {
  /**
   * @param {Db} db
   * @param {object} global  ueber Spiele hinweg lebende GFA-Globals
   */
  constructor(db, global) {
    this.db = db;
    this.g = global;
    this.neu = db.neu;                                              // 113
    this.beh = [];                                                  // Beh()
    this.sum = new Array(this.neu).fill(0);                         // Sum()
    this.nul = [];                                                  // Nul()
    this.bx = 0;
    this.korsum = 0;                                                // 126
    this.vorzeit = 0;                                               // 127
    this.gefunden = 0;
    this.log = [];
    this.mo = 0;
    this.optionen = [];
    this.sieg = -10; this.r2 = -10; this.r3 = -10; this.r4 = -10;
    // Zeilen 141-146
    this.siegn = Int((this.neu - 1) * Rnd() / 3);
    this.r2n = Int((this.neu - 1) * Rnd() / 3) + Int((this.neu - 1) / 3);
    this.r3n = Int((this.neu - 1) * Rnd() / 3) + Int(2 * (this.neu - 1) / 3);
    this.r4n = Int((this.neu - 1) * Rnd());
    this.phase = 'frage';
    this.frageStellen();
  }

  say(text, kind) { this.log.push({ text, kind: kind || 'sys' }); }

  /* --- Fragegenerierung (Zeilen 131-214) -------------------------- */
  frageStellen() {
    const { db, bx } = this;
    const zuf = this.g.zuf;
    let D12 = 100, D13 = 100, D23 = 100, D21 = 100, D31 = 100, D32 = 100,
      D6 = 100, D7 = 100, D8 = 100;
    const bSieg = db.bew[this.siegn], bR2 = db.bew[this.r2n],
      bR3 = db.bew[this.r3n], bR4 = db.bew[this.r4n];
    const nEig = db.eig.length;
    // Zuf() lebt ueber Spiele hinweg; nach dem Loeschen von Eigenschaften
    // koennen dort Indizes stehen, die es nicht mehr gibt.
    for (let i = 0; i < 9; i++) if (zuf[i] >= nEig) zuf[i] = 0;

    for (let laue = 0; laue < nEig; laue++) {
      // Ngut: Nul() enthaelt genau die 9*Bx bereits gezeigten Eigenschaften.
      if (bx > 0 && this.nul.includes(laue)) continue;
      const Dx = bx + 2;
      const L1 = ascAt(bSieg, laue + 1) - ascAt(bR2, laue + 1);
      const L2 = ascAt(bSieg, laue + 1) - ascAt(bR3, laue + 1);
      const L3 = ascAt(bR2, laue + 1) - ascAt(bR3, laue + 1);
      if (D12 > Math.abs(Dx - L1)) { zuf[0] = laue; D12 = Math.abs(Dx - L1); continue; }
      if (D21 >= Math.abs(Dx + L1)) { D21 = Math.abs(Dx + L1); zuf[1] = laue; continue; }
      if (D13 > Math.abs(Dx - L2)) { D13 = Math.abs(Dx - L2); zuf[2] = laue; continue; }
      if (D31 >= Math.abs(Dx + L2)) { D31 = Math.abs(Dx + L2); zuf[3] = laue; continue; }
      if (D23 > Math.abs(Dx - L3)) { D23 = Math.abs(Dx - L3); zuf[4] = laue; continue; }
      if (D32 >= Math.abs(Dx + L3)) { D32 = Math.abs(Dx + L3); zuf[5] = laue; continue; }
      const Dpruf = ascAt(bR4, laue + 1);
      if (Math.abs(Dpruf - 93) < D8 ||
          (Math.abs(Dpruf - 93) === D8 && laue >= 60 && laue < 200)) {
        D8 = Math.abs(Dpruf - 93); zuf[8] = laue; continue;
      }
      if (Math.abs(Dpruf - 88) < D7 ||
          (Math.abs(Dpruf - 88) === D7 && laue >= 85 && laue < 160)) {
        D7 = Math.abs(Dpruf - 88); zuf[7] = laue; continue;
      }
      if (Math.abs(Dpruf - 83) < D6 ||
          (Math.abs(Dpruf - 83) === D6 && laue >= 100 && laue < 140)) {
        D6 = Math.abs(Dpruf - 83); zuf[6] = laue;
      }
    }

    this.mo = Int(Rnd() * 9);                                       // 210
    this.optionen = [];
    for (let zi = 0; zi < 9; zi++) {
      const eigIdx = zuf[(zi + this.mo) % 9];
      this.optionen.push({ eigIdx, text: db.eig[eigIdx] });
      this.nul[9 * bx + zi] = zuf[zi];
    }
    this.phase = 'frage';
  }

  /** Antwort: zi = 0..8 (im Original die Zahl Z-1). */
  antworten(zi) {
    if (this.phase !== 'frage') return;
    this.beh[this.bx] = this.g.zuf[(zi + this.mo) % 9] + 1;         // 223
    this.log = [];
    this.say('› ' + this.db.eig[this.beh[this.bx] - 1], 'wahl');
    this.suchen();
    if (this.phase === 'raten') return;                             // wartet auf Ja/Nein
    this.rundeAbschliessen();
  }

  rundeAbschliessen() {
    if (this.gefunden === 1 && this.vorzeit === 1) { this.phase = 'fertig'; return; }
    this.bx++;
    if (this.bx >= RUNDEN) { this.aufgeben(); return; }
    this.frageStellen();
  }

  aufgeben() {
    this.bx = RUNDEN - 1;                                           // 246
    this.say('Das war zu schwierig. Wer war\'s denn?', 'frage');
    this.phase = 'aufgeben';
  }

  /* --- Procedure Suchen (Zeilen 518-1465) ------------------------- */
  suchen() {
    const { db, bx } = this;
    let sieg = -10, r2 = -10, r3 = -10, r4 = -10;
    let siegn = this.siegn, r2n = this.r2n, r3n = this.r3n, r4n = this.r4n;

    for (let y = 0; y < this.neu; y++) {
      if (bx === 0) this.sum[y] = 0;
      this.sum[y] += ascAt(db.bew[y], this.beh[bx]);
      const s = this.sum[y];
      if (s >= r4 && s < r3) { r4 = s; r4n = y; }
      if (s >= r3 && s < r2) { r4 = r3; r4n = r3n; r3 = s; r3n = y; }
      if (s >= r2 && s < sieg) { r4 = r3; r4n = r3n; r3 = r2; r3n = r2n; r2 = s; r2n = y; }
      if (s >= sieg) {
        r4 = r3; r3 = r2; r2 = sieg; sieg = s;
        r4n = r3n; r3n = r2n; r2n = siegn; siegn = y;
      }
    }
    this.sieg = sieg; this.r2 = r2; this.r3 = r3; this.r4 = r4;
    this.siegn = siegn; this.r2n = r2n; this.r3n = r3n; this.r4n = r4n;

    const g = this.g;
    if (sieg - r2 > 1 && sieg - r2 < 22 - bx && bx < RUNDEN - 1) {   // 559
      if (siegn !== g.vern) {
        const res = spurName(db.names[siegn], g.lang);
        g.lang = res.lang;
        g.nName = res.name;
        this.say('Ich habe die Spur aufgenommen. Ich sage nur: ' + g.nName, 'spur');
        g.verdacht = 1;
        g.vdif = sieg - r2;
      }
      if (siegn === g.vern) {
        if (g.vdif2 === 1) {
          this.say('Das war wohl ein Tip auf ' + g.nName + '.');
          g.vdif2 = 0; g.vdif = sieg - r2;
          g.vern = siegn;
          return;                                                   // Goto Verend
        }
        if (sieg - r2 > g.vdif) { this.say('Mein Verdacht erhärtet sich.'); g.vdif = sieg - r2; }
        else if (sieg - r2 === g.vdif)
          this.say('Das hat mir bezüglich ' + g.nName + ' keine Klarheit gebracht.');
        else this.say('Das spricht eher gegen ' + g.nName + '. Doch ich bleibe dran.');
      }
      g.vern = siegn;
    } else {
      if (sieg - r2 < 2 && bx < RUNDEN - 1) {
        if (r2 - r3 > 2) {
          this.say(db.names[siegn].charAt(0) + '. oder ' + db.names[r2n].charAt(0) +
                   '. – das ist hier die Frage.');
          g.vdif2 = 1;
        } else if (g.verdacht === 1) {
          this.say('Ich muss auch wieder andere Möglichkeiten erwägen.');
          g.verdacht = 0; g.vern = MAX_PERSONEN;
        } else {
          this.say('Noch tappe ich im dunkeln.');
        }
      } else {
        g.verdacht = 0;
        if (sieg - r2 > 0) { this.gefunden = 1; this.resultat(); }
      }
    }
  }

  /* --- Procedure Resultat (SAUVAGE.LST 2484-2539) ----------------- */
  resultat() {
    const { bx, sieg, r2 } = this;
    if (bx < 10) {
      this.say(sieg - r2 < 28 - bx
        ? 'Man höre und staune: Ich weiss schon, wer es ist.'
        : 'Kein Zweifel – das ist sooo typisch.');
    } else if (bx < 16) {
      this.say(sieg - r2 < 10
        ? 'Ich glaube, nun weiss ich, wer es ist.'
        : 'Warum hast du das nicht gleich gesagt? Das macht die Sache sonnenklar:');
    } else {
      this.say(bx === RUNDEN - 1 && sieg - r2 < 5
        ? 'Ich bin meiner Sache nicht sicher, aber ich wage noch einen Versuch.'
        : 'Jetzt bin ich doch noch drauf gekommen: Es ist …');
    }
    this.say(this.db.names[this.siegn] + ' !', 'erfolg');           // Print + Box
    this.phase = 'raten';
    this.geraten = this.siegn;
  }

  /** Nerv2: "Gell, ich hab das toll gemacht!" (nur Phase 'raten'). */
  ratenBestaetigen(ja) {
    if (this.phase !== 'raten') return;
    if (ja) {
      this.korr(this.geraten, 2);                                   // Kor=2
      this.vorzeit = 1;
      this.phase = 'fertig';
      return;
    }
    this.korr(this.geraten, -1);                                    // Kor=-1
    this.sum[this.geraten] = -30;                                   // Sum(Siegn)=-30
    this.vorzeit = 0;
    this.rundeAbschliessen();
  }

  /* --- Procedure Korr (Zeilen 493-502) ---------------------------- */
  korr(siegn, kor) {
    const warnungen = [];
    for (let xk = 0; xk <= this.bx; xk++) {
      const pos = this.beh[xk];
      if (!pos) continue;
      const cNeu = ascAt(this.db.bew[siegn], pos) + kor;
      if (cNeu < 60 || cNeu > 123) {
        warnungen.push('Vorsicht! Bewertung von ' + this.db.names[siegn] +
                       ' in Position ' + xk + ' auf ' + cNeu + '!');
        continue;
      }
      this.db.bew[siegn] = pokeChar(this.db.bew[siegn], pos, cNeu);
    }
    warnungen.forEach((w) => this.say(w, 'warn'));
  }

  /* --- Schlussteil "Wer war's denn" (Zeilen 237-335) -------------- */
  platzVon(x) {
    let platz = 1;
    for (let pl = 0; pl < this.neu; pl++) if (this.sum[pl] > this.sum[x]) platz++;
    return platz;
  }

  /** @returns {object} Ergebnis mit .prot=true, wenn der Protest-Dialog folgt. */
  personGenannt(per) {
    const idx = this.db.names.indexOf(per);
    if (idx === -1) {
      this.say('Ich finde diese Person nicht.');
      this.phase = 'wirklichNeu';
      this.perName = per;
      return { gefunden: false };
    }
    this.say('Ja, diese Person ist mir bekannt.');
    let prot = 0;
    if (this.sieg - this.sum[idx] < 5) {                            // 252
      this.say('War knapp daneben – …');
    } else if (this.sieg - this.sum[idx] < 16 && this.sum[idx] > 1650) {
      this.say('He nun so dann; …');
    } else {
      this.say('Da hast du aber ganz komisches Zeug eingetippt.');
      this.say('Und von solchem Gesindel werde ich gefüttert und bin machtlos dagegen.');
      let protas = 120, protw = '';
      for (let pr = 0; pr < RUNDEN; pr++) {                         // 264
        const cPr = ascAt(this.db.bew[idx], this.beh[pr]);
        protas = Math.min(protas, cPr);
        if (protas === cPr) protw = this.db.eig[this.beh[pr] - 1];
      }
      this.say('Was hat denn ' + this.db.names[idx] + ' mit \'' + protw +
               '\' zu tun, bitte?!?');
      this.say('Na ja – …');
      prot = 1;
    }
    this.say('… ich hatte ' + this.db.names[idx] + ' nun auf dem ' +
             this.platzVon(idx) + '. Platz.');
    this.korr(idx, 2);
    if (prot === 1) {
      this.phase = 'protest';
      return { gefunden: true, prot: true };
    }
    this.phase = 'fertig';
    return { gefunden: true };
  }

  /* Protest-Dialog (Zeilen 290-332) */
  protestAntwort(text) {
    if (text.length <= 4) {
      this.say('So gehe auch ich ohne viel Worte drüber hinweg.');
      this.phase = 'fertig';
      return { fertig: true };
    }
    if (text.includes('Urs')) {
      this.say('Also über Urs lasse ich mir gar nichts sagen! – Ein ganz feiner Kerl ist das.');
      this.say('Und jetzt zeigst du ihm deine unflätige Bemerkung und entschuldigst dich bei ' +
               'ihm, sonst mach ich nicht mehr weiter.');
      this.phase = 'codewort';
      this.codewort = 'sorry';
      this.codeFehler = 'Geh schon und hol Urs!';
      return { code: true };
    }
    this.say('Das hab ich mir doch gedacht, dass du mir jetzt so vorbeikommst.');
    this.say('Von dir lass ich mir sowas nicht sagen, verstehst\'e!?');
    this.say('Nun – drückst du mir zum Zeichen des Friedens ein \'Pax\' rein…?');
    this.say('…sonst steige ich sofort aus.');
    this.phase = 'codewort';
    this.codewort = 'Pax';
    this.codeFehler = null;   // Original: Stop – hier: Runde beenden
    return { code: true };
  }

  codewortAntwort(text) {
    if (text === this.codewort) { this.phase = 'fertig'; return { ok: true }; }
    if (this.codeFehler) { this.say(this.codeFehler); return { ok: false }; }
    this.say('Dann steige ich jetzt aus.');
    this.phase = 'fertig';
    return { ok: true };
  }

  /* Person aufnehmen (Zeilen 352-362) */
  personAufnehmen(name) {
    if (this.db.neu >= MAX_PERSONEN) {
      this.say('Kein Platz mehr – ' + MAX_PERSONEN + ' Personen sind das Maximum.', 'warn');
      this.phase = 'fertig';
      return false;
    }
    const idx = this.db.personHinzufuegen(name);
    this.sum.push(0);
    this.neu = this.db.neu;
    this.korr(idx, 2);
    this.say('Ist gegongt.', 'erfolg');
    if (idx > 580) this.say('Achtung! Das ist die ' + (idx + 1) + 'te Person!', 'warn');
    this.phase = 'fertig';
    return true;
  }

  /* Gemeinsam suchen (Zeilen 375-393) */
  kandidaten(kath) {
    const treffer = [];
    for (let x = 0; x < this.neu; x++) {
      const nam = this.db.names[x];
      for (let la = 1; la <= nam.length - 3; la++) {
        if (kath === nam.slice(la - 1, la - 1 + kath.length)) { treffer.push(x); break; }
      }
    }
    return treffer;
  }

  kandidatBestaetigen(idx) {
    this.say('Prima.', 'erfolg');
    this.korr(idx, 2);
    this.phase = 'fertig';
  }
}

/* ------------------------------------------------------------------ */
/* Ueber Spiele hinweg lebende GFA-Globals                             */
/* ------------------------------------------------------------------ */

function neueGlobals() {
  return {
    zuf: [0, 0, 0, 0, 0, 0, 0, 0, 0],   // Dim Zuf(9)
    vern: 0, vdif: 0, vdif2: 0, verdacht: 0,
    lang: 0, nName: '',
  };
}
