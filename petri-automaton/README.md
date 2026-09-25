# Petri Automaton

A programming automation game. You write **Python** to drive a nanobot around a petri
dish, farm what grows there, and spend the harvest on a tech tree that unlocks more of
the language you are writing in.

It is one self-contained HTML file. No build step, no dependencies, no server.

Inspired by [The Farmer Was Replaced](https://store.steampowered.com/app/2060160/).

---

## Playing

Open `index.html`, or host the directory anywhere static.

Your bot starts on a 5×5 dish knowing almost nothing — no variables, no `if`, no loops,
just a handful of calls. The first thing you buy is the `while` loop, and it goes from
there.

```python
while True:
    harvest()
    seed(CULTURE)
    move(EAST)
    if pos_x() == 0:
        move(SOUTH)
```

**Time only moves when the bot acts.** Every call costs one step of dish time, except
bookkeeping like `pos_x()` and `num()`, which are free. A `harvest()` that comes up empty
costs *two* — so when you are genuinely unsure, it can be cheaper to look first.

That single rule is what the whole game is about: your program's step count is the only
currency that matters, and better code spends fewer of them.

### What's in it

- **6 species**, each with a different payout rule — a flat crop, a substrate-gated one,
  one that pays for adjacency, one that pays the *square* of a connected patch up to a size
  limit, one that pays the square of an unbroken run along a row, and one that only pays
  full value for the highest-valued cell on the dish.
- **Sterile agar wears out.** A `sterilize()` is good for five crops and then the cell goes
  back to agar, so treating the dish is an ongoing cost rather than a one-time chore, and
  `substrate()` has a job for the whole run.
- **A labyrinth** you solve by pathfinding, with the payload buried at the furthest cell.
- **31 tech nodes** — roughly 78,000 steps of progression. Some unlock language features,
  some unlock species, some change the physics (free sensors, longer ripeness, a harvest
  that replants itself).
- **A 6-stage curriculum** gating the species tier by tier. See below.
- **5 trials** — fixed dish, fixed seed, fixed step budget, scored and saved. The dish is
  identical every attempt, so a better score means better code.
- **A profiler** that shows where your steps actually went, and a live per-step rate under
  every resource.

## The first sixty seconds

The opening screen used to be nineteen lines of grey comment and nothing that ran. A
programming game whose first screen is an empty editor loses most people before they type
anything, and no amount of instruction fixes that — instruction is the thing being skipped.

The starter program is twelve lines now, and one of them is live:

```python
# Press Run. Something will grow, and then the log will tell you
# why it stopped working. Fix that, and you have a farm.

seed(CULTURE)
```

Press Run and the whole arc happens in about two seconds: a culture appears, the first item
on the checklist ticks itself, the second `seed()` fails, and the log says *"a CULTURE is
growing there and is not ripe yet. Harvest it, or sterilize() to clear it."* You now know
what to type next without having been told.

Four first steps sit at the top of the Lab, and they react to the world rather than following
a script — plant something, take it, bank 32 bacteria, buy Iteration — ticking off as each
actually happens. There is no tutorial state to get out of sync with the game, and the whole
thing deletes itself the moment the fourth line goes green.

---

## The curriculum

The Lab will not sell you a new species until you have shown you can use the last one. Six
stages sit between you and the bottom of the tech tree, each on its own clean dish:

| stage | proves | opens |
|---|---|---|
| First culture | bank 400 bacteria | Sterile technique |
| Clean plate | bank 600 spores | Mycelial networks |
| Two live links | 200 harvests in a row that each had two ripe neighbours | Biofilm colonies |
| Nine at once | 20 patches of nine cells, every cell ripe at the same moment | Crystal lattice |
| Highest facet first | 60 in a row taken at full value | Strand cultures, Labyrinth assay |
| Five in a row | 6 unbroken runs of five | Second actuator |

Each stage is named after what it tests, not after the species it uses, because a stage
gates the *next* tech rather than its own — clearing "Two live links" is what puts Biofilm
colonies on sale. They used to share names with the techs, which made a working gate look
broken.

**A stage gives you nothing.** Empty dish, empty ledger. Everything you plant has to be paid
for out of what you grew on the same dish, which means running the whole chain below the new
species at the same time as the new species itself — by the crystal stage that is five tiers
on forty-nine cells, and dividing them up is the real problem. The stage lends you the
species it teaches (and every one under it) for the duration and takes the loan back when
you leave; clearing it opens the *purchase*, it does not hand you the species.

This is the second design of these stages. The first staked two million of the input
resource, and at that price the mycelium stage cleared itself: on a fully planted torus a
harvested cell always has two ripe neighbours left, so snaking across the dish satisfied the
rule without the player ever meeting it. A cell you can always afford to plant is a cell you
never have to think about. `stage-check.js` keeps that regression pinned.

## Speed changes nothing but what you can see

The speed slider only changes how many ticks `pump()` runs before the frame is drawn. The
evaluator never reads the clock, so the same program over the same number of ticks lands on
a bit-identical world at 1 step per frame and at 750 — there is a test asserting exactly that
across six speeds, because "the decision trees aren't working right at high step speeds" is a
reasonable thing to suspect and a bad thing to guess about.

What *was* speed-dependent was the presentation, and both halves of it were wrong:

- **Payouts.** One floating number per harvest reads well at 8 steps a second and is an
  unreadable smear at 3000. They are buffered now and merged once per frame — one figure per
  resource, placed where the bot ended up. At one tick per frame that is exactly the old
  behaviour. Bursts get the same treatment: at most one per species per frame.
- **The traced line.** Above `TRACE_MAX` steps in a frame the highlight is just wherever the
  last tick happened to land, so it strobed across the whole program. Past that it switches
  off and the editor header says *too fast to trace*.

## Upgrades are tools, not modes

Seeder attachment used to be a passive: every successful harvest refilled the cell with the
same species, always, with no way to switch it off. Three things were wrong with that, and
only the first is obvious:

1. It froze a bed to one crop. The arc of the game is converting cells to higher tiers, and
   a cell that refills itself can never be converted.
2. It silently changed what `harvest()` means, so a `seed()` on the next line failed with
   "something is already growing there" and nothing named the cause.
3. It was quietly wasting a quarter of every program's steps. Removing it dropped the
   reference programs from ~30% wasted to 3–11%, because all those pre-empted `seed()` calls
   were being paid for.

It unlocks `replant()` now — harvest and re-seed the same species for the price of one
action, where you ask for it. Same species only; turning a bed over to a different crop is a
real decision and still costs a `harvest()` and a `seed()`.

That also made it an interesting purchase instead of a flat one:

```
culture: plain snake        1.234 bacteria/step
culture: bed + replant()    1.806          +46%

spore: sterilise after      1.880 spores/step
spore: replant()            1.975           +5%
```

Worth a lot on a free crop and almost nothing on a sterile one, because a sterile bed is
already paying for a `substrate()` check and periodic re-treatment.

## Two bots take up room

They used to stand in the same cell quite happily, which made a second actuator one lap run
twice with an offset rather than a problem to divide up. `move()` into an occupied cell now
returns False and costs the step, exactly as a labyrinth wall does, and `blocked()` reports
it. A round resolves bots in order, so the lower `bot_id()` takes any cell they both reach
for — arbitrary, but fixed, which is what makes it something you can code around.

Measured on a 7×7 culture bed:

```
one bot, snake                 0.484 bact/step    2% wasted
two bots, same snake           1.846              3%          3.8x
two bots, split by bot_id()    2.399              1%          5.0x
```

The naive pair is barely punished — two bots snaking a torus drift apart on their own — so
this rewards writing the coordination rather than penalising not writing it. Splitting the
rows is worth 30% over sharing them. (Both are super-linear against one bot because halving
the lap means every cell is harvested fresher.)

## jump() is priced flat, on purpose

`jump(x, y)` puts the bot on any cell for **4 steps, however far away it is**. The cost is
the entire design:

- **Priced by distance** it would just be `goto()`, which anyone can write in four lines —
  convenience, not a decision, and it would take away a function players currently write.
- **One step flat** would delete route planning. Movement is 33–38% of a typical program's
  steps, and layout planning is one of the two things skilled play optimises.
- **Flat, at a cost worth beating**, means there is a break-even distance, and finding it is
  the problem. The dish wraps, so the real walking distance is
  `min(dx, n-dx) + min(dy, n-dy)` — often much less than it looks.

Measured against a four-bed tour, walking with a good wrap-aware `goto()` versus jumping:

```
 7x7    1.083 bact/step walking    0.915 jumping     -16%
 9x9    0.953                      0.915              -4%
13x13   0.768                      0.915             +19%
15x15   0.699                      0.915             +31%
```

The jumping row never moves, because a flat cost does not care how big the dish is. Walking
degrades as it grows. The crossover lands on the 9×9 — which is the dish the tech is gated
behind, so it arrives exactly as it starts to pay. Tests pin that relationship, so changing
`JUMP_COST` without re-checking the curve will fail.

It refuses inside the labyrinth. Without that, the whole assay collapses to `jump(tx, ty)`.

## Ground you ignore goes bad

Without this, an idle cell costs nothing, so the best play on a big dish is to work one
corner and let the rest sit. A cell nobody has stood on for `size² × 12` steps fouls on its
own; fouled ground grows nothing, and every 260 steps it takes the cells orthogonally beside
it, destroying what was in them. `sterilize()` is the only cure.

Deterministic throughout, deliberately: a fixed window since the bot was last there, and a
fixed spread interval. That makes it a patrol you write, not a dice roll you absorb.

**It does not start until Sterile technique is bought.** `sterilize()` is the only cure, and a
mechanic whose answer you do not own yet is not difficulty, it is a dead end — reported from
play, on the opening 5×5: farm one row, watch the other twenty cells foul and spread, and have
nothing to clean them with. Every measurement that signed contamination off had been taken
with the whole tech tree owned, so the opening board was never tested. The clock also starts
at the purchase rather than at tick zero, or a long first run would foul the dish the instant
you bought the cure. Nothing fouls under a bot that is standing on it, either.

That gate is worth stating as a rule: **a penalty mechanic must not reach the player before its
counter does.**

The window is scaled by area rather than fixed, and that came out of the measurement rather
than the design. A flat 900 steps was fine at 7×7 and fatal at 15×15, where one circuit of a
225-cell dish already runs to ~900 steps: the far side fouled while the bot was still
working, seeds then failed on fouled ground, the lap got longer, and the dish died. Scaled,
the window is about three worst-case laps at every size:

```
                        bact/step   cells fouled
5x5   full snake          1.229        0/25
7x7   full snake          0.490        0/49
9x9   full snake          0.304        0/81
15x15 full snake          0.000        0/225
7x7   one corner only     0.126       49/49
15x15 one corner only     0.437      225/225
```

A program that laps its whole dish is never touched at any size. A program that ignores most
of it loses everything. The same thing shows in the income table once you own the cure:

```
culture: tight 2-cell            0.704 bact/step   (pre-Sterile technique)
culture: tight, +contamination   0.058             (same program, after)
dish snake 5x5                   1.234             (unaffected either way)
```

`balance.js` was not running the fouling clock at all until this was noticed, so every rate
reported between contamination landing and that fix was measured with the mechanic switched
off. It runs it now, and the early-game rows are measured without Sterile technique so they
reflect the board a new player is actually on.

### The bug this turned up, since fixed

The `0.000` for the 15×15 snake above was **not** contamination — note the zero fouled cells.
A plain snake produced *exactly nothing* on 11×11 and larger, and had since long before
contamination existed. CULTURE's `life` was 450 steps and a single planting lap of a 121-cell
dish takes ~480, so every cell rotted before the bot came back round. The harvest then failed,
which costs two steps instead of one, which lengthened the lap further — the farm could never
start, and three dish upgrades sold as improvements were worth nothing.

That is the same death spiral the freshness floor exists to prevent, one timescale up, so it
got the same fix: **CULTURE and SPORE no longer die outright.** The payout still ramps to the
floor of 1, which is a 4× and 8× penalty and plenty of reason to keep a bed fresh, but a long
lap now costs yield instead of the farm:

```
dish     life 450     no hard death
7x7        0.497        0.497      identical
9x9        0.308        0.308      identical
11x11      0.000        0.304
13x13      0.000        0.297
15x15      0.000        0.289
```

Nothing below 11×11 changes at all, because the cliff was never reached there. STRAND keeps
its `life`, because there the short fuse is the puzzle rather than a tax. Abandoned ground is
punished by contamination now, which spreads, shows itself and can be cured — rot did not need
to do that job as well.

## Telling the player how they are doing

This is an optimisation game, and its loop is: see a number, believe you can beat it, rewrite,
watch it move. For a long time the first and last steps did not exist. The engine measured
your best sustained rate for every resource on every run and saved it, and the only place it
appeared was a table in the Profile sub-tab — nowhere you would be looking while playing, and
with nothing to compare it against. The only pull to rewrite a program was "I need 2,400 more
biomass", which is waiting, not optimising.

Three things close that loop:

- **The record sits under the live rate.** `+0.482/step` with `best 0.681` beneath it, on the
  tile you are already watching.
- **Beating it is announced**, once per resource per run, measured against the record as it
  stood when the run began. Against the live peak it would fire on every sample while the rate
  climbed; the news worth having is "this program beats your last one".
- **Stages have a par.** It is the step count the reference program in `stages/` takes, so
  beating it means your program is better than the one in this repo. Clearing one reports
  your steps, par, and your own previous best. `stage-check.js` prints par alongside the
  measured run and flags it if the two drift more than 20% apart.

### The rate ladder

The tech tree runs out at around 79,000 steps and then there is nothing left to chase, which
is a strange way to end an optimisation game. The Profile tab now carries a bronze / silver /
gold ladder for each resource's sustained rate. The peak was already measured over a
1000-step window, so it only needed targets:

```
bacteria  0.6  1.2  2.0        measured best reference: 1.806
spores    0.6  1.2  2.2                                 1.975
enzymes   0.2  0.45 0.8                                 0.696
biomass   0.5  1.5  3.2                                 2.987
crystals  0.08 0.2  0.4                                 0.348
```

Gold sits above everything in `stages/`, so it cannot be bought — it has to be written.

## A seed is a dish, so a dish is shareable

The engine is deterministic and every trial already built its board from a string hash, so
"beat my score on this exact dish" costs twenty characters and no server:

```
PA1.sort.k3f9.38g
 |    |     |   score to beat
 |    |     dish seed
 |    trial
 tag
```

Paste one and you get that dish and that number to chase. **Roll dish** gives you a seed
nobody has played. There is deliberately no program in the code: the challenge is the thing
worth sending, an answer would be a spoiler and ten times longer.

Stages use the same format, with two differences that fall out of what a stage is. Its id
starts with `s_`, which is how the reader tells them apart; the number it carries is a step
count, so **lower wins**; and it never carries a dish. The curriculum is a fixed teaching
board and rolling it would defeat the point, so a stage code is purely "I cleared this in
12,400, beat it".

### Today's dish

A card above everything else, seeded from the UTC date:

```js
function dailyFor(key){
  const h = hashId('daily:' + key);
  return { key, seed:h, def: CHALLENGES[h % CHALLENGES.length] };
}
```

Every player in the world gets the same board on the same day, and a different trial the next,
with no server deciding anything. Its score is kept separately from your canonical records and
wiped when the day rolls over, so yesterday's number can never pass for today's. Its share code
is an ordinary one, which means somebody can hand you a past day's dish and you can play it.

That is the habit the game did not have: a fixed, comparable puzzle that is gone tomorrow.

Making the rolling honest needed work. Three of the five trial setups used no RNG at all — `web`
planted the same full dish every time, `bloom` the same sterile board — so rolling them
changed nothing and the button was a lie. Each now varies when a seed is in play: holes in
the mycelium web, patches of raw agar in the biofilm bloom, a scatter of part-grown crops in
the first harvest. All of them are better puzzles for it. A test rolls every trial with two
seeds and asserts the boards differ, then asserts each seed is repeatable.

The canonical dish is untouched by any of it — `setup(varied)` only varies when a seed is
set — so pars and existing scores keep meaning, and a score on a rolled dish never touches
your record for the real one.

## Charts

The Profile tab plots two things the game was measuring and never showing:

- **Everything you have gathered** — lifetime totals per resource, as log-scaled bars.
  Nothing tracked this before; `W.res` is the current balance and falls every time you buy
  something. Log-scaled because bacteria run to hundreds of thousands while crystals are in
  the hundreds, and on a linear axis every bar but one is invisible.
- **The run so far** — five lines, one per resource, each normalised to its own peak. You
  read the shape, not the height: where a line goes flat is where that tier stalled. One
  point every 200 steps, 240 points kept.

Neither records anything from a stage or a trial. Scratch dishes are not your history.

## Why the bot language is not real Python

It is a real Python *subset*, interpreted by a tokenizer → parser → generator-based evaluator
written from scratch. Pyodide is the obvious alternative and it does not fit, for a reason
that has nothing to do with conformance:

**The whole game is "time only moves when the bot acts."** The evaluator is a generator that
yields at every action, so a program pauses mid-loop and resumes next tick. CPython in wasm
runs synchronously and cannot be paused mid-frame. The escapes all fail: making every bot call
`await` stops it being the Python anyone would write; blocking a worker on `Atomics` needs
SharedArrayBuffer, which needs COOP/COEP headers GitHub Pages cannot set; and
`setInterruptBuffer` can stop a program but not resume one. Feature gating would need
rebuilding too, since locking `while` behind a purchase is enforced at parse time here.

The published artifact cannot load Pyodide at all — the platform's CSP blocks a library's
runtime fetches — but that is the smaller of the two problems.

If the language is ever genuinely in the way, the fix is to add the failing construct to
`python-tests.js` and let `xcheck.js` settle the semantics against the real `python` on your
PATH. That has caught divergences three times. It has not yet been the cause of a bug anyone
reported from play.

## The language

Real Python syntax, interpreted by a tokenizer → parser → resumable evaluator written from
scratch in JavaScript. The evaluator is generator-based, so a program can pause mid-loop
every time the bot acts and resume on the next tick.

**Supported:** `if`/`elif`/`else`, `while`, `for … in range()`, `def` with default and
keyword arguments, `lambda`, list and dict comprehensions, tuples and unpacking, slicing,
f-strings (including `!r` and format specs), chained comparisons, `global`,
`try`/`except`/`finally`, `raise`, and the usual list/dict/str methods.

**Not supported:** classes, `import`, sets, generators. Each of those fails with a message
saying so rather than a confusing syntax error.

**One deliberate difference:** whole numbers and decimals are a single type, so `4 / 2`
prints `2` where Python prints `2.0`. Integers beyond 2⁵³ raise an `OverflowError` rather
than silently losing precision.

Everything else is checked against real CPython — see below.

---

## Development

Everything runs on Node. There is nothing to install.

The engine lives in a single `<script>` block inside `game.html`. The tooling extracts it
and runs it headlessly against a stubbed DOM:

```bash
sed -n '/^<script>$/,/^<\/script>$/p' game.html | sed '1d;$d' > /tmp/eng.js
```

### Test suites

```bash
node test-harness.js /tmp/eng.js    # 615 tests: engine, world rules, stages, trials, UI state
node python-tests.js /tmp/eng.js    # 121 Python conformance cases
node xcheck.js                      # re-runs those cases through real CPython and diffs
node stage-check.js /tmp/eng.js     # plays every curriculum stage to the end
```

`xcheck.js` is the interesting one. Every conformance expectation is verified against the
`python` on your PATH rather than against anyone's memory of what Python does — it has
caught genuine divergences (`round(2.5)` is 2, not 3; `dict.keys()` prints
`dict_keys([...])`; `print(a, a.pop(), a)` shows the popped state twice) *and* several
cases where the expectation was wrong and the engine was right.

**Current status: 615 + 121 passing, 90 of 90 expectations matching CPython 3.14.**

### Stage feasibility

```bash
node stage-check.js /tmp/eng.js
```

Because stages hand out no resources, a target can be set higher than the dish can physically
reach and nothing else in the tooling would notice. This runs a reference program a competent
player could write against each stage and reports how far it got. The programs live in
`stages/` and are deliberately unoptimised, so the step counts are an upper bound, not a par:

```
  stage        program              result        steps   wasted
  ------------------------------------------------------------------
  s_culture   s_culture.py         cleared           397      31%
  s_sterile   s_sterile.py         cleared          1376      30%
  s_myc       s_myc.py             cleared          4824      32%
  s_bio       s_bio.py             cleared         29075      30%
  s_cryst     s_cryst.py           cleared          8602      29%
  s_strand    s_strand.py          cleared         49599      38%
  s_myc       naive-snake.py       0/200           30000      64%
```

The last row is the point of the file: `naive-snake.py` used to clear the mycelium stage on
its own. It must never clear it again.

### Economy simulator

```bash
node balance.js /tmp/eng.js
```

Runs reference programs a competent player would write, measures resource-per-step for
each, and prices the whole tech tree against those rates. Adding a mechanic without
re-running this is how you end up with a 45× discoverability cliff or a death spiral —
both of which happened, and both of which this caught.

It is also how the biofilm cap got sized. Uncapped, a patch filling the dish paid its area
squared, so biomass came in at 12.8/step on a 9×9 against 0.7/step for enzymes and got
*faster* the bigger your dish grew. The table below carries both the naive whole-dish patch
and the quadrant layout that is now optimal, so a future change can be judged against good
play rather than the first thing anyone writes.

### Playing from a terminal

```bash
node play.js --state save.json reset     # new game
node play.js --state save.json api       # the rules
node play.js --state save.json status    # resources, unlocks, what you can buy
node play.js --state save.json peek      # ascii view of the dish
node play.js --state save.json run p.py 2000
node play.js --state save.json buy loop
node play.js --state save.json board     # clear the dish, keep what you earned
```

Each `--state` file is an independent save, so several players — or several agents — can
run at once. `run` reports steps used, percentage wasted, and the per-step rate for every
resource.

### Building the static page

`game.html` is authored for the Claude Artifacts platform, which supplies the document
skeleton at publish time. A plain web server does not, so:

```bash
node build-pages.js       # wraps game.html -> index.html
```

This adds the doctype, charset, viewport and baseline reset. Run it after any change to
`game.html`; `index.html` is generated and should not be edited by hand.

### Deploying to GitHub Pages

Commit `index.html` at the repository root, then **Settings → Pages → Deploy from a branch
→ `main` / `(root)`**. Nothing else is required — the page is entirely self-contained apart
from two Google Fonts stylesheets.

---

## Layout

| file | |
|---|---|
| `game.html` | the whole game — engine, UI and styles. The only source file. |
| `index.html` | generated by `build-pages.js`. What you deploy. |
| `test-harness.js` | engine and world tests |
| `python-tests.js` | Python conformance cases |
| `xcheck.js` | verifies those cases against real CPython |
| `balance.js` | economy simulator and tech-tree pricing |
| `stage-check.js` | plays every curriculum stage to the end |
| `stages/` | the reference programs it plays them with |
| `play.js` | terminal client for the real engine |
| `build-pages.js` | wraps the game into a standalone page |

Saves live in `localStorage` under `petri-automaton-v2`. They are per-origin, so a save on
one host will not appear on another.
