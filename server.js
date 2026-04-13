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
  const { kunde_id, kunde_name, datum, abholung_datum, abholung_ort, lieferung_ort, transport_art, gefahrgut, notizen, positionen, km_anfahrt, km_hauptstrecke, km_rueckfahrt, km_gesamt, km_minuten } = req.body;
  if (!datum) return res.status(400).json({ error: 'Datum erforderlich' });

  dbRun("INSERT INTO auftraege (kunde_id, kunde_name, datum, abholung_datum, abholung_ort, lieferung_ort, transport_art, gefahrgut, notizen, km_anfahrt, km_hauptstrecke, km_rueckfahrt, km_gesamt, km_minuten) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [kunde_id || null, kunde_name || null, datum, abholung_datum || null, abholung_ort || null, lieferung_ort || null, transport_art || 'inland', gefahrgut ? 1 : 0, notizen || null, km_anfahrt || 0, km_hauptstrecke || 0, km_rueckfahrt || 0, km_gesamt || 0, km_minuten || 0]);
  const auftragId = getDB().exec("SELECT last_insert_rowid()")[0].values[0][0];

  if (positionen && positionen.length) {
    for (const p of positionen) {
      dbRun("INSERT INTO auftrag_positionen (auftrag_id, paletten_typ_id, paletten_typ_name, anzahl, gewicht_kg, hoehe_mm, stapelbar, beschreibung, laenge_mm, breite_mm) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [auftragId, p.paletten_typ_id || null, p.paletten_typ_name || null, parseInt(p.anzahl) || 1, p.gewicht_kg ? parseFloat(p.gewicht_kg) : null, p.hoehe_mm ? parseInt(p.hoehe_mm) : null, p.stapelbar ? 1 : 0, p.beschreibung || null, p.laenge_mm ? parseInt(p.laenge_mm) : null, p.breite_mm ? parseInt(p.breite_mm) : null]);
    }
  }

  res.json({ ok: true, id: auftragId });
});

app.put('/api/auftraege/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { kunde_id, kunde_name, datum, abholung_datum, abholung_ort, lieferung_ort, transport_art, gefahrgut, lkw_typ_id, status, notizen, positionen } = req.body;

  const erlaubt = ['kunde_id', 'kunde_name', 'datum', 'abholung_datum', 'abholung_ort', 'lieferung_ort', 'transport_art', 'gefahrgut', 'lkw_typ_id', 'status', 'notizen', 'km_anfahrt', 'km_hauptstrecke', 'km_rueckfahrt', 'km_gesamt', 'km_minuten'];
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
      dbRun("INSERT INTO auftrag_positionen (auftrag_id, paletten_typ_id, paletten_typ_name, anzahl, gewicht_kg, hoehe_mm, stapelbar, beschreibung, laenge_mm, breite_mm) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [id, p.paletten_typ_id || null, p.paletten_typ_name || null, parseInt(p.anzahl) || 1, p.gewicht_kg ? parseFloat(p.gewicht_kg) : null, p.hoehe_mm ? parseInt(p.hoehe_mm) : null, p.stapelbar ? 1 : 0, p.beschreibung || null, p.laenge_mm ? parseInt(p.laenge_mm) : null, p.breite_mm ? parseInt(p.breite_mm) : null]);
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
      const laenge = p.pt_laenge || p.laenge_mm || 1200;
      const breite = p.pt_breite || p.breite_mm || 800;
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

  // Shelf-Packing mit Lückenfüllung
  // Jede Palette bekommt absolute Position (x, y) auf der Ladefläche
  const LKW_BREITE = 2450;
  const ABSTAND = 50;

  // Freie Rechtecke: [{x, y, w, h}] — w = Tiefe (Längsrichtung), h = Breite
  const freeRects = [{ x: 0, y: 0, w: 100000, h: LKW_BREITE }];
  const placed = []; // {pal, x, y, laenge, breite}
  const warnungen = [];

  for (const pal of allePaletten) {
    // Beste freie Stelle finden (Best Short Side Fit)
    let bestIdx = -1, bestX = Infinity, bestLeftover = Infinity, bestRotated = false;

    for (let ri = 0; ri < freeRects.length; ri++) {
      const r = freeRects[ri];
      // Normal: laenge in Tiefe (x), breite in Breite (y)
      if (pal.laenge <= r.w && pal.breite <= r.h) {
        const leftover = Math.min(r.w - pal.laenge, r.h - pal.breite);
        if (r.x < bestX || (r.x === bestX && leftover < bestLeftover)) {
          bestIdx = ri; bestX = r.x; bestLeftover = leftover; bestRotated = false;
        }
      }
      // Rotiert: breite in Tiefe (x), laenge in Breite (y)
      if (pal.breite <= r.w && pal.laenge <= r.h) {
        const leftover = Math.min(r.w - pal.breite, r.h - pal.laenge);
        if (r.x < bestX || (r.x === bestX && leftover < bestLeftover)) {
          bestIdx = ri; bestX = r.x; bestLeftover = leftover; bestRotated = true;
        }
      }
    }

    if (bestIdx === -1) {
      // Grund ermitteln warum Palette nicht passt
      const name = pal.name || 'Palette';
      if (pal.breite > LKW_BREITE && pal.laenge > LKW_BREITE) {
        warnungen.push(`${name} (${pal.laenge}x${pal.breite}mm): Beide Seiten breiter als LKW (${LKW_BREITE}mm) — passt nicht auf die Ladefläche`);
      } else if (Math.min(pal.breite, pal.laenge) > LKW_BREITE) {
        warnungen.push(`${name} (${pal.laenge}x${pal.breite}mm): Schmalste Seite ${Math.min(pal.breite, pal.laenge)}mm > LKW-Breite ${LKW_BREITE}mm — passt nicht`);
      } else {
        // Passt grundsätzlich, aber kein Platz mehr frei
        const bestFreeW = freeRects.reduce((m, r) => Math.max(m, r.w), 0);
        const bestFreeH = freeRects.reduce((m, r) => Math.max(m, r.h), 0);
        warnungen.push(`${name} (${pal.laenge}x${pal.breite}mm): Kein Platz mehr frei — größte Lücke: ${bestFreeW}mm Tiefe x ${bestFreeH}mm Breite`);
      }
      continue;
    }

    const rect = freeRects[bestIdx];
    const pL = bestRotated ? pal.breite : pal.laenge; // Tiefe auf LKW
    const pB = bestRotated ? pal.laenge : pal.breite; // Breite auf LKW

    placed.push({ pal, x: rect.x, y: rect.y, laenge: pL, breite: pB });

    // Free-Rect aufteilen (Maximal Rectangles Split)
    freeRects.splice(bestIdx, 1);
    // Rechts daneben (volle Breite des Originals)
    if (rect.w - pL - ABSTAND > 0) {
      freeRects.push({ x: rect.x + pL + ABSTAND, y: rect.y, w: rect.w - pL - ABSTAND, h: rect.h });
    }
    // Darunter (volle Tiefe des Originals)
    if (rect.h - pB > 0) {
      freeRects.push({ x: rect.x, y: rect.y + pB, w: rect.w, h: rect.h - pB });
    }

    // Überlappende Rects bereinigen: Neue Rects können sich überlappen,
    // daher bei jeder Platzierung alle Rects gegen die platzierte Palette clippen
    const px1 = rect.x, py1 = rect.y, px2 = rect.x + pL, py2 = rect.y + pB;
    for (let ri = freeRects.length - 1; ri >= 0; ri--) {
      const r = freeRects[ri];
      const rx2 = r.x + r.w, ry2 = r.y + r.h;
      // Prüfen ob Rect mit platzierter Palette überlappt
      if (r.x < px2 + ABSTAND && rx2 > px1 && r.y < py2 && ry2 > py1) {
        const splits = [];
        // Links
        if (r.x < px1) splits.push({ x: r.x, y: r.y, w: px1 - r.x - ABSTAND, h: r.h });
        // Rechts
        if (rx2 > px2 + ABSTAND) splits.push({ x: px2 + ABSTAND, y: r.y, w: rx2 - px2 - ABSTAND, h: r.h });
        // Oben
        if (r.y < py1) splits.push({ x: r.x, y: r.y, w: r.w, h: py1 - r.y });
        // Unten
        if (ry2 > py2) splits.push({ x: r.x, y: py2, w: r.w, h: ry2 - py2 });
        freeRects.splice(ri, 1, ...splits.filter(s => s.w > 0 && s.h > 0));
      }
    }
  }

  // Reihen-Format für Frontend-Draufsicht generieren
  // Gruppiere placed-Paletten nach x-Position zu Reihen
  const reihenMap = new Map();
  for (const p of placed) {
    // Runden auf 10mm um gleiche x-Positionen zusammenzufassen
    const key = p.x;
    if (!reihenMap.has(key)) reihenMap.set(key, { paletten: [], tiefe: 0, x: p.x });
    reihenMap.get(key).paletten.push({ ...p.pal, laenge: p.laenge, breite: p.breite, _y: p.y });
    reihenMap.get(key).tiefe = Math.max(reihenMap.get(key).tiefe, p.laenge + ABSTAND);
  }
  const reihen = [...reihenMap.values()].sort((a, b) => a.x - b.x);
  // Paletten innerhalb jeder Reihe nach y sortieren
  for (const r of reihen) r.paletten.sort((a, b) => a._y - b._y);

  const gesamtLaenge = placed.length ? Math.max(...placed.map(p => p.x + p.laenge)) + ABSTAND : 0;
  const gesamtBreite = placed.length ? Math.max(...placed.map(p => p.y + p.breite)) : 0;
  const gesamtGewicht = allePaletten.reduce((s, p) => s + p.gewicht, 0);
  const gesamtAnzahl = allePaletten.length;

  // LKW-Empfehlung
  const lkwTypen = dbAll("SELECT * FROM lkw_typen WHERE aktiv = 1 ORDER BY sortierung, laenge");
  let empfehlung = null;
  for (const lkw of lkwTypen) {
    if (lkw.laenge >= gesamtLaenge && lkw.breite >= gesamtBreite) {
      const gewichtOk = !lkw.max_gewicht || !gesamtGewicht || gesamtGewicht <= lkw.max_gewicht;
      empfehlung = {
        name: lkw.name, laenge: lkw.laenge, breite: lkw.breite,
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
      name: `${anzahl}x ${biggest.name}`, laenge: biggest.laenge * anzahl, breite: biggest.breite,
      auslastung: Math.round(gesamtLaenge / (biggest.laenge * anzahl) * 100),
      max_gewicht: biggest.max_gewicht ? biggest.max_gewicht * anzahl : null,
      gewichtUeberschritten: biggest.max_gewicht && gesamtGewicht > biggest.max_gewicht * anzahl
    };
  }

  res.json({ reihen, gesamtLaenge, gesamtBreite, gesamtGewicht: Math.round(gesamtGewicht * 10) / 10, gesamtAnzahl, empfehlung, lkwTypen, warnungen });
});

// ===================== KM-BERECHNUNG =====================

// Standort: 72805 Lichtenstein
const STANDORT = { lat: 48.4319, lon: 9.2561, name: '72805 Lichtenstein' };

async function geocode(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=de,at,ch,fr,it,nl,be,lu,pl,cz`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Munz-KFZ-Dispo/1.0' } });
  const data = await r.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), display: data[0].display_name };
}

async function getRoute(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
  const r = await fetch(url);
  const data = await r.json();
  if (data.code !== 'Ok' || !data.routes.length) return null;
  const route = data.routes[0];
  return {
    km: Math.round(route.distance / 100) / 10,       // km mit 1 Dezimale
    minuten: Math.round(route.duration / 60)           // Fahrzeit in Minuten
  };
}

function istLichtenstein(address, coords) {
  if (!address) return false;
  const lower = address.toLowerCase();
  if (lower.includes('lichtenstein') || lower.includes('72805')) return true;
  // Koordinaten-Check: <5km Umkreis von Lichtenstein
  if (coords) {
    const dist = Math.sqrt(Math.pow((coords.lat - STANDORT.lat) * 111, 2) + Math.pow((coords.lon - STANDORT.lon) * 73, 2));
    if (dist < 5) return true;
  }
  return false;
}

app.post('/api/km-berechnung', async (req, res) => {
  try {
    const { ladestelle, entladestelle, lade_coords, entlade_coords } = req.body;
    if (!ladestelle || !entladestelle) return res.status(400).json({ error: 'Lade- und Entladestelle erforderlich' });

    // Koordinaten direkt nutzen oder geocoden
    const geoLade = lade_coords ? { lat: lade_coords.lat, lon: lade_coords.lon, display: ladestelle } : await geocode(ladestelle);
    const geoEntlade = entlade_coords ? { lat: entlade_coords.lat, lon: entlade_coords.lon, display: entladestelle } : await geocode(entladestelle);

    if (!geoLade) return res.status(400).json({ error: `Ladestelle "${ladestelle}" nicht gefunden` });
    if (!geoEntlade) return res.status(400).json({ error: `Entladestelle "${entladestelle}" nicht gefunden` });

    const result = {
      ladestelle: { adresse: ladestelle, gefunden: geoLade.display },
      entladestelle: { adresse: entladestelle, gefunden: geoEntlade.display },
      ladestelle_coords: { lat: geoLade.lat, lon: geoLade.lon },
      entladestelle_coords: { lat: geoEntlade.lat, lon: geoEntlade.lon },
      anfahrt: null,
      hauptstrecke: null,
      rueckfahrt: null,
      gesamt_km: 0,
      gesamt_minuten: 0
    };

    // Anfahrt: Nur wenn Ladestelle NICHT in Lichtenstein
    if (!istLichtenstein(ladestelle, geoLade)) {
      const anfahrt = await getRoute(STANDORT, geoLade);
      if (anfahrt) {
        result.anfahrt = { von: STANDORT.name, nach: ladestelle, ...anfahrt };
        result.gesamt_km += anfahrt.km;
        result.gesamt_minuten += anfahrt.minuten;
      }
    }

    // Hauptstrecke: Ladestelle → Entladestelle
    const haupt = await getRoute(geoLade, geoEntlade);
    if (haupt) {
      result.hauptstrecke = { von: ladestelle, nach: entladestelle, ...haupt };
      result.gesamt_km += haupt.km;
      result.gesamt_minuten += haupt.minuten;
    }

    // Rückfahrt: Entladestelle → Lichtenstein
    const rueck = await getRoute(geoEntlade, STANDORT);
    if (rueck) {
      result.rueckfahrt = { von: entladestelle, nach: STANDORT.name, ...rueck };
      result.gesamt_km += rueck.km;
      result.gesamt_minuten += rueck.minuten;
    }

    result.gesamt_km = Math.round(result.gesamt_km * 10) / 10;

    res.json(result);
  } catch (e) {
    console.error('KM-Berechnung Fehler:', e);
    res.status(500).json({ error: 'Fehler bei KM-Berechnung: ' + e.message });
  }
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
