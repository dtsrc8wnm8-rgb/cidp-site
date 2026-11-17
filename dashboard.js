// Dashboard: liest dieselben Tagebuch-Einträge wie journal.js und zeichnet SVG-Diagramme ohne Bibliothek.
// Aufbau wie bei gängigen Symptom-Trackern: Übersichtskacheln, ein Detaildiagramm für einen Wert, Kalender, Ereignisse.
const STORAGE_KEY = 'cidp-tagebuch-v1';
const DAY = 86400000;
// Feste Reihenfolge, feste Farben (mit dem Dataviz-Validator auf #FAEEE2 geprüft).
const SERIES = [
  { key: 'strength', label: 'Kraft', color: '#0B8C7E', better: 'Höher ist besser' },
  { key: 'fatigue', label: 'Fatigue', color: '#A8781A', better: 'Niedriger ist besser' },
  { key: 'pain', label: 'Schmerz', color: '#5B68B5', better: 'Niedriger ist besser' },
  { key: 'numbness', label: 'Taubheit', color: '#BA4E3C', better: 'Niedriger ist besser' },
];
const EVENTS = ['Sturz / Stolpern', 'Schlecht geschlafen', 'Hilfsmittel genutzt', 'Arbeitsunfähig'];

// --- reine Hilfsfunktionen (dashboard.test.js) ---

const toDate = (iso) => new Date(iso + 'T00:00:00');
const toIso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.round((toDate(a) - toDate(b)) / DAY);
const addDays = (iso, n) => toIso(new Date(toDate(iso).getTime() + n * DAY));

function filterRange(entries, days, today) {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!days) return sorted;
  return sorted.filter((e) => { const d = dayDiff(today, e.date); return d >= 0 && d < days; });
}

function average(entries, key) {
  if (!entries.length) return null;
  return Math.round((entries.reduce((s, e) => s + e[key], 0) / entries.length) * 10) / 10;
}

// letzte 7 Tage gegen die 7 Tage davor
function trend(entries, key, today) {
  const recent = entries.filter((e) => dayDiff(today, e.date) < 7);
  const previous = entries.filter((e) => { const d = dayDiff(today, e.date); return d >= 7 && d < 14; });
  const r = average(recent, key), p = average(previous, key);
  return { recent: r, previous: p, delta: r !== null && p !== null ? Math.round((r - p) * 10) / 10 : null };
}

function daysSinceTherapy(entries, today) {
  const last = [...entries].filter((e) => e.therapy).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  return last ? dayDiff(today, last.date) : null;
}

function countEvents(entries) {
  return EVENTS.map((label) => ({ label, count: entries.filter((e) => (e.events || []).includes(label)).length }));
}

function linePath(points) {
  return points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

// Kalenderwochen (Montag bis Sonntag), die den Zeitraum abdecken
function calendarWeeks(startIso, endIso) {
  const dow = (iso) => (toDate(iso).getDay() + 6) % 7; // 0 = Montag
  let cur = addDays(startIso, -dow(startIso));
  const last = addDays(endIso, 6 - dow(endIso));
  const weeks = [];
  while (cur <= last) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cur, i)));
    cur = addDays(cur, 7);
  }
  return weeks;
}

// --- Browser-Teil ---

if (typeof document !== 'undefined') {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (iso) => toDate(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  const fmtLong = (iso) => toDate(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  const de = (n) => String(n).replace('.', ',');
  const sign = (d) => (d > 0 ? `+${de(d)}` : de(d));
  const today = toIso(new Date());
  const load = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } };

  const all = load();
  const state = { range: 30, metric: 'strength' };
  const byDate = Object.fromEntries(all.map((e) => [e.date, e]));

  if (!all.length) {
    $('dash').hidden = true;
    $('empty').hidden = false;
  } else {
    render();
  }

  document.querySelectorAll('input[name="range"]').forEach((r) => r.addEventListener('change', () => { state.range = Number(r.value) || null; render(); }));
  document.querySelectorAll('.metric[data-metric]').forEach((b) => b.addEventListener('click', () => { state.metric = b.dataset.metric; render(); }));

  function rangeStart(entries) {
    return state.range ? addDays(today, -(state.range - 1)) : (entries[0] ? entries[0].date : today);
  }

  function render() {
    const entries = filterRange(all, state.range, today);
    const start = rangeStart(entries);
    $('range-note').textContent = `${fmt(start)} bis ${fmt(today)} · ${entries.length} ${entries.length === 1 ? 'Eintrag' : 'Einträge'}`;
    renderCards(entries);
    renderDetail(entries, start);
    renderCalendar(entries, start);
    renderBars(entries);
    renderTable(entries);
  }

  // Übersicht: eine Kachel pro Wert mit letztem Wert, Durchschnitt, Trend und Sparkline
  function renderCards(entries) {
    const last = entries[entries.length - 1];
    for (const s of SERIES) {
      const card = document.querySelector(`.metric[data-metric="${s.key}"]`);
      card.setAttribute('aria-pressed', String(state.metric === s.key));
      card.querySelector('.metric-value').textContent = last ? `${last[s.key]}/10` : '–';
      const avg = average(entries, s.key), t = trend(entries, s.key, today);
      card.querySelector('.metric-avg').textContent = avg === null ? 'keine Einträge' : `Ø ${de(avg)}${t.delta === null ? '' : ` · ${sign(t.delta)} zur Vorwoche`}`;
      const svg = card.querySelector('svg');
      const W = 160, H = 44;
      if (entries.length < 2) { svg.innerHTML = ''; continue; }
      const first = entries[0].date, span = Math.max(dayDiff(entries[entries.length - 1].date, first), 1);
      const pts = entries.map((e) => ({ x: 4 + (dayDiff(e.date, first) / span) * (W - 8), y: 4 + (1 - e[s.key] / 10) * (H - 8) }));
      svg.innerHTML = `<path d="${linePath(pts)}" style="--c:${s.color}"/><circle cx="${pts[pts.length - 1].x}" cy="${pts[pts.length - 1].y}" r="4" style="--c:${s.color}"/>`;
    }
    const since = daysSinceTherapy(all, today);
    $('stat-therapy').textContent = since === null ? '–' : since;
    $('stat-therapy-note').textContent = since === null ? 'noch keine Therapie eingetragen' : since === 1 ? 'Tag seit der letzten Therapie' : 'Tage seit der letzten Therapie';
  }

  // Detail: ein Wert, groß, mit Therapietagen und Tooltip
  function renderDetail(entries, start) {
    const s = SERIES.find((x) => x.key === state.metric);
    const W = 960, H = 340, L = 44, R = 24, T = 24, B = 48;
    const svg = $('detail-chart'), tip = $('detail-tip');
    $('detail-title').textContent = `${s.label} im Verlauf`;
    $('detail-sub').textContent = `${s.better}. Gestrichelte Linien sind Therapietage.`;
    const span = Math.max(dayDiff(today, start), 1);
    const x = (iso) => L + (dayDiff(iso, start) / span) * (W - L - R);
    const y = (v) => T + (1 - v / 10) * (H - T - B);
    const step = span <= 14 ? 2 : span <= 45 ? 7 : span <= 120 ? 14 : 30;
    const ticks = []; for (let d = 0; d <= span; d += step) ticks.push(addDays(start, d));
    const pts = entries.map((e) => ({ x: x(e.date), y: y(e[s.key]) }));
    let out = `<g class="grid">${[0, 2, 4, 6, 8, 10].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 10}" y="${y(v) + 5}" text-anchor="end">${v}</text>`).join('')}</g>`;
    out += `<g class="therapy">${entries.filter((e) => e.therapy).map((e) => `<line class="therapy-line" x1="${x(e.date)}" x2="${x(e.date)}" y1="${T}" y2="${y(0)}"/>`).join('')}</g>`;
    out += `<g class="axis">${ticks.map((d) => `<text x="${x(d)}" y="${H - 14}" text-anchor="middle">${fmt(d)}</text>`).join('')}</g>`;
    if (pts.length) out += `<g class="series" style="--c:${s.color}"><path d="${linePath(pts)}"/>${pts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="4"/>`).join('')}</g>`;
    out += `<line id="cross" class="cross" y1="${T}" y2="${y(0)}" visibility="hidden"/>`;
    out += `<rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>`;
    svg.innerHTML = out;
    svg.setAttribute('aria-label', `${s.label}, ${entries.length} Einträge von ${fmt(start)} bis ${fmt(today)}. Tabelle weiter unten.`);

    const cross = svg.querySelector('#cross');
    let idx = -1;
    const show = (i) => {
      idx = i;
      const e = entries[i];
      if (!e) { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; return; }
      const px = x(e.date);
      cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
      const rect = svg.getBoundingClientRect();
      tip.style.left = `${Math.min(Math.max((px / W) * rect.width, 110), rect.width - 110)}px`;
      const extra = [e.therapy, ...(e.events || [])].filter(Boolean);
      tip.innerHTML = `<strong>${fmtLong(e.date)}</strong><span><i style="background:${s.color}"></i>${s.label} ${e[s.key]}/10</span>${extra.length ? `<em>${esc(extra.join(' · '))}</em>` : ''}`;
      tip.hidden = false;
    };
    const nearest = (clientX) => {
      const rect = svg.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * W;
      let best = -1, bd = Infinity;
      entries.forEach((e, i) => { const d = Math.abs(x(e.date) - px); if (d < bd) { bd = d; best = i; } });
      return best;
    };
    svg.onpointermove = (ev) => show(nearest(ev.clientX));
    svg.onpointerleave = () => show(-1);
    svg.onkeydown = (ev) => {
      if (ev.key === 'ArrowRight') { ev.preventDefault(); show(Math.min(entries.length - 1, idx + 1)); }
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); show(Math.max(0, idx - 1)); }
      if (ev.key === 'Escape') show(-1);
    };
    svg.onblur = () => show(-1);
  }

  // Kalender: jeder Tag nach dem gewählten Wert eingefärbt, Therapietage mit Ring
  function renderCalendar(entries, start) {
    const s = SERIES.find((x) => x.key === state.metric);
    const weeks = calendarWeeks(start, today);
    $('cal-title').textContent = `${s.label} als Kalender`;
    $('cal-legend').innerHTML = `<span>0</span>${[1, 2, 3, 4, 5].map((i) => `<i style="--c:${s.color};--p:${i * 20}%"></i>`).join('')}<span>10</span><span class="cal-legend-note">leer = kein Eintrag, Ring = Therapietag</span>`;
    let monthSeen = '';
    $('calendar').innerHTML = weeks.map((week) => {
      const m = toDate(week[0]).toLocaleDateString('de-DE', { month: 'short' });
      const label = m !== monthSeen ? (monthSeen = m) : '';
      return `<div class="cal-month">${label}</div>${week.map((d) => {
        const e = byDate[d];
        const inRange = d >= start && d <= today;
        if (!inRange) return `<div class="cal-day cal-out" aria-hidden="true"></div>`;
        if (!e) return `<div class="cal-day cal-empty" title="${fmtLong(d)}: kein Eintrag"><span>${toDate(d).getDate()}</span></div>`;
        const v = e[s.key];
        const p = Math.max(12, Math.round((v / 10) * 100));
        return `<div class="cal-day${e.therapy ? ' cal-therapy' : ''}" style="--c:${s.color};--p:${p}%" title="${fmtLong(d)}: ${s.label} ${v}/10${e.therapy ? ', ' + esc(e.therapy) : ''}"><span>${toDate(d).getDate()}</span></div>`;
      }).join('')}`;
    }).join('');
  }

  function renderBars(entries) {
    const rows = countEvents(entries);
    const max = Math.max(1, ...rows.map((r) => r.count));
    const W = 960, rowH = 44, L = 230, R = 70;
    const svg = $('bar-chart');
    svg.setAttribute('viewBox', `0 0 ${W} ${rows.length * rowH}`);
    svg.innerHTML = rows.map((r, i) => {
      const w = (r.count / max) * (W - L - R);
      const cy = i * rowH + rowH / 2;
      return `<g class="bar"><text class="bar-label" x="${L - 14}" y="${cy + 6}" text-anchor="end">${esc(r.label)}</text><rect x="${L}" y="${cy - 8}" width="${Math.max(w, r.count ? 4 : 0)}" height="16" rx="2"/><text class="bar-value" x="${L + w + 12}" y="${cy + 6}">${r.count}</text><title>${esc(r.label)}: ${r.count} ${r.count === 1 ? 'Tag' : 'Tage'}</title></g>`;
    }).join('');
    svg.setAttribute('aria-label', 'Häufigkeit der Ereignisse: ' + rows.map((r) => `${r.label} ${r.count}`).join(', '));
  }

  function renderTable(entries) {
    $('table-body').innerHTML = [...entries].reverse().map((e) => `<tr><th scope="row">${fmtLong(e.date)}</th>${SERIES.map((s) => `<td>${e[s.key]}</td>`).join('')}<td>${esc(e.therapy || '–')}</td><td>${esc((e.events || []).join(', ') || '–')}</td></tr>`).join('');
  }
}

if (typeof module !== 'undefined') {
  module.exports = { filterRange, average, trend, daysSinceTherapy, countEvents, linePath, calendarWeeks, SERIES, EVENTS };
}
