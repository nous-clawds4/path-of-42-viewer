# Path of 42 viewer (prototype)

A static, interactive viewer for **the Path of 42**, David Strayhorn's question-graph method for building a theory, specified in [infinite-harness `docs/path-of-42.md`](https://github.com/nous-clawds4/infinite-harness/blob/main/docs/path-of-42.md) (PR [#7](https://github.com/nous-clawds4/infinite-harness/pull/7)).

**Live:** https://nous-clawds4.github.io/path-of-42-viewer/

> The graph shipped here is **SAMPLE DATA**. Node names come from real observer-space-framework decisions, but the structure, synopses and every `q` / `a` value are placeholders, not rulings. It is not the physics pilot's retro-mapping.

![screenshot](screenshot.png)

## What it shows

The graph is a DAG of **question** nodes and **answer** nodes (spec §1).

| Visual | Meaning |
|---|---|
| diamond | question |
| rounded box | answer |
| solid fill | accepted answer (the root is indigo) |
| outline only | open answer |
| grey fill, dashed incoming edge | rejected answer (kept with *why* and *reopen if*, spec §3); anything reachable only through it is faded, with dashed edges |
| letter badge | tag: **D** definition, **T** math-tool, **M** method (methodological principle), **P** physical hypothesis |
| border thickness | hold number *h* (hover a node to see the value) |

**Hold number** (spec §9): `h(root) = 1`; for an answer, `h = h(parent) × q × a`; a question inherits its parent's `h` (the ratings sit on the question-to-answer step, i.e. on the answer). With several parents the weakest parent's `h` is used.

**Controls:** click a node for the side panel (title, synopsis, type / status / tag / hold level, q, a, h with its derivation, rationale, reopen-if, parent and child links, source links, git history, build warnings). *Show rejected* hides rejected answers and the dead branches below them. *Paper version* highlights a version's selection and every path from the root to it (spec §4). *Search* matches id, title, synopsis, tag, status and rationale (Enter jumps to the first hit). *Fit*, *+*, *−*, *Layout*. Deep link to a node with `#node=<id>`.

## Data format

One file per node in a `question-graph/` folder, following spec §8. Either YAML (`.yaml` / `.yml`) or Markdown with YAML frontmatter (`.md`; the body becomes `synopsis` if that field is absent). Plain Markdown files with no frontmatter (e.g. a README) are ignored.

```yaml
id: a-no-privileged-matter        # required, unique
type: answer                      # question | answer
title: No privileged matter       # display label (defaults to id)
synopsis: Short description.      # optional
parents: [q-which-objects-observe]  # [] for the root
status: accepted                  # answers: accepted | open | rejected
hold: L2                          # hold level L0–L4 (shown, not computed)
tag: method                       # answers: definition | math-tool | method | physical-hypothesis
rationale: Why accepted / rejected.
reopen_if: null                   # expected when rejected
q: 0.95                           # [0,1], is the question worth asking?
a: 0.8                            # [0,1], is this the best answer?
sources:                          # optional viewer extension: links shown in the panel
  - label: physics#104
    url: https://github.com/nous-clawds4/physics/pull/104
  - https://example.org/plain-url-also-works
```

`principle` is accepted as an alias of `method`. A node with `parents: []` is a root.

**Paper versions** (spec §4): one file per version under `question-graph/versions/` (or any file with a `selects:` key):

```yaml
id: v0.5
title: Framework paper v0.5
selects: [a-no-privileged-matter, a-branch-points]   # accepted answers
```

**Graph metadata** (optional): `question-graph/graph.yaml` with `title`, `sample: true|false`, `note`, `repo_url`, `source_base_url` (prefix used to link each node to its file).

## Pipeline

```
question-graph/*.yaml|*.md  ──build/build.mjs──▶  site/data/graph.json  ──▶  site/index.html + app.js (Cytoscape.js + dagre)
```

`build/build.mjs` (Node ≥ 18, one dependency: `js-yaml`):

1. reads every node file, the `versions/` files and `graph.yaml`;
2. validates: unique ids, known parents, no cycles, valid `type` / `status` / `tag`, `q` and `a` in [0, 1] (**errors**, build exits 1); rejected answers without `rationale` or `reopen_if`, answers without a tag or ratings, answer-under-answer or question-under-question, accepted answers resting on rejected parents, versions selecting non-accepted or unknown nodes or two answers to one question (**warnings**; `--strict` makes them fatal);
3. computes children, depth and `h` in topological order, and each version's path set;
4. with `--git`, adds each node file's commit history (links need `--repo-url`), and sets `source_base_url` to the file's blob URL at the checked-out commit;
5. writes `graph.json` (format `path-of-42/graph@1`), including warnings and errors, which the viewer shows in the panel and status line.

The viewer is plain static files. The layout libraries are vendored in `site/vendor/` (cytoscape 3.34.3, dagre 0.8.5, cytoscape-dagre 2.5.0, MIT; see the LICENSE files there), so there is no CDN dependency.

## Local use

```sh
npm ci
npm test                        # build the sample strictly + validation fixtures
npm run build                   # sample -> site/data/graph.json
npm run serve                   # http://localhost:8000
```

Point it at a real folder:

```sh
git clone https://github.com/nous-clawds4/physics ../physics
node build/build.mjs \
  --in ../physics/public-papers/observer-space-framework/question-graph \
  --out site/data/graph.json --git --repo-url https://github.com/nous-clawds4/physics
```

The page loads `data/graph.json` by default; `?graph=<url>` loads any other built JSON (same origin, or a CORS-enabled URL such as raw.githubusercontent.com).

## Deploying from a real question graph

`.github/workflows/pages.yml` builds and deploys on every push to `main`. Without configuration it publishes the sample. To publish a real graph, set repository variables (Settings → Secrets and variables → Actions → Variables):

| Variable | Example |
|---|---|
| `GRAPH_REPO` | `nous-clawds4/physics` |
| `GRAPH_PATH` | `public-papers/observer-space-framework/question-graph` |
| `GRAPH_REF` | `main` (optional) |

then re-run the workflow (or run it manually with the same values as inputs). The sample stays at `?graph=data/sample.json`. The source repo can trigger a rebuild with a `repository_dispatch` event of type `question-graph-updated`; that needs a token with access to this repo, which is not set up.

## Status

Prototype. See the spec for the method; this repo only renders it.
