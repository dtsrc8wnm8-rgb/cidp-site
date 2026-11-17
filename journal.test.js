// Ausführen mit: node journal.test.js
const assert = require('node:assert/strict');
const { upsertEntry, removeEntry, toCsv, isValidEntry } = require('./journal.js');

const a = { date: '2026-11-01', strength: 5, fatigue: 6, pain: 2, numbness: 3, therapy: '', events: [], notes: 'ok' };
const b = { date: '2026-11-03', strength: 7, fatigue: 4, pain: 0, numbness: 1, therapy: 'IVIG', events: ['Sturz / Stolpern'], notes: 'Zitat "gut"' };

// neueste zuerst
assert.deepEqual(upsertEntry([a], b).map((e) => e.date), ['2026-11-03', '2026-11-01']);
// gleiches Datum ersetzt
assert.equal(upsertEntry([a], { ...a, pain: 9 })[0].pain, 9);
assert.equal(upsertEntry([a], { ...a, pain: 9 }).length, 1);
// löschen
assert.deepEqual(removeEntry([a, b], '2026-11-01'), [b]);
// CSV: Kopfzeile + Zeilen, Anführungszeichen verdoppelt
const csv = toCsv([b]).split('\n');
assert.equal(csv.length, 2);
assert.ok(csv[1].includes('"Zitat ""gut"""'));
assert.ok(csv[1].includes('"Sturz / Stolpern"'));
// Validierung
assert.ok(isValidEntry(a));
assert.ok(!isValidEntry({ ...a, date: '' }));
assert.ok(!isValidEntry({ ...a, pain: 11 }));
assert.ok(!isValidEntry({ ...a, pain: NaN }));

console.log('journal.test.js: alle Tests bestanden');
