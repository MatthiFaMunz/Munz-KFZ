const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'dispo.db');

let db;

async function initDB() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  // Schema
  db.run(`CREATE TABLE IF NOT EXISTS kunden (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    ort TEXT,
    telefon TEXT,
    notizen TEXT,
    erstellt TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS paletten_typen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    laenge INTEGER NOT NULL,
    breite INTEGER NOT NULL,
    hoehe INTEGER DEFAULT 144,
    max_gewicht INTEGER,
    sortierung INTEGER DEFAULT 0,
    aktiv INTEGER DEFAULT 1
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS lkw_typen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    laenge INTEGER NOT NULL,
    breite INTEGER NOT NULL DEFAULT 2450,
    hoehe INTEGER DEFAULT 2700,
    max_gewicht INTEGER,
    aktiv INTEGER DEFAULT 1,
    sortierung INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS auftraege (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kunde_id INTEGER,
    kunde_name TEXT,
    datum TEXT NOT NULL,
    abholung_datum TEXT,
    abholung_ort TEXT,
    lieferung_ort TEXT,
    transport_art TEXT DEFAULT 'inland',
    gefahrgut INTEGER DEFAULT 0,
    lkw_typ_id INTEGER,
    status TEXT DEFAULT 'offen',
    notizen TEXT,
    erstellt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (kunde_id) REFERENCES kunden(id),
    FOREIGN KEY (lkw_typ_id) REFERENCES lkw_typen(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS auftrag_positionen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auftrag_id INTEGER NOT NULL,
    paletten_typ_id INTEGER,
    paletten_typ_name TEXT,
    anzahl INTEGER NOT NULL DEFAULT 1,
    gewicht_kg REAL,
    hoehe_mm INTEGER,
    stapelbar INTEGER DEFAULT 0,
    beschreibung TEXT,
    FOREIGN KEY (auftrag_id) REFERENCES auftraege(id) ON DELETE CASCADE,
    FOREIGN KEY (paletten_typ_id) REFERENCES paletten_typen(id)
  )`);

  // Seed paletten_typen
  const ptCount = db.exec("SELECT COUNT(*) FROM paletten_typen")[0]?.values[0][0] || 0;
  if (ptCount === 0) {
    const defaults = [
      ['Europalette', 1200, 800, 144, 1500, 1],
      ['Industriepalette', 1200, 1000, 144, 1500, 2],
      ['Halbpalette', 800, 600, 144, 500, 3],
      ['Gitterbox', 1240, 835, 970, 1500, 4],
    ];
    const stmt = db.prepare("INSERT INTO paletten_typen (name, laenge, breite, hoehe, max_gewicht, sortierung) VALUES (?,?,?,?,?,?)");
    for (const d of defaults) { stmt.run(d); }
    stmt.free();
  }

  // Seed lkw_typen
  const lkwCount = db.exec("SELECT COUNT(*) FROM lkw_typen")[0]?.values[0][0] || 0;
  if (lkwCount === 0) {
    const defaults = [
      ['7.5t Plane', 6200, 2450, 2700, 2500, 1],
      ['12t Plane', 7400, 2450, 2700, 5500, 2],
      ['18t Pritsche', 9000, 2450, 2700, 10000, 3],
      ['Sattelzug', 13600, 2450, 2700, 24000, 4],
    ];
    const stmt = db.prepare("INSERT INTO lkw_typen (name, laenge, breite, hoehe, max_gewicht, sortierung) VALUES (?,?,?,?,?,?)");
    for (const d of defaults) { stmt.run(d); }
    stmt.free();
  }

  saveDB();
  return db;
}

function saveDB() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function getDB() { return db; }

module.exports = { initDB, saveDB, getDB };
