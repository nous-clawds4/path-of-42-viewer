/* The Path of 42: question-graph viewer. Static; loads data/graph.json (or ?graph=URL). */
(function () {
  'use strict';

  const TAGS = {
    'definition': { letter: 'D', color: '#0d9488', label: 'definition' },
    'math-tool': { letter: 'T', color: '#7c3aed', label: 'math-tool' },
    'method': { letter: 'M', color: '#d97706', label: 'method (methodological principle)' },
    'physical-hypothesis': { letter: 'P', color: '#dc2626', label: 'physical hypothesis' },
  };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (x, d = 3) => (x == null ? '—' : (+x).toFixed(d).replace(/\.?0+$/, '') || '0');

  let G = null, cy = null, byId = new Map(), selected = null;

  function badgeSvg(tag) {
    const t = TAGS[tag]; if (!t) return 'none';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="9" fill="${t.color}" stroke="#fff" stroke-width="1.5"/><text x="10" y="14" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="700" fill="#fff" text-anchor="middle">${t.letter}</text></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  function computeDead() {
    // Nodes reachable from a root without passing through a rejected answer.
    const alive = new Set(), stack = [...G.roots];
    while (stack.length) {
      const id = stack.pop(); if (alive.has(id)) continue;
      const n = byId.get(id); if (!n || n.status === 'rejected') continue;
      alive.add(id); stack.push(...n.children);
    }
    return alive;
  }

  function elements() {
    const alive = computeDead();
    const els = [];
    for (const n of G.nodes) {
      const cls = [n.type, n.status || '', n.parents.length ? '' : 'root', n.status !== 'rejected' && !alive.has(n.id) ? 'dead' : ''].filter(Boolean).join(' ');
      els.push({ group: 'nodes', data: { id: n.id, label: n.title, badge: badgeSvg(n.tag), bw: 1.5 + 6.5 * (n.h ?? 0) }, classes: cls });
    }
    for (const n of G.nodes) for (const p of n.parents) {
      const src = byId.get(p);
      const cls = [n.status === 'rejected' ? 'to-rejected' : '', src.status === 'rejected' || !alive.has(p) ? 'in-dead' : ''].filter(Boolean).join(' ');
      els.push({ group: 'edges', data: { id: `${p}->${n.id}`, source: p, target: n.id }, classes: cls });
    }
    return els;
  }

  const style = [
    { selector: 'node', style: {
      'label': 'data(label)', 'text-wrap': 'wrap', 'text-valign': 'center', 'text-halign': 'center',
      'font-size': 12, 'font-family': 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      'border-width': 'data(bw)', 'transition-property': 'opacity, underlay-opacity', 'transition-duration': '150ms' } },
    { selector: 'node.answer', style: {
      'shape': 'round-rectangle', 'width': 176, 'height': 54, 'text-max-width': 146,
      'background-image': 'data(badge)', 'background-width': 18, 'background-height': 18,
      'background-position-x': '100%', 'background-position-y': '0%', 'background-offset-x': 7, 'background-offset-y': -7,
      'background-clip': 'none', 'background-image-containment': 'over', 'bounds-expansion': 10 } },
    { selector: 'node.question', style: {
      'shape': 'diamond', 'width': 170, 'height': 96, 'text-max-width': 96, 'font-size': 11,
      'background-color': '#f8fafc', 'border-color': '#475569', 'color': '#0f172a', 'font-style': 'italic' } },
    { selector: 'node.accepted', style: { 'background-color': '#2563eb', 'border-color': '#1e3a8a', 'color': '#fff' } },
    { selector: 'node.root', style: { 'background-color': '#4f46e5', 'border-color': '#312e81', 'font-weight': 700 } },
    { selector: 'node.open', style: { 'background-color': '#ffffff', 'border-color': '#2563eb', 'color': '#1e3a8a' } },
    { selector: 'node.rejected', style: { 'background-color': '#d1d5db', 'border-color': '#9ca3af', 'color': '#4b5563', 'border-style': 'solid', 'opacity': 0.8 } },
    { selector: 'node.dead', style: { 'opacity': 0.55 } },
    { selector: 'edge', style: {
      'curve-style': 'bezier', 'width': 1.6, 'line-color': '#94a3b8', 'target-arrow-color': '#94a3b8',
      'target-arrow-shape': 'triangle', 'arrow-scale': 0.9 } },
    { selector: 'edge.to-rejected, edge.in-dead', style: { 'line-style': 'dashed', 'line-dash-pattern': [6, 4], 'line-color': '#b8bec8', 'target-arrow-color': '#b8bec8' } },
    { selector: '.hidden', style: { 'display': 'none' } },
    { selector: '.dim', style: { 'opacity': 0.15 } },
    { selector: 'node.in-version', style: { 'underlay-color': '#f59e0b', 'underlay-opacity': 0.35, 'underlay-padding': 7 } },
    { selector: 'node.version-pick', style: { 'underlay-color': '#f59e0b', 'underlay-opacity': 0.75, 'underlay-padding': 9 } },
    { selector: 'edge.in-version', style: { 'line-color': '#f59e0b', 'target-arrow-color': '#f59e0b', 'width': 3 } },
    { selector: 'node.match', style: { 'underlay-color': '#22c55e', 'underlay-opacity': 0.6, 'underlay-padding': 8 } },
    { selector: 'node.sel', style: { 'overlay-color': '#0ea5e9', 'overlay-opacity': 0.18, 'overlay-padding': 6 } },
  ];

  function layout(animate) {
    cy.elements(':visible').layout({ name: 'dagre', rankDir: 'TB', nodeSep: 28, rankSep: 56, edgeSep: 10, animate: !!animate, animationDuration: 250, fit: true, padding: 30 }).run();
  }

  function applyVisibility() {
    const show = $('show-rejected').checked;
    cy.batch(() => {
      cy.elements().removeClass('hidden');
      if (!show) cy.nodes('.rejected, .dead').addClass('hidden');
    });
    layout(true);
    if (selected && cy.getElementById(selected).hasClass('hidden')) closePanel();
  }

  function applyHighlight() {
    const q = $('search').value.trim().toLowerCase();
    const vid = $('version').value;
    const v = G.versions.find((x) => x.id === vid);
    cy.batch(() => {
      cy.elements().removeClass('dim match in-version version-pick');
      if (v) {
        const path = new Set(v.path), picks = new Set(v.selects);
        cy.nodes().forEach((n) => { if (path.has(n.id())) n.addClass(picks.has(n.id()) ? 'version-pick in-version' : 'in-version'); else n.addClass('dim'); });
        cy.edges().forEach((e) => { if (path.has(e.source().id()) && path.has(e.target().id())) e.addClass('in-version'); else e.addClass('dim'); });
      }
      if (q) {
        const hits = cy.nodes().filter((n) => { const d = byId.get(n.id()); return [d.id, d.title, d.synopsis, d.tag, d.status, d.rationale].join(' ').toLowerCase().includes(q); });
        cy.elements().addClass('dim'); hits.removeClass('dim').addClass('match');
        $('status').textContent = `${hits.length} match${hits.length === 1 ? '' : 'es'}`;
      } else updateStatus();
      if (v && !q) {
        // Version-level build warnings (e.g. a historical version selecting a since-rejected answer).
        const vw = G.warnings.filter((w) => w.startsWith(`version ${v.id}:`)).map((w) => w.slice(`version ${v.id}: `.length));
        if (vw.length) $('status').textContent += ` · ${v.id}: ${vw.join('; ')}`;
      }
    });
  }

  function updateStatus() {
    const c = { accepted: 0, open: 0, rejected: 0 };
    G.nodes.forEach((n) => { if (n.status in c) c[n.status]++; });
    const qn = G.nodes.filter((n) => n.type === 'question').length;
    const probs = (G.errors.length ? ` · ${G.errors.length} build errors` : '') + (G.warnings.length ? ` · ${G.warnings.length} warnings` : '');
    const srcc = G.meta.source_commit ? ` · source ${G.meta.source_commit.slice(0, 7)}` : '';
    $('status').title = [...G.errors.map((e) => `error: ${e}`), ...G.warnings.map((w) => `warning: ${w}`)].join('\n');
    $('status').textContent = `${G.nodes.length} nodes: ${qn} questions, ${c.accepted} accepted, ${c.open} open, ${c.rejected} rejected${probs}${srcc}`;
  }

  function link(id) { const n = byId.get(id); return n ? `<a href="#node=${encodeURIComponent(id)}" data-node="${esc(id)}">${esc(n.title)}</a> <span class="muted">(${esc(n.type === 'answer' ? n.status : 'question')})</span>` : esc(id); }

  function hLine(n) {
    if (!n.parents.length) return 'h(root) = 1';
    if (n.h == null) return 'unknown (missing q or a on this path)';
    const wp = n.parents.length > 1 ? `weakest of ${n.parents.length} parents, ` : '';
    if (n.type === 'question') return `h = h(parent) = ${fmt(n.h_parent)} <span class="muted">(${wp}${esc(n.weakest_parent)})</span>`;
    return `h = ${fmt(n.h_parent)} × q ${fmt(n.q)} × a ${fmt(n.a)} = <b>${fmt(n.h)}</b><br><span class="muted">h(parent) from ${wp}<code>${esc(n.weakest_parent)}</code></span>`;
  }

  function openPanel(id) {
    const n = byId.get(id); if (!n) return;
    selected = id;
    cy.nodes().removeClass('sel'); cy.getElementById(id).addClass('sel');
    const sample = n.sample || G.meta.sample;
    const tag = TAGS[n.tag];
    const inVersions = G.versions.filter((v) => v.selects.includes(id));
    const warns = [...G.warnings, ...G.errors].filter((w) => w.startsWith(id + ':'));
    const base = G.meta.source_base_url;
    let h = '';
    const proposal = !sample && G.meta.proposal;
    h += `<div class="chips">${sample ? '<span class="chip sample">SAMPLE</span>' : ''}${proposal ? '<span class="chip proposal" title="q, a and hold are proposals, pending signature">PROPOSAL</span>' : ''}<span class="chip">${esc(n.type)}${n.parents.length ? '' : ' · root'}</span>`;
    if (n.status) h += `<span class="chip ${esc(n.status)}">${esc(n.status)}</span>`;
    if (tag) h += `<span class="chip"><b class="tb" style="background:${tag.color}">${tag.letter}</b> ${esc(tag.label)}</span>`;
    if (n.hold) h += `<span class="chip" title="hold level (L0–L4)">${esc(n.hold)}</span>`;
    h += `</div><h2>${esc(n.title)}</h2>`;
    if (n.synopsis) h += `<p>${esc(n.synopsis)}</p>`;
    h += `<h3>Hold number${sample ? ' <span class="chip sample" style="font-size:10px">sample values</span>' : ''}${proposal ? ' <span class="chip proposal" style="font-size:10px">proposed values, pending signature</span>' : ''}</h3>`;
    h += `<table class="ratings"><tr><td>q</td><td>${fmt(n.q)}</td><td class="muted">question worth asking?</td></tr><tr><td>a</td><td>${fmt(n.a)}</td><td class="muted">best answer?</td></tr><tr><td>h</td><td>${fmt(n.h)}</td><td><div class="hbar"><div style="width:${(n.h ?? 0) * 100}%"></div></div></td></tr></table>`;
    h += `<p style="font-size:12px">${hLine(n)}</p>`;
    if (n.rationale || n.status === 'rejected') h += `<h3>${n.status === 'rejected' ? 'Why rejected' : 'Rationale'}</h3><div class="box">${n.rationale ? esc(n.rationale) : '<span class="warn">missing</span>'}</div>`;
    if (n.status === 'rejected' || n.reopen_if) h += `<h3>Reopen if</h3><div class="box reopen">${n.reopen_if ? esc(n.reopen_if) : '<span class="warn">missing</span>'}</div>`;
    h += `<h3>Parents</h3>${n.parents.length ? '<ul>' + n.parents.map((p) => `<li>${link(p)}</li>`).join('') + '</ul>' : '<p class="muted">none (root)</p>'}`;
    h += `<h3>Children</h3>${n.children.length ? '<ul>' + n.children.map((c) => `<li>${link(c)}</li>`).join('') + '</ul>' : '<p class="muted">none</p>'}`;
    if (inVersions.length) h += `<h3>Selected in paper versions</h3><div class="chips">${inVersions.map((v) => `<span class="chip version">${esc(v.title)}</span>`).join('')}</div>`;
    h += '<h3>Sources</h3>';
    const src = n.sources.map((s) => `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>` : esc(s.label)}</li>`);
    if (base) src.push(`<li><a href="${esc(base + n.file)}" target="_blank" rel="noopener">node file: ${esc(n.file)}</a></li>`);
    else src.push(`<li class="muted">node file: <code>${esc(n.file)}</code></li>`);
    h += `<ul>${src.join('')}</ul>`;
    if (n.history && n.history.length) h += `<h3>History (git)</h3><ul>${n.history.map((c) => `<li>${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.sha.slice(0, 7))}</a>` : `<code>${esc(c.sha.slice(0, 7))}</code>`} ${esc(c.subject)} <span class="muted">${esc(c.date.slice(0, 10))}</span></li>`).join('')}</ul>`;
    if (warns.length) h += `<h3>Build warnings</h3><ul>${warns.map((w) => `<li class="warn">${esc(w.slice(id.length + 1))}</li>`).join('')}</ul>`;
    h += `<p class="muted" style="margin-top:14px;font-size:12px">id: <code>${esc(n.id)}</code></p>`;
    $('panel-body').innerHTML = h;
    $('panel').hidden = false;
    cy.resize();
    if (location.hash !== `#node=${encodeURIComponent(id)}`) history.replaceState(null, '', `#node=${encodeURIComponent(id)}`);
  }

  function closePanel() {
    selected = null; $('panel').hidden = true; cy.nodes().removeClass('sel'); cy.resize();
    history.replaceState(null, '', location.pathname + location.search);
  }

  function focusNode(id) {
    const el = cy.getElementById(id); if (!el.length) return;
    if (el.hasClass('hidden')) { $('show-rejected').checked = true; applyVisibility(); }
    openPanel(id);
    cy.animate({ center: { eles: el }, duration: 250 });
  }

  function fromHash() {
    const m = location.hash.match(/^#node=(.+)$/);
    if (m) focusNode(decodeURIComponent(m[1]));
  }

  function init(data) {
    G = data;
    G.nodes.forEach((n) => byId.set(n.id, n));
    const title = G.meta.title || '';
    $('graph-title').textContent = title ? `· ${title}` : '';
    document.title = `The Path of 42${title ? ' · ' + title : ''}`;
    // Banner: sample graphs say so; other graphs show their badge / notice / note (e.g. a pilot whose
    // ratings are proposals). meta.badge, meta.notice and meta.notice_link come from graph.yaml or --meta.
    const badge = $('data-badge'), note = $('data-note');
    if (G.meta.sample) {
      badge.hidden = false; badge.textContent = 'SAMPLE DATA';
      badge.title = G.meta.note || 'Sample data';
      note.hidden = false;
      note.innerHTML = `<b>SAMPLE DATA.</b> ${esc(G.meta.note || 'Illustrative graph; q and a values are sample placeholders.')}`;
    } else if (G.meta.badge || G.meta.notice || G.meta.note) {
      const cls = G.meta.proposal ? 'proposal' : '';
      if (G.meta.badge) { badge.hidden = false; badge.textContent = G.meta.badge; badge.title = G.meta.notice || G.meta.note || ''; badge.className = `data-badge ${cls}`; }
      note.hidden = false; note.className = `data-note ${cls}`;
      const more = G.meta.notice_link ? ` <a href="${esc(G.meta.notice_link)}" target="_blank" rel="noopener">${esc(G.meta.notice_link_label || 'Details')}</a>` : '';
      note.innerHTML = G.meta.notice ? `${esc(G.meta.notice)}${more}` : `${esc(G.meta.note)}${more}`;
    }
    for (const v of G.versions) { const o = document.createElement('option'); o.value = v.id; o.textContent = v.title; $('version').appendChild(o); }

    cytoscape.use(cytoscapeDagre);
    cy = cytoscape({ container: $('cy'), elements: elements(), style, minZoom: 0.15, maxZoom: 3 });
    layout(false);
    updateStatus();

    const tip = $('tooltip');
    cy.on('mouseover', 'node', (e) => {
      const n = byId.get(e.target.id());
      tip.innerHTML = `<b>${esc(n.title)}</b><br>${esc(n.type)}${n.status ? ' · ' + esc(n.status) : ''}${n.tag ? ' · ' + esc(n.tag) : ''}<br>h = ${fmt(n.h)}${n.type === 'answer' && n.parents.length ? ` <span style="opacity:.7">(q ${fmt(n.q)}, a ${fmt(n.a)})</span>` : ''}${n.sample || G.meta.sample ? ' <span style="opacity:.7">· sample</span>' : G.meta.proposal ? ' <span style="opacity:.7">· proposal</span>' : ''}`;
      tip.hidden = false;
      document.body.style.cursor = 'pointer';
    });
    cy.on('mousemove', 'node', (e) => { const p = e.originalEvent; tip.style.left = p.clientX + 14 + 'px'; tip.style.top = p.clientY + 14 + 'px'; });
    cy.on('mouseout', 'node', () => { tip.hidden = true; document.body.style.cursor = ''; });
    cy.on('tap', 'node', (e) => openPanel(e.target.id()));
    cy.on('tap', (e) => { if (e.target === cy) closePanel(); });

    $('panel-close').onclick = closePanel;
    $('panel-body').addEventListener('click', (e) => { const a = e.target.closest('a[data-node]'); if (a) { e.preventDefault(); focusNode(a.dataset.node); } });
    $('show-rejected').onchange = applyVisibility;
    $('version').onchange = applyHighlight;
    $('search').oninput = applyHighlight;
    $('search').onkeydown = (e) => {
      if (e.key === 'Enter') { const m = cy.nodes('.match:visible'); if (m.length) { focusNode(m[0].id()); cy.animate({ fit: { eles: m, padding: 80 }, duration: 250 }); } }
      if (e.key === 'Escape') { $('search').value = ''; applyHighlight(); }
    };
    $('fit').onclick = () => cy.animate({ fit: { eles: cy.elements(':visible'), padding: 30 }, duration: 250 });
    $('zoom-in').onclick = () => cy.zoom({ level: cy.zoom() * 1.25, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    $('zoom-out').onclick = () => cy.zoom({ level: cy.zoom() / 1.25, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    $('relayout').onclick = () => layout(true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.activeElement !== $('search')) closePanel(); });
    window.addEventListener('hashchange', fromHash);
    fromHash();
    window.__p42 = { cy, G, focusNode }; // handy for debugging and tests
  }

  const src = new URLSearchParams(location.search).get('graph') || 'data/graph.json';
  fetch(src, { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(`${src}: HTTP ${r.status}`); return r.json(); })
    .then(init)
    .catch((e) => { document.querySelector('main').innerHTML = `<div id="error"><h2>Could not load the graph</h2><p>${esc(e.message)}</p><p>Build it with <code>npm run build</code>, or pass <code>?graph=URL</code>.</p></div>`; console.warn(e); });
})();
