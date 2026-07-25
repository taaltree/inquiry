# Content schema — "INQUIRY" scientist dialogue

Each district file is a **JSON array** of scientist objects. Strict JSON (no comments,
no trailing commas, double quotes only). Em dashes and unicode are fine.

## The five question types (the game's core mechanic)

The player carries an "Inquiry Device" with five question slots instead of weapons.
Every scientist must answer all five. These map to the anatomy of a scientific argument:

| key        | Player asks                                       | What the answer must do |
|------------|---------------------------------------------------|--------------------------|
| `question` | "What question were you chasing?"                 | The driving question / hypothesis. What was genuinely unknown, and why it mattered *at that time*. |
| `method`   | "How did you actually test it?"                   | Concrete methodology. Instruments, procedure, sample, controls. The physical/mathematical craft. |
| `evidence` | "What did the data show?"                         | The actual result, with a real number, measurement, or specific observation where possible. |
| `impact`   | "Why does this matter now?"                       | Downstream consequence — technology, other fields, everyday life, open research today. |
| `doubt`    | "What were you wrong about, or still don't know?" | Epistemic humility. Genuine errors, limits of the method, what remains unresolved. **This is the most important slot — never make it a humblebrag.** |

## Object shape

```json
{
  "id": "curie",
  "name": "Marie Curie",
  "lifespan": "1867–1934",
  "era": "historical",
  "field": "Radioactivity",
  "origin": "Poland / France",
  "hook": "Weighed the invisible.",
  "intro": "One or two sentences, first person, said when the interview opens. Establishes voice and setting.",
  "answers": {
    "question": { "text": "...", "concept": "Atomic instability" },
    "method":   { "text": "...", "concept": "Electrometer assay" },
    "evidence": { "text": "...", "concept": "Two new elements" },
    "impact":   { "text": "...", "concept": "Radiotherapy" },
    "doubt":    { "text": "...", "concept": "Unshielded exposure" }
  },
  "misconception": {
    "myth": "A one-sentence belief many undergraduates actually hold.",
    "reality": "Two sentences correcting it, with the reason the myth is appealing."
  },
  "terms": [
    { "term": "Radioactivity", "def": "One clear sentence, undergraduate level." }
  ],
  "recognition": "Nobel Prize in Physics 1903 (shared); Chemistry 1911."
}
```

## Field rules

- `id` — lowercase, no spaces, unique across ALL districts (e.g. `curie`, `bell_burnell`).
- `era` — exactly `"historical"` or `"contemporary"`. Contemporary = active in the last
  ~40 years, whether living or recently deceased.
- `hook` — under 6 words, evocative, no period-heavy phrasing. Shown under the nameplate in 3D.
- `intro` — 20–40 words.
- `answers.*.text` — **50–95 words each.** First person, conversational, spoken aloud to a
  visiting student. Vary sentence length. No bullet lists.
- `answers.*.concept` — 2–4 words, title case. This becomes a collectible "insight" token.
- `terms` — exactly 3 entries.
- `recognition` — one line; if there is no major prize, describe the actual standing of the work.

## Voice and accuracy rules (read carefully)

1. **Never write a direct quotation.** Everything is the game's paraphrase in a first-person
   voice. Do not use phrasing that a reader could mistake for a documented quote, and do not
   reference famous quotes as if the character is repeating them.
2. **Only state things you are confident are accurate.** Prefer a well-established fact stated
   plainly over a vivid detail you are unsure of. If unsure of an exact number, describe the
   magnitude qualitatively rather than inventing a figure.
3. **Include the real complications.** Credit disputes, institutional exclusion, career damage,
   ideas rejected for decades, errors that took years to surface. Undergraduates need to see that
   science is done by people inside institutions, not by disembodied geniuses. Be specific and
   factual, not editorializing.
4. **No hagiography, no "genius" framing.** Emphasize process, labor, collaboration, and
   iteration. Where a discovery depended on other people's work — including uncredited
   people — say so in the character's own voice.
5. **Living people:** keep to their public scientific record and publicly documented career
   history. Nothing about private life, personality, or opinions they have not publicly expressed.
   Attitudes expressed should be about the science itself.
6. Undergraduate reading level. Technical terms are welcome but must be unpacked in the same
   breath. Assume a bright non-major.
7. Vary voice meaningfully between characters — a 17th-century natural philosopher and a
   contemporary computational imaging researcher should not sound alike. Do not use dialect
   spelling or archaic spelling.

## Output

Write **only** the JSON array to your assigned file path. No prose, no markdown fence, no
explanation. The file must parse with `JSON.parse`.
