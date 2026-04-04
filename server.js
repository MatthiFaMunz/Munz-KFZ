const express = require('express');
const path = require('path');
const { initDB, saveDB, getDB } = require('./database');

const app = express();
const PORT = 3010;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cache-Control für API
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// --- Helper ---
function dbAll(sql, params = []) {
  const db = getDB();
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function dbRun(sql, params = []) {
  const db = getDB();
  db.run(sql, params);
  saveDB();
}

function dbGet(sql, params = []) {
  const rows = dbAll(sql, params);
  return rows[0] || null;
}

// ===================== KUNDEN =====================

app.get('/api/kunden', (req, res) => {
  res.json(dbAll("SELECT * FROM kunden ORDER BY name"));
});

app.post('/api/kunden', (req, res) => {
  const { name, ort, telefon, notizen } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  dbRun("INSERT INTO kunden (name, ort, telefon, notizen) VALUES (?,?,?,?)", [name, ort || null, telefon || null, notizen || null]);
  const id = getDB().exec("SELECT last_insert_rowid()")[0].values[0][0];
  res.json({ ok: true, id });
});

app.put('/api/kunden/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const erlaubt = ['name', 'ort', 'telefon', 'notizen'];
  const sets = [], vals = [];
  for (const [k, v] of Object.entries(req.body)) {
    if (!erlaubt.includes(k)) continue;
    sets.push(`${k} = ?`);
    vals.push(v === '' ? null : v);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'Keine Felder' });
  vals.push(id);
  dbRun(`UPDATE kunden SET ${sets.join(', ')} WHERE id = ?`, vals);
  res.json({ ok: true });
});

app.delete('/api/kunden/:id', (req, res) => {
  dbRun("DELETE FROM kunden WHERE id = ?", [parseInt(req.params.id)]);
  res.json({ ok: true });
});

// ===================== PALETTEN-TYPEN =====================

app.get('/api/paletten-typen', (req, res) => {
  res.json(dbAll("SELECT * FROM paletten_typen ORDER BY sortierung, id"));
});

app.post('/api/paletten-typen', (req, res) => {
  const { name, laenge, breite, hoehe, max_gewicht, sortierung } = req.body;
  if (!name || !laenge || !breite) return res.status(400).json({ error: 'Name, Länge und Breite erforderlich' });
  dbRun("INSERT INTO paletten_typen (name, laenge, breite, hoehe, max_gewicht, sortierung) VALUES (?,?,?,?,?,?)",
    [name, parseInt(laenge), parseInt(breite), parseInt(hoehe) || 144, max_gewicht ? parseInt(max_gewicht) : null, parseInt(sortierung) || 0]);
  const id = getDB().exec("SELECT last_insert_rowid()")[0].values[0][0];
  res.json({ ok: true, id });
});

app.put('/api/paletten-typen/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const erlaubt = ['name', 'laenge', 'breite', 'hoehe', 'max_gewicht', 'aktiv', 'sortierung'];
  const sets = [], vals = [];
  for (const [k, v] of Object.entries(req.body)) {
    if (!erlaubt.includes(k)) continue;
    sets.push(`${k} = ?`);
    vals.push(v === '' || v === null ? null : (k === 'name' ? v : parseInt(v)));
  }
  if (sets.length === 0) return res.status(400).json({ error: 'Keine Felder' });
  vals.push(id);
  dbRun(`UPDATE paletten_typen SET ${sets.join(', ')} WHERE id = ?`, vals);
  res.json({ ok: true });
});

app.delete('/api/paletten-typen/:id', (req, res) => {
  dbRun("DELETE FROM paletten_typen WHERE id = ?", [parseInt(req.params.id)]);
  res.json({ ok: true });
});

// ===================== LKW-TYPEN =====================

app.get('/api/lkw-typen', (req, res) => {
  res.json(dbAll("SELECT * FROM lkw_typen ORDER BY sortierung, id"));
});

app.post('/api/lkw-typen', (req, res) => {
  const { name, laenge, breite, hoehe, max_gewicht, sortierung } = req.body;
  if (!name || !laenge) return res.status(400).json({ error: 'Name und Ladelänge erforderlich' });
  dbRun("INSERT INTO lkw_typen (name, laenge, breite, hoehe, max_gewicht, aktiv, sortierung) VALUES (?,?,?,?,?,1,?)",
    [name, parseInt(laenge), parseInt(breite) || 2450, parseInt(hoehe) || 2700, max_gewicht ? parseInt(max_gewicht) : null, parseInt(sortierung) || 0]);
  const id = getDB().exec("SELECT last_insert_rowid()")[0].values[0][0];
  res.json({ ok: true, id });
});

app.put('/api/lkw-typen/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const erlaubt = ['name', 'laenge', 'breite', 'hoehe', 'max_gewicht', 'aktiv', 'sortierung'];
  const sets = [], vals = [];
  for (const [k, v] of Object.entries(req.body)) {
    if (!erlaubt.includes(k)) continue;
    sets.push(`${k} = ?`);
    vals.push(v === '' || v === null ? null : (k === 'name' ? v : parseInt(v)));
  }
  if (sets.length === 0) return res.status(400).json({ error: 'Keine Felder' });
  vals.push(id);
  dbRun(`UPDATE lkw_typen SET ${sets.join(', ')} WHERE id = ?`, vals);
  res.json({ ok: true });
});

app.delete('/api/lkw-typen/:id', (req, res) => {
  dbRun("DELETE FROM lkw_typen WHERE id = ?", [parseInt(req.params.id)]);
  res.json({ ok: true });
});

// ===================== AUFTRÄGE =====================

app.get('/api/auftraege', (req, res) => {
  const { status } = req.query;
  let sql = "SELECT a.*, k.name as kunde_ref_name FROM auftraege a LEFT JOIN kunden k ON a.kunde_id = k.id";
  const params = [];
  if (status) { sql += " WHERE a.status = ?"; params.push(status); }
  sql += " ORDER BY a.abholung_datum ASC, a.erstellt DESC";
  const auftraege = dbAll(sql, params);

  // Positionen dazuladen
  for (const a of auftraege) {
    a.positionen = dbAll("SELECT p.*, pt.name as typ_name, pt.laenge, pt.breite FROM auftrag_positionen p LEFT JOIN paletten_typen pt ON p.paletten_typ_id = pt.id WHERE p.auftrag_id = ? ORDER BY p.id", [a.id]);
    a.display_name = a.kunde_ref_name || a.kunde_name || '—';
  }
  res.json(auftraege);
});

app.get('/api/auftraege/:id', (req, res) => {
  const a = dbGet("SELECT a.*, k.name as kunde_ref_name FROM auftraege a LEFT JOIN kunden k ON a.kunde_id = k.id WHERE a.id = ?", [parseInt(req.params.id)]);
  if (!a) return res.status(404).json({ error: 'Nicht gefunden' });
  a.positionen = dbAll("SELECT p.*, pt.name as typ_name, pt.laenge, pt.breite FROM auftrag_positionen p LEFT JOIN paletten_typen pt ON p.paletten_typ_id = pt.id WHERE p.auftrag_id = ? ORDER BY p.id", [a.id]);
  a.display_name = a.kunde_ref_name || a.kunde_name || '—';
  res.json(a);
});

app.post('/api/auftraege', (req, res) => {
  const { kunde_id, kunde_name, datum, abholung_datum, abholung_ort, lieferung_ort, transport_art, gefahrgut, notizen, positionen } = req.body;
  if (!datum) return res.status(400).json({ error: 'Datum erforderlich' });

  dbRun("INSERT INTO auftraege (kunde_id, kunde_name, datum, abholung_datum, abholung_ort, lieferung_ort, transport_art, gefahrgut, notizen) VALUES (?,?,?,?,?,?,?,?,?)",
    [kunde_id || null, kunde_name || null, datum, abholung_datum || null, abholung_ort || null, lieferung_ort || null, transport_art || 'inland', gefahrgut ? 1 : 0, notizen || null]);
  const auftragId = getDB().exec("SELECT last_insert_rowid()")[0].values[0][0];

  if (positionen && positionen.length) {
    for (const p of positionen) {
      dbRun("INSERT INTO auftrag_positionen (auftrag_id, paletten_typ_id, paletten_typ_name, anzahl, gewicht_kg, hoehe_mm, stapelbar, beschreibung) VALUES (?,?,?,?,?,?,?,?)",
        [auftragId, p.paletten_typ_id || null, p.paletten_typ_name || null, parseInt(p.anzahl) || 1, p.gewicht_kg ? parseFloat(p.gewicht_kg) : null, p.hoehe_mm ? parseInt(p.hoehe_mm) : null, p.stapelbar ? 1 : 0, p.beschreibung || null]);
    }
  }

  res.json({ ok: true, id: auftragId });
});

app.put('/api/auftraege/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { kunde_id, kunde_name, datum, abholung_datum, abholung_ort, lieferung_ort, transport_art, gefahrgut, lkw_typ_id, status, notizen, positionen } = req.body;

  const erlaubt = ['kunde_id', 'kunde_name', 'datum', 'abholung_datum', 'abholung_ort', 'lieferung_ort', 'transport_art', 'gefahrgut', 'lkw_typ_id', 'status', 'notizen'];
  const sets = [], vals = [];
  for (const [k, v] of Object.entries(req.body)) {
    if (!erlaubt.includes(k)) continue;
    sets.push(`${k} = ?`);
    if (k === 'gefahrgut') vals.push(v ? 1 : 0);
    else vals.push(v === '' ? null : v);
  }
  if (sets.length) {
    vals.push(id);
    dbRun(`UPDATE auftraege SET ${sets.join(', ')} WHERE id = ?`, vals);
  }

  // Positionen komplett ersetzen
  if (positionen) {
    dbRun("DELETE FROM auftrag_positionen WHERE auftrag_id = ?", [id]);
    for (const p of positionen) {
      dbRun("INSERT INTO auftrag_positionen (auftrag_id, paletten_typ_id, paletten_typ_name, anzahl, gewicht_kg, hoehe_mm, stapelbar, beschreibung) VALUES (?,?,?,?,?,?,?,?)",
        [id, p.paletten_typ_id || null, p.paletten_typ_name || null, parseInt(p.anzahl) || 1, p.gewicht_kg ? parseFloat(p.gewicht_kg) : null, p.hoehe_mm ? parseInt(p.hoehe_mm) : null, p.stapelbar ? 1 : 0, p.beschreibung || null]);
    }
  }

  res.json({ ok: true });
});

app.put('/api/auftraege/:id/status', (req, res) => {
  const { status } = req.body;
  const erlaubt = ['offen', 'geplant', 'unterwegs', 'erledigt'];
  if (!erlaubt.includes(status)) return res.status(400).json({ error: 'Ungültiger Status' });
  dbRun("UPDATE auftraege SET status = ? WHERE id = ?", [status, parseInt(req.params.id)]);
  res.json({ ok: true });
});

app.delete('/api/auftraege/:id', (req, res) => {
  const id = parseInt(req.params.id);
  dbRun("DELETE FROM auftrag_positionen WHERE auftrag_id = ?", [id]);
  dbRun("DELETE FROM auftraege WHERE id = ?", [id]);
  res.json({ ok: true });
});

// ===================== DISPOSITION =====================

app.get('/api/disposition', (req, res) => {
  const { datum } = req.query; // YYYY-MM-DD
  let sql = "SELECT a.*, k.name as kunde_ref_name FROM auftraege a LEFT JOIN kunden k ON a.kunde_id = k.id WHERE a.status IN ('offen','geplant')";
  const params = [];
  if (datum) {
    sql += " AND a.abholung_datum = ?";
    params.push(datum);
  }
  sql += " ORDER BY a.abholung_datum ASC, a.erstellt ASC";
  const auftraege = dbAll(sql, params);

  for (const a of auftraege) {
    a.positionen = dbAll("SELECT p.*, pt.name as typ_name, pt.laenge, pt.breite, pt.hoehe as typ_hoehe FROM auftrag_positionen p LEFT JOIN paletten_typen pt ON p.paletten_typ_id = pt.id WHERE p.auftrag_id = ? ORDER BY p.id", [a.id]);
    a.display_name = a.kunde_ref_name || a.kunde_name || '—';
  }

  const lkwTypen = dbAll("SELECT * FROM lkw_typen WHERE aktiv = 1 ORDER BY sortierung, laenge");

  res.json({ auftraege, lkwTypen });
});

app.post('/api/disposition/packen', (req, res) => {
  const { auftrag_ids } = req.body;
  if (!auftrag_ids || !auftrag_ids.length) return res.status(400).json({ error: 'Keine Aufträge' });

  // Alle Positionen sammeln
  const allePaletten = [];
  for (const aid of auftrag_ids) {
    const a = dbGet("SELECT * FROM auftraege WHERE id = ?", [aid]);
    if (!a) continue;
    const posis = dbAll("SELECT p.*, pt.name as typ_name, pt.laenge as pt_laenge, pt.breite as pt_breite FROM auftrag_positionen p LEFT JOIN paletten_typen pt ON p.paletten_typ_id = pt.id WHERE p.auftrag_id = ?", [aid]);
    for (const p of posis) {
      const laenge = p.pt_laenge || 1200;
      const breite = p.pt_breite || 800;
      for (let i = 0; i < (p.anzahl || 1); i++) {
        allePaletten.push({
          auftrag_id: aid,
          position_id: p.id,
          name: p.typ_name || p.paletten_typ_name || 'Palette',
          laenge,
          breite,
          gewicht: p.gewicht_kg || 0,
          stapelbar: p.stapelbar === 1,
          hoehe: p.hoehe_mm || 144
        });
      }
    }
  }

  // Sortieren: größte zuerst
  allePaletten.sort((a, b) => (b.laenge * b.breite) - (a.laenge * a.breite));

  // Einfacher Tetris: Reihen auf der Ladefläche (Breite = 2450mm)
  const LKW_BREITE = 2450;
  const reihen = [];
  const verwendet = new Array(allePaletten.length).fill(false);

  for (let i = 0; i < allePaletten.length; i++) {
    if (verwendet[i]) continue;
    verwendet[i] = true;
    const pal = allePaletten[i];

    // Palette kann längs oder quer liegen
    const reihe = { paletten: [pal], breiteVerbraucht: pal.breite, maxLaenge: pal.laenge };

    // Weitere Paletten in gleiche Reihe packen (nebeneinander in Breitenrichtung)
    for (let j = i + 1; j < allePaletten.length; j++) {
      if (verwendet[j]) continue;
      const p2 = allePaletten[j];
      if (reihe.breiteVerbraucht + p2.breite <= LKW_BREITE) {
        verwendet[j] = true;
        reihe.paletten.push(p2);
        reihe.breiteVerbraucht += p2.breite;
        reihe.maxLaenge = Math.max(reihe.maxLaenge, p2.laenge);
      }
    }

    reihe.tiefe = reihe.maxLaenge + 50; // 50mm Abstand
    reihen.push(reihe);
  }

  const gesamtLaenge = reihen.reduce((s, r) => s + r.tiefe, 0);
  const gesamtGewicht = allePaletten.reduce((s, p) => s + p.gewicht, 0);
  const gesamtAnzahl = allePaletten.length;

  // LKW-Empfehlung
  const lkwTypen = dbAll("SELECT * FROM lkw_typen WHERE aktiv = 1 ORDER BY sortierung, laenge");
  let empfehlung = null;
  for (const lkw of lkwTypen) {
    if (lkw.laenge >= gesamtLaenge) {
      const gewichtOk = !lkw.max_gewicht || !gesamtGewicht || gesamtGewicht <= lkw.max_gewicht;
      empfehlung = {
        name: lkw.name, laenge: lkw.laenge,
        auslastung: Math.round(gesamtLaenge / lkw.laenge * 100),
        max_gewicht: lkw.max_gewicht || null,
        gewichtUeberschritten: !gewichtOk
      };
      if (gewichtOk) break;
      empfehlung = null;
    }
  }
  if (!empfehlung && gesamtLaenge > 0 && lkwTypen.length) {
    const biggest = lkwTypen[lkwTypen.length - 1];
    const anzahl = Math.ceil(gesamtLaenge / biggest.laenge);
    empfehlung = {
      name: `${anzahl}x ${biggest.name}`, laenge: biggest.laenge * anzahl,
      auslastung: Math.round(gesamtLaenge / (biggest.laenge * anzahl) * 100),
      max_gewicht: biggest.max_gewicht ? biggest.max_gewicht * anzahl : null,
      gewichtUeberschritten: biggest.max_gewicht && gesamtGewicht > biggest.max_gewicht * anzahl
    };
  }

  res.json({ reihen, gesamtLaenge, gesamtGewicht: Math.round(gesamtGewicht * 10) / 10, gesamtAnzahl, empfehlung, lkwTypen });
});

// ===================== START =====================

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Munz-KFZ-Dispo läuft auf http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('DB-Init fehlgeschlagen:', err);
  process.exit(1);
});
