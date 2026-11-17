// Symptomtagebuch: Einträge liegen als JSON-Array unter einem localStorage-Schlüssel.
// Ein Eintrag pro Datum; ein neuer Eintrag mit gleichem Datum ersetzt den alten.
const STORAGE_KEY = 'cidp-tagebuch-v1';
const SCALE_FIELDS = ['strength', 'fatigue', 'pain', 'numbness'];
const LABELS = { strength: 'Kraft', fatigue: 'Fatigue', pain: 'Schmerz', numbness: 'Taubheit' };

// --- reine Hilfsfunktionen (werden in journal.test.js getestet) ---

function upsertEntry(entries, entry) {
  return [...entries.filter((e) => e.date !== entry.date), entry]
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function removeEntry(entries, date) {
  return entries.filter((e) => e.date !== date);
}

function toCsv(entries) {
  const head = ['Datum', 'Kraft', 'Fatigue', 'Schmerz', 'Taubheit', 'Therapie', 'Ereignisse', 'Notizen'];
  const quote = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = entries.map((e) => [
    e.date, e.strength, e.fatigue, e.pain, e.numbness, e.therapy, (e.events || []).join('; '), e.notes,
  ].map(quote).join(';'));
  return [head.join(';'), ...rows].join('\n');
}

function isValidEntry(entry) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) return false;
  return SCALE_FIELDS.every((f) => Number.isInteger(entry[f]) && entry[f] >= 0 && entry[f] <= 10);
}

// --- Browser-Teil ---

if (typeof document !== 'undefined') {
  const form = document.getElementById('journal-form');
  const list = document.getElementById('entries');
  const count = document.getElementById('count');
  const msg = document.getElementById('form-msg');

  const load = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
  };
  const save = (entries) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); return true; } catch { return false; }
  };

  const fmtDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

  const render = () => {
    const entries = load();
    count.textContent = entries.length === 1 ? '1 Eintrag' : entries.length ? `${entries.length} Einträge` : '';
    list.replaceChildren();
    if (!entries.length) {
      list.innerHTML = '<p class="empty">Noch keine Einträge. Füllen Sie oben das Formular aus.</p>';
      return;
    }
    for (const e of entries) {
      const el = document.createElement('article');
      el.className = 'card entry';
      const dl = SCALE_FIELDS.map((f) => `<div><dt>${LABELS[f]}</dt><dd>${e[f]}/10</dd></div>`).join('');
      const extra = [e.therapy, ...(e.events || [])].filter(Boolean).join(' · ');
      el.innerHTML = `
        <div class="entry-date">${fmtDate(e.date)}</div>
        <div>
          <dl>${dl}${extra ? `<div><dt>Therapie / Ereignisse</dt><dd class="extra"></dd></div>` : ''}</dl>
          <p></p>
        </div>
        <button type="button" aria-label="Eintrag vom ${fmtDate(e.date)} löschen">Löschen</button>`;
      // Nutzertext nur über textContent setzen, nie als HTML.
      if (extra) el.querySelector('dd.extra').textContent = extra;
      el.querySelector('p').textContent = e.notes || '';
      el.querySelector('button').addEventListener('click', () => {
        if (!confirm(`Eintrag vom ${fmtDate(e.date)} wirklich löschen?`)) return;
        save(removeEntry(load(), e.date));
        msg.textContent = `Eintrag vom ${fmtDate(e.date)} gelöscht.`;
        render();
        // the focused button was just destroyed; keep keyboard users in the ledger
        (list.querySelector('button') || document.getElementById('export-csv')).focus();
      });
      list.appendChild(el);
    }
  };

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const entry = {
      date: fd.get('date'),
      therapy: fd.get('therapy'),
      events: fd.getAll('events'),
      notes: fd.get('notes').trim(),
    };
    for (const f of SCALE_FIELDS) entry[f] = Number(fd.get(f));
    if (!isValidEntry(entry)) {
      msg.textContent = 'Bitte ein gültiges Datum angeben.';
      return;
    }
    const existed = load().some((e) => e.date === entry.date);
    if (!save(upsertEntry(load(), entry))) {
      msg.textContent = 'Speichern nicht möglich. Ist der Browserspeicher blockiert (z. B. privater Modus)?';
      return;
    }
    msg.textContent = existed ? 'Eintrag für dieses Datum aktualisiert.' : 'Gespeichert.';
    form.reset();
    form.querySelectorAll('input[type=range]').forEach((r) => { r.nextElementSibling.value = r.value; });
    document.getElementById('date').value = new Date().toISOString().slice(0, 10);
    render();
  });

  document.getElementById('export-csv').addEventListener('click', () => {
    const blob = new Blob(['﻿' + toCsv(load())], { type: 'text/csv;charset=utf-8' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `cidp-tagebuch-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('date').value = new Date().toISOString().slice(0, 10);
  render();
}

if (typeof module !== 'undefined') {
  module.exports = { upsertEntry, removeEntry, toCsv, isValidEntry };
}
