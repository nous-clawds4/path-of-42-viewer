// Minimal checks for build/build.mjs: sample builds clean; bad fixture reports the expected problems.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';

execFileSync('node', ['build/build.mjs', '--in', 'sample/question-graph', '--out', '/tmp/p42-sample.json', '--strict'], { stdio: 'inherit' });
const g = JSON.parse(fs.readFileSync('/tmp/p42-sample.json', 'utf8'));
const by = Object.fromEntries(g.nodes.map(n => [n.id, n]));
assert.equal(g.nodes.length >= 15 && g.nodes.length <= 25, true, 'sample has 15-25 nodes');
assert.equal(by['a-observer-physical-system'].h, 1, 'h(root) = 1');
const close = (x, y) => Math.abs(x - y) < 1e-9;
assert.ok(close(by['a-no-privileged-matter'].h, 1 * 0.95 * 0.8), 'h = h(parent) * q * a');
const qw = by['q-weight-evolutions'];
assert.equal(qw.h, Math.min(by['a-branch-points'].h, by['a-obs-set-of-lumps'].h), 'weakest parent');
for (const n of g.nodes) if (n.status === 'rejected') assert.ok(n.rationale && n.reopen_if, `${n.id} keeps rationale + reopen_if`);
for (const id of ['a-m1', 'a-m2']) assert.equal(by[id].status, 'open', `${id} is open`);

const r = spawnSync('node', ['build/build.mjs', '--in', 'test/fixtures/bad', '--out', '/tmp/p42-bad.json'], { encoding: 'utf8' });
assert.equal(r.status, 1, 'bad fixture fails the build');
const b = JSON.parse(fs.readFileSync('/tmp/p42-bad.json', 'utf8'));
const has = (arr, re) => assert.ok(arr.some(x => re.test(x)), `expected ${re} in ${JSON.stringify(arr)}`);
has(b.errors, /a2: q must be/);
has(b.errors, /a2: unknown parent nope/);
has(b.errors, /cycle among: .*cyc1/);
has(b.warnings, /a1: rejected without a reopen_if/);
has(b.warnings, /version v: selects a1, which is rejected/);
has(b.warnings, /version v: unknown node ghost/);
has(b.warnings, /version v: selects both a1 and a2/);
assert.equal(b.nodes.find(n => n.id === 'a1').tag, 'method', 'principle is an alias of method');
console.log('all tests passed');
