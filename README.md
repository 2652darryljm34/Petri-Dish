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

- **5 species**, each with a different payout rule — a flat crop, a substrate-gated one,
  one that pays for adjacency, one that pays the *square* of a connected patch, and one
  that only pays full value for the highest-valued cell on the dish.
- **A labyrinth** you solve by pathfinding, with the payload buried at the furthest cell.
- **29 tech nodes** — roughly 64,000 steps of progression. Some unlock language features,
  some unlock species, some change the physics (free sensors, longer ripeness, a harvest
  that replants itself).
- **5 trials** — fixed dish, fixed seed, fixed step budget, scored and saved. The dish is
  identical every attempt, so a better score means better code.
- **A profiler** that shows where your steps actually went, and a live per-step rate under
  every resource.

---

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
node test-harness.js /tmp/eng.js    # 213 tests: engine, world rules, trials, UI state
node python-tests.js /tmp/eng.js    # 113 Python conformance cases
node xcheck.js                      # re-runs those cases through real CPython and diffs
```

`xcheck.js` is the interesting one. Every conformance expectation is verified against the
`python` on your PATH rather than against anyone's memory of what Python does — it has
caught genuine divergences (`round(2.5)` is 2, not 3; `dict.keys()` prints
`dict_keys([...])`; `print(a, a.pop(), a)` shows the popped state twice) *and* several
cases where the expectation was wrong and the engine was right.

**Current status: 213 + 113 passing, 82 of 82 expectations matching CPython 3.14.**

### Economy simulator

```bash
node balance.js /tmp/eng.js
```

Runs reference programs a competent player would write, measures resource-per-step for
each, and prices the whole tech tree against those rates. Adding a mechanic without
re-running this is how you end up with a 45× discoverability cliff or a death spiral —
both of which happened, and both of which this caught.

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
| `play.js` | terminal client for the real engine |
| `build-pages.js` | wraps the game into a standalone page |

Saves live in `localStorage` under `petri-automaton-v2`. They are per-origin, so a save on
one host will not appear on another.
