// ===================== GLOBALS =====================
let kundenCache = [];
let palettenTypenCache = [];
let currentPage = 'auftraege';

// ===================== API HELPER =====================
async function api(url, opts = {}) {
  try {
    const r = await fetch(url, opts);
    return await r.json();
  } catch (e) {
    console.error('API Error:', e);
    return { error: e.message };
  }
}

function showFeedback(msg, type = 'ok') {
  const el = document.getElementById('feedback');
  el.textContent = msg;
  el.className = 'feedback' + (type === 'error' ? ' error' : '');
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}

function openModal(html) {
  document.getElementById('modal').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
  // Karte aufräumen
  if (kmMap) { kmMap.remove(); kmMap = null; kmMapLayers = []; }
  ortCoords = { abholung: null, lieferung: null };
}

document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

// ===================== NAVIGATION =====================
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    navigateTo(btn.dataset.page);
  });
});

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-btn[data-page="${page}"]`).classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');

  if (page === 'auftraege') loadAuftraege();
  else if (page === 'disposition') loadDisposition();
  else if (page === 'kunden') loadKunden();
  else if (page === 'lkw-typen') loadLkwTypen();
  else if (page === 'paletten-typen') loadPalettenTypen();
}

// ===================== AUFTRÄGE =====================
let auftraegeFilter = '';

async function loadAuftraege() {
  const url = auftraegeFilter ? `/api/auftraege?status=${auftraegeFilter}` : '/api/auftraege';
  const data = await api(url);
  if (data.error) return;

  // Stats
  const alle = await api('/api/auftraege');
  const stats = { offen: 0, geplant: 0, unterwegs: 0, erledigt: 0 };
  if (Array.isArray(alle)) alle.forEach(a => { if (stats[a.status] !== undefined) stats[a.status]++; });

  const container = document.getElementById('page-auftraege');
  container.innerHTML = `
    <div class="stats-row">
      <div class="stat-card"><div class="stat-value">${stats.offen}</div><div class="stat-label">Offen</div></div>
      <div class="stat-card"><div class="stat-value">${stats.geplant}</div><div class="stat-label">Geplant</div></div>
      <div class="stat-card"><div class="stat-value">${stats.unterwegs}</div><div class="stat-label">Unterwegs</div></div>
      <div class="stat-card"><div class="stat-value">${stats.erledigt}</div><div class="stat-label">Erledigt</div></div>
    </div>
    <div class="card">
      <div class="card-header">
        <span>Aufträge</span>
        <button class="btn btn-primary" onclick="openAuftragModal()">+ Neuer Auftrag</button>
      </div>
      <div class="filter-bar">
        <select id="auftraege-filter" onchange="auftraegeFilter=this.value; loadAuftraege()">
          <option value="">Alle</option>
          <option value="offen" ${auftraegeFilter === 'offen' ? 'selected' : ''}>Offen</option>
          <option value="geplant" ${auftraegeFilter === 'geplant' ? 'selected' : ''}>Geplant</option>
          <option value="unterwegs" ${auftraegeFilter === 'unterwegs' ? 'selected' : ''}>Unterwegs</option>
          <option value="erledigt" ${auftraegeFilter === 'erledigt' ? 'selected' : ''}>Erledigt</option>
        </select>
      </div>
      <table>
        <thead><tr>
          <th>Nr.</th><th>Datum</th><th>Kunde</th><th>Abholung</th><th>Lieferung</th>
          <th>Positionen</th><th>KM</th><th>Transport</th><th>Status</th><th>Aktionen</th>
        </tr></thead>
        <tbody>
          ${Array.isArray(data) && data.length ? data.map(a => `
            <tr>
              <td><strong>#${a.id}</strong></td>
              <td>${a.abholung_datum || a.datum || '—'}</td>
              <td>${esc(a.display_name)}</td>
              <td>${esc(a.abholung_ort || '—')}</td>
              <td>${esc(a.lieferung_ort || '—')}</td>
              <td>${a.positionen ? a.positionen.map(p => { const name = p.typ_name || p.paletten_typ_name || 'Palette'; const masse = !p.typ_name && p.laenge_mm && p.breite_mm ? ` (${p.laenge_mm}x${p.breite_mm})` : ''; return `${p.anzahl}x ${esc(name)}${masse}`; }).join(', ') : '—'}</td>
              <td style="white-space:nowrap;font-weight:${a.km_gesamt ? '600' : '400'};color:${a.km_gesamt ? 'var(--primary)' : 'var(--text-muted)'}">${a.km_gesamt ? a.km_gesamt + ' km' : '—'}</td>
              <td>
                ${transportBadge(a.transport_art)}
                ${a.gefahrgut ? '<span class="gefahrgut-badge">ADR</span>' : ''}
              </td>
              <td><span class="status-badge status-${a.status}" onclick="cycleStatus(${a.id}, '${a.status}')">${a.status}</span></td>
              <td>
                <button class="btn btn-sm btn-outline" onclick="openAuftragModal(${a.id})">Bearbeiten</button>
                <button class="btn btn-sm btn-danger" onclick="deleteAuftrag(${a.id})">X</button>
              </td>
            </tr>
          `).join('') : '<tr><td colspan="10" style="text-align:center;color:var(--text-muted)">Keine Aufträge</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

function transportBadge(art) {
  const labels = { inland: 'Inland', international: 'International', a1_schweiz: 'A1 Schweiz' };
  return `<span class="transport-badge transport-${art || 'inland'}">${labels[art] || art || 'Inland'}</span>`;
}

function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

const statusOrder = ['offen', 'geplant', 'unterwegs', 'erledigt'];

async function cycleStatus(id, current) {
  const idx = statusOrder.indexOf(current);
  const next = statusOrder[(idx + 1) % statusOrder.length];
  await api(`/api/auftraege/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) });
  loadAuftraege();
}

async function deleteAuftrag(id) {
  if (!confirm('Auftrag wirklich löschen?')) return;
  await api(`/api/auftraege/${id}`, { method: 'DELETE' });
  showFeedback('Auftrag gelöscht');
  loadAuftraege();
}

async function openAuftragModal(id) {
  // Caches laden
  kundenCache = await api('/api/kunden');
  palettenTypenCache = await api('/api/paletten-typen');

  let a = null;
  if (id) {
    a = await api(`/api/auftraege/${id}`);
    if (a.error) return;
  }

  const today = new Date().toISOString().split('T')[0];

  openModal(`
    <h3>${a ? 'Auftrag bearbeiten' : 'Neuer Auftrag'}</h3>
    <div class="form-row">
      <div class="form-group flex1 autocomplete-wrapper">
        <label>Kunde</label>
        <input type="text" id="af-kunde" value="${esc(a ? (a.kunde_ref_name || a.kunde_name || '') : '')}" placeholder="Kundenname..." oninput="kundeAutocomplete(this)">
        <input type="hidden" id="af-kunde-id" value="${a?.kunde_id || ''}">
        <div id="af-kunde-ac" class="autocomplete-list" style="display:none"></div>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group flex1">
        <label>Abholdatum</label>
        <input type="date" id="af-abholung-datum" value="${a?.abholung_datum || today}">
      </div>
      <div class="form-group flex1 autocomplete-wrapper">
        <label>Abholort (Ladestelle)</label>
        <input type="text" id="af-abholung-ort" value="${esc(a?.abholung_ort || '')}" placeholder="Ort oder PLZ eingeben..." oninput="ortAutocomplete(this, 'ac-abholung')" autocomplete="off">
        <div id="ac-abholung" class="ort-ac-list" style="display:none"></div>
      </div>
      <div class="form-group flex1 autocomplete-wrapper">
        <label>Lieferort (Entladestelle)</label>
        <input type="text" id="af-lieferung-ort" value="${esc(a?.lieferung_ort || '')}" placeholder="Ort oder PLZ eingeben..." oninput="ortAutocomplete(this, 'ac-lieferung')" autocomplete="off">
        <div id="ac-lieferung" class="ort-ac-list" style="display:none"></div>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Transport-Art</label>
        <select id="af-transport">
          <option value="inland" ${a?.transport_art === 'inland' ? 'selected' : ''}>Inland</option>
          <option value="international" ${a?.transport_art === 'international' ? 'selected' : ''}>International</option>
          <option value="a1_schweiz" ${a?.transport_art === 'a1_schweiz' ? 'selected' : ''}>A1 Schweiz</option>
        </select>
      </div>
      <div class="form-group" style="align-self:center;padding-top:20px">
        <label style="display:inline"><input type="checkbox" id="af-gefahrgut" ${a?.gefahrgut ? 'checked' : ''}> Gefahrgut (ADR)</label>
      </div>
    </div>

    <div style="margin:12px 0;padding:12px;background:#f0f4f8;border-radius:var(--radius);border-left:4px solid var(--primary)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong style="font-size:14px">KM-Berechnung</strong>
        <button class="btn btn-sm btn-primary" onclick="berechneKm()" id="km-btn">Berechnen</button>
      </div>
      <div id="km-result">${a?.km_gesamt ? renderKmResult({
        anfahrt: a.km_anfahrt ? { km: a.km_anfahrt } : null,
        hauptstrecke: a.km_hauptstrecke ? { km: a.km_hauptstrecke } : null,
        rueckfahrt: a.km_rueckfahrt ? { km: a.km_rueckfahrt } : null,
        gesamt_km: a.km_gesamt,
        gesamt_minuten: a.km_minuten
      }) : '<span style="color:var(--text-muted);font-size:13px">Abholort und Lieferort eingeben, dann berechnen</span>'}</div>
      <div id="km-map"></div>
      <input type="hidden" id="af-km-anfahrt" value="${a?.km_anfahrt || 0}">
      <input type="hidden" id="af-km-hauptstrecke" value="${a?.km_hauptstrecke || 0}">
      <input type="hidden" id="af-km-rueckfahrt" value="${a?.km_rueckfahrt || 0}">
      <input type="hidden" id="af-km-gesamt" value="${a?.km_gesamt || 0}">
      <input type="hidden" id="af-km-minuten" value="${a?.km_minuten || 0}">
    </div>

    <div class="form-row">
      <div class="form-group flex1">
        <label>Notizen</label>
        <textarea id="af-notizen" rows="2" style="width:100%">${esc(a?.notizen || '')}</textarea>
      </div>
    </div>

    <h4 style="margin-top:16px;margin-bottom:8px">Positionen</h4>
    <table class="pos-table" id="pos-table">
      <thead><tr>
        <th>Palettentyp</th><th>Anzahl</th><th>Gewicht/Stk (kg)</th><th>Höhe (mm)</th><th>Stapelbar</th><th>Beschreibung</th><th></th>
      </tr></thead>
      <tbody id="pos-tbody"></tbody>
    </table>
    <button class="btn btn-sm btn-outline" style="margin-top:8px" onclick="addPositionRow()">+ Position</button>

    <div style="margin-top:20px;display:flex;gap:12px;justify-content:flex-end">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="saveAuftrag(${id || 'null'})">${a ? 'Speichern' : 'Anlegen'}</button>
    </div>
  `);

  // Bestehende Positionen laden
  if (a && a.positionen) {
    for (const p of a.positionen) {
      addPositionRow(p);
    }
  } else {
    addPositionRow();
  }
}

function addPositionRow(p = null) {
  const tbody = document.getElementById('pos-tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>
      <select class="pos-typ" onchange="posTypChanged(this)">
        <option value="">— Freitext —</option>
        ${palettenTypenCache.filter(t => t.aktiv).map(t => `<option value="${t.id}" ${p?.paletten_typ_id == t.id ? 'selected' : ''}>${esc(t.name)} (${t.laenge}x${t.breite})</option>`).join('')}
      </select>
      <input type="text" class="pos-typ-name" placeholder="oder Freitext..." value="${esc(p?.paletten_typ_name || '')}" style="margin-top:4px;${p?.paletten_typ_id ? 'display:none' : ''}">
      <div class="pos-freitext-masse" style="display:${p?.paletten_typ_id ? 'none' : 'flex'};gap:4px;margin-top:4px;align-items:center">
        <input type="number" class="pos-laenge" value="${p?.laenge_mm || ''}" placeholder="Länge" style="width:70px" min="1"> x
        <input type="number" class="pos-breite" value="${p?.breite_mm || ''}" placeholder="Breite" style="width:70px" min="1">
        <span style="font-size:11px;color:var(--text-muted)">mm</span>
      </div>
    </td>
    <td><input type="number" class="pos-anzahl" value="${p?.anzahl || 1}" min="1"></td>
    <td><input type="number" class="pos-gewicht" value="${p?.gewicht_kg || ''}" step="0.1" placeholder="kg"></td>
    <td><input type="number" class="pos-hoehe" value="${p?.hoehe_mm || ''}" placeholder="mm"></td>
    <td style="text-align:center"><input type="checkbox" class="pos-stapelbar" ${p?.stapelbar ? 'checked' : ''}></td>
    <td><input type="text" class="pos-beschreibung" value="${esc(p?.beschreibung || '')}" placeholder="z.B. Maschinenteile"></td>
    <td><button class="btn btn-sm btn-danger" onclick="this.closest('tr').remove()">X</button></td>
  `;
  tbody.appendChild(tr);
}

// ===================== ORT-AUTOCOMPLETE =====================

let ortAcTimer = null;
let ortCoords = { abholung: null, lieferung: null };
let kmMap = null;
let kmMapLayers = [];

async function ortAutocomplete(input, listId) {
  const val = input.value.trim();
  const listEl = document.getElementById(listId);

  if (val.length < 2) { listEl.style.display = 'none'; return; }

  clearTimeout(ortAcTimer);
  ortAcTimer = setTimeout(async () => {
    listEl.innerHTML = '<div class="ort-ac-loading">Suche...</div>';
    listEl.style.display = 'block';

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&limit=6&addressdetails=1&countrycodes=de,at,ch,fr,it,nl,be,lu,pl,cz`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Munz-KFZ-Dispo/1.0' } });
      const data = await r.json();

      if (!data.length) {
        listEl.innerHTML = '<div class="ort-ac-loading">Keine Ergebnisse</div>';
        return;
      }

      listEl.innerHTML = data.map((item, i) => {
        const addr = item.address || {};
        const main = [addr.road, addr.house_number].filter(Boolean).join(' ') || addr.town || addr.city || addr.village || item.display_name.split(',')[0];
        const detail = [addr.postcode, addr.town || addr.city || addr.village || addr.municipality, addr.state, addr.country].filter(Boolean).join(', ');
        const icon = item.type === 'city' || item.type === 'town' ? '🏙' : item.type === 'village' ? '🏘' : '📍';
        return `<div class="ort-ac-item" onclick="selectOrt('${input.id}', '${listId}', ${i})" data-lat="${item.lat}" data-lon="${item.lon}" data-display="${esc(item.display_name)}">
          <span class="ort-ac-icon">${icon}</span>
          <div class="ort-ac-text">
            <div class="ort-ac-main">${esc(main)}</div>
            <div class="ort-ac-detail">${esc(detail)}</div>
          </div>
        </div>`;
      }).join('');
    } catch (e) {
      listEl.innerHTML = '<div class="ort-ac-loading">Fehler bei Suche</div>';
    }
  }, 350);
}

function selectOrt(inputId, listId, idx) {
  const listEl = document.getElementById(listId);
  const item = listEl.querySelectorAll('.ort-ac-item')[idx];
  if (!item) return;

  const display = item.dataset.display;
  const lat = parseFloat(item.dataset.lat);
  const lon = parseFloat(item.dataset.lon);

  document.getElementById(inputId).value = display;
  listEl.style.display = 'none';

  // Koordinaten speichern
  const key = inputId.includes('abholung') ? 'abholung' : 'lieferung';
  ortCoords[key] = { lat, lon, name: display };

  // Wenn beide Orte gesetzt → automatisch berechnen
  if (ortCoords.abholung && ortCoords.lieferung) {
    berechneKm();
  } else {
    updateMiniMap();
  }
}

// Dropdown schließen bei Klick außerhalb
document.addEventListener('click', (e) => {
  if (!e.target.closest('.autocomplete-wrapper')) {
    document.querySelectorAll('.ort-ac-list').forEach(l => l.style.display = 'none');
  }
});

function updateMiniMap(routeData) {
  const mapDiv = document.getElementById('km-map');
  if (!mapDiv) return;

  // Standort Lichtenstein
  const standort = { lat: 48.4319, lon: 9.2561 };
  const points = [];

  if (ortCoords.abholung) points.push(ortCoords.abholung);
  if (ortCoords.lieferung) points.push(ortCoords.lieferung);

  if (!points.length && !routeData) {
    mapDiv.style.display = 'none';
    return;
  }

  mapDiv.style.display = 'block';

  if (!kmMap) {
    kmMap = L.map('km-map').setView([standort.lat, standort.lon], 8);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18
    }).addTo(kmMap);
  }

  // Alte Layer entfernen
  kmMapLayers.forEach(l => kmMap.removeLayer(l));
  kmMapLayers = [];

  // Standort-Marker (Lichtenstein)
  const homeIcon = L.divIcon({ html: '🏠', className: 'leaflet-div-icon', iconSize: [24, 24], iconAnchor: [12, 12] });
  const homeMarker = L.marker([standort.lat, standort.lon], { icon: homeIcon }).addTo(kmMap).bindTooltip('Lichtenstein (Standort)');
  kmMapLayers.push(homeMarker);

  const allPoints = [[standort.lat, standort.lon]];

  // Lade-Marker
  if (ortCoords.abholung) {
    const ladeIcon = L.divIcon({ html: '<div style="background:#2e7d32;color:#fff;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;white-space:nowrap">Laden</div>', className: '', iconAnchor: [20, 12] });
    const m = L.marker([ortCoords.abholung.lat, ortCoords.abholung.lon], { icon: ladeIcon }).addTo(kmMap);
    kmMapLayers.push(m);
    allPoints.push([ortCoords.abholung.lat, ortCoords.abholung.lon]);
  }

  // Entlade-Marker
  if (ortCoords.lieferung) {
    const entladeIcon = L.divIcon({ html: '<div style="background:#c62828;color:#fff;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;white-space:nowrap">Entladen</div>', className: '', iconAnchor: [28, 12] });
    const m = L.marker([ortCoords.lieferung.lat, ortCoords.lieferung.lon], { icon: entladeIcon }).addTo(kmMap);
    kmMapLayers.push(m);
    allPoints.push([ortCoords.lieferung.lat, ortCoords.lieferung.lon]);
  }

  // Linien zeichnen
  if (routeData) {
    // Anfahrt (blau gestrichelt)
    if (routeData.anfahrt && ortCoords.abholung) {
      const line = L.polyline([[standort.lat, standort.lon], [ortCoords.abholung.lat, ortCoords.abholung.lon]], { color: '#1565c0', weight: 3, dashArray: '8,6', opacity: 0.7 }).addTo(kmMap);
      kmMapLayers.push(line);
    }
    // Hauptstrecke (grün)
    if (ortCoords.abholung && ortCoords.lieferung) {
      const line = L.polyline([[ortCoords.abholung.lat, ortCoords.abholung.lon], [ortCoords.lieferung.lat, ortCoords.lieferung.lon]], { color: '#2e7d32', weight: 4, opacity: 0.9 }).addTo(kmMap);
      kmMapLayers.push(line);
    }
    // Rückfahrt (orange gestrichelt)
    if (ortCoords.lieferung) {
      const line = L.polyline([[ortCoords.lieferung.lat, ortCoords.lieferung.lon], [standort.lat, standort.lon]], { color: '#ff6f00', weight: 3, dashArray: '8,6', opacity: 0.7 }).addTo(kmMap);
      kmMapLayers.push(line);
    }
  } else {
    // Einfache Verbindungslinien
    if (ortCoords.abholung) {
      const line = L.polyline([[standort.lat, standort.lon], [ortCoords.abholung.lat, ortCoords.abholung.lon]], { color: '#999', weight: 2, dashArray: '4,4' }).addTo(kmMap);
      kmMapLayers.push(line);
    }
    if (ortCoords.abholung && ortCoords.lieferung) {
      const line = L.polyline([[ortCoords.abholung.lat, ortCoords.abholung.lon], [ortCoords.lieferung.lat, ortCoords.lieferung.lon]], { color: '#999', weight: 2, dashArray: '4,4' }).addTo(kmMap);
      kmMapLayers.push(line);
    }
  }

  // Karte auf alle Punkte zoomen
  if (allPoints.length > 1) {
    kmMap.fitBounds(allPoints, { padding: [30, 30] });
  } else {
    kmMap.setView(allPoints[0], 10);
  }

  // Leaflet braucht manchmal invalidateSize nach DOM-Änderungen
  setTimeout(() => kmMap.invalidateSize(), 100);
}

// ===================== KM-BERECHNUNG =====================

function renderKmResult(data) {
  let html = '<table style="width:100%;font-size:13px;margin:0"><tbody>';
  if (data.anfahrt) {
    html += `<tr><td style="padding:3px 0;color:var(--text-muted)">Anfahrt (Lichtenstein → Ladestelle)</td><td style="text-align:right;font-weight:600">${data.anfahrt.km} km${data.anfahrt.minuten ? ' <span style="color:var(--text-muted);font-weight:400">(' + formatMinuten(data.anfahrt.minuten) + ')</span>' : ''}</td></tr>`;
  }
  if (data.hauptstrecke) {
    html += `<tr><td style="padding:3px 0;color:var(--text-muted)">Hauptstrecke (Lade → Entlade)</td><td style="text-align:right;font-weight:600">${data.hauptstrecke.km} km${data.hauptstrecke.minuten ? ' <span style="color:var(--text-muted);font-weight:400">(' + formatMinuten(data.hauptstrecke.minuten) + ')</span>' : ''}</td></tr>`;
  }
  if (data.rueckfahrt) {
    html += `<tr><td style="padding:3px 0;color:var(--text-muted)">Rückfahrt (Entlade → Lichtenstein)</td><td style="text-align:right;font-weight:600">${data.rueckfahrt.km} km${data.rueckfahrt.minuten ? ' <span style="color:var(--text-muted);font-weight:400">(' + formatMinuten(data.rueckfahrt.minuten) + ')</span>' : ''}</td></tr>`;
  }
  html += `<tr style="border-top:2px solid var(--primary)"><td style="padding:6px 0;font-weight:700;font-size:14px">Gesamt</td><td style="text-align:right;font-weight:700;font-size:14px;color:var(--primary)">${data.gesamt_km} km <span style="font-weight:400;font-size:12px;color:var(--text-muted)">(${formatMinuten(data.gesamt_minuten)})</span></td></tr>`;
  html += '</tbody></table>';
  return html;
}

function formatMinuten(min) {
  if (!min) return '0 Min';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} Min`;
  return `${h}h ${m}min`;
}

async function berechneKm() {
  const ladestelle = document.getElementById('af-abholung-ort').value;
  const entladestelle = document.getElementById('af-lieferung-ort').value;

  if (!ladestelle || !entladestelle) {
    showFeedback('Bitte Abholort und Lieferort eingeben', 'error');
    return;
  }

  const btn = document.getElementById('km-btn');
  const resultDiv = document.getElementById('km-result');
  btn.disabled = true;
  btn.textContent = 'Berechne...';
  resultDiv.innerHTML = '<span style="color:var(--text-muted)">Berechne Route...</span>';

  const payload = { ladestelle, entladestelle };
  if (ortCoords.abholung) payload.lade_coords = { lat: ortCoords.abholung.lat, lon: ortCoords.abholung.lon };
  if (ortCoords.lieferung) payload.entlade_coords = { lat: ortCoords.lieferung.lat, lon: ortCoords.lieferung.lon };

  const r = await api('/api/km-berechnung', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  btn.disabled = false;
  btn.textContent = 'Berechnen';

  if (r.error) {
    resultDiv.innerHTML = `<span style="color:var(--rot)">${esc(r.error)}</span>`;
    return;
  }

  resultDiv.innerHTML = renderKmResult(r);

  // Hidden fields aktualisieren
  document.getElementById('af-km-anfahrt').value = r.anfahrt?.km || 0;
  document.getElementById('af-km-hauptstrecke').value = r.hauptstrecke?.km || 0;
  document.getElementById('af-km-rueckfahrt').value = r.rueckfahrt?.km || 0;
  document.getElementById('af-km-gesamt').value = r.gesamt_km;
  document.getElementById('af-km-minuten').value = r.gesamt_minuten;

  // Koordinaten vom Server-Response holen (falls nicht schon gesetzt)
  if (r.ladestelle_coords) {
    ortCoords.abholung = { lat: r.ladestelle_coords.lat, lon: r.ladestelle_coords.lon, name: ladestelle };
  }
  if (r.entladestelle_coords) {
    ortCoords.lieferung = { lat: r.entladestelle_coords.lat, lon: r.entladestelle_coords.lon, name: entladestelle };
  }

  // Karte aktualisieren
  updateMiniMap(r);
}

function posTypChanged(sel) {
  const td = sel.closest('td');
  const freitext = td.querySelector('.pos-typ-name');
  const masse = td.querySelector('.pos-freitext-masse');
  freitext.style.display = sel.value ? 'none' : 'block';
  masse.style.display = sel.value ? 'none' : 'flex';
  if (sel.value) {
    freitext.value = '';
    td.querySelector('.pos-laenge').value = '';
    td.querySelector('.pos-breite').value = '';
  }
}

function kundeAutocomplete(input) {
  const val = input.value.toLowerCase();
  const ac = document.getElementById('af-kunde-ac');
  if (val.length < 1) { ac.style.display = 'none'; return; }

  const matches = kundenCache.filter(k => k.name.toLowerCase().includes(val));
  if (!matches.length) { ac.style.display = 'none'; return; }

  ac.innerHTML = matches.map(k => `<div class="autocomplete-item" onclick="selectKunde(${k.id}, '${esc(k.name)}')">${esc(k.name)}${k.ort ? ' (' + esc(k.ort) + ')' : ''}</div>`).join('');
  ac.style.display = 'block';
}

function selectKunde(id, name) {
  document.getElementById('af-kunde').value = name;
  document.getElementById('af-kunde-id').value = id;
  document.getElementById('af-kunde-ac').style.display = 'none';
}

async function saveAuftrag(id) {
  const kundeId = document.getElementById('af-kunde-id').value;
  const kundeName = document.getElementById('af-kunde').value;

  const positionen = [];
  document.querySelectorAll('#pos-tbody tr').forEach(tr => {
    const typSel = tr.querySelector('.pos-typ');
    positionen.push({
      paletten_typ_id: typSel.value || null,
      paletten_typ_name: tr.querySelector('.pos-typ-name').value || null,
      anzahl: parseInt(tr.querySelector('.pos-anzahl').value) || 1,
      gewicht_kg: parseFloat(tr.querySelector('.pos-gewicht').value) || null,
      hoehe_mm: parseInt(tr.querySelector('.pos-hoehe').value) || null,
      stapelbar: tr.querySelector('.pos-stapelbar').checked ? 1 : 0,
      beschreibung: tr.querySelector('.pos-beschreibung').value || null,
      laenge_mm: parseInt(tr.querySelector('.pos-laenge').value) || null,
      breite_mm: parseInt(tr.querySelector('.pos-breite').value) || null,
    });
  });

  const body = {
    kunde_id: kundeId || null,
    kunde_name: kundeId ? null : kundeName,
    datum: new Date().toISOString().split('T')[0],
    abholung_datum: document.getElementById('af-abholung-datum').value || null,
    abholung_ort: document.getElementById('af-abholung-ort').value || null,
    lieferung_ort: document.getElementById('af-lieferung-ort').value || null,
    transport_art: document.getElementById('af-transport').value,
    gefahrgut: document.getElementById('af-gefahrgut').checked ? 1 : 0,
    notizen: document.getElementById('af-notizen').value || null,
    km_anfahrt: parseFloat(document.getElementById('af-km-anfahrt').value) || 0,
    km_hauptstrecke: parseFloat(document.getElementById('af-km-hauptstrecke').value) || 0,
    km_rueckfahrt: parseFloat(document.getElementById('af-km-rueckfahrt').value) || 0,
    km_gesamt: parseFloat(document.getElementById('af-km-gesamt').value) || 0,
    km_minuten: parseInt(document.getElementById('af-km-minuten').value) || 0,
    positionen
  };

  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/auftraege/${id}` : '/api/auftraege';
  const r = await api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  if (r.ok || r.id) {
    closeModal();
    showFeedback(id ? 'Auftrag gespeichert' : 'Auftrag angelegt');
    loadAuftraege();
  } else {
    showFeedback(r.error || 'Fehler', 'error');
  }
}

// ===================== DISPOSITION =====================

async function loadDisposition() {
  const container = document.getElementById('page-disposition');
  const data = await api('/api/disposition');
  if (data.error) { container.innerHTML = `<div class="card">Fehler: ${data.error}</div>`; return; }

  const { auftraege, lkwTypen } = data;

  // Gruppiert nach Abholdatum
  const tage = {};
  for (const a of auftraege) {
    const tag = a.abholung_datum || 'Ohne Datum';
    if (!tage[tag]) tage[tag] = [];
    tage[tag].push(a);
  }

  let html = `<div class="card">
    <div class="card-header">
      <span>Disposition</span>
      <button class="btn btn-primary btn-sm" onclick="berechnePackung()">Packberechnung</button>
    </div>`;

  if (!auftraege.length) {
    html += '<p style="color:var(--text-muted);padding:20px;text-align:center">Keine offenen/geplanten Aufträge</p>';
  }

  for (const [tag, aufs] of Object.entries(tage)) {
    const gesamtPaletten = aufs.reduce((s, a) => s + (a.positionen?.reduce((s2, p) => s2 + (p.anzahl || 0), 0) || 0), 0);
    html += `<div style="margin-top:16px">
      <h4 style="margin-bottom:8px">${tag === 'Ohne Datum' ? 'Ohne Datum' : formatDate(tag)} — ${gesamtPaletten} Paletten</h4>
      <table>
        <thead><tr><th><input type="checkbox" class="dispo-select-all" data-tag="${esc(tag)}" onchange="dispoSelectAll(this)"></th><th>Nr.</th><th>Kunde</th><th>Route</th><th>Positionen</th><th>Transport</th></tr></thead>
        <tbody>
          ${aufs.map(a => `<tr>
            <td><input type="checkbox" class="dispo-check" value="${a.id}"></td>
            <td>#${a.id}</td>
            <td>${esc(a.display_name)}</td>
            <td>${esc(a.abholung_ort || '?')} → ${esc(a.lieferung_ort || '?')}</td>
            <td>${a.positionen?.map(p => `${p.anzahl}x ${esc(p.typ_name || p.paletten_typ_name || 'Pal.')}`).join(', ') || '—'}</td>
            <td>${transportBadge(a.transport_art)} ${a.gefahrgut ? '<span class="gefahrgut-badge">ADR</span>' : ''}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  html += '</div><div id="dispo-result"></div>';
  container.innerHTML = html;
}

function dispoSelectAll(cb) {
  const checks = document.querySelectorAll('.dispo-check');
  checks.forEach(c => c.checked = cb.checked);
}

async function berechnePackung() {
  const ids = [...document.querySelectorAll('.dispo-check:checked')].map(c => parseInt(c.value));
  if (!ids.length) { showFeedback('Bitte Aufträge auswählen', 'error'); return; }

  const r = await api('/api/disposition/packen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auftrag_ids: ids }) });
  if (r.error) { showFeedback(r.error, 'error'); return; }

  renderPackResult(r);
}

let lastPackData = null;

function renderPackResult(data) {
  lastPackData = data;
  const { reihen, gesamtLaenge, gesamtBreite, gesamtGewicht, gesamtAnzahl, empfehlung, warnungen, lkwTypen } = data;

  let html = '<div class="card"><div class="card-header">Packberechnung</div>';

  // Warnungen anzeigen
  if (warnungen && warnungen.length) {
    html += '<div style="background:#fff3e0;border:1px solid #ff9800;border-left:4px solid #e65100;border-radius:var(--radius);padding:12px;margin-bottom:16px">';
    html += '<div style="font-weight:700;color:#e65100;margin-bottom:6px">&#9888; Nicht alle Paletten passen:</div>';
    html += warnungen.map(w => `<div style="font-size:13px;color:#bf360c;padding:2px 0">&bull; ${esc(w)}</div>`).join('');
    html += '</div>';
  }

  // Zusammenfassung
  html += `<div class="stats-row">
    <div class="stat-card"><div class="stat-value">${gesamtAnzahl}</div><div class="stat-label">Paletten</div></div>
    <div class="stat-card"><div class="stat-value">${(gesamtLaenge / 1000).toFixed(1)}m</div><div class="stat-label">Ladelänge</div></div>
    <div class="stat-card"><div class="stat-value">${gesamtBreite ? (gesamtBreite / 1000).toFixed(2) + 'm' : '—'}</div><div class="stat-label">Ladebreite</div></div>
    <div class="stat-card"><div class="stat-value">${gesamtGewicht}kg</div><div class="stat-label">Gewicht</div></div>
    <div class="stat-card"><div class="stat-value">${empfehlung ? empfehlung.name : '—'}</div><div class="stat-label">Empfehlung</div></div>
  </div>`;

  // Auslastungsbalken + LKW-Auswahl
  const activeLkw = empfehlung || { name: '—', laenge: 0 };
  html += renderLkwSection(activeLkw, gesamtLaenge, gesamtGewicht, gesamtBreite);

  // Draufsicht
  if (empfehlung && reihen.length) {
    html += renderDraufsicht(reihen, empfehlung);
  }

  // LKW-Auswahl Dropdown
  html += `<div style="margin-top:16px;padding:16px;background:#f0f4f8;border-radius:var(--radius)">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <strong style="font-size:14px">Anderen LKW prüfen:</strong>
      <select id="lkw-vergleich" style="padding:6px 12px;border-radius:var(--radius);border:1px solid var(--border);font-size:13px">
        <option value="">— LKW wählen —</option>
        ${(lkwTypen || []).map(l => `<option value="${l.id}">${esc(l.name)} (${(l.laenge/1000).toFixed(1)}m, max ${l.max_gewicht||'?'}kg)</option>`).join('')}
      </select>
      <button class="btn btn-sm btn-primary" onclick="vergleicheLkw()">Prüfen</button>
    </div>
    <div id="lkw-vergleich-result"></div>
  </div>`;

  html += '</div>';
  document.getElementById('dispo-result').innerHTML = html;
}

function renderLkwSection(lkw, gesamtLaenge, gesamtGewicht, gesamtBreite) {
  const pctL = lkw.laenge ? Math.round(gesamtLaenge / lkw.laenge * 100) : 0;
  const colorL = pctL > 100 ? 'var(--rot)' : pctL > 90 ? 'var(--gelb)' : 'var(--gruen)';
  const pctB = lkw.breite ? Math.round((gesamtBreite || 0) / lkw.breite * 100) : 0;
  const colorB = pctB > 100 ? 'var(--rot)' : pctB > 90 ? 'var(--gelb)' : 'var(--gruen)';
  const gewichtOver = lkw.max_gewicht && gesamtGewicht > lkw.max_gewicht;

  let html = `<div style="margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
      <span>${esc(lkw.name)} — Länge (${(lkw.laenge / 1000).toFixed(1)}m)</span>
      <span>${pctL}% Auslastung${lkw.max_gewicht ? ' — ' + gesamtGewicht + '/' + lkw.max_gewicht + 'kg' : ''}</span>
    </div>
    <div style="background:#e0e0e0;border-radius:4px;height:16px;overflow:hidden">
      <div style="background:${colorL};height:100%;width:${Math.min(pctL, 100)}%;border-radius:4px;transition:width .3s"></div>
    </div>
    ${pctL > 100 ? '<div style="color:var(--rot);font-weight:700;margin-top:4px">&#9888; Ladelänge überschritten!</div>' : ''}
    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;margin-top:8px">
      <span>Breite (${(lkw.breite / 1000).toFixed(2)}m)</span>
      <span>${pctB}%</span>
    </div>
    <div style="background:#e0e0e0;border-radius:4px;height:10px;overflow:hidden">
      <div style="background:${colorB};height:100%;width:${Math.min(pctB, 100)}%;border-radius:4px;transition:width .3s"></div>
    </div>
    ${pctB > 100 ? '<div style="color:var(--rot);font-weight:700;margin-top:4px">&#9888; Ladebreite überschritten!</div>' : ''}
    ${gewichtOver ? '<div style="color:var(--rot);font-weight:700;margin-top:4px">&#9888; Gewicht überschritten!</div>' : ''}
  </div>`;
  return html;
}

function vergleicheLkw() {
  if (!lastPackData) return;
  const sel = document.getElementById('lkw-vergleich');
  const lkwId = parseInt(sel.value);
  if (!lkwId) { showFeedback('Bitte LKW auswählen', 'error'); return; }

  const lkw = lastPackData.lkwTypen.find(l => l.id === lkwId);
  if (!lkw) return;

  const { gesamtLaenge, gesamtBreite, gesamtGewicht, gesamtAnzahl, reihen } = lastPackData;
  const resultDiv = document.getElementById('lkw-vergleich-result');

  const pct = Math.round(gesamtLaenge / lkw.laenge * 100);
  const gewichtOver = lkw.max_gewicht && gesamtGewicht > lkw.max_gewicht;
  const laengeOver = gesamtLaenge > lkw.laenge;
  const breiteOver = gesamtBreite > lkw.breite;

  let html = '<div style="margin-top:12px">';

  // Probleme sammeln
  const probleme = [];
  if (laengeOver) {
    const diff = Math.round(gesamtLaenge - lkw.laenge);
    probleme.push(`Ladelänge: ${(gesamtLaenge/1000).toFixed(1)}m benötigt, aber nur ${(lkw.laenge/1000).toFixed(1)}m verfügbar (${diff}mm zu lang)`);
  }
  if (breiteOver) {
    const diff = Math.round(gesamtBreite - lkw.breite);
    probleme.push(`Ladebreite: ${(gesamtBreite/1000).toFixed(2)}m benötigt, aber nur ${(lkw.breite/1000).toFixed(2)}m verfügbar (${diff}mm zu breit)`);
  }
  if (gewichtOver) {
    const diff = Math.round(gesamtGewicht - lkw.max_gewicht);
    probleme.push(`Gewicht: ${gesamtGewicht}kg benötigt, aber max. ${lkw.max_gewicht}kg erlaubt (${diff}kg zu schwer)`);
  }

  if (probleme.length) {
    html += '<div style="background:#ffebee;border:1px solid #ef5350;border-left:4px solid #c62828;border-radius:var(--radius);padding:12px;margin-bottom:12px">';
    html += `<div style="font-weight:700;color:#c62828;margin-bottom:6px">&#10060; ${esc(lkw.name)} passt nicht:</div>`;
    html += probleme.map(p => `<div style="font-size:13px;color:#b71c1c;padding:2px 0">&bull; ${esc(p)}</div>`).join('');
    html += '</div>';
  } else {
    html += '<div style="background:#e8f5e9;border:1px solid #66bb6a;border-left:4px solid #2e7d32;border-radius:var(--radius);padding:12px;margin-bottom:12px">';
    html += `<div style="font-weight:700;color:#2e7d32">&#10004; ${esc(lkw.name)} passt!</div>`;
    html += '</div>';
  }

  // Auslastungsbalken
  const empf = { name: lkw.name, laenge: lkw.laenge, breite: lkw.breite, max_gewicht: lkw.max_gewicht };
  html += renderLkwSection(empf, gesamtLaenge, gesamtGewicht, gesamtBreite);

  // Draufsicht mit diesem LKW
  if (reihen && reihen.length) {
    html += renderDraufsicht(reihen, empf);
  }

  html += '</div>';
  resultDiv.innerHTML = html;
}

function renderDraufsicht(reihen, empfehlung) {
  const lkwLaenge = empfehlung.laenge;
  const lkwBreite = empfehlung.breite || 2450;
  const kabineW = 40;
  const containerW = 700;
  const scale = containerW / lkwLaenge;
  const containerH = lkwBreite * scale;

  const farben = ['#42a5f5', '#66bb6a', '#ffa726', '#ef5350', '#ab47bc', '#26c6da', '#8d6e63', '#78909c', '#d4e157', '#ec407a', '#5c6bc0', '#29b6f6'];
  const farbMap = {};
  let fi = 0;

  let palletsHtml = '';

  for (const reihe of reihen) {
    for (const pal of reihe.paletten) {
      if (!farbMap[pal.name]) farbMap[pal.name] = farben[fi++ % farben.length];
      const x = (reihe.x || 0) * scale;
      const y = (pal._y || 0) * scale;
      const w = pal.laenge * scale;
      const h = pal.breite * scale;
      palletsHtml += `<div style="position:absolute;left:${kabineW + x}px;top:${y}px;width:${w}px;height:${h}px;background:${farbMap[pal.name]};border:1px solid rgba(0,0,0,.2);border-radius:2px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;font-weight:600;overflow:hidden;text-shadow:0 1px 2px rgba(0,0,0,.3)" title="${pal.name} ${pal.laenge}x${pal.breite}mm">${pal.name}</div>`;
    }
  }

  // Meter-Markierungen
  let meter = '';
  for (let m = 1; m * 1000 < lkwLaenge; m++) {
    const x = kabineW + m * 1000 * scale;
    meter += `<div style="position:absolute;left:${x}px;bottom:0;font-size:8px;color:#999">${m}m</div>`;
    meter += `<div style="position:absolute;left:${x}px;top:0;height:100%;border-left:1px dashed rgba(0,0,0,.1)"></div>`;
  }

  // Legende
  const legende = Object.entries(farbMap).map(([name, color]) => `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;font-size:11px"><span style="width:12px;height:12px;background:${color};border-radius:2px;display:inline-block"></span>${name}</span>`).join('');

  return `<div class="draufsicht-container">
    <div style="font-size:13px;font-weight:600;margin-bottom:8px">Draufsicht ${empfehlung.name} (${(lkwLaenge / 1000).toFixed(1)}m x 2.45m)</div>
    <div style="position:relative;width:${containerW + kabineW + 4}px;height:${containerH}px;border:2px solid #333;border-radius:4px;background:#fff;overflow:hidden">
      <img src="munz.jpg" style="position:absolute;left:0;top:0;width:${kabineW}px;height:${containerH}px;object-fit:cover;border-right:2px solid #333">
      ${palletsHtml}
      ${meter}
    </div>
    <div style="margin-top:8px">${legende}</div>
  </div>`;
}

// ===================== KUNDEN =====================

async function loadKunden() {
  const data = await api('/api/kunden');
  const container = document.getElementById('page-kunden');

  container.innerHTML = `<div class="card">
    <div class="card-header">
      <span>Kunden</span>
      <button class="btn btn-primary btn-sm" onclick="openKundeModal()">+ Neuer Kunde</button>
    </div>
    <table>
      <thead><tr><th>Name</th><th>Ort</th><th>Telefon</th><th>Notizen</th><th>Aktionen</th></tr></thead>
      <tbody>
        ${Array.isArray(data) && data.length ? data.map(k => `<tr>
          <td><strong>${esc(k.name)}</strong></td>
          <td>${esc(k.ort || '—')}</td>
          <td>${esc(k.telefon || '—')}</td>
          <td>${esc(k.notizen || '—')}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="openKundeModal(${k.id}, '${esc(k.name)}', '${esc(k.ort || '')}', '${esc(k.telefon || '')}', '${esc(k.notizen || '')}')">Bearbeiten</button>
            <button class="btn btn-sm btn-danger" onclick="deleteKunde(${k.id})">X</button>
          </td>
        </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Keine Kunden</td></tr>'}
      </tbody>
    </table>
  </div>`;
}

function openKundeModal(id, name, ort, telefon, notizen) {
  openModal(`
    <h3>${id ? 'Kunde bearbeiten' : 'Neuer Kunde'}</h3>
    <div class="form-row">
      <div class="form-group flex1"><label>Name</label><input type="text" id="kf-name" value="${name || ''}"></div>
      <div class="form-group flex1"><label>Ort</label><input type="text" id="kf-ort" value="${ort || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group flex1"><label>Telefon</label><input type="text" id="kf-telefon" value="${telefon || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group flex1"><label>Notizen</label><textarea id="kf-notizen" rows="2" style="width:100%">${notizen || ''}</textarea></div>
    </div>
    <div style="margin-top:16px;display:flex;gap:12px;justify-content:flex-end">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="saveKunde(${id || 'null'})">${id ? 'Speichern' : 'Anlegen'}</button>
    </div>
  `);
}

async function saveKunde(id) {
  const body = {
    name: document.getElementById('kf-name').value,
    ort: document.getElementById('kf-ort').value,
    telefon: document.getElementById('kf-telefon').value,
    notizen: document.getElementById('kf-notizen').value,
  };
  if (!body.name) { showFeedback('Name erforderlich', 'error'); return; }

  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/kunden/${id}` : '/api/kunden';
  const r = await api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.ok || r.id) {
    closeModal();
    showFeedback(id ? 'Kunde gespeichert' : 'Kunde angelegt');
    loadKunden();
  } else {
    showFeedback(r.error || 'Fehler', 'error');
  }
}

async function deleteKunde(id) {
  if (!confirm('Kunde wirklich löschen?')) return;
  await api(`/api/kunden/${id}`, { method: 'DELETE' });
  showFeedback('Kunde gelöscht');
  loadKunden();
}

// ===================== LKW-TYPEN =====================

async function loadLkwTypen() {
  const data = await api('/api/lkw-typen');
  const container = document.getElementById('page-lkw-typen');

  container.innerHTML = `<div class="card">
    <div class="card-header">
      <span>LKW-Typen</span>
      <button class="btn btn-primary btn-sm" onclick="addLkwTyp()">+ Neuer LKW-Typ</button>
    </div>
    <table>
      <thead><tr><th>Name</th><th>Ladelänge (mm)</th><th>Breite (mm)</th><th>Höhe (mm)</th><th>Max. Gewicht (kg)</th><th>Sort.</th><th>Aktiv</th><th>Aktionen</th></tr></thead>
      <tbody>
        ${Array.isArray(data) ? data.map(l => `<tr data-lkw-id="${l.id}">
          <td><input type="text" data-field="name" value="${esc(l.name)}" style="width:140px"></td>
          <td><input type="number" data-field="laenge" value="${l.laenge}" style="width:90px"></td>
          <td><input type="number" data-field="breite" value="${l.breite}" style="width:80px"></td>
          <td><input type="number" data-field="hoehe" value="${l.hoehe || 2700}" style="width:80px"></td>
          <td><input type="number" data-field="max_gewicht" value="${l.max_gewicht || ''}" style="width:90px" placeholder="optional"></td>
          <td><input type="number" data-field="sortierung" value="${l.sortierung || 0}" style="width:50px"></td>
          <td><input type="checkbox" data-field="aktiv" ${l.aktiv ? 'checked' : ''}></td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="saveLkwTyp(${l.id})">Speichern</button>
            <button class="btn btn-sm btn-danger" onclick="deleteLkwTyp(${l.id})">X</button>
          </td>
        </tr>`).join('') : ''}
      </tbody>
    </table>
  </div>`;
}

async function saveLkwTyp(id) {
  const row = document.querySelector(`tr[data-lkw-id="${id}"]`);
  const data = {};
  row.querySelectorAll('input').forEach(inp => {
    const field = inp.dataset.field;
    if (!field) return;
    if (inp.type === 'checkbox') data[field] = inp.checked ? 1 : 0;
    else data[field] = inp.value;
  });
  const r = await api(`/api/lkw-typen/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (r.ok) { showFeedback('LKW-Typ gespeichert'); loadLkwTypen(); }
  else showFeedback(r.error || 'Fehler', 'error');
}

async function deleteLkwTyp(id) {
  if (!confirm('LKW-Typ wirklich löschen?')) return;
  await api(`/api/lkw-typen/${id}`, { method: 'DELETE' });
  showFeedback('LKW-Typ gelöscht');
  loadLkwTypen();
}

async function addLkwTyp() {
  const r = await api('/api/lkw-typen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Neuer LKW', laenge: 6000, breite: 2450, hoehe: 2700, max_gewicht: 5000, sortierung: 99 }) });
  if (r.ok) { showFeedback('LKW-Typ angelegt'); loadLkwTypen(); }
}

// ===================== PALETTEN-TYPEN =====================

async function loadPalettenTypen() {
  const data = await api('/api/paletten-typen');
  const container = document.getElementById('page-paletten-typen');

  container.innerHTML = `<div class="card">
    <div class="card-header">
      <span>Palettentypen</span>
      <button class="btn btn-primary btn-sm" onclick="addPalettenTyp()">+ Neuer Palettentyp</button>
    </div>
    <table>
      <thead><tr><th>Name</th><th>Länge (mm)</th><th>Breite (mm)</th><th>Höhe (mm)</th><th>Max. Gewicht (kg)</th><th>Sort.</th><th>Aktiv</th><th>Aktionen</th></tr></thead>
      <tbody>
        ${Array.isArray(data) ? data.map(p => `<tr data-pt-id="${p.id}">
          <td><input type="text" data-field="name" value="${esc(p.name)}" style="width:160px"></td>
          <td><input type="number" data-field="laenge" value="${p.laenge}" style="width:80px"></td>
          <td><input type="number" data-field="breite" value="${p.breite}" style="width:80px"></td>
          <td><input type="number" data-field="hoehe" value="${p.hoehe || 144}" style="width:80px"></td>
          <td><input type="number" data-field="max_gewicht" value="${p.max_gewicht || ''}" style="width:90px" placeholder="optional"></td>
          <td><input type="number" data-field="sortierung" value="${p.sortierung || 0}" style="width:50px"></td>
          <td><input type="checkbox" data-field="aktiv" ${p.aktiv ? 'checked' : ''}></td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="savePalettenTyp(${p.id})">Speichern</button>
            <button class="btn btn-sm btn-danger" onclick="deletePalettenTyp(${p.id})">X</button>
          </td>
        </tr>`).join('') : ''}
      </tbody>
    </table>
  </div>`;
}

async function savePalettenTyp(id) {
  const row = document.querySelector(`tr[data-pt-id="${id}"]`);
  const data = {};
  row.querySelectorAll('input').forEach(inp => {
    const field = inp.dataset.field;
    if (!field) return;
    if (inp.type === 'checkbox') data[field] = inp.checked ? 1 : 0;
    else data[field] = inp.value;
  });
  const r = await api(`/api/paletten-typen/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (r.ok) { showFeedback('Palettentyp gespeichert'); loadPalettenTypen(); }
  else showFeedback(r.error || 'Fehler', 'error');
}

async function deletePalettenTyp(id) {
  if (!confirm('Palettentyp wirklich löschen?')) return;
  await api(`/api/paletten-typen/${id}`, { method: 'DELETE' });
  showFeedback('Palettentyp gelöscht');
  loadPalettenTypen();
}

async function addPalettenTyp() {
  const r = await api('/api/paletten-typen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Neue Palette', laenge: 1200, breite: 800, hoehe: 144, sortierung: 99 }) });
  if (r.ok) { showFeedback('Palettentyp angelegt'); loadPalettenTypen(); }
}

// ===================== HELPERS =====================

function formatDate(d) {
  if (!d) return '—';
  const parts = d.split('-');
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return d;
}

// ===================== INIT =====================
loadAuftraege();
