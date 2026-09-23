# INQUIRY — a first-person science interview

An FPS-shaped exploration game where the weapon is a question. You walk a research station and
interview thirty historical and contemporary scientists; the goal is to reconstruct how they knew
what they knew, not to memorise what they found. Then they ask *you* something.

**▶ Play it: https://taaltree.github.io/inquiry/**

Built as a single self-contained HTML file. No dependencies, no network calls, no build-time
assets — the renderer, the world, the figures, the portraits and every piece of text are generated
in code. Needs a keyboard and mouse.

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
pointing at an unknown id, a vault question with the wrong number of options, a misinformation
card with an invalid weakness, a marginal note whose owner is in the wrong district, or a
scientist without a challenge question all fail the build rather than reaching the site.

To add a scientist, edit the relevant `src/data/<district>.json` (the schema is documented in
`src/data/SCHEMA.md`), give them an entry in `LOOKS` in `src/actors.js` and `FACES` in
`src/portrait.js`, a note in `marginalia.json`, a question in `challenges.json`, and push.

## Two levels

**Level 1 — THE COLLOQUIUM.** A research station, on foot. Twenty-four scientists across five
discipline districts, each secured by interviewing its researchers, sealing its vault, educating
its students and clearing its feed — the last drone of which is a **Peer Review**. All five opens
the Convocation.

**Level 2 — THE SUMMIT.** A residential conference at altitude where everyone gets between
sessions on a snowboard, so the level is one continuous descent. Six professors hold sessions
down the fall line, fourteen grad students ride it with you, and the feed is airborne. Same five
questions, same teaching, same inoculation — different verbs. It ends at the poster session,
where somebody hands you a beer.

## The design

**The five questions are the whole mechanic.** Instead of weapon slots 1–5 the player carries
`PROBE · METHOD · EVIDENCE · IMPACT · DOUBT`. That sequence is the anatomy of a scientific
argument, and asking all five of someone is what "completing" them means. `DOUBT` — what were
you wrong about, or still don't know — is the slot the whole thing is built around.

**The weapon is a book.** You hold the Codex, a large open tome. The sigil on its right-hand page
takes the colour of the question you have selected and is the muzzle; the tabs on its fore-edge
are the five slots, and choosing a new question turns a page. A question type can only be fired
once you have actually asked it of someone, so the field is gated on the interviews.

**Citations are the specific weapon.** The right question type beats a claim generically. Somebody's
actual work beats it *specifically* — and you only hold that work if you went and asked them about
it. Every one of the 20 cards names the researchers whose findings settle it (55 citations in all),
and aiming at a drone shows `C · cite Vera Rubin` if you have interviewed her. A citation destroys
the claim whatever its weakness, strips a layer off a Peer Review, and — the point — **spreads to
every student in earshot**, because a sourced refutation is the kind other people can repeat. If you
have nobody, the game tells you who would have had the answer, which turns the feed into a reading
list.

**Then they ask you one.** Once all five questions are logged, the scientist turns the interview
around: a short scenario in their own mode of inference, four answers, one right. Every option
explains itself once chosen. A right answer earns their **endorsement**; a wrong one costs nothing
but is remembered. Thirty such questions, none of which repeat the vault material.

**A world worth climbing.** The atrium has a mezzanine up two staircases with a zipline out to
every district. Each district has a loft up a flight of stairs, a jump pad that throws you onto a
floating island over the void, and a balcony off the outer ring reached by zipline from the loft.
Thirty **marginalia** — objects, papers and specimens from the scientists' real work, each with a
short note — are hidden on those lofts, islands, balconies, kiosks and the mezzanine, and beside
the session tents on the mountain. They persist in the Codex. Falling off the station puts you
back on the deck, nothing worse.

**Structure.** A pentagonal station: a central atrium ringed by five discipline districts
(Foundry / Observatory / Helix / Lattice / Engine), joined by radial causeways and an outer
ring walkway. Each district holds 4–6 scientists, a signature megastructure, and an Insight
Vault that unseals once everyone there has been fully interviewed.

**Assessment is reasoning, not recall.** The 15 vault questions never ask for a name or a date.
They ask which experimental design would distinguish two hypotheses, what a result does and
does not license, and why consensus can lag correct evidence. Every option — right or wrong —
explains itself once chosen, so the distractors are the teaching.

**Synthesis is the interdisciplinary layer.** 14 real links between researchers, 12 of them
crossing districts, opened by pairing two completed interviews at the atrium terminal.

**The feed is there from the first minute.** Before you have asked anybody anything you have no
counter, so the drones ignore you and work on the students — which is the honest version of the
metaphor and the reason to go and find a scientist. Ask one question and the feed notices you.

**The feed fights back.** Drifting Feed Drones fire manipulative claims at the player and at the
student crowd. Each of the 20 cards is destroyed by exactly one question type — the one that
structurally dismantles its technique (cherry-picking falls to EVIDENCE; fake expertise to METHOD;
manufactured doubt to DOUBT). Fire the wrong one and the claim shrugs it off and reveals its
weakness. This is **inoculation pedagogy**: weakened doses of real manipulation *techniques*, with
the correction always attached and the technique always named. Four of the twenty target
pro-science overclaiming rather than denial, because the lesson is calibration, not tribal loyalty.

**Peer Review is the boss.** The last drone owed by each district arrives with five shields, one
per question type, and they fall only in order: PROBE, METHOD, EVIDENCE, IMPACT, DOUBT — the
argument, assembled. Fire out of sequence and nothing happens except a hint. Its own claims are
always ones the next shield's question dismantles, so getting hit teaches the order too. Educated
students can wear a layer down for you.

**A claim that reaches you stops the world.** There is deliberately no timer. The screen halts,
the claim is shown large, and you pick which of the five questions dismantles it. Get it right and
it never lands. Get it wrong once and you are told *why that question doesn't touch this claim*,
with one attempt left. Get it wrong twice and it lands — raising *mind pollution*, which tears and
desaturates the view — but **you are shown the technique and the correction either way**. A red arc
shows where the shot came from. Afterwards there is a six-second grace window, and a drone will
never fire at you while another claim is already in the air, so reading time is always protected.

**Educated students defend themselves.** Each student has four tiers — Unaware, Curious, Informed,
Graduate — with an unmistakable silhouette at each: a floating book, then an academic scarf, then a
gown and mortarboard with a halo. From Informed they return fire on drones; Graduates aim better and
hit harder. That is the thesis of the whole game made mechanical: education is herd immunity.

**You can always see what a student needs.** Every student carries a persistent status plate —
tier, progress, and the one question type that will help them most, with the key to press.
Waypoints in the world show the next researcher, the vault when it is ready, nearby drones and
marginalia, with distances; the objective panel tracks the four tasks of the district you are in.

## Winning

Each district is a level with four tasks, tracked live on the objective panel:

```
SECURE THE FOUNDRY
  ✓ Interview the researchers   4/4
  ✓ Seal the Insight Vault      3/3
  ▢ Educate the students        2/4     (to Informed or better)
  ▢ Clear the feed              1/3     (the third is a Peer Review)
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
| The Summit | Thompson, Hayhoe, Simard, Bertozzi, Yamanaka, Charpentier |

## On the portraits

Each scientist has a procedurally drawn **interpretive plate** — a duotone engraving built from a
small parameter set (head shape, hair, facial hair, eyewear, collar) chosen to match documented
visual descriptions. These are **illustrations, not likenesses**, and every one is captioned as
such. Nothing is traced from or derived from any photograph.

## On the dialogue

**Every line is written for the game. Nothing is a real quotation.** The research, methods, career
histories and controversies are drawn from the public record and are meant to be accurate; the
voices are dramatisations. The marginalia describe real objects and papers and are meant to be
accurate about dates, places and what was shown. This is stated on the title screen. It is a
doorway to the primary literature, not a citable source.

## Layout

```
src/
  core.js      math, GL plumbing, mesh upload, framebuffers, canvas→texture
  geom.js      primitive generators + transform-baking mesh builder (pos, normal, colour, glow, roughness, metalness)
  render.js    the frame pipeline: shadow map → PBR scene with g-buffer → SSAO → bloom → god rays → graded composite
  fx.js        the particle pool (discs and streaks)
  world.js     procedural station: districts, causeways, landmarks, and the traversal layer (stairs, lofts, islands, pads, ziplines, lecterns)
  actors.js    scientist figures, nameplates, the Codex viewmodel, floating pages
  portrait.js  procedural duotone portrait plates
  campus.js    the title-screen collegiate court, drawn procedurally
  mountain.js  level 2: heightfield terrain, lodge, lift, snowboard physics
  life.js      articulated student crowd + education tiers, Feed Drones, Peer Review, projectiles
  hud.js       reticle, waypoints, boss bar, dialogue + challenges, codex, quizzes, synthesis, pause
  game.js      player physics (jump, ledges, pads, ziplines), input, interaction, main loop, save/load
  style.css    HUD styling
  body.html    markup
  data/        one JSON file per district, plus summit.json (level 2 professors),
               connections / vaults / misinfo (20 technique cards) / students / marginalia / challenges
build.mjs      validates the content, then fuses everything into dist/
```

## Technical notes

Hand-rolled WebGL2. One static mesh for the whole station in a single draw call, plus animated
spinners, figures and a crowd. The renderer is a small deferred-ish pipeline: a 2048² shadow map
with hardware PCF, a physically based scene pass (GGX, hemisphere ambient, the 16 nearest lights)
that also writes a normal/depth g-buffer, half-resolution SSAO, quarter-resolution bloom and
god rays, and a single composite with split-tone grading, ACES, vignette, chromatic aberration,
grain and the mind-pollution distortion. Resolution scales itself down if frame time stays above
~26 ms. Progress saves to `localStorage`; the codex has a reset button.

## Controls, and why they are built the way they are

Pointer lock is **blocked by feature policy in a sandboxed frame**, which is exactly where this
runs when published. So it is treated as a bonus, never a requirement:

- **Drag to look** works everywhere — hold the left button and move.
- **True mouselook** engages automatically if a lock request succeeds.
- **Arrow keys** turn and walk, so the whole game is playable with no mouse at all.
- **Space** jumps; **Shift** sprints. **Click / F** fires the Codex; **E / right-click** interviews
  and grabs ziplines; **1–5, Q R, wheel** choose the question; **Tab** opens the Codex; **Esc** pauses.

Look sensitivity and invert-Y are on the title screen and persist. Needs a keyboard — there is no
touch scheme, and the title screen says so on a coarse pointer.
