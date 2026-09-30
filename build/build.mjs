#!/usr/bin/env node
// Build graph.json for the Path of 42 viewer from a folder of node files.
//
//   node build/build.mjs --in <question-graph dir> --out site/data/graph.json
//        [--repo-url https://github.com/OWNER/REPO] [--git] [--strict]
//
// Node files: *.yaml / *.yml (one node per file), or *.md with YAML frontmatter
// (the markdown body becomes `synopsis` if none is given). Schema: see README.
// Paper versions: files under versions/ (or any file with `selects:`).
// Graph metadata: graph.yaml or _graph.yaml at the top of the folder.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';

const TYPES = ['question', 'answer'];
const STATUSES = ['accepted', 'open', 'rejected'];
const TAGS = ['definition', 'math-tool', 'method', 'physical-hypothesis'];
const TAG_ALIASES = { principle: 'method', 'methodological-principle': 'method', mathtool: 'math-tool', 'math_tool': 'math-tool', hypothesis: 'physical-hypothesis', 'physical_hypothesis': 'physical-hypothesis' };
const META_FILES = ['graph.yaml', 'graph.yml', '_graph.yaml', '_graph.yml'];

function parseArgs(argv) {
  const o = { in: null, out: 'site/data/graph.json', repoUrl: null, git: false, strict: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--in') o.in = argv[++i];
    else if (k === '--out') o.out = argv[++i];
    else if (k === '--repo-url') o.repoUrl = argv[++i];
    else if (k === '--git') o.git = true;
    else if (k === '--strict') o.strict = true;
    else if (k === '-h' || k === '--help') { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 12).join('\n')); process.exit(0); }
    else throw new Error(`unknown argument ${k}`);
  }
  if (!o.in) throw new Error('--in <dir> is required');
  return o;
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(ya?ml|md|markdown)$/i.test(e.name)) out.push(p);
  }
  return out.sort();
}

function readDoc(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (/\.(md|markdown)$/i.test(file)) {
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!m) return null; // plain markdown (e.g. README): not a node
    const data = yaml.load(m[1]) || {};
    const body = m[2].trim();
    if (body) data._body = body;
    return data;
  }
  return yaml.load(text);
}

function asList(v) { return v == null ? [] : Array.isArray(v) ? v : [v]; }

function normSources(v) {
  return asList(v).map(s => {
    if (typeof s === 'string') {
      const m = s.match(/^\s*(.*?)\s*<?(https?:\/\/\S+?)>?\s*$/);
      return m ? { label: m[1] || m[2], url: m[2] } : { label: s, url: null };
    }
    if (s && typeof s === 'object') return { label: s.label || s.title || s.url, url: s.url || null };
    return null;
  }).filter(Boolean);
}

function gitHistory(file, repoUrl) {
  try {
    const cwd = path.dirname(file);
    const out = execFileSync('git', ['log', '--follow', '--format=%H%x09%cI%x09%s', '--', path.basename(file)], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.trim().split('\n').filter(Boolean).map(l => {
      const [sha, date, subject] = l.split('\t');
      return { sha, date, subject, url: repoUrl ? `${repoUrl.replace(/\/$/, '')}/commit/${sha}` : null };
    });
  } catch { return []; }
}

function main() {
  const opt = parseArgs(process.argv);
  const inDir = path.resolve(opt.in);
  const errors = [], warnings = [];
  const err = (m) => errors.push(m), warn = (m) => warnings.push(m);

  let meta = {};
  const nodes = new Map(), versions = [];
  for (const file of walk(inDir)) {
    const rel = path.relative(inDir, file).split(path.sep).join('/');
    if (META_FILES.includes(rel)) { meta = yaml.load(fs.readFileSync(file, 'utf8')) || {}; continue; }
    let d;
    try { d = readDoc(file); } catch (e) { err(`${rel}: YAML parse error: ${e.message.split('\n')[0]}`); continue; }
    if (d == null) continue;
    if (typeof d !== 'object' || Array.isArray(d)) { err(`${rel}: expected a mapping`); continue; }
    const isVersion = rel.startsWith('versions/') || d.selects !== undefined || /^(paper-)?version$/.test(d.type || '');
    if (isVersion) {
      versions.push({ id: String(d.id ?? path.basename(rel).replace(/\.[^.]+$/, '')), title: d.title || d.id, synopsis: d.synopsis || d._body || '', selects: asList(d.selects).map(String), sources: normSources(d.sources), file: rel });
      continue;
    }
    if (d.id == null) { err(`${rel}: missing id`); continue; }
    const id = String(d.id);
    if (nodes.has(id)) { err(`${rel}: duplicate id ${id} (also in ${nodes.get(id).file})`); continue; }
    const n = {
      id, file: rel,
      type: d.type, title: d.title || id, synopsis: d.synopsis || d._body || '',
      parents: asList(d.parents).map(String),
      status: d.status ?? null, hold: d.hold ?? null, tag: d.tag ?? null,
      rationale: d.rationale ?? null, reopen_if: d.reopen_if ?? null,
      q: d.q ?? null, a: d.a ?? null,
      sources: normSources(d.sources ?? d.source),
      sample: d.sample ?? !!meta.sample,
    };
    if (!TYPES.includes(n.type)) err(`${id}: type must be question | answer (got ${JSON.stringify(n.type)})`);
    if (n.tag && TAG_ALIASES[n.tag]) n.tag = TAG_ALIASES[n.tag];
    if (n.type === 'answer') {
      if (!STATUSES.includes(n.status)) err(`${id}: answer status must be accepted | open | rejected (got ${JSON.stringify(n.status)})`);
      if (n.tag && !TAGS.includes(n.tag)) err(`${id}: tag must be one of ${TAGS.join(' | ')} (got ${JSON.stringify(n.tag)})`);
      if (!n.tag && n.parents.length) warn(`${id}: answer has no tag`);
      if (n.status === 'rejected') {
        if (!n.rationale) warn(`${id}: rejected without a rationale`);
        if (!n.reopen_if) warn(`${id}: rejected without a reopen_if`);
      }
    } else if (n.type === 'question') {
      if (n.status) warn(`${id}: status is ignored on question nodes`);
    }
    for (const k of ['q', 'a']) {
      if (n[k] == null) continue;
      if (typeof n[k] !== 'number' || n[k] < 0 || n[k] > 1) { err(`${id}: ${k} must be a number in [0, 1]`); n[k] = null; }
    }
    if (n.type === 'answer' && n.parents.length && (n.q == null || n.a == null)) warn(`${id}: missing q or a, so h is unknown here and below`);
    nodes.set(id, n);
  }

  // Edges and structural checks.
  const children = new Map([...nodes.keys()].map(k => [k, []]));
  for (const n of nodes.values()) {
    n.parents = n.parents.filter(p => {
      if (!nodes.has(p)) { err(`${n.id}: unknown parent ${p}`); return false; }
      children.get(p).push(n.id);
      const pt = nodes.get(p).type;
      if (n.type === 'answer' && pt !== 'question') warn(`${n.id}: answer whose parent ${p} is not a question`);
      if (n.type === 'question' && pt !== 'answer') warn(`${n.id}: question whose parent ${p} is not an answer`);
      return true;
    });
  }
  const roots = [...nodes.values()].filter(n => !n.parents.length).map(n => n.id);
  if (!nodes.size) warn('no node files found');
  if (!roots.length && nodes.size) err('no root (a node with parents: [])');

  // Topological order (Kahn); leftover nodes are on a cycle.
  const indeg = new Map([...nodes.values()].map(n => [n.id, n.parents.length]));
  const order = [], queue = [...roots];
  while (queue.length) {
    const id = queue.shift(); order.push(id);
    for (const c of children.get(id)) { indeg.set(c, indeg.get(c) - 1); if (indeg.get(c) === 0) queue.push(c); }
  }
  if (order.length < nodes.size) err(`cycle among: ${[...nodes.keys()].filter(k => !order.includes(k)).join(', ')}`);

  // Hold number: h(root) = 1; question h = weakest parent h; answer h = weakest parent h * q * a.
  for (const id of order) {
    const n = nodes.get(id);
    n.children = children.get(id);
    if (!n.parents.length) { n.h = 1; n.h_parent = null; n.weakest_parent = null; n.depth = 0; continue; }
    const ps = n.parents.map(p => nodes.get(p));
    n.depth = 1 + Math.max(...ps.map(p => p.depth));
    let weakest = null;
    for (const p of ps) { if (p.h == null) { weakest = null; break; } if (!weakest || p.h < weakest.h) weakest = p; }
    n.weakest_parent = weakest ? weakest.id : null;
    n.h_parent = weakest ? weakest.h : null;
    if (n.h_parent == null) n.h = null;
    else if (n.type === 'question') n.h = n.h_parent;
    else n.h = (n.q == null || n.a == null) ? null : n.h_parent * n.q * n.a;
    if (n.status === 'accepted' && ps.some(p => p.status === 'rejected')) warn(`${id}: accepted but rests on rejected parent(s)`);
  }

  // Paper versions: a consistent selection of accepted answers.
  for (const v of versions) {
    const byQuestion = new Map();
    v.selects = v.selects.filter(s => {
      const n = nodes.get(s);
      if (!n) { warn(`version ${v.id}: unknown node ${s}`); return false; }
      if (n.type !== 'answer') warn(`version ${v.id}: ${s} is not an answer`);
      else if (n.status !== 'accepted') warn(`version ${v.id}: selects ${s}, which is ${n.status}`);
      for (const q of n.parents) {
        if (byQuestion.has(q)) warn(`version ${v.id}: selects both ${byQuestion.get(q)} and ${s} for question ${q}`);
        byQuestion.set(q, s);
      }
      return true;
    });
    // Everything on a path from a root to a selected answer.
    const inPath = new Set(), stack = [...v.selects];
    while (stack.length) { const id = stack.pop(); if (inPath.has(id)) continue; inPath.add(id); stack.push(...nodes.get(id).parents); }
    v.path = [...inPath];
    if (opt.git) v.history = gitHistory(path.join(inDir, v.file), opt.repoUrl || meta.repo_url);
  }

  if (opt.git) for (const n of nodes.values()) n.history = gitHistory(path.join(inDir, n.file), opt.repoUrl || meta.repo_url);

  // Link each node to its file on GitHub when the folder is a git checkout of a known repo.
  const repoUrl = opt.repoUrl || meta.repo_url;
  if (repoUrl && !meta.source_base_url) {
    try {
      const git = (...a) => execFileSync('git', a, { cwd: inDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      const sha = git('rev-parse', 'HEAD');
      const prefix = git('rev-parse', '--show-prefix');
      meta.source_base_url = `${repoUrl.replace(/\/$/, '')}/blob/${sha}/${prefix}`;
      meta.source_commit = sha;
    } catch { /* not a git checkout */ }
  }

  const out = {
    format: 'path-of-42/graph@1',
    meta: { ...meta, sample: !!meta.sample || [...nodes.values()].some(n => n.sample), source_dir: opt.in, built_at: new Date().toISOString() },
    roots,
    nodes: order.length === nodes.size ? order.map(id => nodes.get(id)) : [...nodes.values()],
    versions,
    warnings,
    errors,
  };
  fs.mkdirSync(path.dirname(path.resolve(opt.out)), { recursive: true });
  fs.writeFileSync(opt.out, JSON.stringify(out, null, 2) + '\n');
  for (const w of warnings) console.warn(`warning: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);
  console.log(`${opt.out}: ${nodes.size} nodes, ${versions.length} versions, ${warnings.length} warnings, ${errors.length} errors`);
  if (errors.length || (opt.strict && warnings.length)) process.exit(1);
}

try { main(); } catch (e) { console.error(`error: ${e.message}`); process.exit(2); }
