// Test the REAL selectDripsToSend from App.js by extracting and evaluating its
// source, so we're not testing a hand-copied duplicate that could drift.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.js'), 'utf8');

const constLine = src.match(/const DRIP_STALE_DAYS = \d+, DRIP_MAX_PER_RUN = \d+;/)[0];
const fnStart = src.indexOf('function selectDripsToSend(');
// Walk braces to find the end of the function.
let depth = 0, end = -1;
for (let i = src.indexOf('{', fnStart); i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const fnSrc = src.slice(fnStart, end);
const selectDrips = eval(`${constLine}\n${fnSrc}\nselectDripsToSend`);

// Fixed "now" so the test is deterministic: 2026-09-01T20:00:00Z
const NOW = Date.parse('2026-09-01T20:00:00Z');
const d = (offsetDays) => new Date(NOW + offsetDays * 86400000).toISOString().slice(0, 10);

let pass = 0, fail = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
  ok ? pass++ : fail++;
};

// ── Realistic queue, not a toy one ──────────────────────────────────────────
const queue = [
  { id: 'a', sent: false, dueDate: d(0),   leadEmail: 'due.today@x.com',  subject: 'Due today' },
  { id: 'b', sent: false, dueDate: d(-1),  leadEmail: 'y1@x.com',         subject: '1 day over' },
  { id: 'c', sent: false, dueDate: d(-3),  leadEmail: 'y3@x.com',         subject: 'exactly 3 days over (boundary)' },
  { id: 'e', sent: false, dueDate: d(-4),  leadEmail: 'old@x.com',        subject: '4 days over -> stale' },
  { id: 'f', sent: false, dueDate: d(-90), leadEmail: 'ancient@x.com',    subject: 'ancient backlog' },
  { id: 'g', sent: false, dueDate: d(+5),  leadEmail: 'future@x.com',     subject: 'not due yet' },
  { id: 'h', sent: true,  dueDate: d(-1),  leadEmail: 'already@x.com',    subject: 'already sent' },
  { id: 'i', sent: false, dueDate: d(0),   leadEmail: '',                 subject: 'due but no email' },
];

const r = selectDrips(queue, NOW);
check('due ids',       r.due.map(x => x.id),      ['a', 'b', 'c']);
check('stale ids',     r.stale.map(x => x.id),    ['e', 'f']);
check('noEmail ids',   r.noEmail.map(x => x.id),  ['i']);
check('heldBack empty', r.heldBack.length,        0);
check('future excluded', r.due.some(x => x.id === 'g'), false);
check('sent excluded',   r.due.some(x => x.id === 'h'), false);

// ── The cap: 25 fresh-due emails should split 20 / 5 ────────────────────────
const big = Array.from({ length: 25 }, (_, i) => ({
  id: `cap${i}`, sent: false, dueDate: d(0), leadEmail: `p${i}@x.com`, subject: `s${i}`,
}));
const rb = selectDrips(big, NOW);
check('cap: due count',      rb.due.length,      20);
check('cap: heldBack count', rb.heldBack.length, 5);
check('cap: no overlap',     rb.due.some(x => rb.heldBack.find(y => y.id === x.id)), false);

// ── The scenario that actually matters: the backlog blast ───────────────────
// Auto-send has been off for 6 months; every step of every campaign is overdue.
const backlog = Array.from({ length: 400 }, (_, i) => ({
  id: `bk${i}`, sent: false, dueDate: d(-(i % 180) - 4), leadEmail: `c${i}@real.com`, subject: `s${i}`,
}));
const rc = selectDrips(backlog, NOW);
check('backlog: sends NOTHING', rc.due.length, 0);
check('backlog: all flagged stale', rc.stale.length, 400);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
