/* ============================================================
   hud.js — every piece of 2D interface: reticle, compass,
   minimap, dialogue, codex, vault quizzes, synthesis terminal.
   ============================================================ */

const QTYPES = [
  { key: 'question', name: 'PROBE',    ask: 'What question were you chasing?',
    short: 'The driving question' },
  { key: 'method',   name: 'METHOD',   ask: 'How did you actually test it?',
    short: 'How it was tested' },
  { key: 'evidence', name: 'EVIDENCE', ask: 'What did the data show?',
    short: 'What the data showed' },
  { key: 'impact',   name: 'IMPACT',   ask: 'Why does this matter now?',
    short: 'Why it matters now' },
  { key: 'doubt',    name: 'DOUBT',    ask: 'What were you wrong about, or still don’t know?',
    short: 'Errors and open questions' },
];

const QBLURB = {
  question: 'Every result begins as something genuinely unknown. Find out what was at stake before the answer existed.',
  method:   'A conclusion is only as good as the procedure that produced it. Ask what was actually done, with what instrument.',
  evidence: 'The measurement itself — the number, the image, the pattern. Separate what was observed from what was inferred.',
  impact:   'Where the work went afterwards: into other fields, into technology, into arguments still running today.',
  doubt:    'Errors, blind spots, and open questions. The answer a textbook leaves out, and the one that teaches the most.',
};

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const HUD = {
  init(game) {
    this.game = game;
    this.roster = game.roster;
    this.byId = game.byId;

    // question-type explainer cards on the title screen
    $('#qexplain').innerHTML = QTYPES.map((q, i) => `
      <div class="card">
        <h3>${i + 1} · ${q.name}</h3>
        <p style="color:var(--ink);font-size:13.5px;margin-bottom:7px">“${esc(q.ask)}”</p>
        <p>${esc(QBLURB[q.key])}</p>
      </div>`).join('');

    // the five slots
    $('#slots').innerHTML = QTYPES.map((q, i) => `
      <div class="slot" data-slot="${i}" tabindex="0" role="button">
        <div class="k">${i + 1}</div>
        <div class="n">${q.name}</div>
        <div class="q">${esc(q.short)}</div>
      </div>`).join('');
    $$('#slots .slot').forEach((el) => {
      const fire = (e) => { e.stopPropagation(); game.ask(+el.dataset.slot); };
      el.addEventListener('click', fire);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(e); }
      });
    });

    installCampusBackdrop();
    this.buildCompass();
    this.mapCtx = $('#mapc').getContext('2d');

    $$('[data-close]').forEach((b) => b.addEventListener('click', () => game.closeScreen(b.dataset.close)));
    $('#btn-start').addEventListener('click', () => game.start());

    // look settings, persisted
    const sens = $('#sens'), sensOut = $('#sens-out'), inv = $('#invert');
    if (sens) {
      sens.value = String(game.look.sens);
      sensOut.textContent = `${(+sens.value).toFixed(2)}×`;
      sens.addEventListener('input', () => {
        game.look.sens = +sens.value;
        sensOut.textContent = `${game.look.sens.toFixed(2)}×`;
        game.savePrefs();
      });
    }
    if (inv) {
      inv.checked = !!game.look.invert;
      inv.addEventListener('change', () => { game.look.invert = inv.checked; game.savePrefs(); });
    }

    this.retRing = $('#ret-ring');
    this.retArc = $('#ret-arc');
    this.retTicks = $$('.ret-tick');
    this._retState = null;
  },

  /* ---------- accent ---------- */
  setAccent(hex, hex2) {
    if (this._acc === hex) return;
    this._acc = hex;
    const r = document.documentElement.style;
    r.setProperty('--acc', hex);
    r.setProperty('--acc2', hex2 || hex);
    const c = hex2rgb(hex);
    r.setProperty('--edge', `rgba(${(c[0]*255)|0},${(c[1]*255)|0},${(c[2]*255)|0},0.32)`);
    this.retRing.setAttribute('stroke', hex);
    this.retArc.setAttribute('stroke', hex);
    $('#ret-ticks').setAttribute('stroke', hex);
  },

  /* ---------- reticle ---------- */
  setReticle(mode, frac, name, sub) {
    if (mode !== this._retState) {
      this._retState = mode;
      const spread = mode === 'idle' ? 0 : mode === 'near' ? 5 : 11;
      this.retTicks.forEach((t, i) => {
        const d = [[0,-1],[0,1],[-1,0],[1,0]][i];
        t.style.transform = `translate(${d[0]*spread}px, ${d[1]*spread}px)`;
        t.style.opacity = mode === 'idle' ? 0.55 : 1;
      });
      this.retRing.setAttribute('r', mode === 'idle' ? 9 : mode === 'near' ? 13 : 17);
      this.retRing.setAttribute('stroke-opacity', mode === 'idle' ? 0.5 : 0.9);
    }
    const R = 16, C = TAU * R;
    const f = clamp(frac || 0, 0, 1);
    this.retArc.setAttribute('r', R);
    this.retArc.setAttribute('stroke-dasharray', `${(C * f).toFixed(1)} ${C.toFixed(1)}`);
    const lab = $('#ret-label');
    if (name) {
      $('#ret-name').textContent = name;
      $('#ret-sub').textContent = sub || '';
      lab.classList.add('on');
    } else lab.classList.remove('on');
  },

  prompt(html) {
    const p = $('#prompt');
    if (html) { p.innerHTML = html; p.classList.add('on'); }
    else p.classList.remove('on');
  },

  objective(title, where) {
    $('#obj-title').textContent = title;
    $('#obj-where').textContent = where || '';
  },

  /* per-district checklist — the actual win condition, always on screen */
  objectivePanel(g) {
    const d = g.focusDistrict();
    const box = $('#tasks');
    if (!d) {
      box.innerHTML = `<div class="task done"><i>✓</i><span>All five districts secured</span></div>
        <div class="task"><i>◆</i><span>Collect your Convocation at the atrium terminal</span></div>`;
      $('#obj-title').textContent = 'The Colloquium is secure';
      $('#obj-where').textContent = `${g.securedCount()}/5 districts · Convocation open`;
      return;
    }
    const st = g.districtStatus(d);
    $('#obj-title').textContent = `Secure ${d.name}`;
    $('#obj-where').textContent = `${g.securedCount()}/5 districts secured`;
    box.innerHTML = st.tasks.map((t) => {
      const done = t.n >= t.of;
      return `<div class="task ${done ? 'done' : ''} ${t.locked && !done ? 'locked' : ''}">
        <i>${done ? '✓' : '▢'}</i><span>${esc(t.label)}</span>
        <b>${t.n}/${t.of}</b></div>`;
    }).join('');
    document.documentElement.style.setProperty('--obj-c', d.accent);
  },

  districtSecured(d) {
    const el = $('#secured');
    el.innerHTML = `<div class="sec-tag">DISTRICT SECURED</div>
      <div class="sec-name" style="color:${d.accent};text-shadow:0 0 30px ${d.accent}">${esc(d.name)}</div>
      <div class="sec-sub">${esc(d.sub)}</div>`;
    el.classList.add('on');
    clearTimeout(this._secT);
    this._secT = setTimeout(() => el.classList.remove('on'), 4200);
  },

  stats(s) {
    $('#st-ins').textContent = `${s.insights}/${s.insightsMax}`;
    $('#st-int').textContent = `${s.interviews}/${s.interviewsMax}`;
    $('#st-con').textContent = `${s.connections}/${s.connectionsMax}`;
    $('#st-vau').textContent = `${s.vaults}/5`;
    const t = $('#st-taught'), db = $('#st-deb');
    if (t) t.textContent = String(s.taught || 0);
    if (db) db.textContent = String(s.debunked || 0);
  },

  toast(text, sub) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 1600);
  },

  log(html) {
    const el = document.createElement('div');
    el.className = 'logline';
    el.innerHTML = html;
    const box = $('#log');
    box.appendChild(el);
    while (box.children.length > 5) box.firstChild.remove();
    setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 600); }, 8000);
  },

  /* ---------- compass ---------- */
  buildCompass() {
    const t = $('#compass-track');
    let h = '';
    for (let d = -180; d <= 540; d += 15) {
      const card = { 0: 'N', 90: 'E', 180: 'S', 270: 'W', '-90': 'W', '-180': 'S', 360: 'N', 450: 'E' }[d];
      h += `<div class="cmark" data-deg="${d}"><i></i>${card ? `<b>${card}</b>` : ''}</div>`;
    }
    t.innerHTML = h;
    this.cmarks = Array.from(t.children).map((el) => ({ el, deg: +el.dataset.deg }));
    // district markers get appended once the world exists
    this.cdist = [];
  },

  addCompassDistricts(districts) {
    const t = $('#compass-track');
    this.cdist = districts.map((d) => {
      const el = document.createElement('div');
      el.className = 'cmark dist';
      el.style.setProperty('--c', d.accent);
      el.innerHTML = `<i></i><b>${d.name.replace('THE ', '')}</b>`;
      t.appendChild(el);
      return { el, d };
    });
  },

  updateCompass(yaw, px, pz, doneSet) {
    const PX_PER_DEG = 3.4;
    const wrap = (a) => { while (a > 180) a -= 360; while (a < -180) a += 360; return a; };
    const heading = -yaw * 180 / Math.PI;
    for (const m of this.cmarks) {
      const rel = wrap(m.deg - heading);
      if (Math.abs(rel) > 82) { m.el.style.display = 'none'; continue; }
      m.el.style.display = '';
      m.el.style.left = `calc(50% + ${rel * PX_PER_DEG}px)`;
    }
    for (const c of this.cdist) {
      const bearing = Math.atan2(c.d.cx - px, -(c.d.cz - pz)) * 180 / Math.PI;
      const rel = wrap(bearing - heading);
      if (Math.abs(rel) > 82) { c.el.style.display = 'none'; continue; }
      c.el.style.display = '';
      c.el.style.left = `calc(50% + ${rel * PX_PER_DEG}px)`;
      c.el.classList.toggle('done', doneSet.has(c.d.id));
    }
  },

  /* ---------- minimap ---------- */
  drawMap(g) {
    const c = this.mapCtx, S = 360, mid = S / 2;
    const scale = mid / 158;
    c.clearRect(0, 0, S, S);
    const X = (x) => mid + x * scale, Z = (z) => mid + z * scale;

    c.lineWidth = 1.4;
    // ring walkway
    c.strokeStyle = 'rgba(140,170,210,.22)';
    c.beginPath(); c.arc(mid, mid, R_RING * scale, 0, TAU); c.stroke();
    // causeways
    c.strokeStyle = 'rgba(140,170,210,.30)';
    for (const d of DISTRICTS) {
      c.beginPath();
      c.moveTo(X(Math.cos(d.angle) * CAUSE_IN), Z(Math.sin(d.angle) * CAUSE_IN));
      c.lineTo(X(Math.cos(d.angle) * CAUSE_OUT), Z(Math.sin(d.angle) * CAUSE_OUT));
      c.stroke();
    }
    // atrium
    c.strokeStyle = 'rgba(255,217,138,.55)'; c.fillStyle = 'rgba(255,217,138,.09)';
    c.beginPath(); c.arc(mid, mid, R_ATRIUM * scale, 0, TAU); c.fill(); c.stroke();

    // districts
    for (const d of DISTRICTS) {
      const done = g.districtDone(d.id);
      c.strokeStyle = d.accent; c.globalAlpha = done ? 1 : 0.62;
      c.fillStyle = d.accent;
      c.beginPath(); c.arc(X(d.cx), Z(d.cz), R_PLATFORM * scale, 0, TAU);
      c.globalAlpha = 0.10; c.fill();
      c.globalAlpha = done ? 0.95 : 0.5; c.lineWidth = done ? 2 : 1.2; c.stroke();
      c.globalAlpha = 1;
    }
    // stations
    for (const s of g.world.stations) {
      const p = g.progress[s.id] || [];
      const full = p.length >= 5;
      c.beginPath(); c.arc(X(s.x), Z(s.z), full ? 4.6 : 3.4, 0, TAU);
      c.fillStyle = full ? '#ffffff' : (p.length ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.24)');
      c.fill();
      if (full) { c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1; c.stroke(); }
    }
    // students, coloured by education tier
    if (g.life) {
      for (const s of g.life.students) {
        const t = g.life.tier(s);
        c.beginPath(); c.arc(X(s.x), Z(s.z), t >= 3 ? 3.4 : 2.6, 0, TAU);
        c.fillStyle = s.confused > 0 ? '#ff45a6'
          : t >= 3 ? '#ffd98a' : t >= 2 ? '#7df0ae' : t >= 1 ? '#6f9ab8' : 'rgba(160,180,205,.42)';
        c.fill();
      }
      for (const d of g.life.drones) {
        if (d.dead) continue;
        c.beginPath(); c.arc(X(d.x), Z(d.z), 4, 0, TAU);
        c.fillStyle = '#ff3fa8'; c.fill();
        c.strokeStyle = 'rgba(255,63,168,.5)'; c.lineWidth = 4; c.stroke();
      }
    }
    // secured districts get a solid ring
    for (const d of DISTRICTS) {
      if (!g.secured[d.id]) continue;
      c.beginPath(); c.arc(X(d.cx), Z(d.cz), R_PLATFORM * scale + 3, 0, TAU);
      c.strokeStyle = '#ffd98a'; c.lineWidth = 2; c.stroke();
    }

    // player
    const px = X(g.cam.x), pz = Z(g.cam.z);
    const fwdA = Math.atan2(-Math.sin(g.cam.yaw), -Math.cos(g.cam.yaw));
    c.save(); c.translate(px, pz); c.rotate(fwdA + Math.PI / 2);
    c.beginPath(); c.moveTo(0, -9); c.lineTo(6.4, 7); c.lineTo(0, 3.6); c.lineTo(-6.4, 7); c.closePath();
    c.fillStyle = '#ffffff'; c.fill();
    c.restore();
    // view cone
    c.save(); c.translate(px, pz); c.rotate(fwdA + Math.PI / 2);
    const grad = c.createRadialGradient(0, 0, 0, 0, 0, 52);
    grad.addColorStop(0, 'rgba(255,255,255,.20)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = grad;
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 52, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62); c.closePath(); c.fill();
    c.restore();
  },

  /* ---------- slots: interview keypad in dialogue, ammo belt in the field ---------- */
  showSlots(on, asked, sel, ammo) {
    const box = $('#slots');
    box.classList.toggle('on', !!on);
    box.classList.toggle('field', !!ammo);
    if (!on) return;
    $$('#slots .slot').forEach((el, i) => {
      el.classList.toggle('done', !ammo && asked.includes(QTYPES[i].key));
      el.classList.toggle('sel', i === sel);
      el.classList.toggle('locked', !!ammo && !ammo[i]);
    });
  },

  controlMode(mode) {
    this._ctrl = mode;
    const el = $('#ctrl-hint');
    if (!el) return;
    if (mode === 'lock') el.innerHTML = 'Mouse look active &nbsp;·&nbsp; <kbd>Esc</kbd> release';
    else el.innerHTML = '<kbd>Drag</kbd> to look &nbsp;·&nbsp; <kbd>WASD</kbd> move &nbsp;·&nbsp; <kbd>Click</kbd> fire';
    el.classList.add('on');
    clearTimeout(this._ctrlT);
    this._ctrlT = setTimeout(() => el.classList.remove('on'), 6000);
  },

  /* ---------- mind pollution ---------- */
  setNoise(v) {
    const bar = $('#noise-fill');
    if (!bar) return;
    bar.style.width = `${Math.round(v * 100)}%`;
    $('#noise').classList.toggle('hot', v > 0.55);
    $('#noise').classList.toggle('on', v > 0.02);
    document.getElementById('hud').classList.toggle('polluted', v > 0.45);
  },

  /* a claim that landed on you, still unresolved */
  addClutter(card, drone) {
    const el = document.createElement('div');
    el.className = 'clutter';
    el.innerHTML = `<div class="ctag">UNVERIFIED · INCOMING FEED</div>
      <div class="cclaim">${esc(card.claim)}</div>
      <div class="cfoot">Destroy the drone with the right question to resolve this</div>`;
    el._drone = drone;
    $('#clutter').appendChild(el);
    while ($('#clutter').children.length > 4) $('#clutter').firstChild.remove();
    setTimeout(() => { if (el.parentNode) { el.classList.add('gone'); setTimeout(() => el.remove(), 500); } }, 42000);
  },

  resolveClutter(drone, card) {
    $$('#clutter .clutter').forEach((el) => {
      if (el._drone !== drone) return;
      el.classList.add('resolved');
      el.querySelector('.ctag').textContent = `${card.technique} · IDENTIFIED`;
      el.querySelector('.cfoot').textContent = card.tell;
      setTimeout(() => { el.classList.add('gone'); setTimeout(() => el.remove(), 500); }, 4200);
    });
  },

  /* the teaching payload shown when a drone is correctly dismantled */
  techniqueCard(card, byStudents) {
    const el = $('#technique');
    const q = QTYPES.find((x) => x.key === card.weakness);
    el.innerHTML = `
      <div class="tk-head"><span class="tk-tag">${esc(card.technique)}</span>
        <span class="tk-q">${byStudents ? 'worn down by the students you taught'
          : `dismantled by ${q.name}`}</span></div>
      <div class="tk-claim">“${esc(card.claim)}”</div>
      <div class="tk-tell"><b>The tell.</b> ${esc(card.tell)}</div>
      <div class="tk-why">${esc(card.debunk)}</div>`;
    el.classList.add('on');
    clearTimeout(this._tkT);
    this._tkT = setTimeout(() => el.classList.remove('on'), 15000);
  },

  markDroneWeakness(d) { d.scanned = true; },

  /* ---------- intercept: the world stops, you read, you choose ---------- */
  openIntercept(it) {
    this.renderIntercept(it);
    $('#intercept').classList.add('on');
    document.getElementById('hud').classList.add('halted');
  },

  closeIntercept() {
    $('#intercept').classList.remove('on');
    document.getElementById('hud').classList.remove('halted');
  },

  renderIntercept(it) {
    const q = QTYPES.find((x) => x.key === it.card.weakness);
    const opts = QTYPES.map((t, i) => {
      const wrong = it.wrong.includes(t.key);
      const right = it.done && t.key === it.card.weakness;
      const cls = right ? 'right' : wrong ? 'wrong' : (it.done ? 'muted' : '');
      return `<button class="iopt ${cls}" data-slot="${i}" ${it.done ? 'disabled' : ''}>
        <span class="ik">${i + 1}</span>
        <span class="iname">${t.name}</span>
        <span class="iask">${esc(t.short)}</span>
      </button>`;
    }).join('');

    let verdict = '';
    if (it.done) {
      const held = it.outcome === 'held';
      verdict = `<div class="ivt ${held ? 'good' : 'bad'}">
          <div class="ivt-h">${held ? 'CLAIM DISMANTLED' : 'CLAIM LANDED'}
            <span>${esc(it.card.technique)} · ${q.name}</span></div>
          <p class="ivt-tell"><b>The tell.</b> ${esc(it.card.tell)}</p>
          <p class="ivt-why">${esc(it.card.debunk)}</p>
          ${held ? '' : `<p class="ivt-cost">It cost you clarity, but you have the technique now —
            the same move will be easier to spot next time.</p>`}
        </div>
        <div class="icont"><button class="btn" id="i-cont">Continue</button>
          <span>or press <kbd>Space</kbd></span></div>`;
    } else if (it.wrong.length === 1) {
      const w = QTYPES.find((x) => x.key === it.wrong[0]);
      verdict = `<div class="ihint">${w.name} does not touch this one — the claim survives it
        intact. One more attempt before it lands.</div>`;
    }

    $('#intercept-body').innerHTML = `
      <div class="itag">INCOMING CLAIM · FEED DRONE</div>
      <blockquote class="iclaim">${esc(it.card.claim)}</blockquote>
      <div class="iprompt">${it.done ? 'Resolved.'
        : 'Which question dismantles this? Take your time — nothing else can reach you.'}</div>
      <div class="iopts">${opts}</div>
      ${verdict}`;

    $$('#intercept-body .iopt:not([disabled])').forEach((b) =>
      b.addEventListener('click', () => this.game.answerIntercept(+b.dataset.slot)));
    const cont = $('#i-cont');
    if (cont) cont.addEventListener('click', () => this.game.closeIntercept());
  },

  /* ---------- dialogue ---------- */
  openDialogue(person, accent) {
    const d = DISTRICTS.find((x) => x.id === person.district);
    const img = $('#dlg-portrait');
    img.src = getPortrait(person, d);
    img.alt = `Stylised interpretive portrait of ${person.name} — an illustration, not a likeness`;
    $('#dlg-name').textContent = person.name;
    $('#dlg-meta').innerHTML =
      `${esc(person.lifespan)} &nbsp;·&nbsp; <b>${esc(person.field)}</b> &nbsp;·&nbsp; ${esc(person.origin || '')}`;
    $('#dialogue').classList.add('on');
    this.setDialogueText(person.intro, null, null, true);
    this.updatePips(person);
  },

  updatePips(person) {
    const asked = this.game.progress[person.id] || [];
    $('#dlg-prog').innerHTML = QTYPES.map((q) =>
      `<div class="pip ${asked.includes(q.key) ? 'on' : ''}"></div>`).join('');
  },

  closeDialogue() {
    $('#dialogue').classList.remove('on');
    this.stopType();
  },

  setDialogueText(text, qtype, concept, instant) {
    $('#dlg-qname').textContent = qtype ? qtype.name : 'GREETING';
    $('#dlg-qask').textContent = qtype ? `“${qtype.ask}”` : 'Choose a question below, or press 1–5.';
    const cel = $('#dlg-concept');
    cel.classList.remove('on');
    if (concept) { cel.textContent = concept; this._pendingConcept = true; }
    else this._pendingConcept = false;
    this.type(text, instant ? 0 : 1);
  },

  type(text, speed) {
    this.stopType();
    const el = $('#dlg-text');
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!speed || still) { el.textContent = text; this.revealConcept(); return; }
    this._typeFull = text;
    let i = 0;
    const CPF = 2.1;   // characters per frame at 60fps ≈ 126 cps
    let acc = 0;
    const step = () => {
      acc += CPF;
      while (acc >= 1 && i < text.length) { i++; acc -= 1; }
      el.innerHTML = esc(text.slice(0, i)) + (i < text.length ? '<span class="cursor"></span>' : '');
      if (i < text.length) this._typeRAF = requestAnimationFrame(step);
      else { this._typeRAF = null; this.revealConcept(); }
    };
    this._typeRAF = requestAnimationFrame(step);
  },

  stopType() { if (this._typeRAF) { cancelAnimationFrame(this._typeRAF); this._typeRAF = null; } },

  skipType() {
    if (!this._typeRAF) return false;
    this.stopType();
    $('#dlg-text').textContent = this._typeFull;
    this.revealConcept();
    return true;
  },

  revealConcept() { if (this._pendingConcept) $('#dlg-concept').classList.add('on'); },

  /* ---------- screens ---------- */
  screen(id, on) { $('#' + id).classList.toggle('on', on); },

  /* ---------- codex ---------- */
  CODEX_TABS: ['ROSTER', 'CONNECTIONS', 'GLOSSARY', 'PROGRESS'],

  openCodex(tab) {
    this._codexTab = tab || this._codexTab || 'ROSTER';
    const g = this.game;
    $('#codex-sub').textContent =
      `${g.countInterviews()} of ${g.roster.length} interviews complete · ${g.countInsights()} insights logged`;
    $('#codex-tabs').innerHTML = this.CODEX_TABS.map((t) =>
      `<button class="btn ghost" data-tab="${t}" style="padding:9px 20px;font-size:10.5px;margin:0 3px${
        t === this._codexTab ? ';background:rgba(127,232,255,.16)' : ''}">${t}</button>`).join('');
    $$('#codex-tabs [data-tab]').forEach((b) =>
      b.addEventListener('click', () => this.openCodex(b.dataset.tab)));
    this.renderCodexBody();
    this.screen('codex', true);
  },

  renderCodexBody() {
    const g = this.game, body = $('#codex-body');
    const T = this._codexTab;

    if (T === 'ROSTER') {
      let h = '';
      for (const d of DISTRICTS) {
        const people = g.roster.filter((p) => p.district === d.id);
        const done = people.filter((p) => (g.progress[p.id] || []).length >= 5).length;
        h += `<h2 class="sec" style="border-color:${d.accent}66;color:${d.accent}">
                ${d.name} · ${esc(d.sub)} <span>${done}/${people.length} complete</span></h2>
              <div class="roster">`;
        for (const p of people) {
          const a = g.progress[p.id] || [];
          h += `<div class="rcard ${a.length ? '' : 'locked'}" data-person="${p.id}" style="--c:${d.accent}">
                  <div class="era">${p.era === 'contemporary' ? 'CONTEMP' : 'HIST'}</div>
                  <img class="rthumb" src="${getPortrait(p, d)}" alt="">
                  <div class="rn">${esc(p.name)}</div>
                  <div class="rl">${esc(p.lifespan)}</div>
                  <div class="rl" style="color:${d.accent};opacity:.85">${esc(p.field)}</div>
                  <div class="rp">${QTYPES.map((q) =>
                    `<i class="${a.includes(q.key) ? 'on' : ''}"></i>`).join('')}</div>
                </div>`;
        }
        h += '</div>';
      }
      body.innerHTML = h;
      $$('#codex-body [data-person]').forEach((el) =>
        el.addEventListener('click', () => this.showPerson(el.dataset.person)));

    } else if (T === 'CONNECTIONS') {
      const found = g.connectionsFound;
      body.innerHTML = `
        <p class="prose" style="margin-bottom:18px">Interdisciplinary links you have opened at the
        Synthesis Terminal in the atrium. <em>${found.length} of ${CONNECTIONS.length}</em> found.</p>
        <div class="connlist">${
          CONNECTIONS.map((cn, i) => found.includes(i) ? this.connCard(cn) : `
            <div class="conn" style="opacity:.35">
              <div class="ch">LOCKED</div>
              <div class="ct">? ? ?</div>
              <div class="cb">Interview both researchers, then pair them at the Synthesis Terminal.</div>
            </div>`).join('')}</div>`;

    } else if (T === 'GLOSSARY') {
      const seen = g.roster.filter((p) => (g.progress[p.id] || []).length > 0);
      const terms = [];
      for (const p of seen) for (const t of (p.terms || [])) terms.push({ ...t, who: p.name });
      terms.sort((a, b) => a.term.localeCompare(b.term));
      body.innerHTML = terms.length
        ? `<p class="prose" style="margin-bottom:16px">Terms unlock as you interview the people who
            work with them. <em>${terms.length}</em> collected.</p>
           <div class="cols">${terms.map((t) => `
             <div class="card"><h3>${esc(t.term)}</h3><p>${esc(t.def)}</p>
             <p style="font-size:10px;color:var(--dim);margin-top:8px;font-family:var(--mono);
                letter-spacing:.1em">VIA ${esc(t.who.toUpperCase())}</p></div>`).join('')}</div>`
        : '<p class="prose">Nothing yet. Interview someone to start the glossary.</p>';

    } else {
      const perOutcome = g.outcomeScores();
      body.innerHTML = `
        <p class="prose" style="margin-bottom:20px">Your field record, mapped onto what the exercise
        is designed to build. Nothing here is a grade — it is a picture of coverage.</p>
        <div class="cols">${perOutcome.map((o) => `
          <div class="card"><h3>${esc(o.name)}</h3><p>${esc(o.detail)}</p>
            <div class="bar"><i style="width:${Math.round(o.pct * 100)}%"></i></div>
            <p style="font-family:var(--mono);font-size:10px;letter-spacing:.12em;margin-top:7px;
               color:var(--acc)">${Math.round(o.pct * 100)}%</p></div>`).join('')}</div>
        <h2 class="sec">Session <span>saved to this browser</span></h2>
        <div class="center"><button class="btn ghost" id="btn-reset"
          style="border-color:#ff8a7a;color:#ff8a7a">Erase progress and restart</button></div>`;
      const rb = $('#btn-reset');
      if (rb) rb.addEventListener('click', () => {
        if (confirm('Erase all progress in this browser and reload?')) g.resetSave();
      });
    }
  },

  connCard(cn) {
    const A = this.byId[cn.a], B = this.byId[cn.b];
    return `<div class="conn">
      <div class="kind">${esc(cn.kind)}</div>
      <div class="ch">${esc(A ? A.name : cn.a)} &nbsp;⟷&nbsp; ${esc(B ? B.name : cn.b)}</div>
      <div class="ct">${esc(cn.title)}</div>
      <div class="cb">${esc(cn.text)}</div></div>`;
  },

  showPerson(id) {
    const g = this.game, p = this.byId[id];
    const asked = g.progress[id] || [];
    if (!asked.length) return;
    const d = DISTRICTS.find((x) => x.id === p.district);
    $('#codex-body').innerHTML = `
      <button class="btn ghost" id="back-roster" style="padding:8px 18px;font-size:10px;margin-bottom:18px">← Roster</button>
      <div class="detail" style="border-color:${d.accent}55">
        <div class="label" style="color:${d.accent}">${esc(d.name)} · ${p.era === 'contemporary' ? 'CONTEMPORARY' : 'HISTORICAL'}</div>
        <h1 class="title" style="font-size:30px;letter-spacing:.08em;text-align:left;margin:8px 0 4px">${esc(p.name)}</h1>
        <div style="font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;color:var(--dim)">
          ${esc(p.lifespan)} · ${esc(p.field)} · ${esc(p.origin || '')}</div>
        <div class="detail-top">
          <figure class="portrait">
            <img src="${getPortrait(p, d)}" alt="Stylised interpretive portrait of ${esc(p.name)}">
            <figcaption>Interpretive plate — an illustration built from documented
              descriptions, not a likeness.</figcaption>
          </figure>
          <p class="prose" style="margin:0;font-style:italic;color:${d.accent}">${esc(p.hook)}</p>
        </div>
        ${QTYPES.map((q) => asked.includes(q.key) ? `
          <div class="dq">
            <div class="qh">${q.name} — ${esc(q.ask)}</div>
            <div class="qb">${esc(p.answers[q.key].text)}</div>
            <div style="font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;color:${d.accent};margin-top:6px">
              ◆ ${esc(p.answers[q.key].concept)}</div>
          </div>` : `
          <div class="dq" style="opacity:.32">
            <div class="qh">${q.name} — not yet asked</div>
          </div>`).join('')}
        ${asked.length >= 5 ? `
          <div class="myth">
            <div class="label" style="color:#ff9d5c">Common misconception</div>
            <div class="m">${esc(p.misconception.myth)}</div>
            <div class="r">${esc(p.misconception.reality)}</div>
          </div>
          <div class="termlist">${(p.terms || []).map((t) =>
            `<div class="term"><b>${esc(t.term)}</b> <span>— ${esc(t.def)}</span></div>`).join('')}</div>
          <p style="font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:var(--dim);margin-top:18px">
            RECOGNITION · ${esc(p.recognition)}</p>` : `
          <p class="prose" style="margin-top:18px;opacity:.6">Ask all five questions to unlock the
          misconception note, the glossary terms and the recognition record.</p>`}
      </div>`;
    $('#back-roster').addEventListener('click', () => this.openCodex('ROSTER'));
    $('#codex').scrollTop = 0;
  },

  /* ---------- vault quiz ---------- */
  openQuiz(districtId) {
    const g = this.game;
    const d = DISTRICTS.find((x) => x.id === districtId);
    const v = VAULTS[districtId];
    this._quizD = districtId;
    this._quizAnswers = g.vaultAnswers[districtId] || {};
    $('#quiz-eyebrow').textContent = `INSIGHT VAULT · ${d.name}`;
    $('#quiz-title').textContent = v.title;
    this.renderQuiz();
    this.screen('quiz', true);
  },

  renderQuiz() {
    const g = this.game, id = this._quizD, v = VAULTS[id];
    const ans = this._quizAnswers;
    const doneCount = Object.keys(ans).length;
    $('#quiz-body').innerHTML = `
      <p class="prose" style="margin-bottom:8px">Three questions. None of them ask you to recall a
      name or a date — they ask you to reason the way the people in this district reasoned.
      Every option explains itself once chosen.</p>
      <div class="bar" style="max-width:300px"><i style="width:${(doneCount / v.questions.length) * 100}%"></i></div>
      ${v.questions.map((q, qi) => {
        const picked = ans[qi];
        return `<div style="margin-top:30px">
          <div class="label">Question ${qi + 1} of ${v.questions.length}</div>
          <p class="prose" style="font-size:16px;color:var(--ink);margin:8px 0 4px">${esc(q.prompt)}</p>
          ${q.options.map((o, oi) => {
            let cls = 'qopt';
            if (picked != null) {
              cls += ' show';
              if (oi === q.correct) cls += ' right';
              else if (oi === picked) cls += ' wrong';
            }
            return `<button class="${cls}" data-q="${qi}" data-o="${oi}" ${picked != null ? 'disabled' : ''}>
              <span class="tag">${String.fromCharCode(65 + oi)}</span> &nbsp;${esc(o)}
              <span class="why">${oi === q.correct ? '<b style="color:#4fe08a">CORRECT — </b>' :
                (oi === picked ? '<b style="color:#ff9d8a">NOT QUITE — </b>' : '')}${esc(q.why[oi])}</span>
            </button>`;
          }).join('')}
        </div>`;
      }).join('')}
      ${doneCount === v.questions.length ? `
        <div class="notice" style="margin-top:30px;border-color:rgba(90,230,150,.45);background:rgba(14,50,32,.4);color:#c6f0d8">
          <b>Vault sealed and logged.</b> You answered
          ${v.questions.filter((q, i) => ans[i] === q.correct).length} of ${v.questions.length}
          correctly on the first attempt. The explanations stay in your codex either way — the point
          was the reasoning, not the score.
        </div>` : ''}`;
    $$('#quiz-body .qopt:not([disabled])').forEach((b) => b.addEventListener('click', () => {
      const qi = +b.dataset.q, oi = +b.dataset.o;
      this._quizAnswers[qi] = oi;
      g.recordVaultAnswer(this._quizD, qi, oi);
      this.renderQuiz();
    }));
  },

  /* ---------- synthesis terminal ---------- */
  openSynth() {
    this._pick = [];
    this.renderSynth();
    this.screen('synth', true);
  },

  renderSynth() {
    const g = this.game;
    const eligible = g.roster.filter((p) => (g.progress[p.id] || []).length >= 5);
    $('#synth-status').textContent = eligible.length < 2
      ? `Fully interview at least two researchers to use this terminal — ${eligible.length} so far.`
      : this._pick.length === 0 ? 'Select the first researcher.'
      : this._pick.length === 1 ? `${this.byId[this._pick[0]].name} selected — choose a second.`
      : '';
    $('#synth-grid').innerHTML = g.roster.map((p) => {
      const ok = (g.progress[p.id] || []).length >= 5;
      const d = DISTRICTS.find((x) => x.id === p.district);
      return `<div class="spick ${ok ? '' : 'locked'} ${this._pick.includes(p.id) ? 'sel' : ''}"
        data-p="${p.id}" style="--c:${d.accent}">${esc(p.name)}
        <small>${esc(d.name.replace('THE ', ''))}${ok ? '' : ' · LOCKED'}</small></div>`;
    }).join('');
    $$('#synth-grid .spick:not(.locked)').forEach((el) =>
      el.addEventListener('click', () => this.pickSynth(el.dataset.p)));

    const found = g.connectionsFound;
    $('#synth-count').textContent = `${found.length} / ${CONNECTIONS.length}`;
    $('#synth-list').innerHTML = found.length
      ? found.map((i) => this.connCard(CONNECTIONS[i])).join('')
      : '<p class="prose" style="opacity:.6">None yet.</p>';
  },

  pickSynth(id) {
    const i = this._pick.indexOf(id);
    if (i >= 0) this._pick.splice(i, 1);
    else if (this._pick.length < 2) this._pick.push(id);
    else this._pick = [id];

    if (this._pick.length === 2) {
      const res = this.game.trySynthesis(this._pick[0], this._pick[1]);
      const box = $('#synth-result');
      if (res.found) {
        box.innerHTML = `<div class="notice" style="border-color:rgba(90,230,150,.5);
          background:rgba(14,50,32,.4);color:#c9f2dc"><b>CONNECTION OPENED.</b></div>
          <div style="margin-top:12px">${this.connCard(res.conn)}</div>`;
      } else {
        box.innerHTML = `<div class="notice"><b>No established link on record.</b> ${esc(res.hint)}</div>`;
      }
      this._pick = [];
      setTimeout(() => this.renderSynth(), 30);
      return;
    }
    this.renderSynth();
  },

  /* ---------- convocation (the win) ---------- */
  openWin() {
    const g = this.game;
    const outcomes = g.outcomeScores();
    const grads = g.life.students.filter((s) => g.life.tier(s) >= 3).length;
    const informed = g.life.students.filter((s) => g.life.tier(s) >= 2).length;
    $('#win-body').innerHTML = `
      <p class="prose center" style="margin:0 auto 8px;font-size:17px;color:var(--ink)">
        Five districts secured. Twenty-four researchers on the record. The feed is quiet, and the
        students are teaching each other.
      </p>
      <div class="cols" style="margin-top:26px">
        <div class="card"><h3>Researchers</h3><p><b style="font-size:26px;color:var(--acc)">${g.countInterviews()}</b>
          / ${g.roster.length} fully interviewed — ${g.countInsights()} insights logged.</p></div>
        <div class="card"><h3>The feed</h3><p><b style="font-size:26px;color:var(--acc)">${g.debunked || 0}</b>
          manipulative claims dismantled by naming the technique behind them.</p></div>
        <div class="card"><h3>The cohort</h3><p><b style="font-size:26px;color:var(--acc)">${grads}</b>
          graduates and ${informed} informed students, from ${g.taught || 0} insights handed over.</p></div>
        <div class="card"><h3>Connections</h3><p><b style="font-size:26px;color:var(--acc)">${g.connectionsFound.length}</b>
          / ${CONNECTIONS.length} interdisciplinary links opened.</p></div>
      </div>
      <h2 class="sec">Outcome coverage <span>not a grade — a picture of what you did</span></h2>
      <div class="cols">${outcomes.map((o) => `
        <div class="card"><h3>${esc(o.name)}</h3><p>${esc(o.detail)}</p>
          <div class="bar"><i style="width:${Math.round(o.pct * 100)}%"></i></div></div>`).join('')}</div>
      <h2 class="sec">The actual lesson <span>read this bit</span></h2>
      <p class="prose">You never won an argument in this game. You won by asking what the evidence
      was, how it was produced, and what remained uncertain — and then by handing that to someone
      else. The drones fell to <em>named techniques</em>, not to counter-claims. And the district
      that got quietest fastest was the one where the students had learned enough to answer for
      themselves.</p>
      <p class="prose" style="margin-top:14px">Every word here was written for this game. The next
      move is the one every researcher on this station would tell you to make: find the original
      paper and read the methods section first.</p>`;
    this.screen('win', true);
  },

  /* ---------- debrief ---------- */
  openEnd() {
    const g = this.game;
    const outcomes = g.outcomeScores();
    const doubts = g.roster.filter((p) => (g.progress[p.id] || []).includes('doubt')).length;
    $('#end-body').innerHTML = `
      <p class="prose center" style="margin:0 auto 26px">
        You interviewed <em>${g.countInterviews()}</em> of ${g.roster.length} researchers, logged
        <em>${g.countInsights()}</em> insights, opened <em>${g.connectionsFound.length}</em> of
        ${CONNECTIONS.length} interdisciplinary connections and sealed <em>${g.countVaults()}</em> of
        five vaults. You asked <em>${doubts}</em> people what they got wrong. You dismantled
        <em>${g.debunked || 0}</em> manipulative claims and handed an insight to
        <em>${g.taught || 0}</em> students.
      </p>
      <div class="cols">${outcomes.map((o) => `
        <div class="card"><h3>${esc(o.name)}</h3><p>${esc(o.detail)}</p>
          <div class="bar"><i style="width:${Math.round(o.pct * 100)}%"></i></div></div>`).join('')}</div>
      <h2 class="sec">Where to go next <span>this game is a doorway, not a source</span></h2>
      <p class="prose">Every claim in here is a compressed paraphrase. If any of it mattered to you,
      the next move is the same one every researcher on this station would tell you to make: find the
      original paper, read the methods section first, and check whether the evidence actually supports
      what you were told it supports.</p>`;
    this.screen('endgame', true);
  },
};
