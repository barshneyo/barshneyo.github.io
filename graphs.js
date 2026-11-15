// Projects page background: small random graphs that drift around the screen
// and keep morphing into new shapes (cycle, star, wheel, tree, grid, ...).
(function () {
  const canvas = document.getElementById('net');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduce = false; // always animate
  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.5 : 1;
  const COLORS = ['95,212,224', '255,111,168', '255,207,90', '200,214,232'];
  const MAXN = 10;
  let W = 0, H = 0, dpr = 1, graphs = [];

  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  // ---- Shape generators: return points (local coords) and edges for n nodes
  const ring = (n, r, off = 0) => Array.from({ length: n }, (_, i) => {
    const a = off + (i / n) * Math.PI * 2 - Math.PI / 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  const shapes = {
    cycle(n, r) { return { pts: ring(n, r), edges: Array.from({ length: n }, (_, i) => [i, (i + 1) % n]) }; },
    star(n, r) { return { pts: [[0, 0], ...ring(n - 1, r)], edges: Array.from({ length: n - 1 }, (_, i) => [0, i + 1]) }; },
    wheel(n, r) {
      const m = n - 1, e = [];
      for (let i = 0; i < m; i++) { e.push([0, i + 1]); e.push([i + 1, ((i + 1) % m) + 1]); }
      return { pts: [[0, 0], ...ring(m, r)], edges: e };
    },
    complete(n, r) {
      n = Math.min(n, 7); const e = [];
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) e.push([i, j]);
      return { pts: ring(n, r), edges: e };
    },
    path(n, r) {
      const pts = Array.from({ length: n }, (_, i) => [-r + (2 * r * i) / (n - 1), (i % 2 ? 1 : -1) * r * 0.35]);
      return { pts, edges: Array.from({ length: n - 1 }, (_, i) => [i, i + 1]) };
    },
    tree(n, r) {
      const depth = i => Math.floor(Math.log2(i + 1));
      const maxD = depth(n - 1), pts = [], e = [];
      for (let i = 0; i < n; i++) {
        const d = depth(i), first = 2 ** d - 1, count = 2 ** d, k = i - first;
        pts.push([(-r) + (2 * r) * ((k + 0.5) / count), -r + (2 * r * d) / Math.max(1, maxD)]);
        if (i > 0) e.push([Math.floor((i - 1) / 2), i]);
      }
      return { pts, edges: e };
    },
    grid(n, r) {
      const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols), pts = [], e = [];
      for (let i = 0; i < n; i++) {
        const c = i % cols, rr = Math.floor(i / cols);
        pts.push([-r + (2 * r * c) / Math.max(1, cols - 1), -r + (2 * r * rr) / Math.max(1, rows - 1)]);
        if (c < cols - 1 && i + 1 < n) e.push([i, i + 1]);
        if (i + cols < n) e.push([i, i + cols]);
      }
      return { pts, edges: e };
    },
    bipartite(n, r) {
      const a = Math.ceil(n / 2), b = n - a, pts = [], e = [];
      for (let i = 0; i < a; i++) pts.push([-r * 0.6, -r + (2 * r * i) / Math.max(1, a - 1)]);
      for (let j = 0; j < b; j++) pts.push([r * 0.6, -r + (2 * r * j) / Math.max(1, b - 1)]);
      for (let i = 0; i < a; i++) for (let j = 0; j < b; j++) e.push([i, a + j]);
      return { pts, edges: e };
    },
    random(n, r) {
      const pts = Array.from({ length: n }, () => { const a = rand(0, 6.283), d = r * Math.sqrt(Math.random()); return [Math.cos(a) * d, Math.sin(a) * d]; });
      const e = [];
      for (let i = 1; i < n; i++) { // connect each node to its nearest earlier node, plus the odd extra edge
        let best = 0, bd = Infinity;
        for (let j = 0; j < i; j++) { const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]); if (d < bd) { bd = d; best = j; } }
        e.push([best, i]);
        if (Math.random() < 0.35) { const k = randInt(0, i - 1); if (k !== best) e.push([k, i]); }
      }
      return { pts, edges: e };
    }
  };
  const SHAPES = Object.keys(shapes);

  function morph(g) {
    let type = pick(SHAPES);
    if (type === g.type) type = pick(SHAPES);
    g.type = type;
    const n = randInt(5, MAXN), r = rand(0.75, 1.25) * g.size * dpr;
    const { pts, edges } = shapes[type](n, r);
    const keep = pts.length;
    for (let i = 0; i < MAXN; i++) {
      const node = g.nodes[i];
      if (i < keep) {
        node.tx = pts[i][0]; node.ty = pts[i][1]; node.ta = 1;
        if (node.a < 0.05) { node.x = 0; node.y = 0; } // new nodes grow out of the centre
      } else node.ta = 0;
    }
    g.target = new Set(edges.map(([i, j]) => i < j ? `${i}-${j}` : `${j}-${i}`));
    for (const k of g.target) if (!(k in g.ea)) g.ea[k] = 0;
    g.next = performance.now() + rand(3200, 6500);
  }

  // Content boxes (cards, title, menu) in canvas pixels; graphs are steered out of them
  let rects = [];
  function readRects() {
    rects = [...document.querySelectorAll('.nodecard, .neo-head, .nav')].map(el => {
      const r = el.getBoundingClientRect();
      return { l: r.left * dpr, t: r.top * dpr, r: r.right * dpr, b: r.bottom * dpr };
    });
  }
  function inside(x, y, m) { return rects.find(q => x > q.l - m && x < q.r + m && y > q.t - m && y < q.b + m); }
  function freeSpot() {
    for (let k = 0; k < 40; k++) { const x = rand(0, W), y = rand(0, H); if (!inside(x, y, 60 * dpr)) return [x, y]; }
    return [rand(0, W), rand(0, H)];
  }
  addEventListener('scroll', readRects, { passive: true });
  setInterval(readRects, 1000);

  function makeGraph() {
    const spot = freeSpot();
    const g = {
      cx: spot[0], cy: spot[1], size: rand(32, 80),
      vx: rand(-0.25, 0.25) * dpr, vy: rand(-0.2, 0.2) * dpr,
      rot: rand(0, 6.283), vr: rand(-0.0015, 0.0015),
      color: pick(COLORS), type: null, ea: {}, target: new Set(),
      nodes: Array.from({ length: MAXN }, () => ({ x: 0, y: 0, tx: 0, ty: 0, a: 0, ta: 0 }))
    };
    morph(g);
    g.next = performance.now() + rand(500, 4000);
    return g;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.width = Math.round(innerWidth * dpr);
    H = canvas.height = Math.round(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    readRects();
    const count = Math.max(8, Math.min(30, Math.round((innerWidth * innerHeight) / 42000)));
    while (graphs.length < count) graphs.push(makeGraph());
    graphs.length = count;
  }

  function step(now) {
    ctx.clearRect(0, 0, W, H);
    // keep graphs from piling on top of each other
    if (!reduce) for (let i = 0; i < graphs.length; i++) for (let j = i + 1; j < graphs.length; j++) {
      const a = graphs[i], b = graphs[j], dx = b.cx - a.cx, dy = b.cy - a.cy;
      const d = Math.hypot(dx, dy) || 1, min = (a.size + b.size) * 1.15 * dpr;
      if (d < min) { const f = 0.012 * dpr * (1 - d / min) / d; a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f; }
    }
    for (const g of graphs) {
      if (!reduce) {
        if (now > g.next) morph(g);
        // nudge out of content boxes toward the nearest open side, then ease back to cruising speed
        const m = g.size * dpr, q = inside(g.cx, g.cy, m);
        if (q) {
          const d = [g.cx - (q.l - m), (q.r + m) - g.cx, g.cy - (q.t - m), (q.b + m) - g.cy];
          const k = d.indexOf(Math.min(...d)), push = 0.06 * dpr;
          if (k === 0) g.vx -= push; else if (k === 1) g.vx += push; else if (k === 2) g.vy -= push; else g.vy += push;
        }
        const sp = Math.hypot(g.vx, g.vy), cruise = 0.3 * dpr;
        if (sp > cruise) { g.vx *= 0.97; g.vy *= 0.97; }
        g.cx += g.vx * slow; g.cy += g.vy * slow; g.rot += g.vr * slow;
        const pad = 140 * dpr; // wrap around the screen edges
        if (g.cx < -pad) g.cx = W + pad; if (g.cx > W + pad) g.cx = -pad;
        if (g.cy < -pad) g.cy = H + pad; if (g.cy > H + pad) g.cy = -pad;
        for (const n of g.nodes) { n.x += (n.tx - n.x) * 0.045; n.y += (n.ty - n.y) * 0.045; n.a += (n.ta - n.a) * 0.06; }
        for (const k in g.ea) {
          const t = g.target.has(k) ? 1 : 0;
          g.ea[k] += (t - g.ea[k]) * 0.05;
          if (!t && g.ea[k] < 0.01) delete g.ea[k];
        }
      } else {
        for (const n of g.nodes) { n.x = n.tx; n.y = n.ty; n.a = n.ta; }
        for (const k of g.target) g.ea[k] = 1;
      }
      const cos = Math.cos(g.rot), sin = Math.sin(g.rot);
      const P = g.nodes.map(n => [g.cx + n.x * cos - n.y * sin, g.cy + n.x * sin + n.y * cos]);

      ctx.lineWidth = 1.1 * dpr;
      for (const k in g.ea) {
        const [i, j] = k.split('-').map(Number);
        const a = g.ea[k] * Math.min(g.nodes[i].a, g.nodes[j].a);
        if (a < 0.02) continue;
        ctx.strokeStyle = `rgba(${g.color},${0.38 * a})`;
        ctx.beginPath(); ctx.moveTo(P[i][0], P[i][1]); ctx.lineTo(P[j][0], P[j][1]); ctx.stroke();
      }
      for (let i = 0; i < MAXN; i++) {
        const a = g.nodes[i].a; if (a < 0.02) continue;
        ctx.fillStyle = `rgba(4,6,12,${a})`;
        ctx.beginPath(); ctx.arc(P[i][0], P[i][1], 4.2 * dpr, 0, 6.283); ctx.fill();
        ctx.strokeStyle = `rgba(${g.color},${0.75 * a})`; ctx.lineWidth = 1.4 * dpr; ctx.stroke();
      }
    }
    if (!reduce) requestAnimationFrame(step);
  }

  addEventListener('resize', () => { resize(); if (reduce) step(performance.now()); });
  resize();
  requestAnimationFrame(step);
})();
