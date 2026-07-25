/* Bundles src/* into two self-contained artefacts:
     dist/inquiry.html  — full standalone page (open locally)
     dist/artifact.html — body-only, for publishing where the shell is supplied
   No dependencies, no network, nothing external at runtime. */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(join(here, 'src', p), 'utf8');
const data = (p) => JSON.parse(readFileSync(join(here, 'src/data', p), 'utf8'));

/* ---------- data ---------- */
// The five station districts have vaults; the summit is level 2 and does not.
const DISTRICT_FILES = [
  ['foundry', 'foundry.json'],
  ['observatory', 'observatory.json'],
  ['helix', 'helix.json'],
  ['lattice', 'lattice.json'],
  ['engine', 'engine.json'],
];

const roster = [];
for (const [district, file] of DISTRICT_FILES) {
  for (const p of data(file)) roster.push({ ...p, district });
}
let SUMMIT_STUBBED = false;
try {
  for (const p of data('summit.json')) roster.push({ ...p, district: 'summit' });
} catch (e) {
  SUMMIT_STUBBED = true;
  for (let i = 0; i < 6; i++) {
    roster.push({
      id: `stubprof${i}`, name: `Stub Professor ${i + 1}`, lifespan: 'b. 1960',
      era: 'contemporary', field: 'Placeholder', origin: '—', hook: 'Placeholder.',
      intro: 'Placeholder while the summit content is generated for level two of this game.',
      answers: Object.fromEntries(['question', 'method', 'evidence', 'impact', 'doubt']
        .map((k) => [k, { text: 'Placeholder answer.', concept: 'Placeholder' }])),
      misconception: { myth: 'Placeholder.', reality: 'Placeholder.' },
      terms: [{ term: 'Placeholder', def: 'Placeholder.' }],
      recognition: 'Placeholder.', district: 'summit',
    });
  }
}
/* connections/vaults may still be in flight during development — stub them so the
   engine is testable, but shout loudly so a stub never ships by accident. */
let connections, vaults, misinfo, students, STUBBED = false;
try {
  connections = data('connections.json');
  vaults = data('vaults.json');
} catch (e) {
  STUBBED = true;
  connections = [{ a: roster[0].id, b: roster[1].id, kind: 'method', title: 'STUB CONNECTION',
    text: 'Placeholder while content is generated.' }];
  vaults = Object.fromEntries(DISTRICT_FILES.map(([d]) => [d, {
    title: 'STUB VAULT',
    questions: [{ prompt: 'Placeholder question?', options: ['A', 'B', 'C', 'D'], correct: 0,
      why: ['stub', 'stub', 'stub', 'stub'] }],
  }]));
}

try {
  misinfo = data('misinfo.json');
  students = data('students.json');
} catch (e) {
  STUBBED = true;
  misinfo = [{ id: 'stub', technique: 'STUB', weakness: 'evidence', claim: 'Placeholder claim.',
    tell: 'Placeholder tell.', debunk: 'Placeholder debunk.', domain: 'statistics' }];
  students = { taught: ['Huh — say that again?'], confused: ['I saw something about this…'] };
}

/* ---------- validation ---------- */
const KEYS = ['question', 'method', 'evidence', 'impact', 'doubt'];
const problems = [];
const ids = new Set();

for (const p of roster) {
  const at = `${p.id || '(no id)'}`;
  if (!p.id) problems.push('a person has no id');
  if (ids.has(p.id)) problems.push(`${at}: duplicate id`);
  ids.add(p.id);
  for (const f of ['name', 'lifespan', 'era', 'field', 'hook', 'intro', 'recognition']) {
    if (!p[f]) problems.push(`${at}: missing "${f}"`);
  }
  if (!['historical', 'contemporary'].includes(p.era)) problems.push(`${at}: bad era "${p.era}"`);
  for (const k of KEYS) {
    const a = p.answers && p.answers[k];
    if (!a || !a.text) problems.push(`${at}: missing answer "${k}"`);
    else if (!a.concept) problems.push(`${at}: answer "${k}" has no concept tag`);
  }
  if (!p.misconception || !p.misconception.myth || !p.misconception.reality) {
    problems.push(`${at}: incomplete misconception`);
  }
  if (!Array.isArray(p.terms) || p.terms.length < 1) problems.push(`${at}: no terms`);
}

for (const [i, c] of connections.entries()) {
  if (!ids.has(c.a)) problems.push(`connection ${i}: unknown id "${c.a}"`);
  if (!ids.has(c.b)) problems.push(`connection ${i}: unknown id "${c.b}"`);
  if (c.a === c.b) problems.push(`connection ${i}: self-pair`);
  if (!['lineage', 'method', 'tension', 'pattern'].includes(c.kind)) problems.push(`connection ${i}: bad kind`);
  if (!c.title || !c.text) problems.push(`connection ${i}: missing title/text`);
}
const seenPairs = new Set();
for (const [i, c] of connections.entries()) {
  const k = [c.a, c.b].sort().join('|');
  if (seenPairs.has(k)) problems.push(`connection ${i}: duplicate pair ${k}`);
  seenPairs.add(k);
}

for (const [district] of DISTRICT_FILES) {
  const v = vaults[district];
  if (!v) { problems.push(`vaults: missing district "${district}"`); continue; }
  if (!v.title) problems.push(`vault ${district}: no title`);
  for (const [qi, q] of (v.questions || []).entries()) {
    if (!q.prompt) problems.push(`vault ${district} q${qi}: no prompt`);
    if (!Array.isArray(q.options) || q.options.length !== 4) problems.push(`vault ${district} q${qi}: needs 4 options`);
    if (!Array.isArray(q.why) || q.why.length !== 4) problems.push(`vault ${district} q${qi}: needs 4 explanations`);
    if (!(q.correct >= 0 && q.correct <= 3)) problems.push(`vault ${district} q${qi}: bad correct index`);
  }
  if (!roster.some((p) => p.district === district)) problems.push(`district ${district} has nobody in it`);
}

const QKEYS = ['question', 'method', 'evidence', 'impact', 'doubt'];
for (const [i, m] of misinfo.entries()) {
  for (const f of ['id', 'technique', 'weakness', 'claim', 'tell', 'debunk']) {
    if (!m[f]) problems.push(`misinfo ${i}: missing "${f}"`);
  }
  if (!QKEYS.includes(m.weakness)) problems.push(`misinfo ${i}: bad weakness "${m.weakness}"`);
}
if (!STUBBED) {
  const byW = {};
  for (const m of misinfo) byW[m.weakness] = (byW[m.weakness] || 0) + 1;
  for (const k of QKEYS) if (!byW[k]) problems.push(`misinfo: nothing is vulnerable to "${k}"`);
}
if (!Array.isArray(students.taught) || !students.taught.length) problems.push('students: no taught lines');
if (!Array.isArray(students.confused) || !students.confused.length) problems.push('students: no confused lines');

if (problems.length) {
  console.error('\n  CONTENT VALIDATION FAILED\n');
  for (const p of problems) console.error('   · ' + p);
  console.error('');
  process.exit(1);
}

/* ---------- assemble ---------- */
const SCRIPTS = ['core.js', 'geom.js', 'render.js', 'world.js', 'actors.js', 'portrait.js', 'campus.js', 'mountain.js', 'life.js', 'hud.js', 'game.js'];

const dataBlock = `/* content data — see the on-screen notice: all dialogue is written for this game */
const ROSTER = ${JSON.stringify(roster)};
const CONNECTIONS = ${JSON.stringify(connections)};
const VAULTS = ${JSON.stringify(vaults)};
const MISINFO = ${JSON.stringify(misinfo)};
const STUDENT_LINES = ${JSON.stringify(students)};
`;

const js = [dataBlock, ...SCRIPTS.map((f) => `\n/* ==== ${f} ==== */\n` + src(f))].join('\n');
const css = src('style.css');
const body = src('body.html');

const inner = `<style>\n${css}\n</style>\n${body}\n<script>\n${js}\n</script>\n`;

const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>INQUIRY — A First-Person Science Interview</title>
<meta name="description" content="A first-person exploration game where you interview 24 historical and contemporary scientists about their research using five question types.">
</head>
<body>
${inner}</body>
</html>
`;

mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist/inquiry.html'), standalone);
writeFileSync(join(here, 'dist/artifact.html'), `<title>INQUIRY — A First-Person Science Interview</title>\n${inner}`);
// index.html is what GitHub Pages serves; .nojekyll stops Jekyll touching it
writeFileSync(join(here, 'dist/index.html'), standalone);
writeFileSync(join(here, 'dist/.nojekyll'), '');

if (STUBBED) {
  console.warn('\n  ⚠  connections.json / vaults.json missing — built with STUBS. Do not ship.\n');
}
if (SUMMIT_STUBBED) {
  console.warn('\n  ⚠  summit.json missing — level 2 professors are STUBS. Do not ship.\n');
}
const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0) + ' KB';
console.log(`  built  dist/index.html     ${kb(standalone)}   (GitHub Pages entry)`);
console.log(`  built  dist/inquiry.html   ${kb(standalone)}`);
console.log(`  built  dist/artifact.html  ${kb(inner)}`);
console.log(`  ${roster.length} scientists · ${roster.length * 5} answers · ${connections.length} connections · ` +
  `${Object.values(vaults).reduce((n, v) => n + v.questions.length, 0)} vault questions · ` +
  `${misinfo.length} misinformation cards`);
