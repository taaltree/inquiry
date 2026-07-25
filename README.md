# INQUIRY — a first-person science interview

An FPS-shaped exploration game where the weapon is a question. You walk a 3D station and
interview 24 historical and contemporary scientists; the goal is to reconstruct how they knew
what they knew, not to memorise what they found.

**▶ Play it: https://taaltree.github.io/inquiry/**

Built as a single self-contained HTML file. No dependencies, no network calls, no build-time
assets — the renderer, the world, the figures and every piece of text are generated in code.
Needs a keyboard and mouse.

```bash
npm run build     # validates the content, then bundles src/ into dist/
npm run serve     # build and serve at http://localhost:8731
```

## Keeping it updated

The site rebuilds itself. Edit anything under `src/` — including the content in `src/data/` —
then:

```bash
git add -A && git commit -m "your change" && git push
```

A GitHub Actions workflow runs `node build.mjs` and redeploys Pages on every push to `main`.
The build **validates content before it ships**: a scientist missing an answer, a connection
pointing at an unknown id, a vault question with the wrong number of options, or a misinformation
card with an invalid weakness all fail the build rather than reaching the site.

To add a scientist, edit the relevant `src/data/<district>.json` (the schema is documented in
`src/data/SCHEMA.md`), give them an entry in `LOOKS` in `src/actors.js` and `FACES` in
`src/portrait.js`, and push.

## Two levels

**Level 1 — THE COLLOQUIUM.** A research station, on foot. Twenty-four scientists across five
discipline districts, each secured by interviewing its researchers, sealing its vault, educating
its students and clearing its feed. All five opens the Convocation.

**Level 2 — THE SUMMIT.** A residential conference at altitude where everyone gets between
sessions on a snowboard, so the level is one continuous descent. Six professors hold sessions
down the fall line, fourteen grad students ride it with you, and the feed is airborne. Same five
questions, same teaching, same inoculation — different verbs. It ends at the poster session,
where somebody hands you a beer.

The mountain is a deterministic heightfield: a broad valley with a groomed piste down the middle
and rougher snow either side. Riding is arcade, not simulation — gravity pulls you down the fall
line, carving across it scrubs speed, and the camera banks into the turn.

## The design

**The five questions are the whole mechanic.** Instead of weapon slots 1–5 the player carries
`PROBE · METHOD · EVIDENCE · IMPACT · DOUBT`. That sequence is the anatomy of a scientific
argument, and asking all five of someone is what "completing" them means. `DOUBT` — what were
you wrong about, or still don't know — is the slot the whole thing is built around.

**Ammunition is knowledge.** Those same five slots are the weapon. A question type can only be
fired once you have actually asked it of someone, so the field is gated on the interviews.

**Structure.** A pentagonal station: a central atrium ringed by five discipline districts
(Foundry / Observatory / Helix / Lattice / Engine), joined by radial causeways and an outer
ring walkway. Each district holds 4–6 scientists, a signature megastructure, and an Insight
Vault that unseals once everyone there has been fully interviewed.

**Assessment is reasoning, not recall.** The 15 vault questions never ask for a name or a date.
They ask which experimental design would distinguish two hypotheses, what a result does and
does not license, and why consensus can lag correct evidence. Several present a novel scenario
and ask the player to transfer a mode of inference to it. Every option — right or wrong —
explains itself once chosen, so the distractors are the teaching.

**Synthesis is the interdisciplinary layer.** 14 real links between researchers, 12 of them
crossing districts, opened by pairing two completed interviews at the atrium terminal.

**The feed fights back.** Drifting Feed Drones fire manipulative claims at the player and at the
student crowd. Each of the 20 cards is destroyed by exactly one question type — the one that
structurally dismantles its technique (cherry-picking falls to EVIDENCE; fake expertise to METHOD;
manufactured doubt to DOUBT). Fire the wrong one and the claim shrugs it off and reveals its
weakness. This is **inoculation pedagogy**: weakened doses of real manipulation *techniques*, with
the correction always attached and the technique always named. Four of the twenty target
pro-science overclaiming rather than denial, because the lesson is calibration, not tribal loyalty.

**A claim that reaches you stops the world.** There is deliberately no timer. The screen halts,
the claim is shown large, and you pick which of the five questions dismantles it. Get it right and
it never lands. Get it wrong once and you are told *why that question doesn't touch this claim*,
with one attempt left. Get it wrong twice and it lands — raising *mind pollution*, which tears and
desaturates the view — but **you are shown the technique and the correction either way**. Guessing
costs clarity, never understanding. Afterwards there is a six-second grace window, and a drone will
never fire at you while another claim is already in the air, so reading time is always protected.

**Educated students defend themselves.** Each student has four tiers — Unaware, Curious, Informed,
Graduate — with an unmistakable silhouette at each: a floating book, then an academic scarf, then a
gown and mortarboard with a halo. From Informed they return fire on drones; Graduates aim better and
hit harder. A drone worn down by students is credited to them. That is the thesis of the whole game
made mechanical: education is herd immunity.

**You can always see what a student needs.** Every student carries a persistent status plate —
tier, progress, and the one question type that will help them most, with the key to press. A
matching insight is worth double. Feedback is a centred banner that holds long enough to read,
not a flicker.

**Teaching is the only repair.** Fire an insight at a student and they take it. Students hit by
the feed wander confused until someone teaches them out of it — scored separately, because the
protégé effect is real and because it is the one action in the game that undoes damage.

## Winning

Each district is a level with four tasks, tracked live on the objective panel:

```
SECURE THE FOUNDRY
  ✓ Interview the researchers   4/4
  ✓ Seal the Insight Vault      3/3
  ▢ Educate the students        2/4     (to Informed or better)
  ▢ Clear the feed              1/3     (three drones, quota'd per district)
```

All four secures the district. All five districts opens the **Convocation** at the atrium terminal —
the win screen, which reports the cohort you built and the outcome coverage you actually hit.

## Roster

| District | Scientists |
|---|---|
| The Foundry | Newton, Curie, Wu, Strickland |
| The Observatory | Einstein, Payne-Gaposchkin, Chandrasekhar, Rubin, Bouman |
| The Helix | Darwin, Franklin, McClintock, Tu Youyou, Doudna, Karikó |
| The Lattice | Mendeleev, Hodgkin, Molina, Arnold |
| The Engine | Lovelace, Noether, Turing, Ramón y Cajal, Fei-Fei Li |

## On the portraits

Each scientist has a procedurally drawn **interpretive plate** — a duotone engraving built from a
small parameter set (head shape, hair, facial hair, eyewear, collar) chosen to match documented
visual descriptions. These are **illustrations, not likenesses**, and every one is captioned as
such. The engraving treatment is deliberate on two counts: it signals "archival illustration"
rather than "photograph", and it avoids inventing skin tones for real people. Nothing is traced
from or derived from any photograph.

## On the dialogue

**Every line is written for the game. Nothing is a real quotation.** The research, methods, career histories and
controversies are drawn from the public record and are meant to be accurate; the voices are
dramatisations. This is stated on the title screen, and it is the first thing a student should
read. It is a doorway to the primary literature, not a citable source.

## Layout

```
src/
  core.js      math, GL plumbing, mesh upload, canvas→texture
  geom.js      primitive generators + transform-baking mesh builder
  render.js    shaders and the frame pipeline (scene → bloom → composite)
  world.js     procedural station: districts, causeways, landmarks, navigation
  actors.js    scientist figures, nameplates, the Inquiry Device viewmodel
  portrait.js  procedural duotone portrait plates
  campus.js    the title-screen collegiate court, drawn procedurally
  mountain.js  level 2: heightfield terrain, lodge, lift, snowboard physics
  life.js      student crowd + education tiers, Feed Drones, projectiles
  hud.js       reticle, compass, minimap, dialogue, codex, quizzes, synthesis
  game.js      player, input, interaction, main loop, save/load
  style.css    HUD styling
  body.html    markup
  data/        one JSON file per district, plus summit.json (level 2 professors),
               connections / vaults / misinfo (20 technique cards) / students
build.mjs      validates the content, then fuses everything into dist/
```

`node build.mjs` validates every scientist (all five answers, concept tags, misconception,
terms), every connection (known ids, valid kind, no duplicate pairs), every vault question
(4 options, 4 explanations, in-range answer index) and every misinformation card (valid weakness,
and that all five question types remain useful) before emitting:

- `dist/inquiry.html` — full standalone page
- `dist/artifact.html` — body-only, for hosts that supply the shell

## Technical notes

Hand-rolled WebGL2. One static mesh for the whole station in a single draw call, plus ~20
animated spinners and 24 figures. Forward lighting with the 16 strongest lights near the
camera, procedural sky with a raymarched-cell starfield, and a threshold → 2× separable blur →
composite bloom chain with vignette, chromatic aberration, grain and scanlines.

Resolution scales itself down if frame time stays above ~26 ms, so it degrades in sharpness
rather than smoothness. Progress saves to `localStorage`; the codex has a reset button.

## Controls, and why they are built the way they are

Pointer lock is **blocked by feature policy in a sandboxed frame**, which is exactly where this
runs when published. So it is treated as a bonus, never a requirement:

- **Drag to look** works everywhere — hold the left button and move.
- **True mouselook** engages automatically if a lock request succeeds.
- **Arrow keys** turn and walk, so the whole game is playable with no mouse at all.
- **Click / F / Space** fires; **E / right-click** interviews; **Q R / wheel** cycle question types.

Look sensitivity and invert-Y are on the title screen and persist. Needs a keyboard — there is no
touch scheme, and the title screen says so on a coarse pointer.
