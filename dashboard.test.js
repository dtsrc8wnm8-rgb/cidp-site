// Ausführen mit: node dashboard.test.js
const assert = require('node:assert/strict');
const { filterRange, average, trend, daysSinceTherapy, countEvents, linePath } = require('./dashboard.js');

const mk = (date, strength, extra = {}) => ({ date, strength, fatigue: 5, pain: 0, numbness: 0, therapy: '', events: [], ...extra });
const today = '2026-11-12';
const entries = [
  mk('2026-11-12', 6, { events: ['Sturz / Stolpern'] }),
  mk('2026-11-10', 4, { therapy: 'IVIG' }),
  mk('2026-11-03', 2, { events: ['Sturz / Stolpern', 'Arbeitsunfähig'] }),
  mk('2026-10-01', 8),
];

// Zeitraum: aufsteigend sortiert, Grenze inklusive heute
assert.deepEqual(filterRange(entries, 30, today).map((e) => e.date), ['2026-11-03', '2026-11-10', '2026-11-12']);
assert.equal(filterRange(entries, null, today).length, 4);
assert.equal(filterRange(entries, 1, today).length, 1);
// Durchschnitt, gerundet; leer -> null
assert.equal(average(filterRange(entries, 30, today), 'strength'), 4);
assert.equal(average([], 'strength'), null);
// Trend: letzte 7 Tage (6, 4) gegen davor (2)
assert.deepEqual(trend(entries, 'strength', today), { recent: 5, previous: 2, delta: 3 });
assert.equal(trend([mk('2026-11-12', 5)], 'strength', today).delta, null);
// Tage seit Therapie
assert.equal(daysSinceTherapy(entries, today), 2);
assert.equal(daysSinceTherapy([mk('2026-11-12', 5)], today), null);
// Ereignisse zählen
const counts = Object.fromEntries(countEvents(entries).map((r) => [r.label, r.count]));
assert.equal(counts['Sturz / Stolpern'], 2);
assert.equal(counts['Arbeitsunfähig'], 1);
assert.equal(counts['Hilfsmittel genutzt'], 0);
// Pfad
assert.equal(linePath([{ x: 0, y: 10 }, { x: 5.25, y: 2 }]), 'M0.0 10.0 L5.3 2.0');
assert.equal(linePath([]), '');

console.log('dashboard.test.js: alle Tests bestanden');

// Kalenderwochen: Montag bis Sonntag, deckt Start und Ende ab (2026-11-12 ist ein Donnerstag)
const { calendarWeeks } = require('./dashboard.js');
const weeks = calendarWeeks('2026-11-03', '2026-11-12');
assert.equal(weeks.length, 2);
assert.equal(weeks[0][0], '2026-11-02');
assert.equal(weeks[1][6], '2026-11-15');
assert.ok(weeks.every((w) => w.length === 7));
console.log('calendarWeeks: ok');
