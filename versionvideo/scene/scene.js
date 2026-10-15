// The scene: SVG and HTML laid out once, then one paused GSAP timeline that the renderer seeks frame by frame.
// Nothing here reads the clock or Math.random, so a given time always draws the same frame.
/* global gsap */
import { TUNE } from './tune.js';

const params = new URLSearchParams(location.search);
const releaseId = params.get('release') || '1.1.15';
const [W, H] = (params.get('size') || '1080x1080').split('x').map(Number);
const FPS = Number(params.get('fps') || 30);
const PREVIEW = params.has('preview');
const SPEED = TUNE.speed || 1;
const U = Math.min(W, H) / 1080;
const SVG_NS = 'http://www.w3.org/2000/svg';
const HULL = 'M4 5.5H13L16 8.5L19 5.5H28L16 27.5Z';
const VEE = 'M8.6 5.5H12.7L16 12.3L19.3 5.5H23.4L16 20.6Z';

const stage = document.getElementById('stage');
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function el(tag, className, parent, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

function svg(tag, attrs, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

function hexPoints(cx, cy, r) {
  const s = (Math.sqrt(3) / 2) * r;
  return `${cx + r},${cy} ${cx + r / 2},${cy + s} ${cx - r / 2},${cy + s} ${cx - r},${cy} ${cx - r / 2},${cy - s} ${cx + r / 2},${cy - s}`;
}

function hexPath(cx, cy, r) {
  return `M${hexPoints(cx, cy, r).split(' ').join('L')}Z`;
}

function splitInto(parent, text, className) {
  return [...text].map((ch) => el('span', ch === '.' && className ? className : '', parent, ch));
}

function formatDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

// ---------- build ----------

function buildBackground(rng) {
  const bg = svg('svg', { class: 'bg', viewBox: `0 0 ${W} ${H}` }, stage);
  const r = TUNE.background.hexSize * U;
  const tw = 3 * r;
  const th = Math.sqrt(3) * r;
  const defs = svg('defs', {}, bg);
  const pattern = svg('pattern', { id: 'hexgrid', patternUnits: 'userSpaceOnUse', width: tw, height: th }, defs);
  svg('path', {
    class: 'grid',
    d: [[0, 0], [0, th], [1.5 * r, th / 2], [tw, 0], [tw, th]].map(([x, y]) => hexPath(x, y, r)).join(''),
  }, pattern);
  const grid = svg('g', {}, bg);
  svg('rect', { x: -2 * tw, y: -2 * th, width: W + 4 * tw, height: H + 4 * th, fill: 'url(#hexgrid)' }, grid);

  const starLayer = svg('g', {}, bg);
  const stars = [];
  const count = Math.round(((W * H) / (1080 * 1080)) * TUNE.background.stars);
  for (let i = 0; i < count; i++) {
    const node = svg('circle', { class: 'star', cx: rng() * W, cy: rng() * H, r: (0.6 + rng() * 1.6) * U }, starLayer);
    stars.push({ node, base: 0.12 + rng() * 0.45, amp: 0.1 + rng() * 0.25, freq: 0.6 + rng() * 2.2, phase: rng() * Math.PI * 2 });
  }
  return { grid, starLayer, stars, cell: tw };
}

function buildMark(parent) {
  const wrap = el('div', 'mark', parent);
  const s = svg('svg', { viewBox: '0 0 32 32' }, wrap);
  const hull = svg('path', { class: 'hull', d: HULL }, s);
  const vee = svg('path', { class: 'vee', d: VEE }, s);
  return { wrap, hull, vee };
}

function buildRelease(release) {
  const block = el('div', 'release', stage);
  block.style.top = `${180 * U}px`;
  const label = el('div', 'label', block, TUNE.words.versionLabel);
  const version = el('div', 'version', block);
  const chars = [...release.version].map((ch) => el('span', /\d/.test(ch) ? 'digit' : 'sep', version, ch));
  const scan = el('div', 'scan', block);
  const headline = release.headline ? el('div', 'headline', block, release.headline) : null;
  const meta = el('div', 'meta', block);
  const chips = [el('div', 'chip', meta, formatDate(release.date))];
  if (release.engine) {
    const engine = el('div', 'chip', meta, `${TUNE.words.enginePrefix} `);
    el('span', '', engine, release.engine).style.textTransform = 'none';
    chips.push(engine);
  }
  return { block, label, chars, scan, headline, chips };
}

function buildList(release, top) {
  const viewport = el('div', 'viewport', stage);
  viewport.style.top = `${top}px`;
  viewport.style.height = `${H - top - 40 * U}px`;
  const list = el('div', 'list', viewport);
  const rows = release.items.map((item) => {
    const row = el('div', 'row', list);
    const anchor = el('div', 'anchor', row);
    const area = item.area ? el('div', 'area', row, item.area) : null;
    const text = el('div', 'text', row);
    const words = item.text.split(/\s+/).filter(Boolean).map((w, i) => {
      if (i) text.appendChild(document.createTextNode(' '));
      return el('span', '', text, w);
    });
    return { row, anchor, area, text, words };
  });
  return { viewport, list, rows };
}

function buildRoute(list, rows) {
  const route = svg('svg', { class: 'route' }, list);
  route.style.height = `${list.offsetHeight}px`;
  const r = 22 * U;
  const centres = rows.map(({ row, anchor }) => ({
    x: row.offsetLeft + anchor.offsetLeft + anchor.offsetWidth / 2,
    y: row.offsetTop + anchor.offsetTop + anchor.offsetHeight / 2,
  }));
  const segments = centres.slice(1).map((c, i) => {
    const prev = centres[i];
    const path = svg('path', { d: `M${prev.x},${prev.y + r}L${c.x},${c.y - r}` }, route);
    const len = c.y - prev.y - 2 * r;
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = `${len}`;
    return path;
  });
  const hexes = centres.map((c) => svg('polygon', { class: 'hex', points: hexPoints(c.x, c.y, r) }, route));
  const ship = svg('g', { class: 'ship' }, route);
  const inner = svg('g', { transform: `scale(${U * 0.95}) translate(-16,-16.5)` }, ship);
  svg('path', { class: 'hull', d: HULL }, inner);
  svg('path', { class: 'vee', d: VEE }, inner);
  return { route, centres, segments, hexes, ship, r };
}

// ---------- animate ----------

function flash(tl, parent, x, y, r, at) {
  const ring = svg('circle', { cx: x, cy: y, r, fill: 'none', stroke: css('--signal'), 'stroke-width': 3 * U }, parent);
  pulse(tl, ring, at, 0.6, 2.4);
}

// A ring that pops on at `at` and spreads out. set + to (not fromTo) so it stays hidden before `at`, scrubbing included.
function pulse(tl, ring, at, from, to) {
  gsap.set(ring, { opacity: 0, scale: from, transformOrigin: '50% 50%' });
  tl.set(ring, { opacity: 0.9, scale: from }, at);
  tl.to(ring, { opacity: 0, scale: to, duration: 0.6, ease: 'power2.out' }, at);
}

function scramble(tl, chars, at, duration, seed) {
  const targets = chars.map((c) => c.textContent);
  const proxy = { p: 0 };
  chars.forEach((c) => { if (/\d/.test(c.textContent)) c.textContent = '0'; });
  tl.to(proxy, {
    p: 1,
    duration,
    ease: 'none',
    onUpdate() {
      const step = Math.floor(proxy.p * 24);
      chars.forEach((c, i) => {
        if (!/\d/.test(targets[i])) return;
        const locked = proxy.p >= (i + 1) / (chars.length + 1);
        c.textContent = locked ? targets[i] : String((seed + i * 7 + step * 13 + i * step) % 10);
      });
    },
  }, at);
}

function wordHold(words) {
  const h = TUNE.items.hold;
  return Math.min(h.max, Math.max(h.min, h.base + words * h.perWord));
}

function build(release) {
  stage.style.width = `${W}px`;
  stage.style.height = `${H}px`;
  stage.style.setProperty('--u', `${U}px`);
  const seed = hashString(release.version);
  const bg = buildBackground(mulberry32(seed));

  // Header, laid out at its final place; the intro is a transform away from it.
  const mark = buildMark(stage);
  mark.wrap.style.left = `${80 * U}px`;
  mark.wrap.style.top = `${72 * U}px`;
  const word = el('div', 'wordmark', stage);
  splitInto(word, TUNE.words.wordmark, 'dot');
  const letters = [...word.children];
  word.style.left = `${(80 + 64 + 22) * U}px`;
  word.style.top = `${(72 + 17) * U}px`;
  const kicker = el('div', 'kicker', stage, TUNE.words.kicker);
  const ring = el('div', 'ring', stage);

  const rel = buildRelease(release);
  const listTop = rel.block.offsetTop + rel.block.offsetHeight + 24 * U;
  const { viewport, list, rows } = buildList(release, listTop);
  const route = buildRoute(list, rows);

  const outro = el('div', 'outro', stage);
  const domain = el('div', 'domain', outro);
  const domainChars = splitInto(domain, TUNE.words.domain, 'dot');
  el('div', 'sub', outro, `${TUNE.words.versionLabel} ${release.version} · ${formatDate(release.date)}`);
  outro.style.top = `${H / 2 + 50 * U}px`;

  // Intro geometry.
  const markSize = 64 * U;
  const introMark = TUNE.intro.markSize * U;
  const introCy = H / 2 - 90 * U;
  const markScale = introMark / markSize;
  const markX = W / 2 - introMark / 2 - mark.wrap.offsetLeft;
  const markY = introCy - introMark / 2 - mark.wrap.offsetTop;
  const wordScale = TUNE.intro.wordScale;
  const wordTop = introCy + introMark / 2 + 44 * U;
  const wordX = W / 2 - (word.offsetWidth * wordScale) / 2 - word.offsetLeft;
  const wordY = wordTop - word.offsetTop;
  kicker.style.top = `${wordTop + 30 * U * wordScale + 34 * U}px`;
  ring.style.width = ring.style.height = `${introMark}px`;
  ring.style.left = `${W / 2 - introMark / 2}px`;
  ring.style.top = `${introCy - introMark / 2}px`;

  const signal = css('--signal');
  const signalDim = css('--signal-dim');
  const hullLen = mark.hull.getTotalLength();

  gsap.set(mark.wrap, { x: markX, y: markY, scale: markScale, transformOrigin: '0 0' });
  gsap.set(word, { x: wordX, y: wordY, scale: wordScale, transformOrigin: '0 0' });
  gsap.set(mark.hull, { strokeDasharray: hullLen, strokeDashoffset: hullLen, fillOpacity: 0 });
  gsap.set(mark.vee, { opacity: 0 });
  gsap.set(letters, { opacity: 0 });
  gsap.set([kicker, rel.label, rel.chars, rel.headline, ...rel.chips, outro, ...domainChars].filter(Boolean), { opacity: 0 });
  gsap.set(rel.scan, { scaleX: 0 });
  gsap.set(rows.flatMap((r) => [r.area, ...r.words]).filter(Boolean), { opacity: 0 });
  gsap.set([...route.hexes, route.ship], { scale: 0, transformOrigin: '50% 50%' });
  gsap.set(outro.lastChild, { opacity: 0 });

  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.out' } });

  // 1. The ship draws itself, the name arrives, then both jump to the header.
  const intro = TUNE.intro;
  const drawEnd = 0.2 + intro.draw;
  tl.addLabel('intro', 0);
  tl.from(bg.grid, { opacity: 0, duration: 1.4, ease: 'none' }, 0);
  tl.to(mark.hull, { strokeDashoffset: 0, duration: intro.draw, ease: 'power1.inOut' }, 0.2);
  tl.to(mark.hull, { fillOpacity: 1, duration: 0.4 }, drawEnd - 0.3);
  tl.fromTo(mark.vee, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.4 }, drawEnd - 0.05);
  tl.fromTo(letters, { opacity: 0, y: 14 * U }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.04 }, drawEnd - 0.3);
  tl.fromTo(kicker, { opacity: 0, letterSpacing: '0.9em' }, { opacity: 1, letterSpacing: '0.5em', duration: 0.7 }, drawEnd + 0.4);
  pulse(tl, ring, intro.jumpAt, 0.7, 1.6);
  tl.to(kicker, { opacity: 0, duration: 0.3 }, intro.jumpAt + 0.1);
  tl.to([mark.wrap, word], { x: 0, y: 0, scale: 1, duration: intro.jump, ease: 'power3.inOut' }, intro.jumpAt + 0.15);

  // 2. The version number reads out.
  const v = intro.jumpAt + TUNE.version.after;
  tl.addLabel('version', v);
  tl.fromTo(rel.label, { opacity: 0, x: -16 * U }, { opacity: 1, x: 0, duration: 0.4 }, v);
  tl.to(rel.chars, { opacity: 1, duration: 0.15, stagger: 0.05 }, v + 0.05);
  scramble(tl, rel.chars, v + 0.05, TUNE.version.scramble, seed);
  tl.to(rel.scan, { scaleX: 1, duration: 0.7, ease: 'power3.out' }, v + 0.3);
  if (rel.headline) tl.fromTo(rel.headline, { opacity: 0, x: -24 * U }, { opacity: 1, x: 0, duration: 0.5 }, v + 0.55);
  tl.fromTo(rel.chips, { opacity: 0, y: 10 * U }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.1 }, v + 0.7);

  // 3. One jump per item: the ship leaves the last hex, the route draws, the ship arrives, the item reads in.
  const items = TUNE.items;
  let t = v + items.after;
  const viewH = viewport.offsetHeight;
  rows.forEach((row, i) => {
    const c = route.centres[i];
    tl.addLabel(`item ${i + 1}`, t);
    if (i === 0) {
      tl.set(route.ship, { x: c.x, y: c.y }, t);
    } else {
      const prev = route.centres[i - 1];
      flash(tl, route.route, prev.x, prev.y, route.r, t);
      tl.to(route.ship, { scale: 0, duration: 0.18, ease: 'power2.in' }, t);
      tl.to(route.hexes[i - 1], { fill: signalDim, stroke: signalDim, duration: 0.3 }, t);
      tl.to(route.segments[i - 1], { strokeDashoffset: 0, duration: items.jump + 0.05, ease: 'power1.inOut' }, t + 0.1);
      tl.set(route.ship, { x: c.x, y: c.y }, t + items.jump);
      const prevRow = rows[i - 1];
      tl.to([prevRow.area, ...prevRow.words].filter(Boolean), { opacity: items.dimTo, duration: 0.4 }, t);
      t += items.jump;
    }
    const scroll = Math.max(0, row.row.offsetTop + row.row.offsetHeight + 48 * U - viewH);
    if (scroll > 0) tl.to(list, { y: -scroll, duration: 0.6, ease: 'power2.inOut' }, t - 0.2);
    tl.to(route.hexes[i], { scale: 1, fill: signal, stroke: signal, duration: 0.3 }, t);
    tl.fromTo(route.ship, { scale: 0 }, { scale: 1, duration: 0.25, ease: 'back.out(2)' }, t + 0.05);
    flash(tl, route.route, c.x, c.y, route.r, t + 0.05);
    if (row.area) tl.fromTo(row.area, { opacity: 0, x: -20 * U }, { opacity: 1, x: 0, duration: 0.35 }, t + 0.15);
    const stagger = Math.min(0.05, 0.8 / row.words.length);
    tl.fromTo(row.words, { opacity: 0, y: 16 * U }, { opacity: 1, y: 0, duration: 0.4, stagger }, t + 0.25);
    t += 0.4 + wordHold(row.words.length);
  });

  // 4. Every item back to full strength for a last look.
  const last = rows.length - 1;
  tl.addLabel('summary', t);
  tl.to(rows.flatMap((r) => [r.area, ...r.words]).filter(Boolean), { opacity: 1, duration: 0.4 }, t);
  tl.to(route.hexes[last], { fill: signalDim, stroke: signalDim, duration: 0.4 }, t);
  tl.to(route.ship, { scale: 0, duration: 0.3, ease: 'power2.in' }, t);
  t += TUNE.summary.hold;

  // 5. Out: everything clears, the ship returns to centre and the address types in.
  tl.addLabel('outro', t);
  tl.to([rel.block, viewport], { opacity: 0, y: -30 * U, duration: 0.6, ease: 'power2.in', stagger: 0.08 }, t);
  tl.to(word, { opacity: 0, duration: 0.4 }, t);
  const outroMark = TUNE.outro.markSize * U;
  const outroCy = H / 2 - 80 * U;
  tl.to(mark.wrap, {
    x: W / 2 - outroMark / 2 - mark.wrap.offsetLeft,
    y: outroCy - outroMark / 2 - mark.wrap.offsetTop,
    scale: outroMark / markSize,
    duration: 0.9,
    ease: 'power3.inOut',
  }, t + 0.3);
  const outroRing = el('div', 'ring', stage);
  Object.assign(outroRing.style, { width: `${outroMark}px`, height: `${outroMark}px`, left: `${W / 2 - outroMark / 2}px`, top: `${outroCy - outroMark / 2}px` });
  pulse(tl, outroRing, t + 1.1, 0.7, 1.7);
  tl.set(outro, { opacity: 1 }, t + 1.1);
  tl.fromTo(domainChars, { opacity: 0, y: 12 * U }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.035 }, t + 1.15);
  tl.to(outro.lastChild, { opacity: 1, duration: 0.5 }, t + 1.6);
  tl.to({}, { duration: TUNE.outro.hold }, t + 2.1);

  // The field drifts and twinkles across the whole running time.
  const total = tl.duration();
  const clock = { s: 0 };
  tl.to(clock, {
    s: total,
    duration: total,
    ease: 'none',
    onUpdate() {
      const s = clock.s;
      const d = s * TUNE.background.drift;
      bg.grid.setAttribute('transform', `translate(${(-d * bg.cell) / 20} ${(-d * bg.cell) / 40})`);
      bg.starLayer.setAttribute('transform', `translate(${(-d * 6 * U)} 0)`);
      for (const st of bg.stars) st.node.setAttribute('opacity', (st.base + st.amp * Math.sin(s * st.freq + st.phase)).toFixed(3));
    },
  }, 0);

  return tl;
}

// ---------- preview transport ----------

// Music level at video time t: the tune's volume, ramped in at the start and out at the end.
// The renderer applies the same linear fades with ffmpeg's afade.
function musicGain(t, total) {
  const m = TUNE.music;
  let g = m.volume;
  if (m.fadeIn > 0) g *= Math.min(1, t / m.fadeIn);
  if (m.fadeOut > 0) g *= Math.min(1, Math.max(0, (total - t) / m.fadeOut));
  return Math.min(1, Math.max(0, g));
}

async function loadMusic() {
  if (!TUNE.music.file) return null;
  const res = await fetch(`/${encodeURI(TUNE.music.file)}`);
  if (!res.ok) {
    console.error(`Music not found: ${TUNE.music.file}`);
    return null;
  }
  // A blob URL, so the audio can seek without the server answering range requests.
  const audio = new Audio(URL.createObjectURL(await res.blob()));
  audio.loop = true;
  await new Promise((r) => audio.addEventListener('loadedmetadata', r, { once: true }));
  return audio;
}

async function attachTransport(tl) {
  const bar = document.getElementById('transport');
  const play = document.getElementById('play');
  const scrub = document.getElementById('scrub');
  const clock = document.getElementById('clock');
  bar.hidden = false;
  const fit = () => {
    const f = Math.min(window.innerWidth / W, (window.innerHeight - 64) / H);
    stage.style.transform = `scale(${f})`;
    stage.style.margin = `0 ${(window.innerWidth - W * f) / 2}px`;
  };
  fit();
  window.addEventListener('resize', fit);

  const audio = await loadMusic();
  const total = tl.duration() / SPEED;
  const now = () => tl.time() / SPEED;
  tl.timeScale(SPEED);
  let playing = false;

  // Remember the spot in the address, so a reload after an edit lands on the same frame.
  const remember = () => {
    const url = new URL(location.href);
    url.searchParams.set('t', now().toFixed(2));
    history.replaceState(null, '', url);
  };
  const go = (t) => {
    tl.time(Math.min(total, Math.max(0, t)) * SPEED);
    remember();
  };
  const setPlaying = (on) => {
    playing = on;
    if (on && now() >= total) tl.time(0);
    tl.paused(!on);
    play.textContent = on ? 'Pause' : 'Play';
    if (!audio) return;
    if (on) {
      audio.currentTime = now() % audio.duration;
      audio.play().catch(() => {});
    } else {
      audio.pause();
      remember();
    }
  };

  play.addEventListener('click', () => setPlaying(!playing));
  scrub.addEventListener('input', () => {
    if (playing) setPlaying(false);
    go((scrub.value / 1000) * total);
  });
  window.addEventListener('keydown', (e) => {
    const frame = 1 / FPS;
    const keys = {
      Space: () => setPlaying(!playing),
      ArrowLeft: () => go(now() - (e.shiftKey ? 1 : frame)),
      ArrowRight: () => go(now() + (e.shiftKey ? 1 : frame)),
      BracketLeft: () => go((tl.labels[tl.previousLabel(tl.time() - 0.01)] ?? 0) / SPEED),
      BracketRight: () => go((tl.labels[tl.nextLabel()] ?? tl.duration()) / SPEED),
      Home: () => go(0),
      End: () => go(total),
    };
    if (!keys[e.code]) return;
    e.preventDefault();
    if (e.code !== 'Space' && playing) setPlaying(false);
    keys[e.code]();
  });

  gsap.ticker.add(() => {
    const t = now();
    if (playing && t >= total) setPlaying(false);
    if (audio) {
      audio.volume = musicGain(t, total);
      // Pull the music back into step if the tab stalled.
      if (playing && Math.abs(audio.currentTime - (t % audio.duration)) > 0.15) audio.currentTime = t % audio.duration;
    }
    scrub.value = String(Math.round((t / total) * 1000));
    clock.value = `${t.toFixed(2)} / ${total.toFixed(2)} s · ${tl.currentLabel() || 'intro'}`;
  });
  go(Number(params.get('t') || 0));
  tl.paused(true);
}

// ---------- the jig contract: window.__jig.ready resolves to { duration, fps }; seek(t) draws time t ----------
// Times here are video seconds; TUNE.speed stretches or squeezes the timeline underneath.

let timeline = null;
window.__jig = {
  ready: (async () => {
    await Promise.all(['400 16px Inter', '700 16px Inter', '400 16px Orbitron', '700 16px Orbitron'].map((f) => document.fonts.load(f)));
    const res = await fetch(`/releases/${releaseId}.json`);
    if (!res.ok) {
      stage.textContent = `No releases/${releaseId}.json`;
      throw new Error(`No releases/${releaseId}.json`);
    }
    timeline = build(await res.json());
    if (PREVIEW) await attachTransport(timeline);
    else if (params.has('t')) timeline.seek(Number(params.get('t')) * SPEED, false);
    return { duration: timeline.duration() / SPEED, fps: FPS };
  })(),
  seek(t) {
    timeline.seek(t * SPEED, false);
  },
};
