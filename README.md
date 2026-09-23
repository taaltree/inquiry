# INQUIRY — a first-person science interview

An open-world game on a university campus where the weapon is a question. You walk — or cycle,
or drive a campus cart — around a Cambridge-style college and interview thirty historical and
contemporary scientists; the goal is to reconstruct how they knew what they knew, not to memorise
what they found. Then they ask *you* something.

**▶ Play it: https://taaltree.github.io/inquiry/**

Built as a single self-contained HTML file. No dependencies, no network calls, no image or model
files — the renderer, every texture, the buildings, trees, people and every piece of text are
generated in code. Needs a keyboard and mouse.

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

**Level 1 — THE COLLOQUIUM.** A university campus, on foot and on two wheels. A Great Court with a
library, a chapel, a clock tower and a gatehouse; five departments around it (Foundry Hall, the
Observatory on its hill, the Helix Building and its glasshouse, the Lattice Laboratory, the Engine
House); the river and the Backs to the west; playing fields to the north; the town street to the
south. Twenty-four scientists, each department secured by interviewing its researchers, sealing its
vault, educating its students and clearing its feed — the last drone of which is a **Peer Review**.
All five opens the Convocation at the library.

**Moving through it, the GTA way.** A third-person camera over your shoulder (V for first person),
right-click to aim, a rotating radar with blips and a GPS route to your next objective, a full map
(M) where a click drops a waypoint, area names as you walk into places, bicycles and campus carts
to borrow (E), traffic on the town roads, and a time-of-day clock that takes the campus from
golden hour through dusk to a starlit night with lit windows and street lamps.

**A campus full of people doing things.** About two hundred students, and most of them are
together: conversation circles that take turns talking and crack up laughing, sunbathers on
towels (stargazers after dark), beer pong with real turns — makes, misses, the loser drinking the
cup, a rerack when a side is cleared — frisbee with catches, dives and dropped throws, hacky sack,
picnics, a guitar circle that sings along and applauds at the end of each song, selfies at the
fountain, people studying on the grass, on benches and at café tables. Between them, passers-by
on phones, carrying coffee, walking in pairs and jogging, and students cycling the paths who
ring their bell and brake for you. They glance at you when you walk up, complain when you bump
into them, jump out of the way of your bike, look up and film a drone when one flies low. You
overhear them in speech bubbles, and after dark the evening groups light a lantern.

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

**A campus worth exploring.** Thirty **marginalia** — objects, papers and specimens from the
scientists' real work, each with a short note — wait on lecterns around the campus: under Newton's
apple tree, on the Observatory's hill and its meridian line, inside the glasshouse, on the Engine
House's green roof (up the outside stair), by the river, at the bus stop, and beside the session
tents on the mountain. The radar shows the ones near you; they persist in the Codex.

**Structure.** Each department holds 4–6 scientists standing around its forecourt, marked by a
glowing ring in the department's colour, and an Insight Vault — its front door — that unseals once
everyone there has been fully interviewed.

**Assessment is reasoning, not recall.** The 15 vault questions never ask for a name or a date.
They ask which experimental design would distinguish two hypotheses, what a result does and
does not license, and why consensus can lag correct evidence. Every option — right or wrong —
explains itself once chosen, so the distractors are the teaching.

**Synthesis is the interdisciplinary layer.** 14 real links between researchers, 12 of them
crossing districts, opened by pairing two completed interviews at the atrium terminal.

**The feed is there from the first minute.** Before you have asked anybody anything you have no
counter, so the drones ignore you and work on the students — which is the honest version of the
metaphor and the reason to go and find a scientist. Ask one question and the feed notices you.

**The feed occupies the campus.** Drones circle the Great Court and every department from the
moment you arrive — seven before you can answer them, a dozen once you can. When you dismantle one,
another flies in, until that department's feed is cleared: four drones and then its Peer Review.
The nearest three break off to hunt you, a GTA-style heat meter by the radar shows how many, and at
night they carry their own pink light.

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

**Word of mouth.** Teach one member of a group and they turn and tell the rest: the idea travels
from head to head and everyone in earshot moves up a tier (second-hand knowledge can take someone
as far as Informed, but graduating takes you). Groups are worth far more than people on their own,
so you go looking for the pong table and the picnic. **Reach** — how many people on campus have
heard an idea from you, directly or not — is the headline stat, with milestones along the way.

**Things to find, and things to do.** Between interviews, GTA-style side content that still feeds
the main goal:

- **24 overdue library books** hidden around campus — on the bridge, in the glasshouse, on the
  Engine House roof, under Newton's apple tree. Each is a real classic of science (Euclid,
  al-Khwarizmi, Ibn al-Haytham, Copernicus, Hooke, Lovelace, Darwin, Snow, Nightingale, Mendel,
  Curie, Leavitt, Payne, Turing, Carson…) with a line on why it mattered. Every six returned
  unlocks something: you run faster, then insights splash to a second student, then the rest are
  marked on your map, and finally a golden bicycle appears on the library steps.
- **The bicycle collection.** Almost every bike on a rack can be borrowed now (over ninety), and
  five odd ones are parked somewhere worth riding to — a penny-farthing, a tandem, a racer, a BMX
  and a Dutch cargo bike — each with its own handling and a line of history. Space bunny-hops.
- **Twelve noticeboards** the feed has plastered with flyers. Press E to tear them down and pin
  up the last thing a scientist told you; anyone who walks past reads it, and your Reach grows.
- **Five stunt ramps.** Hit one at full speed and time slows while you are in the air; clear the
  distance to complete it.

The Codex's Progress tab lists what you have found and what is still out there.

**Educated students defend themselves.** Each student has four tiers — Unaware, Curious, Informed,
Graduate — with an unmistakable silhouette at each: a floating book, then an academic scarf, then a
gown and mortarboard with a halo. From Informed they return fire on drones; Graduates aim better and
hit harder. That is the thesis of the whole game made mechanical: education is herd immunity.

**You can always see what a student needs.** Put the crosshair on anyone and their status plate
appears — tier, progress, and the one question type that will help them most, with the key to press.
Waypoints in the world show the next researcher, the vault when it is ready, nearby drones and
marginalia, with distances; the objective panel tracks the four tasks of the district you are in.

## Winning

Each district is a level with four tasks, tracked live on the objective panel:

```
SECURE THE FOUNDRY
  ✓ Interview the researchers   4/4
  ✓ Seal the Insight Vault      3/3
  ▢ Educate the students        2/6     (to Informed or better — the groups near the department)
  ▢ Clear the feed              1/5     (the fifth is a Peer Review)
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

## How it looks the way it does

- **Materials are procedural textures** rendered on the GPU at load into a 28-layer texture array
  with normal maps: limestone ashlar, red and gault brick, slate, clay tile, lawn, gravel, York
  stone, granite setts, asphalt, board-marked concrete, timber, sash and gothic tracery windows,
  curtain walling, shopfronts, leaves, needles, willow strands, bark, hedge, copper, lead.
- **Buildings come from a kit**: facades are built bay by bay with recessed windows and real
  reveals, sills, hood moulds, string courses, quoins, cornices, crenellated parapets, gable and hip
  roofs with dormers and chimneys, turrets, pinnacled buttresses, porticoes, domes and arches.
- **Trees** are trunks, limbs and crowns of alpha-cut leaf cards whose normals bend toward the
  crown's centre, so they light like a volume and cast dappled shadows.
- **The renderer** has two shadow cascades, PBR shading with normal maps, a sky with a cloud deck
  and a sun, moon and stars, aerial perspective that melts distant buildings into the sky behind
  them, water, lit windows at night, SSAO, bloom, god rays, filmic tone mapping and FXAA.
- **People** are skinned: every student, scientist and you are one smooth mesh on a twelve-bone
  rig, with joints that blend into their parent so elbows, knees, shoulders and hips bend without
  seams. Poses are procedural and blend into one another — walking, running, sitting, lying on a
  towel, cross-legged, squatting, cycling, driving, aiming — with overlays for talking, laughing,
  nodding, clapping, cheering, drinking, eating and phones, and two-bone IK for hands that have
  somewhere to be. Distant people and all shadows use a coarser mesh.

## Layout

```
src/
  core.js      math, GL plumbing, mesh upload, framebuffers, texture arrays
  geom.js      primitives, materials, a transform-baking builder with texture-aligned UVs, chunking
  textures.js  the procedural material library (GPU-generated, mipmapped texture arrays)
  render.js    shadow cascades → PBR scene + g-buffer → sky → SSAO → bloom → rays → composite → FXAA
  tod.js       the time-of-day clock: sun, moon, sky, clouds, fog, exposure, lamps and windows
  arch.js      the architecture kit: facades, roofs, towers, porticoes, domes, chapel, glasshouse
  flora.js     trees (ten species) and hedges
  props.js     lamps, benches, bike racks, cars, the fountain, the phone box, punts, café tables
  world.js     the campus: terrain, river, roads and paths, every building, planting, gameplay anchors
  rig.js       skinned characters and their procedural animation
  actors.js    nameplates, the Codex, mission markers
  vehicles.js  bicycles, campus carts, and traffic on the town roads
  nav.js       the GPS graph, the pre-drawn campus map, the radar and the full map
  portrait.js  procedural duotone portrait plates
  mountain.js  level 2: heightfield terrain, lodge, lift, snowboard physics
  crowd.js     groups and their routines, props, speech bubbles, synthesized laughter and guitar
  life.js      the student crowd, word of mouth, education tiers, Feed Drones, Peer Review, projectiles
  hud.js       reticle, radar, waypoints, dialogue + challenges, codex, quizzes, synthesis, pause, map
  game.js      player, third-person camera, vehicles, input, interaction, main loop, save/load
  collect.js   library books and their rewards, the bicycle collection, noticeboards, stunt jumps
  style.css    HUD styling
  body.html    markup
  data/        one JSON file per district, plus summit.json (level 2 professors),
               connections / vaults / misinfo (20 technique cards) / students / marginalia / challenges /
               books (the 24 overdue library books)
build.mjs      validates the content, then fuses everything into dist/
```

## Technical notes

Hand-rolled WebGL2. The campus is about 830,000 vertices of static geometry plus 250,000 of foliage,
baked into 64-metre chunks that are frustum-culled and drawn front to back, so a typical frame
draws around 120 chunks and culls the rest; on a recent laptop it renders in a few milliseconds.
Resolution scales itself down if frame time stays above ~26 ms. Progress saves to `localStorage`;
the codex has a reset button.

## Controls, and why they are built the way they are

Pointer lock is **blocked by feature policy in a sandboxed frame**, which is exactly where this
runs when published. So it is treated as a bonus, never a requirement:

- **Drag to look** works everywhere — hold the left button and move.
- **True mouselook** engages automatically if a lock request succeeds.
- **Arrow keys** turn and walk, so the whole game is playable with no mouse at all.
- **Space** jumps (or bunny-hops a bike); **Shift** sprints (or pedals hard). **Click / F** fires the Codex; **hold right-click**
  to aim over the shoulder; **V** switches third and first person; **E** interviews, gets on or off
  a bike or cart, and reclaims a noticeboard; **1–5, Q R, wheel** choose the question; **C** cites a scientist; **M** opens the map;
  **Tab** opens the Codex; **Esc** pauses.

Look sensitivity and invert-Y are on the title screen and persist. Needs a keyboard — there is no
touch scheme, and the title screen says so on a coarse pointer.
